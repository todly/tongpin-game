import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp } from '../src/index.js';
type Client = Socket; let clients: Client[]=[]; let closeServer:(()=>Promise<void>)|undefined; let url=''; let game:any;
const emitAck=<T>(s:Client,e:string,p?:unknown)=>new Promise<any>(resolve=>p===undefined?s.emit(e,resolve):s.emit(e,p,resolve));
const state=(s:Client,p:(v:any)=>boolean)=>new Promise<any>(resolve=>{const h=(v:any)=>{if(p(v)){s.off('room:state',h);resolve(v)}};s.on('room:state',h)});
beforeEach(async()=>{process.env.NODE_ENV='test';const app=createApp();game=app.game;await new Promise<void>(r=>app.httpServer.listen(0,r));const a=app.httpServer.address();url=`http://127.0.0.1:${typeof a==='object'&&a?a.port:0}`;closeServer=async()=>{await app.io.close();await new Promise<void>(r=>app.httpServer.close(()=>r()))}});
afterEach(async()=>{clients.forEach(c=>c.close());clients=[];await closeServer?.()});
const client=async()=>{const s=connect(url,{transports:['websocket'],forceNew:true});clients.push(s);await new Promise<void>(r=>s.on('connect',()=>r()));return s};
async function room(names=['Ada','Bo'],settings:{preventRepeatWords?:boolean;maxRounds?:number}={}){const sockets=await Promise.all(names.map(()=>client()));const created=await emitAck(sockets[0]!,'room:create',{colorId:0 as const,returnedToLobby:false,nickname:names[0]});const sessions=[created.data];for(let i=1;i<sockets.length;i++)sessions.push((await emitAck(sockets[i]!,'room:join',{code:created.data.roomCode,colorId:0 as const,returnedToLobby:false,nickname:names[i]})).data);await emitAck(sockets[0]!,'lobby:settings',{timerSeconds:10,maxRounds:3,...settings});for(let i=0;i<sockets.length-1;i++)await emitAck(sockets[i]!,'lobby:ready',true);const waiting=state(sockets[0]!,v=>v.phase==='writing');await emitAck(sockets.at(-1)!,'lobby:ready',true);return{sockets,sessions,writing:await waiting}}
async function revealDifferent(r:Awaited<ReturnType<typeof room>>,words:string[]){const wait=state(r.sockets[0]!,v=>v.phase==='reveal');for(let i=0;i<words.length;i++)await emitAck(r.sockets[i]!,'game:submit',{word:words[i],roundId:r.writing.roundId});return wait}
describe('游戏服务端',()=>{
 it('Socket.IO 每次按玩家发送状态时刷新 serverNow',async()=>{const a=await client(),b=await client();const firstState=state(a,v=>typeof v.serverNow==='number');const created=await emitAck(a,'room:create',{});const first=await firstState;await new Promise(r=>setTimeout(r,5));const nextState=state(a,v=>v.players.length===2);await emitAck(b,'room:join',{code:created.data.roomCode});const second=await nextState;expect(second.serverNow).toBeGreaterThan(first.serverNow);expect(second.serverNow).toBeLessThanOrEqual(Date.now())});
 it('六人颜色唯一，个人返房和重连稳定，结果冻结，在线全员返回才开新局',async()=>{
  const r=await room(['甲','乙','丙','丁','戊','己']);const colors=r.writing.players.map((p:any)=>p.colorId);expect(new Set(colors).size).toBe(6);
  const ended=state(r.sockets[1]!,v=>v.phase==='ended');for(const s of r.sockets)await emitAck(s,'game:submit',{word:'星',roundId:r.writing.roundId});const frozen=await ended;const ref={gameId:frozen.gameId};
  const lobby=state(r.sockets[0]!,v=>v.view==='lobby');const other=state(r.sockets[1]!,v=>v.view==='ended');await emitAck(r.sockets[0]!,'game:rematch',ref);expect((await lobby).phase).toBe('ended');expect((await other).view).toBe('ended');
  expect((await emitAck(r.sockets[1]!,'lobby:ready',true)).ok).toBe(false);await emitAck(r.sockets[0]!,'lobby:rename','甲新名');await emitAck(r.sockets[0]!,'lobby:settings',{maxRounds:8});const unchanged=state(r.sockets[1]!,v=>v.phase==='ended');await emitAck(r.sockets[0]!,'lobby:ready',true);const old=await unchanged;expect(old.players).toEqual(frozen.players);expect(old.settings).toEqual(frozen.settings);expect(old.history).toEqual(frozen.history);
  for(let i=0;i<2;i++){r.sockets[i]!.disconnect();const replacement=await client();const restored=state(replacement,v=>v.view===(i===0?'lobby':'ended'));await emitAck(replacement,'room:reconnect',r.sessions[i]);expect((await restored).players.map((p:any)=>p.colorId)).toEqual(colors);r.sockets[i]=replacement;}
  for(let i=1;i<6;i++){await emitAck(r.sockets[i]!,'game:rematch',ref);if(i<5)await emitAck(r.sockets[i]!,'lobby:ready',true);}
  const internal=game.rooms.get(r.sessions[0].roomCode);const offline=state(r.sockets[5]!,v=>v.players.some((p:any)=>!p.connected));r.sockets[1]!.disconnect();await offline;await emitAck(r.sockets[5]!,'lobby:ready',true);expect(internal.phase).toBe('ended');
  const replacement=await client();await emitAck(replacement,'room:reconnect',r.sessions[1]);const writing=state(r.sockets[0]!,v=>v.phase==='writing');await emitAck(replacement,'lobby:ready',true);const next=await writing;expect(next.gameId).not.toBe(ref.gameId);expect(next.players.map((p:any)=>p.colorId)).toEqual(colors);expect((await emitAck(r.sockets[0]!,'game:rematch',ref)).ok).toBe(false);expect(internal.phase).toBe('writing');
 });
 it('全员提交后立即揭晓，内容在揭晓前私密，并可全员同词获胜',async()=>{const r=await room();await emitAck(r.sockets[0]!,'game:submit',{word:'Moon',roundId:r.writing.roundId});const hidden=await state(r.sockets[1]!,v=>v.submittedPlayerIds.length===1);expect(hidden.visibleSubmissions).toEqual([]);const ended=state(r.sockets[0]!,v=>v.phase==='ended');await emitAck(r.sockets[1]!,'game:submit',{word:'moon',roundId:r.writing.roundId});expect((await ended).endReason).toBe('all-same')});
 it('写作提案限定本组，全体approve立即提交，并保存决议/快照',async()=>{const r=await room(['Ada','Bo','Cy']);const first=await revealDifferent(r,['x','x','y']);const internal=game.rooms.get(r.sessions[0].roomCode);const next=state(r.sockets[0]!,v=>v.phase==='writing'&&v.round===2);game.start(internal);const w=await next;expect(w.currentGroups[0].members).toHaveLength(2);expect((await emitAck(r.sockets[0]!,'game:submit',{roundId:w.roundId,word:'绕过'})).ok).toBe(false);const pp=state(r.sockets[1]!,v=>v.proposals.length===1);await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:0,word:'z'});const p=await pp;expect((await emitAck(r.sockets[1]!,'group:approve',{roundId:w.roundId,proposalVersion:0,proposalId:p.proposals[0].id})).ok).toBe(false);const submitted=state(r.sockets[2]!,v=>v.submittedPlayerIds.length===2);expect((await emitAck(r.sockets[1]!,'group:approve',{roundId:w.roundId,proposalVersion:p.proposalVersion,proposalId:p.proposals[0].id})).ok).toBe(true);expect((await submitted).visibleSubmissions).toEqual([]);const end=state(r.sockets[0]!,v=>v.phase==='ended');await emitAck(r.sockets[2]!,'game:submit',{roundId:w.roundId,word:'z'});const e=await end;expect(e.endReason).toBe('all-same');expect(e.history[1].proposals[0].proposal.confirmations).toHaveLength(2);expect(e.history[1].entities).toHaveLength(3);expect(e.history[1].mergeBefore).toHaveLength(1);expect(e.history[1].mergeAfter[0].members).toHaveLength(3);expect(e.history[0]).toEqual(first.history[0])});
 it('倒计时采用候选，reject失效，feed仅本组可见且历史不泄露',async()=>{const r=await room(['Ada','Bo','Cy']);await revealDifferent(r,['x','x','y']);const internal=game.rooms.get(r.sessions[0].roomCode);const next=state(r.sockets[0]!,v=>v.phase==='writing'&&v.round===2);game.start(internal);const w=await next;const proposal=state(r.sockets[0]!,v=>v.proposals.length===1);await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:0,word:'candidate'});let p=await proposal;expect((await emitAck(r.sockets[2]!,'group:reject',{roundId:w.roundId,proposalVersion:p.proposalVersion,proposalId:p.proposals[0].id})).ok).toBe(false);const rejected=state(r.sockets[0]!,v=>v.proposals.length===0&&v.proposalVersion===2);await emitAck(r.sockets[1]!,'group:reject',{roundId:w.roundId,proposalVersion:p.proposalVersion,proposalId:p.proposals[0].id});await rejected;const renewed=state(r.sockets[0]!,v=>v.proposals.length===1);await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:2,word:'chosen'});p=await renewed;const privateFeed=state(r.sockets[1]!,v=>v.currentFeed.some((f:any)=>f.text==='secret'));const outside=state(r.sockets[2]!,v=>v.phase==='writing');await emitAck(r.sockets[0]!,'group:chat',{roundId:w.roundId,text:'secret'});expect((await privateFeed).currentFeed.find((f:any)=>f.kind==='chat').text).toBe('secret');expect((await outside).currentFeed).toEqual([]);const revealed=state(r.sockets[0]!,v=>v.phase==='reveal');const external=state(r.sockets[2]!,v=>v.phase==='reveal');game.timeout(internal,w.roundId);const h=(await revealed).history[1];expect(h.submissions.map((v:any)=>v.word)).toEqual(['chosen','chosen','']);expect(h.proposalSnapshots[0].confirmations).toHaveLength(1);expect(h.proposals[0].status).toBe('rejected');expect((await external).history[1].feed).toEqual([]);expect((await emitAck(r.sockets[0]!,'group:approve',{roundId:w.roundId,proposalVersion:p.proposalVersion,proposalId:p.proposals[0].id})).ok).toBe(false)});
 it('部分同频只列出实际组员，返房清空当前组且其他人保留旧结果',async()=>{
  const r=await room(['甲','乙','丙']);
  const internal=game.rooms.get(r.sessions[0].roomCode);
  internal.settings.maxRounds=1;
  const ended=state(r.sockets[2]!,v=>v.phase==='ended');
  for(let i=0;i<3;i++)await emitAck(r.sockets[i]!,'game:submit',{
   roundId:r.writing.roundId,word:i<2?'星空':'大海'
  });
  const result=await ended;
  const merge=result.currentFeed.find((item:any)=>item.kind==='merge');
  expect(merge.names.map((p:any)=>p.nickname)).toEqual(['甲','乙']);
  expect(merge.visibleMemberIds).toHaveLength(3);
  expect(result.endReason).toBe('max-rounds');
  expect(result.history[0].feed.find((item:any)=>item.kind==='merge').names).toEqual(merge.names);
  const lobby=state(r.sockets[0]!,v=>v.view==='lobby');
  const stillEnded=state(r.sockets[2]!,v=>v.view==='ended');
  await emitAck(r.sockets[0]!,'game:rematch',{gameId:result.gameId});
  expect((await lobby).currentGroups).toEqual([]);
  expect((await stillEnded).currentGroups[0].members).toHaveLength(2);
  expect(internal.groups[0].members).toHaveLength(2);
 });
 it('组词经确认与单人同词后整体合并',async()=>{const r=await room(['甲','乙','丙']);await revealDifferent(r,['x','x','y']);const internal=game.rooms.get(r.sessions[0].roomCode);const next=state(r.sockets[0]!,v=>v.phase==='writing'&&v.round===2);game.start(internal);const w=await next;const proposed=state(r.sockets[0]!,v=>v.proposals.length===1);await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:0,word:'z'});const p=await proposed;await emitAck(r.sockets[1]!,'group:confirm',{roundId:w.roundId,proposalVersion:p.proposalVersion,proposalId:p.proposals[0].id});const end=state(r.sockets[0]!,v=>v.phase==='ended');await emitAck(r.sockets[2]!,'game:submit',{roundId:w.roundId,word:'z'});expect((await end).currentGroups[0].members).toHaveLength(3)});
 it('组员不能绕过候选提交，断线恢复候选',async()=>{const r=await room(['甲','乙','丙']);await revealDifferent(r,['x','x','y']);const internal=game.rooms.get(r.sessions[0].roomCode);const snapshot=()=>JSON.stringify({players:[...internal.players],groups:internal.groups,proposals:internal.proposals,history:internal.history,submissions:internal.submissions,phase:internal.phase});let before=snapshot();expect(snapshot()).toBe(before);const next=state(r.sockets[0]!,v=>v.phase==='writing'&&v.round===2);game.start(internal);const w=await next;const proposed=state(r.sockets[0]!,v=>v.proposals.length===1);await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:0,word:'z'});const p=await proposed;before=snapshot();expect((await emitAck(r.sockets[1]!,'game:submit',{roundId:w.roundId,word:'绕过'})).ok).toBe(false);expect((await emitAck(r.sockets[1]!,'group:propose',{roundId:w.roundId,proposalVersion:p.proposalVersion,word:'替换'})).ok).toBe(false);expect(snapshot()).toBe(before);const offline=state(r.sockets[0]!,v=>v.players.some((p:any)=>!p.connected));r.sockets[1]!.disconnect();await offline;const replacement=await client();const restored=state(replacement,v=>v.proposals.length===1);expect((await emitAck(replacement,'room:reconnect',r.sessions[1])).ok).toBe(true);expect((await restored).proposals[0].id).toBe(p.proposals[0].id);expect(internal.groups[0].members).toHaveLength(2)});
 it('超时空词不合并，最大轮数结束且拒绝旧回合提交',async()=>{const r=await room();const internal=game.rooms.get(r.sessions[0].roomCode);internal.settings.maxRounds=1;expect((await emitAck(r.sockets[0]!,'game:submit',{roundId:'stale',word:'x'})).ok).toBe(false);const ended=state(r.sockets[0]!,v=>v.phase==='ended');game.timeout(internal,r.writing.roundId);const e=await ended;expect(e.endReason).toBe('max-rounds');expect(e.currentGroups).toEqual([]);expect(e.history[0].submissions.every((v:any)=>v.timedOut&&!v.word)).toBe(true);expect(e.history[0].result.endReason).toBe('max-rounds');expect((await emitAck(r.sockets[0]!,'game:submit',{roundId:r.writing.roundId,word:'x'})).ok).toBe(false)});
  it('历史保存准确时间和揭晓原因',async()=>{const r=await room();const first=await revealDifferent(r,['a','b']);expect(first.history[0].startedAt).toBeLessThanOrEqual(first.history[0].endedAt);expect(first.history[0].revealReason).toBe('all-submitted');expect(first.history[0].feed.map((f:any)=>f.kind)).toEqual(['submission'])});
 it('房主独占大厅设置，断线保留身份，结束后离开转交房主',async()=>{const a=await client(),b=await client();const session=(await emitAck(a,'room:create',{})).data;await emitAck(b,'room:join',{code:session.roomCode});const internal=game.rooms.get(session.roomCode);expect(internal.ownerId).toBe(session.playerId);expect((await emitAck(b,'lobby:settings',{timerSeconds:20,maxRounds:1})).ok).toBe(false);expect(internal.settings.timerSeconds).toBe(60);expect((await emitAck(a,'lobby:settings',{timerSeconds:10,maxRounds:1})).ok).toBe(true);const off=state(b,v=>!v.players[0].connected);a.disconnect();await off;expect(internal.ownerId).toBe(session.playerId);const replacement=await client();await emitAck(replacement,'room:reconnect',session);expect((await emitAck(replacement,'lobby:settings',{timerSeconds:15})).ok).toBe(true);await emitAck(replacement,'lobby:ready',true);const writing=state(b,v=>v.phase==='writing');await emitAck(b,'lobby:ready',true);const w=await writing;expect((await emitAck(replacement,'lobby:settings',{timerSeconds:30})).ok).toBe(false);const ended=state(b,v=>v.phase==='ended');game.timeout(internal,w.roundId);await ended;expect((await emitAck(replacement,'room:leave')).ok).toBe(true);expect(internal.ownerId).toBe([...internal.players.keys()][0]);expect((await emitAck(replacement,'room:reconnect',session)).ok).toBe(false)});
 it('重连恢复同一实体且旧连接断开不会覆盖新连接在线状态',async()=>{const r=await room();r.sockets[1]!.disconnect();await state(r.sockets[0]!,v=>v.players.some((p:any)=>p.id===r.sessions[1].playerId&&!p.connected));const replacement=await client();const online=state(r.sockets[0]!,v=>v.players.some((p:any)=>p.id===r.sessions[1].playerId&&p.connected));expect((await emitAck(replacement,'room:reconnect',r.sessions[1])).ok).toBe(true);expect((await online).players).toHaveLength(2)});
 it('敏感词兜底：昵称、提交、聊天均被拒绝并返回提示',async()=>{
  const a=await client();
  const badNickname=await emitAck(a,'room:create',{nickname:'傻逼玩家'});
  expect(badNickname.ok).toBe(false);
  expect(badNickname.error).toContain('敏感词');
  const created=await emitAck(a,'room:create',{nickname:'正常玩家'});
  expect(created.ok).toBe(true);
  const renamed=await emitAck(a,'lobby:rename','TMD名字');
  expect(renamed.ok).toBe(false);
  expect(renamed.error).toContain('敏感词');
  const b=await client();
  await emitAck(b,'room:join',{code:created.data.roomCode,nickname:'伙伴'});
  await emitAck(a,'lobby:settings',{timerSeconds:10,maxRounds:3});
  await emitAck(a,'lobby:ready',true);
  const writing=state(b,v=>v.phase==='writing');
  await emitAck(b,'lobby:ready',true);
  const w=await writing;
  const badWord=await emitAck(a,'game:submit',{word:'傻 逼',roundId:w.roundId});
  expect(badWord.ok).toBe(false);
  expect(badWord.error).toContain('敏感词');
  const badChat=await emitAck(a,'group:chat',{roundId:w.roundId,text:'这句话里有TMD脏话'});
  expect(badChat.ok).toBe(false);
  expect(badChat.error).toContain('敏感词');
  const goodWord=await emitAck(a,'game:submit',{word:'星空',roundId:w.roundId});
  expect(goodWord.ok).toBe(true);
 });
