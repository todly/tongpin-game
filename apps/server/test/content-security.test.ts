import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from '../src/index.js';

let closeServer: (() => Promise<void>) | undefined;
let url = '';
let sockets: WebSocket[] = [];

beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  const app = createApp();
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const address = app.httpServer.address();
  url = `ws://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/ws`;
  closeServer = async () => {
    await app.io.close();
    await new Promise<void>((resolve) => app.httpServer.close(() => resolve()));
  };
});

afterEach(async () => {
  sockets.forEach((socket) => socket.close());
  sockets = [];
  await closeServer?.();
  vi.unstubAllGlobals();
});

/** 建立原生 WebSocket 连接，可注入云托管请求头。 */
function connect(headers: Record<string, string> = {}) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    sockets.push(socket);
    socket.on('open', () => resolve(socket));
    socket.on('error', reject);
  });
}

/** 发送事件并等待对应 ack。 */
function request(socket: WebSocket, event: string, data?: unknown) {
  const requestId = Math.random().toString(36).slice(2);
  return new Promise<any>((resolve) => {
    const onMessage = (raw: unknown) => {
      const message = JSON.parse(String(raw));
      if (message.event === 'ack' && message.requestId === requestId) {
        socket.off('message', onMessage);
        resolve(message);
      }
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ requestId, event, data }));
  });
}

const wechatResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'x-openapi-seqid': 'seq-test' } });

describe('内容安全校验接入', () => {
  it('带 x-wx-openid 时走云调用，risky 结果拦截昵称', async () => {
    const bodies: any[] = [];
    const fetchMock = vi.fn(async (_input: any, init?: any) => {
      bodies.push(JSON.parse(String(init?.body)));
      return wechatResponse({ errcode: 0, result: { suggest: 'risky', label: 20003 } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const socket = await connect({ 'x-wx-openid': 'openid-from-cloud' });
    const result = await request(socket, 'room:create', { nickname: '任意昵称' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('辱骂');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/wxa/game/content_spam/msg_sec_check');
    expect(bodies[0]).toMatchObject({ openid: 'openid-from-cloud', version: 2, scene: 1, content: '任意昵称' });
  });

  it('云调用 pass 时放行，且不触发本地词库', async () => {
    const fetchMock = vi.fn(async () => wechatResponse({ errcode: 0, result: { suggest: 'pass', label: 100 } }));
    vi.stubGlobal('fetch', fetchMock);

    const socket = await connect({ 'x-wx-openid': 'openid-1' });
    const result = await request(socket, 'room:create', { nickname: '正常玩家' });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('无 x-wx-openid（web 端）时使用本地词库兜底', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const socket = await connect();
    const bad = await request(socket, 'room:create', { nickname: '傻逼玩家' });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('敏感词');

    const good = await request(socket, 'room:create', { nickname: '正常玩家' });
    expect(good.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('云调用失败时回退本地词库，不阻断正常内容', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const socket = await connect({ 'x-wx-openid': 'openid-1' });
    const bad = await request(socket, 'room:create', { nickname: '傻逼玩家' });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('敏感词');

    const good = await request(socket, 'room:create', { nickname: '正常玩家' });
    expect(good.ok).toBe(true);
  });

  it('content:check 只读校验命中时返回提示，且不产生房间', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => wechatResponse({ errcode: 0, result: { suggest: 'risky', label: 20003 } })));

    const socket = await connect({ 'x-wx-openid': 'openid-1' });
    const result = await request(socket, 'content:check', { text: '任意内容', scene: 5 });

    expect(result.ok).toBe(true);
    expect(result.data.hit).toBe(true);
    expect(result.data.message).toContain('辱骂');
  });

  it('content:check 通过时返回未命中', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => wechatResponse({ errcode: 0, result: { suggest: 'pass', label: 100 } })));

    const socket = await connect({ 'x-wx-openid': 'openid-1' });
    const result = await request(socket, 'content:check', { text: '正常内容', scene: 5 });

    expect(result.ok).toBe(true);
    expect(result.data.hit).toBe(false);
  });

  it('content:check 空文本直接通过且不请求微信', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const socket = await connect({ 'x-wx-openid': 'openid-1' });
    const result = await request(socket, 'content:check', { text: '   ', scene: 5 });

    expect(result.ok).toBe(true);
    expect(result.data.hit).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('content:check 无 openid 时使用本地词库', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const socket = await connect();
    const bad = await request(socket, 'content:check', { text: '傻逼', scene: 5 });
    expect(bad.data.hit).toBe(true);
    expect(bad.data.message).toContain('敏感词');

    const good = await request(socket, 'content:check', { text: '星空', scene: 5 });
    expect(good.data.hit).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('content:check 拒绝超长文本', async () => {
    const socket = await connect({ 'x-wx-openid': 'openid-1' });
    const result = await request(socket, 'content:check', { text: 'a'.repeat(2501) });
    expect(result.ok).toBe(false);
  });
  it('云调用业务错误同样回退本地词库', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => wechatResponse({ errcode: 750031, errmsg: '该游戏不支持' })));

    const socket = await connect({ 'x-wx-openid': 'openid-1' });
    const result = await request(socket, 'room:create', { nickname: '正常玩家' });
    expect(result.ok).toBe(true);
  });
});
