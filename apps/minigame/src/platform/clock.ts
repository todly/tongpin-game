import { SafeMonotonic, StateCountdown, normalizeEpoch, type TimeSyncResponse } from '@word-sync/shared';

// Compatibility clock for old servers. Room state serverNow anchors are preferred.
export class ServerClock {
  private anchor:number;private at:number;private best=Infinity;
  private readonly safe:SafeMonotonic;
  private readonly wall:()=>number;
  constructor(monotonic=()=>(globalThis as any).performance?.now?.()??Date.now(),wall:number|(()=>number)=Date.now(),debug=false){
    this.wall=typeof wall==='function'?wall:()=>Number(wall);
    this.safe=new SafeMonotonic(monotonic,{wall:this.wall,debug,diagnose:event=>(globalThis as any).console?.debug?.('[clock]',event)});
    this.at=this.safe.now();this.anchor=this.wall();
  }
  now(){return this.anchor+Math.max(0,this.safe.now()-this.at);}
  reset(){this.best=Infinity;}
  sample(sent:number,received:number,value:TimeSyncResponse){
    const receivedAt=normalizeEpoch(value.receivedAt),sentAt=normalizeEpoch(value.sentAt);
    const rtt=received-sent-((sentAt??NaN)-(receivedAt??NaN));
    if(!Number.isFinite(rtt)||receivedAt===undefined||sentAt===undefined||rtt<0||rtt>2000||sentAt<receivedAt||rtt>this.best+10)return false;
    this.best=Math.min(this.best,rtt);this.anchor=sentAt+rtt/2;this.at=received;return true;
  }
  tick(){return this.safe.now();}
}

export class RoomCountdown extends StateCountdown {}
