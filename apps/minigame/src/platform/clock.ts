import type { TimeSyncResponse } from '@word-sync/shared';
// Anchor server epoch to monotonic elapsed time; wall-clock changes cannot move deadlines.
export class ServerClock {
  private anchor:number;private at:number;private best=Infinity;
  constructor(private monotonic=()=>(globalThis as any).performance?.now?.()??Date.now(),wall=Date.now()){this.at=monotonic();this.anchor=wall;}
  now(){return this.anchor+Math.max(0,this.monotonic()-this.at);}
  reset(){this.best=Infinity;}
  sample(sent:number,received:number,value:TimeSyncResponse){
    const {receivedAt,sentAt}=value;
    const rtt=received-sent-(sentAt-receivedAt);
    if(!Number.isFinite(rtt)||!Number.isFinite(receivedAt)||!Number.isFinite(sentAt)||rtt<0||rtt>2000||sentAt<receivedAt||rtt>this.best+10)return false;
    this.best=Math.min(this.best,rtt);this.anchor=sentAt+rtt/2;this.at=received;return true;
  }
  tick(){return this.monotonic();}
}