describe('房主踢人',()=>{
 it('非房主不能踢人，房主可踢且被踢者收到通知并断开',async()=>{
  const a=await client(),b=await client(),c=await client();
  const created=await emitAck(a,'room:create',{nickname:'房主'});
  const code=created.data.roomCode;
  const bJoined=await emitAck(b,'room:join',{code,nickname:'玩家乙'});
  await emitAck(c,'room:join',{code,nickname:'玩家丙'});
  const internal=game.rooms.get(code);
  // 非房主踢人被拒绝
  const denied=await emitAck(b,'room:kick',{playerId:created.data.playerId});
  expect(denied.ok).toBe(false);
  expect(denied.error).toContain('房主');
  // 房主踢自己被拒绝
  const selfKick=await emitAck(a,'room:kick',{playerId:created.data.playerId});
  expect(selfKick.ok).toBe(false);
  // 房主踢乙成功，乙收到 room:kicked 通知；先注册状态监听再踢人
  const kicked=new Promise<any>(resolve=>b.on('room:kicked',resolve));
  const after=state(a,v=>v.players.length===2);
  const kickResult=await emitAck(a,'room:kick',{playerId:bJoined.data.playerId});
  expect(kickResult.ok).toBe(true);
  const notice=await kicked;
  expect(notice.reason).toContain('移出');
  // 乙的会话被清除，重连失败
  expect(internal.players.has(bJoined.data.playerId)).toBe(false);
  // 丙仍在房间
  expect((await after).players.map((p:any)=>p.nickname)).toEqual(['房主','玩家丙']);
 });
 it('写词阶段踢人后若全员已提交则立即揭晓',async()=>{
  const r=await room(['甲','乙','丙']);
  // 甲乙已提交同词，踢掉未提交的丙后应立即揭晓并达成完美同频
  await emitAck(r.sockets[0]!,'game:submit',{word:'星',roundId:r.writing.roundId});
  await emitAck(r.sockets[1]!,'game:submit',{word:'星',roundId:r.writing.roundId});
  const ended=state(r.sockets[0]!,v=>v.phase==='ended');
  const kickResult=await emitAck(r.sockets[0]!,'room:kick',{playerId:r.sessions[2].playerId});
  expect(kickResult.ok).toBe(true);
  const result=await ended;
  expect(result.endReason).toBe('all-same');
  expect(result.winnerWord).toBe('星');
  expect(result.visibleSubmissions).toHaveLength(2);
  expect(result.visibleSubmissions.every((s:any)=>s.word==='星')).toBe(true);
 });
});
});


