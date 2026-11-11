import { orderedTimeline, formatEvent, playerColor, type RoomState, type RoundHistory } from '@word-sync/shared';
import { Layout } from './layout';

export type RoundLogs = ReadonlyMap<number, boolean> | ReadonlySet<number>;
const muted='#b8bbce', text='#f6f2eb';

function logsVisible(logs:boolean|RoundLogs,round:number){return typeof logs==='boolean'?logs:logs instanceof Map?logs.get(round)===true:logs.has(round);}

function eventParts(item:RoundHistory['feed'][number]){
 const value=formatEvent(item);
 if(item.kind==='merge'&&item.names)return [...item.names.flatMap((name,index)=>[{text:index?'、':'',color:muted},{text:name.nickname,color:playerColor(name.colorId)}]),{text:'达成同频',color:'#c6cedd'}];
 if(value.startsWith(item.nickname))return [{text:item.nickname,color:playerColor(item.colorId)},{text:value.slice(item.nickname.length),color:'#c6cedd'}];
 return [{text:value,color:'#c6cedd'}];
}

// 紧凑答案行：昵称单行超宽省略，与词语垂直居中；历史页与写词页的上轮词语共用。
export function submissionRows(l:Layout,submissions:RoundHistory['submissions']){
 for(const submission of submissions){
  const rowY=l.y,rowX=l.inset,rowW=l.contentWidth,paddingX=9,paddingY=8,accent=playerColor(submission.colorId),contentX=rowX+paddingX,contentW=rowW-paddingX*2;
  const nicknameSize=12,wordSize=15,nicknameW=Math.min(128,contentW*.45,Math.max(54,l.measure(submission.nickname,nicknameSize,600).width)),word=submission.timedOut?'未作答':submission.word||'空白',wordColor=submission.timedOut||!submission.word?'#888ba3':'#eee8ff';
  const chars=Array.from(submission.nickname.replace(/\s+/g,' '));
  let name=chars.join('');
  if(l.measure(name,nicknameSize,600).width>nicknameW){
   while(chars.length&&l.measure(chars.join('')+'…',nicknameSize,600).width>nicknameW)chars.pop();
   name=chars.join('')+'…';
  }
  l.y=rowY+paddingY;l.text(name,nicknameSize,accent,contentX,nicknameW,'left',600,0);
  const nameNode=l.nodes[l.nodes.length-1]!;
  l.y=rowY+paddingY;
  l.text(word,wordSize,wordColor,contentX+nicknameW+10,contentW-nicknameW-10,'left',600,0);
  const wordNode=l.nodes[l.nodes.length-1]!,rowH=Math.max(nameNode.h,wordNode.h)+paddingY*2;
  Object.assign(nameNode,{y:rowY,h:rowH,baseline:'middle'});Object.assign(wordNode,{y:rowY,h:rowH,baseline:'middle'});
  l.nodes.splice(l.nodes.length-2,0,{kind:'box',x:rowX,y:rowY,w:rowW,h:rowH,fill:'#292b43',radius:10});
  l.y=rowY+rowH+8;
 }
}

// 历史页与分享图只使用这一套轮次结构；屏幕可按轮次展开，分享图传 true 即全部展开。
export function historyLayout(
 l:Layout,room:RoomState,logs:boolean|RoundLogs,onToggle?:(round:number)=>void,newestFirst=false,
){
 const rounds=newestFirst?[...room.history].reverse():room.history;
 for(const round of rounds){
  const open=logsVisible(logs,round.round),start=l.y,index=l.nodes.length,outerInset=l.inset;
  l.inset+=16;
  const badgeY=start+16,badgeW=Math.max(74,l.measure(`第 ${round.round} 回合`,11,600).width+24);
  l.box(badgeY,26,l.inset,badgeW,'#d8ff72','',13);
  l.y=badgeY;l.text(`第 ${round.round} 回合`,11,'#17191f',l.inset,badgeW,'center',600,0);Object.assign(l.nodes[l.nodes.length-1]!,{y:badgeY,h:26,baseline:'middle'});l.y=badgeY+26+12;
  if(typeof logs!=='boolean'&&round.feed.length&&onToggle){
   const label=open?'收起本轮日志':`展开本轮日志 · ${round.feed.length}`;
   const toggle=l.button(label,()=>onToggle(round.round),true,l.inset,l.contentWidth,'#282b42','#d9d9e6',34);
   toggle.size=12;
  }
  if(open&&round.feed.length){
   l.y+=4;l.box(l.y,1,l.inset,l.contentWidth,'#403957','',0);l.y+=12;
   for(const item of orderedTimeline(round.feed)){
    const itemStart=l.y,itemIndex=l.nodes.length,itemInset=l.inset;
    l.inset+=10;
    if(item.kind==='chat'){
     l.y=itemStart+8;
     l.text(item.nickname,11,playerColor(item.colorId),l.inset,l.contentWidth,'left',600,3);
     l.text(item.text,13,text,l.inset,l.contentWidth,'left',400,0);
     const itemEnd=l.y+8;l.nodes.splice(itemIndex,0,{kind:'box',x:itemInset,y:itemStart,w:l.width-itemInset*2,h:itemEnd-itemStart,fill:'#2b2e46',stroke:'#3c405d',radius:9});l.y=itemEnd;
    }else{
     const textNodes=l.rich(eventParts(item),11),top=Math.min(...textNodes.map(node=>node.y)),bottom=Math.max(...textNodes.map(node=>node.y+node.h));
     l.nodes.splice(itemIndex,0,{kind:'box',x:itemInset,y:top,w:2,h:bottom-top,fill:'#7d869f',radius:0});
    }
    l.inset=itemInset;l.y+=5;
   }
  }
  if(open&&round.feed.length)l.y+=8;
  submissionRows(l,round.submissions);
  l.inset=outerInset;l.y+=14;
  l.nodes.splice(index,0,{kind:'box',x:outerInset,y:start,w:l.width-outerInset*2,h:l.y-start,fill:'#202238',stroke:'#403957',radius:18});
  l.y+=16;
 }
}
