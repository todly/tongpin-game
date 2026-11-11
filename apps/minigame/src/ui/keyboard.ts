export type InputKind='nickname'|'code'|'word'|'chat';
type Target={kind:InputKind;value:string;valid:()=>boolean;change:(v:string)=>void};
// Reserve room for the native editor above the reported keyboard. WeChat does
// not report this editor's bounds separately; this is an avoidance allowance.
const NATIVE_INPUT_BAR_HEIGHT=64;
export class Keyboard {
  state:'idle'|'showing'|'open'|'hiding'='idle';
  private pending?:Target;private current?:Target;private cleanup?:()=>void;private timer?:number;private sequence=0;private writable=false;
  draft='';kind?:InputKind;height=0;
  get occludedHeight(){return this.height>0?this.height+NATIVE_INPUT_BAR_HEIGHT:0;}
  constructor(private api=wx,private redraw=()=>{}){}
  close(){this.pending=undefined;this.hide();}
  confirm(){this.close();}
  clear(kind:InputKind){
    if(this.kind!==kind||!this.current)return;
    this.draft='';
    this.current.change('');
    try{this.api.updateKeyboard?.({value:''});}catch{}
    this.redraw();
  }
  open(kind:InputKind,value:string,valid:()=>boolean,change:(v:string)=>void){
    this.pending={kind,value,valid,change};
    if(this.state==='idle')this.show();else this.hide();
  }
  private detach(){this.writable=false;this.cleanup?.();this.cleanup=undefined;this.kind=undefined;this.height=0;}
  private hide(){
    this.detach();this.redraw();if(this.state==='hiding')return;if(this.state==='idle'){this.show();return;}
    clearTimeout(this.timer);this.state='hiding';const seq=++this.sequence;
    // Native events have no session ID. Keep ALL writable listeners absent until
    // hide completes and the completion turn drains. Tokens only guard callbacks.
    const finish=()=>{if(seq!==this.sequence)return;clearTimeout(this.timer);this.timer=setTimeout(()=>{if(seq!==this.sequence)return;this.state='idle';this.current=undefined;this.show();},0);};
    const failed=()=>{if(seq!==this.sequence)return;this.pending=undefined;finish();};
    this.timer=setTimeout(failed,1500);
    try{this.api.hideKeyboard({success:finish,fail:failed});}catch{failed();}
  }
  private show(){
    const target=this.pending;this.pending=undefined;if(!target||!target.valid())return;
    this.current=target;this.kind=target.kind;this.draft=target.value;this.state='showing';const seq=++this.sequence;
    const live=()=>seq===this.sequence&&this.writable&&this.current===target;
    const input=(e:{value:string})=>{if(!live())return;if(!target.valid()){this.close();return;}this.draft=e.value;target.change(e.value);this.redraw();};
    const complete=(e?:{value:string})=>{if(!live())return;if(e)input(e);this.close();};
    const height=(e:{height:number})=>{if(seq===this.sequence&&this.current===target&&target.valid()){
      this.height=Number.isFinite(e.height)?Math.max(0,e.height):0;this.redraw();
    }};
    this.api.onKeyboardInput(input);this.api.onKeyboardConfirm(complete);this.api.onKeyboardComplete(complete);this.api.onKeyboardHeightChange?.(height);
    this.cleanup=()=>{this.api.offKeyboardInput(input);this.api.offKeyboardConfirm(complete);this.api.offKeyboardComplete(complete);this.api.offKeyboardHeightChange?.(height);};
    const ready=()=>{if(seq!==this.sequence)return;clearTimeout(this.timer);this.state='open';this.writable=true;this.redraw();};
    const fail=()=>{if(seq!==this.sequence)return;this.pending=undefined;this.hide();};
    this.timer=setTimeout(fail,1500);
    try{this.api.showKeyboard({defaultValue:target.value,maxLength:{nickname:12,code:6,word:40,chat:200}[target.kind],multiple:false,confirmHold:true,confirmType:'send',success:ready,fail});}catch{fail();}
    this.redraw();
  }
}
