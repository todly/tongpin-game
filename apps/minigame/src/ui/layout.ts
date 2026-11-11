import {normalizeMeasure,type MeasureInput,type MeasureText,type TextMetrics} from './text';
export type Rect={x:number;y:number;w:number;h:number};
export type Node=Rect&{kind:'text'|'box'|'button'|'timer';lineHeight?:number;metrics?:TextMetrics;baseline?:'middle';field?:string;padRight?:number;focused?:boolean;caret?:boolean;weight?:number;seconds?:number;progress?:number;text?:string;lines?:string[];size?:number;color?:string;fill?:string;stroke?:string;align?:'left'|'center';radius?:number;enabled?:boolean;action?:()=>void};
export const clamp=(n:number,max:number)=>Math.max(0,Math.min(max,n));
// No authoritative deadline means no timer signal; callers must not fabricate 0.
export function deadlineSeconds(deadline:number|null|undefined,now:number){if(deadline==null||!Number.isFinite(deadline)||!Number.isFinite(now))return undefined;return Math.max(0,Math.ceil((deadline-now)/1000));}
export function dockTop(height:number,safeBottom:number,keyboardHeight:number,footerHeight:number,fullHeight=height){
 const covered=keyboardHeight>0?Math.max(0,keyboardHeight-Math.max(0,fullHeight-height)):safeBottom;
 return Math.max(0,height-covered-footerHeight);
}
export function contains(r:Rect,x:number,y:number){return x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;}
export function nodeBounds(nodes:Node[]){if(!nodes.length)return {x:0,y:0,w:0,h:0};const x=Math.min(...nodes.map(n=>n.x)),y=Math.min(...nodes.map(n=>n.y)),right=Math.max(...nodes.map(n=>n.x+n.w)),bottom=Math.max(...nodes.map(n=>n.y+n.h));return {x,y,w:right-x,h:bottom-y};}
export class Layout {
 nodes:Node[]=[];y=0;readonly measure:MeasureText;
 constructor(readonly width:number,measure:MeasureInput,public inset=20){this.measure=normalizeMeasure(measure);}
 get contentWidth(){return this.width-this.inset*2;}
 text(text:string,size=15,color='#f6f2eb',x=this.inset,w=this.contentWidth,align:'left'|'center'='left',weight=400,gap=size>=18?10:6){
  const metrics=this.measure(text,size,weight),lineHeight=metrics.lineHeight+5,lines:string[]=[];for(const paragraph of text.split('\n')){let line='';for(const ch of paragraph){if(line&&this.measure(line+ch,size,weight).width>w){lines.push(line);line='';}line+=ch;}lines.push(line);}
  // block 高度只包含真实末行 ink，行间距不会泄漏到卡片底部。
  const h=(lines.length-1)*lineHeight+metrics.ink;this.nodes.push({kind:'text',x,y:this.y,w,h,lines,size,color,align,weight,lineHeight,metrics});this.y+=h+gap;return h;
 }
 // 眉题与辅助胶囊共享一行，正文标题与顶部房间码保持不同层级。
 heading(eyebrow:string,title:string,pill:string){const start=this.y,pillWidth=this.measure(pill,11,500).width+20;this.box(start,24,this.width-this.inset-pillWidth,pillWidth,'#302c48','#4a4269',12);this.text(eyebrow,10,'#b9afe9',this.inset,this.contentWidth-pillWidth-12,'left',600,0);this.y=start;this.text(pill,11,'#ddd6fa',this.width-this.inset-pillWidth,pillWidth,'center',500,0);Object.assign(this.nodes[this.nodes.length-1]!,{y:start,h:24,baseline:'middle'});this.y=start+32;this.text(title,24,'#f6f2ff',this.inset,this.contentWidth,'left',700,10);this.box(this.y,1,this.inset,this.contentWidth,'#3c3656','',0);this.box(this.y,2,this.inset,28,'#b9a4ff','',0);this.y+=18;}
 hero(){const start=this.y;this.text('灵感交汇 / WORD SYNC',10,'#c5bddf',this.inset,this.contentWidth-27,'left',600,0);this.y=start+30;this.text('同频脑电波',32,'#c2b5ff',this.inset,this.contentWidth,'left',500,10);this.text('一个词，想到一起。',13,'#b8bbce',this.inset,this.contentWidth,'left',400,12);this.box(this.y,1,this.inset,this.contentWidth,'#453e62','',0);this.box(this.y,2,this.inset,42,'#d8ff72','',0);this.y+=18;}
 // 按真实字宽换行，事件中的作者保持个人色，正文使用中性色。
 rich(parts:{text:string;color:string}[],size=12){let x=this.inset,y=this.y;const created:Node[]=[];for(const part of parts)for(const ch of part.text){const metrics=this.measure(ch,size),w=metrics.width;if(ch==='\n'||x+w>this.width-this.inset){x=this.inset;y+=metrics.lineHeight+5;if(ch==='\n')continue;}const node:Node={kind:'text',x,y,w,h:metrics.ink,lines:[ch],size,color:part.color,lineHeight:metrics.lineHeight+5,metrics};this.nodes.push(node);created.push(node);x+=w;}this.y=nodeBounds(created).y+nodeBounds(created).h;return created;}
 box(y:number,h:number,x=this.inset,w=this.contentWidth,fill='#202238',stroke='#303247',radius=22){this.nodes.push({kind:'box',x,y,w,h,fill,stroke,radius});}
 button(text:string,action:()=>void,enabled=true,x=this.inset,w=this.contentWidth,fill='#d8ff72',color='#17191f',h=48){const size=15,n:Node={kind:'button',x,y:this.y,w,h,text,action,enabled,fill,color,radius:13,size,metrics:this.measure(text,size,600)};this.nodes.push(n);this.y+=h+10;return n;}
 // 字段内嵌小按钮：绘制在字段内部右侧，不推进布局 y；字段文本通过 padRight 自动避让按钮区域。
 fieldButton(field:Node,text:string,action:()=>void,enabled=true,w=76,h=32,gap=8){const n:Node={kind:'button',x:field.x+field.w-w-gap,y:field.y+(field.h-h)/2,w,h,text,action,enabled,fill:'#282b42',color:'#ececf5',radius:10,size:12,metrics:this.measure(text,12,600)};this.nodes.push(n);field.padRight=w+gap*2;return n;}
 // 页面边距和卡片内边距分别计算，嵌套内容不能贴到卡片边缘。
 card(build:()=>void,stroke='#303247',fill='#202238',padding=16,gap=16){const start=this.y,index=this.nodes.length,inset=this.inset;this.y+=padding;this.inset+=padding;build();this.inset=inset;this.y+=padding;this.nodes.splice(index,0,{kind:'box',x:inset,y:start,w:this.width-inset*2,h:this.y-start,fill,stroke,radius:18});this.y+=gap;}
 // 圆环是倒计时控件，不是统计图；固定尺寸避免窄屏挤压正文。
 timer(seconds:number,total:number){if(!Number.isFinite(seconds))return;this.nodes.push({kind:'timer',x:this.inset,y:this.y,w:this.contentWidth,h:88,seconds,progress:clamp(seconds/Math.max(1,total),1),color:'#d8ff72'});this.y+=104;}
 row(build:()=>void,h:number){const start=this.y;build();this.y=start+h;}
 rowFields(value:{text:string;placeholder?:string;action:()=>void;enabled:boolean;field?:'word'|'chat';focused?:boolean},button:{text:string;action:()=>void;enabled:boolean;fill?:string},buttonWidth=92,h=44){const start=this.y,gap=8,inputWidth=Math.max(96,this.contentWidth-buttonWidth-gap);const input=this.button(value.text||value.placeholder||'点此输入',value.action,value.enabled,this.inset,inputWidth,'#121421',value.text?'#f6f2eb':'#b8bbce',h);input.field=value.field??'word';input.focused=value.focused;input.stroke='#4a4d60';input.size=value.text?14:12;input.weight=value.text?600:400;input.metrics=this.measure(input.text||'',input.size,input.weight);this.y=start;const submit=this.button(button.text,button.action,button.enabled,this.inset+inputWidth+gap,buttonWidth,button.fill||'#d8ff72',button.fill&&button.fill!=='#d8ff72'?'#ffffff':'#17191f',h);submit.size=14;submit.metrics=this.measure(submit.text||'',14,600);this.y=start+h;return {input,button:submit};}
}