describe('全房间禁止重复词语',()=>{
 async function nextRound(r:Awaited<ReturnType<typeof room>>,round:number){
  const internal=game.rooms.get(r.sessions[0].roomCode),waiting=state(r.sockets[0]!,v=>v.phase==='writing'&&v.round===round);
  game.start(internal);return waiting;
 }
 it('禁用全房间往轮词语，忽略大小写和首尾空格，本轮仍可同词获胜',async()=>{
  const r=await room(['甲','乙','丙'],{preventRepeatWords:true});await revealDifferent(r,['Sun','Moon','Sea']);const w=await nextRound(r,2);
  for(const word of [' mOoN ','Sun']){const reply=await emitAck(r.sockets[0]!,'game:submit',{word,roundId:w.roundId});expect(reply.ok).toBe(false);expect(reply.error).toContain('之前的回合已提交');}
  const ended=state(r.sockets[0]!,v=>v.phase==='ended');
  for(const s of r.sockets)expect((await emitAck(s,'game:submit',{word:'新词',roundId:w.roundId})).ok).toBe(true);
  expect((await ended).endReason).toBe('all-same');
 });
 it('小组不能沿用组外玩家的往轮词语；新候选可确认且其他人可在同轮同词',async()=>{
  const r=await room(['甲','乙','丙'],{preventRepeatWords:true});await revealDifferent(r,['苹果','苹果','香蕉']);const w=await nextRound(r,2);
  expect((await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:0,word:'香蕉'})).ok).toBe(false);
  const proposed=state(r.sockets[0]!,v=>v.proposals.length===1);expect((await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:0,word:'星空'})).ok).toBe(true);const p=await proposed;
  expect((await emitAck(r.sockets[1]!,'group:confirm',{roundId:w.roundId,proposalVersion:p.proposalVersion,proposalId:p.proposals[0].id})).ok).toBe(true);
  const ended=state(r.sockets[0]!,v=>v.phase==='ended');expect((await emitAck(r.sockets[2]!,'game:submit',{roundId:w.roundId,word:'星空'})).ok).toBe(true);expect((await ended).endReason).toBe('all-same');
 });
 it('往轮被否决且未提交的候选词允许全房间复用',async()=>{
  const r=await room(['甲','乙','丙','丁'],{preventRepeatWords:true,maxRounds:5});await revealDifferent(r,['苹果','苹果','香蕉','西瓜']);const w=await nextRound(r,2);
  const proposed=state(r.sockets[0]!,v=>v.proposals.length===1);await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:0,word:'月光'});const p=await proposed;
  expect((await emitAck(r.sockets[1]!,'group:reject',{roundId:w.roundId,proposalVersion:p.proposalVersion,proposalId:p.proposals[0].id})).ok).toBe(true);
  const revealed=state(r.sockets[0]!,v=>v.phase==='reveal');game.timeout(game.rooms.get(r.sessions[0].roomCode),w.roundId);await revealed;const next=await nextRound(r,3);
  expect((await emitAck(r.sockets[2]!,'game:submit',{roundId:next.roundId,word:'月光'})).ok).toBe(true);
  expect((await emitAck(r.sockets[0]!,'group:propose',{roundId:next.roundId,proposalVersion:0,word:'月光'})).ok).toBe(true);
 });
 it('候选词超时被采用成为最终提交后，全房间后续回合禁止复用',async()=>{
  const r=await room(['甲','乙','丙'],{preventRepeatWords:true,maxRounds:5});await revealDifferent(r,['苹果','苹果','香蕉']);const w=await nextRound(r,2);
  expect((await emitAck(r.sockets[0]!,'group:propose',{roundId:w.roundId,proposalVersion:0,word:'月光'})).ok).toBe(true);
  const revealed=state(r.sockets[0]!,v=>v.phase==='reveal');game.timeout(game.rooms.get(r.sessions[0].roomCode),w.roundId);
  expect((await revealed).history[1].submissions.filter((s:any)=>s.word==='月光')).toHaveLength(2);
  const next=await nextRound(r,3);
  expect((await emitAck(r.sockets[2]!,'game:submit',{roundId:next.roundId,word:'月光'})).ok).toBe(false);
  expect((await emitAck(r.sockets[0]!,'group:propose',{roundId:next.roundId,proposalVersion:0,word:'月光'})).ok).toBe(false);
 });
 it('开关关闭时允许复用其他玩家的往轮词语',async()=>{
  const r=await room(['甲','乙']);await revealDifferent(r,['苹果','香蕉']);const w=await nextRound(r,2);
  expect((await emitAck(r.sockets[0]!,'game:submit',{roundId:w.roundId,word:'香蕉'})).ok).toBe(true);
 });
 it('重新开始一局清空全房间词语记录',async()=>{
  const r=await room(['甲','乙'],{preventRepeatWords:true});const ended=state(r.sockets[0]!,v=>v.phase==='ended');
  for(const s of r.sockets)await emitAck(s,'game:submit',{roundId:r.writing.roundId,word:'苹果'});const end=await ended;
  for(const s of r.sockets)await emitAck(s,'game:rematch',{gameId:end.gameId});await emitAck(r.sockets[0]!,'lobby:ready',true);
  const started=state(r.sockets[0]!,v=>v.phase==='writing');await emitAck(r.sockets[1]!,'lobby:ready',true);const w=await started;
  expect(w.history).toEqual([]);expect(w.settings.preventRepeatWords).toBe(true);expect((await emitAck(r.sockets[0]!,'game:submit',{roundId:w.roundId,word:'苹果'})).ok).toBe(true);
 });
});
describe('游戏中主动退出',()=>{
 it('作答中退出只剩一人立即结算，保留退出者本轮作答与身份，令牌失效',async()=>{
  const r=await room();const internal=game.rooms.get(r.sessions[0].roomCode);
  await emitAck(r.sockets[0]!,'game:submit',{roundId:r.writing.roundId,word:'星空'});
  const ended=state(r.sockets[1]!,v=>v.phase==='ended');
  expect((await emitAck(r.sockets[0]!,'room:leave')).ok).toBe(true);
  const result=await ended;expect(result.endReason).toBe('insufficient-players');expect(result.players).toHaveLength(1);
  expect(result.history[0].submissions[0].word).toBe('星空');expect(result.history[0].entities).toHaveLength(2);
  expect(result.deadline).toBeNull();expect(result.nextRoundAt).toBeNull();
  expect((await emitAck(r.sockets[0]!,'room:reconnect',r.sessions[0])).ok).toBe(false);
  game.timeout(internal,r.writing.roundId);expect(internal.phase).toBe('ended');
 });
 it('揭晓中退出保留历史，剩两人继续，剩一人自动结算',async()=>{
  const r=await room(['甲','乙','丙']);const first=await revealDifferent(r,['a','b','c']);
  const internal=game.rooms.get(r.sessions[0].roomCode);const saved=JSON.stringify(internal.history);
  expect((await emitAck(r.sockets[0]!,'room:leave')).ok).toBe(true);expect(internal.phase).toBe('reveal');
  const ended=state(r.sockets[2]!,v=>v.phase==='ended');await emitAck(r.sockets[1]!,'room:leave');
  const result=await ended;expect(result.endReason).toBe('insufficient-players');expect(JSON.stringify(internal.history)).toBe(saved);
  expect(result.history[0].submissions).toEqual(first.history[0].submissions);
 });
 it('退出者的提交不计入剩余人数，剩余玩家提交后正常揭晓',async()=>{
  const r=await room(['甲','乙','丙']);await emitAck(r.sockets[0]!,'game:submit',{roundId:r.writing.roundId,word:'旧词'});
  await emitAck(r.sockets[0]!,'room:leave');const internal=game.rooms.get(r.sessions[0].roomCode);
  await emitAck(r.sockets[1]!,'game:submit',{roundId:r.writing.roundId,word:'a'});expect(internal.phase).toBe('writing');
  const revealed=state(r.sockets[2]!,v=>v.phase==='reveal');await emitAck(r.sockets[2]!,'game:submit',{roundId:r.writing.roundId,word:'b'});
  expect((await revealed).history[0].submissions).toHaveLength(3);
 });
});

it('组员退出使候选失效且聊天和旧回合历史保留',async()=>{
 const r=await room(['甲','乙','丙']);await revealDifferent(r,['x','x','y']);const internal=game.rooms.get(r.sessions[0].roomCode);const saved=JSON.stringify(internal.history);
 game.start(internal);const roundId=internal.roundId;
 await emitAck(r.sockets[0]!,'group:propose',{roundId,proposalVersion:0,word:'候选'});
 await emitAck(r.sockets[0]!,'group:chat',{roundId,text:'留下思考'});
 await emitAck(r.sockets[0]!,'room:leave');expect(internal.proposals).toEqual([]);expect(internal.groups).toEqual([]);expect(JSON.stringify(internal.history)).toBe(saved);
 const ended=state(r.sockets[1]!,v=>v.phase==='ended');await emitAck(r.sockets[2]!,'room:leave');const result=await ended;
 expect(result.history[1].feed.some((f:any)=>f.text==='留下思考')).toBe(true);expect(result.history[1].proposals[0].status).toBe('invalidated');expect(result.history[1].entities).toHaveLength(3);
});
