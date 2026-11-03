import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@word-sync/shared';
import { GameService } from './game.js';

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
  io.on('connection', (socket) => game.bind(socket));
  return { app, httpServer, io, game };
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 3000);
  createApp().httpServer.listen(port, () => console.log(`同频词服务已启动：http://localhost:${port}`));
}
