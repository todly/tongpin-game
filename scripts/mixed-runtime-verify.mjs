import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { io } = require('socket.io-client'), { WebSocket } = require('ws');
const port = 32187, url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['apps/server/dist/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'inherit'] });
const clients = [], evidence = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(fn, timeout = 12000) { const end = Date.now() + timeout; while (!fn()) { if (Date.now() > end) throw new Error('等待状态超时'); await sleep(20); } }
async function native() {
 const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const p = { ws, state: undefined, count: 0, pending: new Map() }; clients.push(p);
 ws.on('message', raw => { const v = JSON.parse(raw); if (v.event === 'room:state') p.state = v.data; if (v.event === 'ack') { p.pending.get(v.requestId)?.(v); p.pending.delete(v.requestId); } });
 p.request = (event, data = null) => new Promise(resolve => { const requestId = String(++p.count); p.pending.set(requestId, resolve); ws.send(JSON.stringify({ event, data, requestId })); });
 await once(ws, 'open'); return p;
}
async function socket() {
 const ws = io(url, { transports: ['websocket'], reconnection: false }); const p = { ws, state: undefined }; clients.push(p); ws.on('room:state', state => { p.state = state; });
 p.request = (event, data = null) => new Promise(resolve => event === 'room:leave' ? ws.emit(event, resolve) : ws.emit(event, data, resolve)); await once(ws, 'connect'); return p;
}
async function ok(p, event, data) { const r = await p.request(event, data); assert.equal(r.ok, true, r.error); return r.data; }
try {
 await once(server.stdout, 'data');
 const a = await socket(), b = await native(), c = await native();
 const sa = await ok(a, 'room:create', { nickname: '网页伙伴' }); const sb = await ok(b, 'room:join', { code: sa.roomCode, nickname: '微信伙伴' }); const sc = await ok(c, 'room:join', { code: sa.roomCode, nickname: '第三伙伴' });
 await wait(() => a.state?.players.length === 3); assert.equal(new Set(a.state.players.map(p => p.colorId)).size, 3);
 await ok(a, 'lobby:settings', { timerSeconds: 10, maxRounds: 3 });
 for (const p of [a,b,c]) await ok(p, 'lobby:ready', true); await wait(() => c.state?.phase === 'writing');
 await ok(b, 'group:chat', { roundId: b.state.roundId, text: '私密思考' }); await sleep(40); assert(!JSON.stringify(a.state).includes('私密思考'));
 assert.equal((await b.request('game:submit', { word: 3 })).ok, false);
 await ok(a, 'game:submit', { roundId: a.state.roundId, word: '苹果' }); await ok(b, 'game:submit', { roundId: b.state.roundId, word: '苹果' }); await ok(c, 'game:submit', { roundId: c.state.roundId, word: '香蕉' });
 await wait(() => c.state?.phase === 'reveal'); assert.equal(a.state.currentGroups[0].members.length, 2); assert(!JSON.stringify(c.state).includes('私密思考'));
 evidence.push('混合客户端同房、三色唯一、私聊实时历史裁剪、非法数据ACK、自动永久合组通过');
 await wait(() => b.state?.phase === 'writing');
 await ok(b, 'group:propose', { roundId: b.state.roundId, proposalVersion: b.state.proposalVersion, word: '橙子' }); await wait(() => a.state.proposals.length === 1);
 await ok(a, 'group:reject', { roundId: a.state.roundId, proposalVersion: a.state.proposalVersion, proposalId: a.state.proposals[0].id }); await wait(() => b.state.proposals.length === 0);
 await ok(b, 'group:propose', { roundId: b.state.roundId, proposalVersion: b.state.proposalVersion, word: '梨' }); await wait(() => a.state.proposals.length === 1);
 assert.equal(c.state.proposals.length, 0);
 const oldColor = b.state.players.find(p => p.id === sb.playerId).colorId;
 const replacement = await socket(); await ok(replacement, 'room:reconnect', sb); await wait(() => replacement.state?.proposals.length === 1); assert.equal(replacement.state.players.find(p => p.id === sb.playerId).colorId, oldColor);
 assert.equal((await replacement.request('room:leave')).ok, false);
 await ok(c, 'game:submit', { roundId: c.state.roundId, word: '梨' });
 await wait(() => a.state?.phase === 'ended'); assert.equal(a.state.winnerWord, '梨'); assert.equal(a.state.currentGroups[0].members.length, 3);
 await ok(replacement, 'game:rematch', { gameId: replacement.state.gameId }); await wait(() => replacement.state.view === 'lobby'); assert.equal(a.state.view, 'ended');
 const restored = await native(); await ok(restored, 'room:reconnect', sb); await wait(() => restored.state?.view === 'lobby'); assert.equal(restored.state.players.find(p => p.id === sb.playerId).colorId, oldColor);
 evidence.push('否决、候选隐私、跨传输接管、候选超时采用、禁止游戏离房、5秒推进、全体合组胜利、个人返房与颜色恢复通过');
 const malformed = await native(); malformed.ws.send('{'); await sleep(40); assert.equal((await malformed.request('不存在', {})).ok, false);
 evidence.push('无效JSON后连接仍可接收错误ACK；未知事件拒绝；恢复令牌未进入公开状态');
 assert(!JSON.stringify(a.state).includes(sa.reconnectToken));
 await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true }); await writeFile(new URL('../artifacts/混合传输运行验证.json', import.meta.url), JSON.stringify({ evidence, room: sa.roomCode, result: a.state.endReason }, null, 2));
 console.log(JSON.stringify({ result: '通过', evidence }, null, 2));
} finally { for (const p of clients) { p.ws.disconnect?.(); p.ws.close?.(); } server.kill('SIGTERM'); }
