import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientToServerEvents, RoomState } from '@word-sync/shared';
import type { GameConnection } from './connection.js';
import type { GameService } from './game.js';

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const string = (x: unknown, max = 200) => typeof x === 'string' && x.length <= max;
export function validRequest(event: string, data: unknown): boolean {
  if (event === 'room:leave') return data == null;
  if (event === 'lobby:rename') return string(data, 20);
  if (event === 'lobby:ready') return typeof data === 'boolean';
  if (!object(data)) return false;
  switch (event) {
    case 'room:create': return data.nickname === undefined || string(data.nickname, 20);
    case 'room:join': return string(data.code, 6) && (data.nickname === undefined || string(data.nickname, 20));
    case 'room:reconnect': return string(data.roomCode, 6) && string(data.playerId, 64) && string(data.reconnectToken, 64);
    case 'lobby:settings': return Object.keys(data).every(k => ['timerSeconds', 'maxRounds'].includes(k) && typeof data[k] === 'number' && Number.isFinite(data[k]));
    case 'game:rematch': return string(data.gameId, 64);
    case 'game:submit': return string(data.roundId, 64) && string(data.word, 40);
    case 'group:chat': return string(data.roundId, 64) && string(data.text);
    case 'group:propose': return string(data.roundId, 64) && Number.isInteger(data.proposalVersion) && string(data.word, 40);
    case 'group:approve': case 'group:confirm': case 'group:reject': return string(data.roundId, 64) && Number.isInteger(data.proposalVersion) && string(data.proposalId, 64);
    default: return false;
  }
}
class NativeConnection implements GameConnection {
  readonly id = `ws-${randomUUID()}`;
  private listeners = new Map<string, (...args: any[]) => void>();
  private seen = new Set<string>();
  alive = true;
  constructor(private ws: WebSocket) {
    ws.on('pong', () => { this.alive = true; });
    ws.on('close', () => this.listeners.get('disconnect')?.());
    ws.on('error', () => ws.close());
    ws.on('message', (raw, binary) => {
      if (binary) return ws.close(1003, '仅支持文本消息');
      let request: unknown;
      try { request = JSON.parse(raw.toString()); } catch { this.send({ event: 'protocol:error', error: '无效 JSON。' }); return; }
      if (!object(request) || !string(request.requestId, 80) || !request.requestId || !string(request.event, 40)) {
        this.send({ event: 'protocol:error', error: '无效请求。' }); return;
      }
      const { requestId, event, data } = request as { requestId: string; event: string; data: unknown };
      const ack = (result: unknown) => this.send({ event: 'ack', requestId, ...result as object });
      if (event === 'ping') { this.alive = true; ack({ ok: true, data: null }); return; }
      if (!validRequest(event, data)) { ack({ ok: false, error: '事件或数据格式无效。' }); return; }
      if (this.seen.has(requestId)) { ack({ ok: false, error: '重复请求，请刷新状态后再操作。' }); return; }
      this.seen.add(requestId);
      if (this.seen.size > 2048) { ws.close(1008, '单连接请求过多，请重连'); return; }
      try {
        const listener = this.listeners.get(event);
        if (event === 'room:leave') listener?.(ack); else listener?.(data, ack);
      } catch { ack({ ok: false, error: '请求处理失败。' }); }
    });
  }
  on<E extends keyof ClientToServerEvents>(event: E, listener: ClientToServerEvents[E]): void;
  on(event: 'disconnect', listener: () => void): void;
  on(event: string, listener: (...args: any[]) => void) { this.listeners.set(event, listener); }
  join(_room: string) {} leave(_room: string) {}
  disconnect() { this.ws.close(1000, '会话已被其他连接接管'); }
  emit(event: 'room:state', data: RoomState) { this.send({ event, data }); }
  private send(value: unknown) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(value)); }
  heartbeat() { if (!this.alive) { this.ws.terminate(); return; } this.alive = false; this.ws.ping(); }
}
export function attachWebSocket(httpServer: HttpServer, game: GameService) {
  // noServer 避免 /ws 与 Socket.IO 的升级监听互相关闭连接。
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url?.split('?')[0] !== '/ws') return;
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  const connections = new Set<NativeConnection>();
  wss.on('connection', ws => {
    const connection = new NativeConnection(ws); connections.add(connection); game.bind(connection);
    ws.on('close', () => connections.delete(connection));
  });
  const interval = setInterval(() => connections.forEach(c => c.heartbeat()), 25000);
  interval.unref();
  wss.on('close', () => clearInterval(interval));
  httpServer.on('close', () => { connections.forEach(c => c.disconnect()); wss.close(); });
  return wss;
}
