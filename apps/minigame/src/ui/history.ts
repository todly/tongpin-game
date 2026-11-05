import { orderedTimeline, formatEvent, playerColor, type RoomState, type RoundHistory } from '@word-sync/shared';
import { Layout } from './layout';

export type RoundLogs = ReadonlyMap<number, boolean> | ReadonlySet<number>;
const muted='#b8bbce', text='#f6f2eb';

function logsVisible(logs:boolean|RoundLogs,round:number){return typeof logs==='boolean'?logs:logs instanceof Map?logs.get(round)===true:logs.has(round);}

function eventParts(item:RoundHistory['feed'][number]){
 const value=formatEvent(item);
 if(item.kind==='merge'&&item.names)return [...item.names.flatMap((name,index)=>[{text:index?'、':'',color:muted},{text:name.nickname,color:playerColor(name.colorId)}]),{text:'想到了一起，组成同频小组',color:'#c6cedd'}];
 if(value.startsWith(item.nickname))return [{text:item.nickname,color:playerColor(item.colorId)},{text:value.slice(item.nickname.length),color:'#c6cedd'}];
 return [{text:value,color:'#c6cedd'}];
}

// 历史页与分享图只使用这一套轮次结构；屏幕可按轮次展开，分享图传 true 即全部展开。
export function historyLayout(l:Layout,room:RoomState,logs:boolean|RoundLogs,onToggle?:(round:number)=>void){
 for(const round of room.history){
  const open=logsVisible(logs,round.round),start=l.y,index=l.nodes.length,outerInset=l.inset;
  l.inset+=16;
  const badgeY=start+16,badgeW=Math.max(74,l.measure(`第 ${round.round} 回合`,11,600).width+24);
  l.box(badgeY,26,l.inset,badgeW,'#d8ff72','',13);
  l.y=badgeY;l.text(`第 ${round.round} 回合`,11,'#17191f',l.inset,badgeW,'center',600,0);Object.assign(l.nodes[l.nodes.length-1]!,{y:badgeY,h:26,baseline:'middle'});l.y=badgeY+26+12;
  for(const submission of round.submissions){
   const rowY=l.y,nameWidth=Math.min(150,Math.max(64,l.contentWidth*.32));
   l.text(submission.nickname,13,playerColor(submission.colorId),l.inset,nameWidth,'left',600,0);
   l.y=rowY;l.text(submission.timedOut?'':submission.word||'',20,submission.timedOut?'#7d869f':'#eee8ff',l.inset+nameWidth+12,l.contentWidth-nameWidth-12,'left',600,0);
   l.y=Math.max(...l.nodes.slice(-2).map(node=>node.y+node.h))+9;
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
  if(typeof logs!=='boolean'&&round.feed.length&&onToggle){
   const y=l.y;l.y+=4;const toggle=l.button(open?'收起本轮日志':`展开本轮日志 · ${round.feed.length}`,()=>onToggle(round.round),true,l.inset,l.contentWidth,'#282b42','#d9d9e6',34);toggle.size=12;l.y=y+44;
  }
  l.inset=outerInset;l.y+=14;
  l.nodes.splice(index,0,{kind:'box',x:outerInset,y:start,w:l.width-outerInset*2,h:l.y-start,fill:'#202238',stroke:'#403957',radius:18});
  l.y+=16;
 }
 if(!room.history.length)l.text('暂无回合词语',15,muted);
}
