import { syncInput, type RoomState, type SessionPayload } from '@word-sync/shared';
import { Transport } from '../platform/transport';
export class GameStore {
  room?:RoomState;session?:SessionPayload;connected=false;restored=false;error='';word='';
  private listeners=new Set<()=>void>();private generation=0;private background=true;private connecting=false;private retry?:number;private busy=false;private identityAck=false;private freshState=false;
  constructor(readonly transport=new Transport(),private storage=wx){
    const stored=storage.getStorageSync('word-sync-session');
    if(stored&&typeof stored.roomCode==='string'&&typeof stored.playerId==='string'&&typeof stored.reconnectToken==='string')this.session=stored;
    transport.onState=state=>{if(this.background)return;this.word=syncInput(this.word,this.room,state,this.session?.playerId||'');this.transport.countdown?.anchor(state,this.transport.clock.now());this.room=state;this.freshState=true;if(this.identityAck&&state.players.some((p:{id:string})=>p.id===this.session?.playerId))this.restored=true;this.emit();};
    // 被房主移出房间：清除本地会话并提示，避免自动重连回房。
    transport.onKicked=({reason})=>{this.session=undefined;this.room=undefined;this.storage.removeStorageSync('word-sync-session');this.error=reason;this.emit();};
    transport.onClose=()=>{this.connected=false;this.restored=false;this.emit();this.queue();};
  }
  get recovering(){return !this.connected||!this.restored||this.background;}
  get estimatedServerNow(){return this.transport.clock.now();}
  remaining(kind:'writing'|'reveal'){return this.transport.countdown?.remaining(kind);}
  get available(){return this.connected&&this.restored&&!this.background&&!this.busy;}
  get me(){return this.room?.players.find(p=>p.id===this.session?.playerId);}
  get myGroup(){return this.room?.currentGroups.find(g=>g.members.includes(this.session?.playerId||''));}
  get candidate(){return this.room?.proposals.find(p=>p.memberIds.includes(this.session?.playerId||''));}
  get submitted(){return !!this.room?.submittedPlayerIds.includes(this.session?.playerId||'');}
  get isOwner(){return !!this.me&&this.room?.ownerId===this.me.id;}
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  private emit(){for(const fn of this.listeners)fn();}
  private queue(){clearTimeout(this.retry);if(!this.background)this.retry=setTimeout(()=>{void this.connect();},1500);}
  private save(s:SessionPayload){this.session=s;this.storage.setStorageSync('word-sync-session',s);}
  async connect(){
    if(this.background||this.connecting||this.connected)return;
    const generation=this.generation;this.connecting=true;clearTimeout(this.retry);
    try{await this.transport.connect();if(generation!==this.generation)return;this.connected=true;this.identityAck=false;this.freshState=false;this.error='';
      if(this.session){try{this.save(await this.transport.request<SessionPayload>('room:reconnect',this.session));}catch(e){if((e as Error).message==='会话已过期。'){this.session=undefined;this.room=undefined;this.storage.removeStorageSync('word-sync-session');}else throw e;}}
      if(generation!==this.generation)return;
      this.identityAck=true;this.restored=!this.session||this.freshState&&!!(this.room as RoomState|undefined)?.players.some(p=>p.id===this.session?.playerId);
    }catch(e){if(generation!==this.generation)return;this.error=(e as Error).message;this.connected=false;this.restored=false;this.transport.close();this.queue();}
    finally{if(generation===this.generation){this.connecting=false;this.emit();}}
  }
  hide(){this.background=true;this.generation++;clearTimeout(this.retry);this.retry=undefined;this.connecting=false;this.connected=false;this.restored=false;this.busy=false;this.transport.close();this.emit();}
  show(){this.background=false;void this.connect();}
  round(){return {roundId:this.room!.roundId,proposalVersion:this.room!.proposalVersion};}
  /** 只读内容安全校验，供输入过程中实时检测。 */
  check(text:string,scene?:number){return this.transport.request<{hit:boolean;message:string}>('content:check',{text,scene});}
  async act(event:string,data:unknown=null){
    const r=this.room;
    try{
    if(!this.available)throw new Error('连接或身份恢复中，请稍候。');
    if(event==='room:create'||event==='room:join'){if(this.session)throw new Error('请先离开当前房间。');}
    else if(!r)throw new Error('尚未进入房间。');
    if(event==='lobby:settings'&&(!this.isOwner||r?.view!=='lobby'))throw new Error('只有大厅房主可以修改设置。');
    if(event.startsWith('lobby:')&&r?.view!=='lobby')throw new Error('请返回大厅操作。');
    if(event==='room:kick'&&(!this.isOwner||!r?.players.some(p=>p.id===(data as {playerId?:string})?.playerId&&p.id!==this.session?.playerId)))throw new Error('只有房主可以移出其他玩家。');
    if(event.startsWith('group:')||event==='game:submit'){
      if(r?.view!=='writing')throw new Error('本回合已结束。');
      if(event!=='group:chat'&&this.submitted)throw new Error('本轮已锁定。');
      if(event==='game:submit'&&this.myGroup)throw new Error('同组请使用候选词。');
      if(event==='group:propose'&&(!this.myGroup||this.candidate))throw new Error('当前不能提议候选。');
      if(['group:confirm','group:reject'].includes(event)&&!this.candidate)throw new Error('候选已变化。');
    }
    if(event==='game:rematch'&&r?.view!=='ended')throw new Error('请在结果页返回大厅。');
    }catch(e){this.error=(e as Error).message;this.emit();throw e;}
    const generation=this.generation;this.busy=true;this.error='';this.emit();
    try{const value=await this.transport.request<SessionPayload|null>(event,data);if(generation!==this.generation)return;
      if(event==='room:create'||event==='room:join'){this.save(value!);if(this.room)this.word=syncInput(this.word,undefined,this.room,value!.playerId);}
      if(event==='room:leave'){this.session=undefined;this.room=undefined;this.storage.removeStorageSync('word-sync-session');}return value;
    }catch(e){if(generation===this.generation)this.error=(e as Error).message;throw e;}
    finally{if(generation===this.generation){this.busy=false;this.emit();}}
  }
}
