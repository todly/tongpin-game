export { orderedTimeline, formatEvent } from './timeline.js';
export { syncInput } from './inputSync.js';
export { normalizeEpoch, SafeMonotonic, StateCountdown } from './time.js';
export type { ClockDiagnostic, EpochValue, SafeMonotonicOptions } from './time.js';
export const MIN_PLAYERS=2, MAX_PLAYERS=6, DEFAULT_TIMER=60, DEFAULT_MAX_ROUNDS=10, MIN_TIMER=10, MAX_TIMER=180, MIN_ROUNDS=1, MAX_ROUNDS=30;
export type RoomPhase='lobby'|'writing'|'reveal'|'ended';
export interface Settings{timerSeconds:number;maxRounds:number}
export type ColorId=0|1|2|3|4|5;
export const PLAYER_COLORS={dark:['#ff9fae','#ffc078','#ffe680','#83e2b5','#8acbff','#cbb0ff'],light:['#a01938','#964500','#756000','#006844','#005da0','#6633a5']};
export function playerColor(id:ColorId=0,theme:'dark'|'light'='dark'){return PLAYER_COLORS[theme][id]}
export interface Player{colorId:ColorId;returnedToLobby:boolean;id:string;nickname:string;ready:boolean;connected:boolean}
export interface Submission{colorId:ColorId;playerId:string;nickname:string;word:string;receivedAt:number;timedOut:boolean}
export interface Group{id:string;word:string;members:string[];memberNames:string[];createdRound:number}
export interface FeedItem{colorId:ColorId;names?:{nickname:string;colorId:ColorId}[];id:string;groupId:string;playerId:string;nickname:string;visibleMemberIds:string[];kind:'submission'|'chat'|'proposed'|'agreed'|'refused'|'rejected'|'approved'|'timeout'|'merge';text:string;createdAt:number;roundId:string}
export interface GroupProposal{id:string;roundId:string;version:number;groupId?:string;proposerId:string;memberIds:string[];word:string;confirmations:string[];createdAt:number}
export interface ProposalDecision{proposal:GroupProposal;status:'approved'|'rejected'|'invalidated';decidedBy?:string;decidedAt:number}
export interface RoundHistory{round:number;roundId:string;submissions:Submission[];groups:Group[];feed:FeedItem[];proposals:ProposalDecision[];entities:Player[];proposalSnapshots:GroupProposal[];mergeBefore:Group[];mergeAfter:Group[];result:{endReason?:'all-same'|'max-rounds';winnerWord?:string};startedAt:number;endedAt:number;revealReason:'all-submitted'|'timeout'}
export interface RoomState{view:RoomPhase;gameId:string;code:string;ownerId:string;phase:RoomPhase;players:Player[];settings:Settings;round:number;roundId:string;proposalVersion:number;serverNow?:number;deadline:number|null;nextRoundAt:number|null;lockedWord?:string;submittedPlayerIds:string[];currentGroups:Group[];proposals:GroupProposal[];visibleSubmissions:Submission[];currentFeed:FeedItem[];history:RoundHistory[];endReason?:'all-same'|'max-rounds';winnerWord?:string}
export interface SessionPayload{roomCode:string;playerId:string;reconnectToken:string}
export type RoundRef={roundId:string;proposalVersion:number};
export type TimeSyncRequest=null;
export interface TimeSyncResponse{receivedAt:number;sentAt:number}
export interface ClientToServerEvents{
 'time:sync':(p:TimeSyncRequest,a:Ack<TimeSyncResponse>)=>void;
 'room:create':(p:{nickname?:string},a:Ack<SessionPayload>)=>void;'room:join':(p:{code:string;nickname?:string},a:Ack<SessionPayload>)=>void;'room:reconnect':(p:SessionPayload,a:Ack<SessionPayload>)=>void;'room:leave':(a?:Ack<null>)=>void;
 'lobby:rename':(n:string,a?:Ack<null>)=>void;'lobby:ready':(r:boolean,a?:Ack<null>)=>void;'lobby:settings':(s:Partial<Settings>,a?:Ack<null>)=>void;
 'game:submit':(p:{word:string;roundId:string},a?:Ack<null>)=>void;'group:propose':(p:RoundRef&{word:string},a?:Ack<null>)=>void;'group:approve':(p:RoundRef&{proposalId:string},a?:Ack<null>)=>void;'group:confirm':(p:RoundRef&{proposalId:string},a?:Ack<null>)=>void;'group:reject':(p:RoundRef&{proposalId:string},a?:Ack<null>)=>void;'group:chat':(p:{text:string;roundId:string},a?:Ack<null>)=>void;'game:rematch':(p:{gameId:string},a?:Ack<null>)=>void;
}
export interface ServerToClientEvents{'room:state':(s:RoomState)=>void;'room:error':(m:string)=>void}
export type Ack<T>=(r:{ok:true;data:T}|{ok:false;error:string})=>void;
// 昵称由前缀与水果独立随机组合，词库保持两字词，避免窄屏输入框截断。
export const NICKNAME_PREFIXES=['快乐','勇敢','温柔','机灵','悠闲','闪亮','活泼','好奇','安静','元气','认真','迷糊','淡定','热情','冷静','浪漫','倔强','淘气','乖巧','神秘','自在','清醒','软糯','轻盈','可爱','古怪'] as const;
export const NICKNAME_FRUITS=['苹果','香蕉','草莓','葡萄','西瓜','芒果','蜜桃','柠檬','樱桃','蓝莓','荔枝','橙子','柚子','石榴','菠萝','椰子','木瓜','杨梅','枇杷','山楂','桑葚','李子','杏子','柿子','青提','雪梨','甘蔗','榴莲','芭乐','释迦','杨桃','龙眼'] as const;
export function randomNickname(random=Math.random){return `${NICKNAME_PREFIXES[Math.floor(random()*NICKNAME_PREFIXES.length)]!}${NICKNAME_FRUITS[Math.floor(random()*NICKNAME_FRUITS.length)]!}`}
export function normalizeNickname(v?:string){return v?.trim().replace(/\s+/g,' ').slice(0,20)||randomNickname()}
export function normalizeWord(v:string){return v.trim().replace(/\s+/g,' ').slice(0,40)}
export function sanitizeSettings(s:Partial<Settings>,c:Settings){const t=Math.round(Number(s.timerSeconds??c.timerSeconds)),r=Math.round(Number(s.maxRounds??c.maxRounds));return{timerSeconds:Math.min(MAX_TIMER,Math.max(MIN_TIMER,Number.isFinite(t)?t:c.timerSeconds)),maxRounds:Math.min(MAX_ROUNDS,Math.max(MIN_ROUNDS,Number.isFinite(r)?r:c.maxRounds))}}
export function mergeGroups(existing:Group[],confirmed:GroupProposal[],players:Player[],round:number):Group[]{
 const validIds=new Set(players.map(p=>p.id));confirmed=confirmed.filter(p=>p.word.trim()&&p.memberIds.every(id=>validIds.has(id)));const sets=existing.map(g=>new Set(g.members.filter(id=>validIds.has(id)))); for(const p of confirmed){if(!p.word.trim()||p.memberIds.some(id=>!validIds.has(id)))continue;const overlapping=sets.filter(s=>p.memberIds.some(id=>s.has(id)));const merged=new Set(p.memberIds);for(const s of overlapping)for(const id of s)merged.add(id);for(const s of overlapping)sets.splice(sets.indexOf(s),1);sets.push(merged)}
 return sets.filter(s=>s.size>1).map((s,i)=>{const prior=existing.find(g=>g.members.some(id=>s.has(id)));const proposal=confirmed.find(p=>p.memberIds.some(id=>s.has(id)));const members=[...s];return{id:prior?.id??`group-${round}-${i+1}`,word:proposal?.word??prior?.word??'',members,memberNames:members.map(id=>players.find(p=>p.id===id)?.nickname??id),createdRound:prior?.createdRound??round}})
}
export function sameNonBlankWord(s:Submission[],count:number){if(s.length!==count||count<MIN_PLAYERS||s.some(x=>x.timedOut||!x.word))return;const first=s[0]!.word.toLocaleLowerCase('zh-CN');return s.every(x=>x.word.toLocaleLowerCase('zh-CN')===first)?s[0]!.word:undefined}
