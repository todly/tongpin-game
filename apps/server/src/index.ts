import './env.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@word-sync/shared';
import { GameService, contentSecurity } from './game.js';
import { reportEnv } from './env.js';
import { attachWebSocket, validRequest } from './websocket.js';

export function createApp() {
  const app = express();
  const httpServer = createServer(app);
  const origins = process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) ?? true;
  app.use(cors({ origin: origins }));
  app.get('/health', (_request, response) => response.json({ ok: true }));
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_request, response) => response.sendFile(path.join(webDist, 'index.html')));
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: { origin: origins } });
  const game = new GameService(io);
  io.on('connection', (socket) => {
    socket.use(([event, ...args], next) => {
      const data = event === 'room:leave' ? null : args[0];
      if (validRequest(event, data)) return next();
      const ack = args.at(-1);
      if (typeof ack === 'function') ack({ ok: false, error: '事件或数据格式无效。' });
      next(new Error('无效请求。'));
    });
    game.bind(socket);
  });
  const wss = attachWebSocket(httpServer, game);
  return { app, httpServer, io, game, wss };
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 3000);
  // 启动时打印环境变量与内容安全配置状态，便于在云托管日志中确认凭据是否生效。
  reportEnv();
  contentSecurity().announce();
  createApp().httpServer.listen(port, () => console.log(`同频词服务已启动：http://localhost:${port}`));
}
