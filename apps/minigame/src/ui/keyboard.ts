export class Keyboard {
  private generation=0;private cleanup?:()=>void;
  constructor(private api=wx){}
  close(){this.generation++;this.cleanup?.();this.cleanup=undefined;this.api.hideKeyboard({});}
  open(kind:'nickname'|'code'|'word'|'chat',value:string,valid:()=>boolean,change:(v:string)=>void){
    this.close();const generation=this.generation;
    const input=(e:{value:string})=>{if(generation===this.generation&&valid())change(kind==='code'?e.value.toUpperCase():e.value);};
    const confirm=(e:{value:string})=>{if(generation!==this.generation)return;input(e);this.close();};
    const complete=()=>{if(generation===this.generation)this.close();};
    this.api.onKeyboardInput(input);this.api.onKeyboardConfirm(confirm);this.api.onKeyboardComplete(complete);
    this.cleanup=()=>{this.api.offKeyboardInput(input);this.api.offKeyboardConfirm(confirm);this.api.offKeyboardComplete(complete);};
    this.api.showKeyboard({defaultValue:value,maxLength:{nickname:20,code:6,word:40,chat:200}[kind],multiple:kind==='chat',confirmHold:false,confirmType:'done',fail:()=>this.close()});
  }
}
