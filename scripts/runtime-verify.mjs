import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/server/package.json'));
const { io } = require('socket.io-client');
const evidence = { startedAt: new Date().toISOString(), mode: '真实 HTTP 与 Socket.IO，独立进程，原始十秒作答与五秒揭晓计时', checks: [], acknowledgements: [], states: [], serverOutput: '', status: 'running' };
const clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(name, fn, detail) { fn(); evidence.checks.push({ name, ok: true, at: Date.now(), detail }); console.log(`通过 ${name}`); }
async function waitFor(fn, label, timeout = 7000) { const until = Date.now() + timeout; while (Date.now() < until) { if (fn()) return; await sleep(15); } throw new Error(`等待超时：${label}`); }
async function client(name) { const c = { name, socket: io(evidence.url, { transports: ['websocket'], reconnection: false }), state: null, session: null }; clients.push(c); c.socket.on('room:state', state => { c.state = state; evidence.states.push({ client: name, observedAt: Date.now(), state }); }); await waitFor(() => c.socket.connected, `${name}连接`); return c; }
async function emit(c, event, payload, expected = true) { const result = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`${event} 未收到确认`)), 3000); const ack = result => { clearTimeout(timer); resolve(result); }; if (payload === undefined) c.socket.emit(event, ack); else c.socket.emit(event, payload, ack); }); evidence.acknowledgements.push({ client: c.name, event, payload, result, at: Date.now() }); assert.equal(result.ok, expected, `${c.name} ${event}: ${JSON.stringify(result)}`); await sleep(35); return result.data; }
const ref = c => ({ roundId: c.state.roundId, proposalVersion: c.state.proposalVersion });
async function room(prefix, count = 4) { const cs = []; for (let i = 0; i < count; i++) cs.push(await client(`${prefix}${i + 1}`)); cs[0].session = await emit(cs[0], 'room:create', { nickname: cs[0].name }); for (const c of cs.slice(1)) c.session = await emit(c, 'room:join', { code: cs[0].session.roomCode, nickname: c.name }); await emit(cs[1], 'lobby:settings', { timerSeconds: 20 }, false); check('创建者房主独占设置',()=>assert.equal(cs[0].state.ownerId,cs[0].session.playerId)); await emit(cs[0], 'lobby:settings', { timerSeconds: 10, maxRounds: 8 }); for (const c of cs) await emit(c, 'lobby:ready', true); await waitFor(() => cs.every(c => c.state?.phase === 'writing'), '首次作答'); check(`${prefix}: 真实十秒作答截止时间`, () => assert.ok(Math.abs(cs[0].state.deadline - Date.now() - 10000) < 1000)); return cs; }
async function submit(c, word) { await emit(c, 'game:submit', { roundId: c.state.roundId, word }); }
async function reveal(cs) { await waitFor(() => cs.every(c => ['reveal', 'ended'].includes(c.state.phase)), '揭晓广播'); }
async function next(cs) { const before = cs[0].state; const start = Date.now(); await waitFor(() => cs.every(c => c.state.phase === 'writing' && c.state.roundId !== before.roundId), '五秒后自动进入下一回合作答', 6500); const elapsed = Date.now() - start; check(`${cs[0].name}: 真实五秒揭晓`, () => { assert.ok(elapsed > 4200 && elapsed < 6200, `实际观察 ${elapsed}ms`); assert.equal(cs[0].state.round, before.round + 1); }, { elapsed }); }
async function propose(c, word, extra = {}) { await emit(c, 'group:propose', { ...ref(c), word, ...extra }); const p = c.state.proposals.find(p => p.proposerId === c.session.playerId && p.word === word); assert.ok(p); return p; }
async function decide(c, event, proposalId, expected = true, custom = {}) { await emit(c, event, { ...ref(c), proposalId, ...custom }, expected); }
async function main() {
  const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve)); const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve)); evidence.url = `http://127.0.0.1:${port}`;
  const tsx = require.resolve('tsx/cli'); service = spawn(process.execPath, [tsx, path.join(root, 'apps/server/src/index.ts')], { cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] }); for (const stream of [service.stdout, service.stderr]) stream.on('data', chunk => { evidence.serverOutput += chunk.toString(); });
  await waitFor(() => evidence.serverOutput.includes('http://localhost:'), '独立服务启动'); const health = await fetch(`${evidence.url}/health`); check('HTTP 健康检查', () => assert.equal(health.status, 200)); evidence.health = await health.json();
  const a = await room('A'); const [a1,a2,a3,a4] = a;
  await submit(a1,'苹果'); await submit(a2,'苹果'); await submit(a3,'海洋'); await submit(a4,'天空'); await reveal(a);
  check('部分同词自动合并但不获胜', () => { assert.equal(a1.state.phase,'reveal'); assert.deepEqual(new Set(a1.state.currentGroups[0].members), new Set([a1.session.playerId,a2.session.playerId])); assert.equal(a1.state.endReason,undefined); assert.equal(a1.state.history[0].mergeBefore.length,0); assert.equal(a1.state.history[0].mergeAfter.length,1); assert.equal(a1.state.history[0].entities.length,4); });
  const oldRound = a1.state.roundId; await next(a);
  await emit(a1,'group:propose',{...ref(a1),roundId:oldRound,word:'过期'},false); await emit(a3,'group:propose',{...ref(a3),word:'无组'},false);
  await emit(a1,'group:chat',{roundId:a1.state.roundId,text:'private-A'});
  check('小组实时聊天隔离', () => { assert.ok(a2.state.currentFeed.some(f=>f.text==='private-A')); assert.ok(a3.state.currentFeed.every(f=>f.text!=='private-A')); });
  const p = await propose(a1,'拒绝词'); const staleVersion = a1.state.proposalVersion - 1;
  await decide(a2,'group:approve',p.id,false,{proposalVersion:staleVersion}); await decide(a2,'group:reject',p.id); await decide(a2,'group:confirm',p.id,false);
  check('否决清除候选并记录完整事件',()=>{assert.ok(!a1.state.proposals.some(v=>v.id===p.id));assert.deepEqual(a1.state.currentFeed.filter(f=>f.text==='拒绝词').map(f=>f.kind),['proposed','refused','rejected']);});
  const replaced = await propose(a1,'被替换'); await emit(a2,'group:propose',{...ref(a2),word:'直接替换禁止'},false); await decide(a2,'group:reject',replaced.id); const fresh = await propose(a2,'河流'); await decide(a1,'group:approve',replaced.id,false); await decide(a1,'group:confirm',fresh.id);
  check('全组同意立即锁定持久组答案',()=>{ assert.equal(a1.state.lockedWord,'河流');assert.equal(a2.state.lockedWord,'河流');assert.equal(a1.state.phase,'writing'); assert.ok([a1,a2].every(c=>a1.state.submittedPlayerIds.includes(c.session.playerId))); assert.ok(a2.state.currentFeed.filter(f=>f.kind==='approved'&&f.text==='河流').length===1); assert.ok(a3.state.currentFeed.every(f=>f.text!=='河流')); });
  await emit(a1,'game:submit',{roundId:a1.state.roundId,word:'重复'},false);
  await submit(a3,'河流'); await submit(a4,'独立'); await reveal(a);
  check('历史保留决议、合并快照与私聊隔离',()=>{ const h=a1.state.history[1]; assert.ok(h.proposals.some(v=>v.status==='rejected')); assert.ok(h.proposals.some(v=>v.status==='rejected'&&v.proposal.id===replaced.id)); assert.ok(h.proposals.some(v=>v.status==='approved')); assert.ok(h.feed.some(f=>f.text==='private-A')); assert.ok(a3.state.history[1].feed.every(f=>f.text!=='private-A')); assert.equal(h.mergeBefore[0].members.length,2); assert.equal(h.mergeAfter[0].members.length,3); assert.equal(a1.state.phase,'reveal'); });
  await next(a); await emit(a2,'game:submit',{roundId:a2.state.roundId,word:'绕过'},false); const bridge=await propose(a1,'桥'); await decide(a2,'group:confirm',bridge.id); await decide(a3,'group:confirm',bridge.id);
  check('作答中持久组不会提前获胜',()=>assert.equal(a1.state.phase,'writing')); await submit(a4,'桥'); await reveal(a);
  check('揭晓合并覆盖全员后获胜',()=>{ assert.equal(a1.state.phase,'ended'); assert.equal(a1.state.endReason,'all-same'); assert.equal(new Set(a1.state.visibleSubmissions.map(v=>v.word)).size,1); assert.equal(a1.state.currentGroups[0].members.length,4); assert.equal(a1.state.history[2].result.endReason,'all-same'); });
  const b = await room('B'); const [b1,b2,b3,b4] = b; await submit(b1,'山'); await submit(b2,'山'); await submit(b3,'海'); await submit(b4,'海'); await reveal(b); await next(b);
  const invalid = await propose(b1,'先候选'); await emit(b2,'group:propose',{...ref(b2),word:'直接替换禁止'},false); await decide(b2,'group:reject',invalid.id); const latest = await propose(b2,'最新候选'); const reject = await propose(b3,'不应兜底');
  await decide(b4,'group:approve',reject.id,false,{roundId:oldRound}); await decide(b4,'group:reject',reject.id);
  check('其他小组版本变化不删除候选',()=>assert.ok(b1.state.proposals.some(v=>v.id===latest.id)));
  await waitFor(()=>b.every(c=>c.state.phase==='reveal'),'真实十秒超时',11500);
  check('超时采用未否决候选，不采用已否决词',()=>{ const h=b1.state.history[1]; assert.equal(h.revealReason,'timeout'); assert.ok(h.endedAt-h.startedAt>=9900); assert.ok(h.endedAt-h.startedAt<11500); for(const c of [b1,b2]) { const s=h.submissions.find(v=>v.playerId===c.session.playerId); assert.equal(s.word,'最新候选'); assert.equal(s.timedOut,false); } for(const c of [b3,b4]) { const s=h.submissions.find(v=>v.playerId===c.session.playerId); assert.equal(s.word,''); assert.equal(s.timedOut,true); } assert.ok(h.proposalSnapshots.some(v=>v.id===latest.id)); assert.ok(!h.proposalSnapshots.some(v=>v.id===invalid.id||v.id===reject.id)); assert.equal(b1.state.phase,'reveal'); });
  await next(b); const independent = await propose(b3,'独立组'); const other = await propose(b1,'组一'); await decide(b4,'group:approve',independent.id); await decide(b2,'group:approve',other.id);
  await reveal(b); check('独立小组确认使用房间版本',()=>{ assert.ok(b1.state.history[2].proposals.filter(v=>v.status==='approved').length===1); assert.equal(b1.state.phase,'reveal'); });
  const c = await room('C',3); const [c1,c2,c3] = c; await submit(c1,'保留'); await submit(c2,'保留'); await submit(c3,'独立'); await reveal(c); await next(c);
  const saved = c2.session; c2.socket.disconnect(); await waitFor(()=>c1.state.players.find(v=>v.id===saved.playerId)?.connected===false,'断线保留成员'); check('断线不拆组',()=>assert.ok(c1.state.currentGroups[0].members.includes(saved.playerId)));
  const restored = await client('C2-reconnected'); restored.session=await emit(restored,'room:reconnect',saved); check('重连恢复身份、小组和历史',()=>{ assert.equal(restored.session.playerId,saved.playerId); assert.ok(restored.state.currentGroups[0].members.includes(saved.playerId)); assert.equal(restored.state.history.length,1); });
  const leaving = await propose(c1,'终'); const snapshot=JSON.stringify(c1.state); await emit(restored,'room:leave',undefined,false); check('游戏中拒绝离开且状态不变',()=>assert.equal(JSON.stringify(c1.state),snapshot));
  await decide(restored,'group:confirm',leaving.id); await submit(c3,'终'); await reveal([c1,restored,c3]); check('恢复后确认候选并整体获胜',()=>assert.equal(c1.state.phase,'ended'));
  await emit(restored,'room:leave'); await emit(restored,'room:reconnect',saved,false);
  await emit(c1,'game:rematch'); check('再来一局回到大厅',()=>{ assert.equal(c1.state.phase,'lobby'); assert.equal(c1.state.history.length,0); assert.equal(c1.state.currentGroups.length,0); });
}
let service;
try { await main(); evidence.status='passed'; } catch(error) { evidence.status='failed'; evidence.error={message:error.message,stack:error.stack}; console.error(`失败 ${error.stack}`); process.exitCode=1; } finally { for(const c of clients) c.socket.disconnect(); if(service) { service.kill('SIGTERM'); await sleep(200); if(service.exitCode===null) service.kill('SIGKILL'); } evidence.finishedAt=new Date().toISOString(); await mkdir(path.join(root,'artifacts'),{recursive:true}); await writeFile(path.join(root,'artifacts/runtime-verification.json'),JSON.stringify(evidence,null,2)+'\n'); console.log(`${(evidence.status==='passed'?'通过':'失败')}: ${evidence.checks.length} 项实际观察； artifacts/runtime-verification.json`); }
