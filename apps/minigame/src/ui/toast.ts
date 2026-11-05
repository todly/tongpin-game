export class Toast {
  text='';error=false;private until=0;private lastError='';
  constructor(private now=()=>Date.now()){}
  push(text:string,error=false){if(!text)return;if(this.text===text&&this.error===error&&this.now()<this.until)return;this.text=text;this.error=error;this.until=this.now()+5000;}
  observeError(error:string){if(error!==this.lastError){this.lastError=error;if(error)this.push(error,true);}}
  visible(){return this.now()<this.until?this.text:'';}
  clear(){this.text='';this.until=0;}
}
