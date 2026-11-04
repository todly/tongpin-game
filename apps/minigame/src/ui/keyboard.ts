export type InputKind='nickname'|'code'|'word'|'chat';
export class Keyboard {
  private generation=0;private cleanup?:()=>void;private commit?:()=>void;
  draft='';kind?:InputKind;height=0;
  constructor(private api=wx,private redraw=()=>{}){}
  close(){this.generation++;this.cleanup?.();this.cleanup=undefined;this.commit=undefined;this.kind=undefined;this.height=0;this.api.hideKeyboard({});this.redraw();}
  confirm(){this.commit?.();}
  open(kind:InputKind,value:string,valid:()=>boolean,change:(v:string)=>void){
    this.close();const generation=this.generation;this.kind=kind;this.draft=value;
    const input=(e:{value:string})=>{if(generation!==this.generation)return;if(!valid()){this.close();return;}this.draft=Array.from(kind==='code'?e.value.toUpperCase():e.value).slice(0,{nickname:20,code:6,word:40,chat:200}[kind]).join('');change(this.draft);this.redraw();};
    this.commit=()=>{this.close();};
    const confirm=(e:{value:string})=>{if(generation!==this.generation)return;input(e);if(generation===this.generation)this.confirm();};
    // Input updates only the field; completion never submits a business action.
    const complete=(e?:{value:string})=>{if(generation===this.generation)confirm(e??{value:this.draft});};
    const height=(e:{height:number})=>{if(generation===this.generation){this.height=Math.max(0,e.height||0);this.redraw();}};
    this.api.onKeyboardInput(input);this.api.onKeyboardConfirm(confirm);this.api.onKeyboardComplete(complete);this.api.onKeyboardHeightChange?.(height);
    this.cleanup=()=>{this.api.offKeyboardInput(input);this.api.offKeyboardConfirm(confirm);this.api.offKeyboardComplete(complete);this.api.offKeyboardHeightChange?.(height);};
    this.api.showKeyboard({defaultValue:value,maxLength:{nickname:20,code:6,word:40,chat:200}[kind],multiple:kind==='chat',confirmHold:false,confirmType:'done',fail:()=>{if(generation===this.generation)this.close();}});this.redraw();
  }
}
