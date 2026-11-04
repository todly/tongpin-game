export class Transport {
  private task:any;
  private generation=0;
  private counter=0;
  private heartbeat?:number;
  private cancelOpen?:()=>void;
  private pending=new Map<string,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:number}>();
  onState:(s:any)=>void=()=>{};
  onClose:()=>void=()=>{};
  constructor(private config=__CONFIG__,private api=wx) {}
  async connect() {
    this.close(); const generation=this.generation;
    let task:any;
    if(this.config.mode==='cloud') {
      if(!this.config.env||!this.config.service) throw new Error('请先配置真实微信云环境和服务名。');
      this.api.cloud.init({env:this.config.env,traceUser:false});
      task=(await this.api.cloud.connectContainer({config:{env:this.config.env},service:this.config.service,path:'/ws'})).socketTask;
    } else task=this.api.connectSocket({url:this.config.localUrl,complete:()=>{}});
    if(generation!==this.generation) {task.close({});throw new Error('连接已取消。');}
    this.task=task;
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{reject(new Error('连接超时。'));this.close();this.onClose();},10000);
      this.cancelOpen=()=>{clearTimeout(timer);reject(new Error('连接已取消。'));};
      task.onOpen(()=>{if(generation!==this.generation)return;clearTimeout(timer);this.cancelOpen=undefined;this.heartbeat=setInterval(()=>{void this.request('ping',null).catch(()=>{this.close();this.onClose();});},20000);resolve();});
      task.onMessage((message:any)=>{
        if(generation!==this.generation||typeof message.data!=='string')return;
        let value:any;try{value=JSON.parse(message.data);}catch{return;}
        if(value.event==='room:state')this.onState(value.data);
        if(value.event==='ack'){const p=this.pending.get(value.requestId);if(!p)return;clearTimeout(p.timer);this.pending.delete(value.requestId);value.ok?p.resolve(value.data):p.reject(new Error(value.error||'请求失败。'));}
      });
      const closed=()=>{if(generation!==this.generation)return;clearTimeout(timer);reject(new Error('连接已断开。'));this.close();this.onClose();};
      task.onClose(closed);task.onError(closed);
    });
  }
  request<T=null>(event:string,data:unknown):Promise<T>{
    if(!this.task)return Promise.reject(new Error('尚未连接。'));
    const requestId=`${this.generation}-${++this.counter}`;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error('确认超时，结果未知，请等待恢复，不要重复提交。'));this.close();this.onClose();},8000);
      this.pending.set(requestId,{resolve,reject,timer});
      this.task.send({data:JSON.stringify({requestId,event,data}),fail:()=>{const p=this.pending.get(requestId);if(p){clearTimeout(p.timer);this.pending.delete(requestId);reject(new Error('消息发送失败，结果未知。'));this.close();this.onClose();}}});
    });
  }
  close(){this.generation++;this.cancelOpen?.();this.cancelOpen=undefined;clearInterval(this.heartbeat);this.heartbeat=undefined;const task=this.task;this.task=undefined;task?.close({});for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('连接中断，操作结果未知。'));}this.pending.clear();}
}
