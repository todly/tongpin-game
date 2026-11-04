import { rounded } from '../ui/renderer';
import { formatEvent, orderedTimeline, playerColor, type RoomState } from '@word-sync/shared';
export function wrapText(text:string,measure:(s:string)=>number,width:number){const lines:string[]=[];let line='';for(const char of text){if(char==='\n'){lines.push(line);line='';continue;}if(line&&measure(line+char)>width){lines.push(line);line=char;}else line+=char;}lines.push(line);return lines;}
export function reportPages(room:RoomState,logs:boolean,measure:(s:string)=>number){
  const lines:{text:string;color:string}[]=[];
  for(const round of room.history){lines.push({text:`第 ${round.round} 回合`,color:'#222222'});for(const s of round.submissions)for(const text of wrapText(`${s.nickname}：${s.timedOut?'时间到':s.word||'空白'}`,measure,560))lines.push({text,color:playerColor(s.colorId,'light')});if(logs)for(const item of orderedTimeline(round.feed))for(const text of wrapText(formatEvent(item),measure,560))lines.push({text,color:playerColor(item.colorId,'light')});}
  if(!lines.length)lines.push({text:'暂无回合词语',color:'#222222'});
  const pages:typeof lines[]=[];for(let i=0;i<lines.length;i+=24)pages.push(lines.slice(i,i+24));return pages;
}
export async function exportReport(room:RoomState,logs:boolean,api=wx):Promise<string[]>{
  const canvas=api.createCanvas();canvas.width=640;canvas.height=1000;const ctx=canvas.getContext('2d');ctx.font='24px sans-serif';
  const pages=reportPages(room,logs,(s:string)=>ctx.measureText(s).width),files:string[]=[];
  for(let i=0;i<pages.length;i++){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,640,1000);ctx.fillStyle='#edf3ef';rounded(ctx,{x:24,y:84,w:592,h:846},22);ctx.fill();ctx.strokeStyle='#b8cdc0';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#20382d';ctx.font='bold 30px sans-serif';ctx.fillText(`同频词 · ${i+1}/${pages.length}`,40,60);ctx.font='24px sans-serif';let y=110;for(const line of pages[i]){ctx.fillStyle=line.color;ctx.fillText(line.text,40,y);y+=34;}ctx.fillStyle='#555555';ctx.fillText(logs?'包含本人授权可见记录':'仅分享回合词语',40,960);
    files.push(await new Promise<string>((resolve,reject)=>canvas.toTempFilePath({fileType:'png',success:(r:any)=>resolve(r.tempFilePath),fail:()=>reject(new Error('纪念图片生成失败。'))})));
  }return files;
}
