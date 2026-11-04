import { type RoomState } from '@word-sync/shared';
import { Layout } from '../ui/layout';
import { render } from '../ui/renderer';
import { historyLayout } from '../ui/history';
import { PngStream } from './png';
export function wrapText(text:string,measure:(s:string)=>number,width:number){const lines:string[]=[];let line='';for(const char of text){if(char==='\n'){lines.push(line);line='';continue;}if(line&&measure(line+char)>width){lines.push(line);line=char;}else line+=char;}lines.push(line);return lines;}
const WIDTH=640,BLOCK=512,MAX_PIXELS=48_000_000,MAX_HEIGHT=100_000,MAX_BYTES=24_000_000;
export function reportPages(room:RoomState,logs:boolean,measure:(s:string,size?:number,weight?:number)=>number){
 const l=new Layout(WIDTH,(s,size,weight)=>measure(s,size,weight));l.y=96;historyLayout(l,room,logs);const rawHeight=Math.ceil(l.y+32),scale=Math.min(1,Math.sqrt(MAX_PIXELS/(WIDTH*rawHeight)),MAX_HEIGHT/rawHeight);const height=Math.ceil(rawHeight*scale),width=Math.floor(WIDTH*scale);
 if(!Number.isFinite(scale)||scale<0.65||height>MAX_HEIGHT||width*height>MAX_PIXELS)throw new Error('纪念长图超出设备尺寸或文件预算，请取消日志后重试；不会截断记录或拆分图片。');
 return [{nodes:l.nodes.map(n=>({...n,x:n.x*scale,y:n.y*scale,w:n.w*scale,h:n.h*scale,size:(n.size||15)*scale,radius:(n.radius||0)*scale,lineHeight:((n.size||15)+5)*scale})),height,width,scale}];
}
export async function exportReport(room:RoomState,logs:boolean,api=wx):Promise<string[]>{
 const canvas=api.createCanvas();const ctx=canvas.getContext('2d');
 const [page]=reportPages(room,logs,(s,size=15,weight=400)=>{ctx.font=`${weight} ${size}px sans-serif`;return ctx.measureText(s).width;});
 const width=page.width;const paint=(y:number,h:number)=>{canvas.width=width;canvas.height=h;ctx.fillStyle='#111321';ctx.fillRect(0,0,width,h);ctx.font='600 24px sans-serif';ctx.fillStyle='#eee8ff';ctx.fillText('我们的灵感足迹',20,40-y);ctx.font='12px sans-serif';ctx.fillStyle='#b8bbce';ctx.fillText(logs?'包含本人授权可见记录':'仅分享回合词语',20,65-y);render(ctx,page.nodes.filter(n=>n.y+n.h>y&&n.y<y+h),-y);};
 if(page.height<=4096){paint(0,page.height);return [await new Promise<string>((resolve,reject)=>canvas.toTempFilePath({fileType:'png',success:(r:any)=>resolve(r.tempFilePath),fail:()=>reject(new Error('纪念图片生成失败。'))}))];}
 const fs=api.getFileSystemManager?.(),root=api.env?.USER_DATA_PATH;
 if(!fs?.openSync||!fs?.writeSync||!fs?.closeSync||!ctx.getImageData||!root)throw new Error('当前设备不支持分块长图文件写入，请更新微信或取消日志后重试。');
 const path=`${root}/word-sync-${Date.now()}.png`;let fd:string|undefined;let writtenBytes=0;
 try{fd=fs.openSync({filePath:path,flag:'w'});const png=new PngStream(bytes=>{writtenBytes+=bytes.length;if(writtenBytes>MAX_BYTES)throw new Error("纪念长图压缩后仍超过24MB文件预算，请取消日志后重试；不会截断记录或分页。");let offset=0;while(offset<bytes.length){const result=fs.writeSync({fd,data:bytes.buffer,offset,length:bytes.length-offset});const written=result?.bytesWritten??bytes.length-offset;if(written<=0)throw new Error('文件写入失败');offset+=written;}},width,page.height);
 for(let y=0;y<page.height;y+=BLOCK){const h=Math.min(BLOCK,page.height-y);paint(y,h);png.rows(ctx.getImageData(0,0,width,h).data,width,h);await new Promise<void>(resolve=>setTimeout(()=>resolve(),0));}png.finish();fs.closeSync({fd});fd=undefined;return [path];
 }catch(error){if(fd!==undefined)try{fs.closeSync({fd});}catch{}try{fs.unlinkSync({filePath:path});}catch{}if(error instanceof Error&&error.message.includes('24MB'))throw error;throw new Error('单张长图生成失败，可能是设备内存或存储不足；请释放空间或取消日志后重试。不会截断或分页。');}finally{canvas.width=1;canvas.height=1;}
}
