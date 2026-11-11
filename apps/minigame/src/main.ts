import { randomNickname, playerColor, orderedTimeline, formatEvent, normalizeNickname, normalizeWord, createContentGuard } from '@word-sync/shared';
import { GameStore } from './stores/game';
import { Keyboard } from './ui/keyboard';
import { Clipboard } from './platform/clipboard';
import { Toast } from './ui/toast';
import { historyLayout } from './ui/history';
import { exportReport } from './utils/report';
import { Layout, clamp, contains, deadlineSeconds, dockTop } from './ui/layout';
import { render, hit } from './ui/renderer';
import { canvasMeasure } from './ui/text';
const game=new GameStore(),keyboard=new Keyboard(wx,()=>draw()),canvas=wx.createCanvas(),ctx=canvas.getContext('2d');
let width=0,height=0,top=0,bottom=0,scroll=0,active=true;
let nickname=randomNickname(),code='',chat='',history=false,logs=false,exporting=false,files:string[]=[];
const toast=new Toast();
const clipboard=new Clipboard(wx,message=>{toast.push(message);draw();});
let footerTop=0,fullHeight=0;
const expanded=new Set<number>();
let newestRoundFirst=false;
let body:Layout,header:Layout,footer:Layout,viewport={x:0,y:0,w:0,h:0};
function resize(){const info=wx.getSystemInfoSync();width=info.windowWidth;height=info.windowHeight;fullHeight=keyboard.state==='idle'?height:Math.max(fullHeight,height);const dpr=info.pixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);top=Math.max(16,info.safeArea?.top||0);try{const rect=wx.getMenuButtonBoundingClientRect?.();top=Math.max(top,rect&&Number.isFinite(rect.bottom)&&rect.bottom>0?rect.bottom+12:top+48);}catch{top+=48;}bottom=Math.max(16,height-(info.safeArea?.bottom||height));draw();}
function run(event:string,data:unknown=null){keyboard.close();if(event==='room:create'||event==='room:join')data={...(data as object),nickname:normalizeNickname(nickname),...(event==='room:join'?{code:code.trim().toUpperCase()}: {})};if(event==='lobby:rename')data=normalizeNickname(nickname);if(event==='game:submit'||event==='group:propose')data={...(data as object),word:normalizeWord(game.word)};toast.clear();void game.act(event,data).catch(()=>{draw();});}
function stamp(){return `${game.room?.view}|${game.room?.roundId}|${game.candidate?.id}|${game.submitted}|${game.session?.playerId}`;}
// 输入即校验：命中敏感词立即清空输入框，避免违规内容停留在输入框里。
type ContentGuard = ReturnType<typeof createContentGuard>;
const guards: Record<string, ContentGuard> = {};
function guard(kind:'nickname'|'word'|'chat'){
  return guards[kind]??=createContentGuard({
    check:text=>game.check(text,kind==='nickname'?1:5),
    onHit:message=>{
      if(kind==='nickname')nickname='';else if(kind==='word')game.word='';else chat='';
      keyboard.clear(kind);toast.push(message);draw();
    },
  });
}
function input(kind:'nickname'|'code'|'word'|'chat'){const key=stamp();keyboard.open(kind,{nickname,code,word:game.word,chat}[kind],()=>active&&key===stamp()&&game.available,v=>{if(kind==='nickname')nickname=v;if(kind==='code')code=v;if(kind==='word')game.word=v;if(kind==='chat')chat=v;if(kind!=='code')guard(kind).input(v);draw();});}
function copyCode(){clipboard.copy(game.room?.code||'');}
function share(){wx.shareAppMessage({title:'来同频脑电波，看看我们能否想到一起',query:game.room?`roomCode=${encodeURIComponent(game.room.code)}`:''});}
async function generate(){if(!game.room||exporting)return;const identity=game.session?.playerId,gameId=game.room.gameId;exporting=true;draw();try{const generated=await exportReport(JSON.parse(JSON.stringify(game.room)),logs);if(identity!==game.session?.playerId||gameId!==game.room?.gameId)return;files=generated;toast.push(`图片已生成，点击查看图片后可长按自行保存。`);}catch(e){toast.push((e as Error).message);}finally{exporting=false;draw();}}
function preview(){if(!files.length)return;wx.previewImage({current:files[0],urls:files,fail:()=>{toast.push('图片查看失败，请重新生成后重试。');draw();}});}
const muted='#b8bbce',lime='#d8ff72',violet='#8376ff';
function secondary(l:Layout,label:string,action:()=>void,enabled=true,x=l.inset,w=l.contentWidth){const n=l.button(label,action,enabled,x,w,'#282b42','#e0dbea');n.stroke='#403d56';n.size=14;n.weight=500;return n;}
function field(l:Layout,label:string,kind:'nickname'|'code'|'word'|'chat',enabled=game.available,placeholder='点此输入'){const value={nickname,code,word:game.word,chat}[kind];if(label)l.text(label,12,muted);const n=l.button(value||placeholder,()=>input(kind),enabled,l.inset,l.contentWidth,'#121421',value?'#f6f2eb':muted,48);n.field=kind;n.focused=keyboard.kind===kind;n.stroke='#403e56';n.weight=500;if(!value){n.size=12;n.weight=400;n.metrics=l.measure(n.text||'',12,400);}return n;}
function clippedText(l:Layout,text:string,size:number,width:number,weight=400){
 const chars=Array.from(text.replace(/\s+/g,' '));if(l.measure(chars.join(''),size,weight).width<=width)return chars.join('');
 while(chars.length&&l.measure(chars.join('')+'…',size,weight).width>width)chars.pop();return chars.join('')+'…';
}
function players(l:Layout){const room=game.room!;const drawn=new Set<string>();
 const lastRound=room.view==='writing'?room.history[room.history.length-1]:undefined;
 // 所有玩家坐标相对当前卡片，组框四边保留完整 16px。
 const player=(p:typeof room.players[number])=>{const canKick=room.view==='lobby'&&game.isOwner&&p.id!==room.ownerId,y=l.y,x=l.inset,statusWidth=room.view==='lobby'||room.view==='writing'?58:0,kickWidth=canKick?72:0,nameX=x+50,availableNameWidth=l.contentWidth-50-(statusWidth?statusWidth+8:0)-kickWidth,nameWidth=lastRound?Math.min(96,availableNameWidth*.46):availableNameWidth;l.box(y,38,x,38,playerColor(p.colorId),'',13);l.text(Array.from(p.nickname)[0]||'',18,'#171923',x,38,'center',700,0);Object.assign(l.nodes[l.nodes.length-1],{y,h:38,baseline:'middle'});
 // 当前用户使用独立头像角标，避免长昵称省略时把身份标识一起截掉。
 if(p.id===game.me?.id){l.box(y+25,16,x+22,20,lime,'#202238',5);l.y=y+25;l.text('我',9,'#171923',x+22,20,'center',600,0);Object.assign(l.nodes[l.nodes.length-1]!,{y:y+25,h:16,baseline:'middle'});}
 const nameSize=lastRound?12:14;l.y=y;l.text(clippedText(l,p.nickname,nameSize,nameWidth),nameSize,playerColor(p.colorId),nameX,nameWidth);l.y=y+23;l.text(`${p.id===room.ownerId?'房主 · ':''}${p.connected?'在线':'离线'}`,10,muted,nameX,nameWidth);
 if(lastRound){
  const entry=lastRound.submissions.find(s=>s.playerId===p.id),word=entry?(entry.timedOut?'未作答':entry.word||'空白'):'—',wordX=nameX+nameWidth+10,wordWidth=availableNameWidth-nameWidth-10;
  const wordSize=10,pillPadding=10,pillWidth=Math.min(wordWidth,Math.max(60,l.measure(word,wordSize,500).width+pillPadding*2)),pillY=y+6,pillHeight=26;
  l.box(pillY,pillHeight,wordX,pillWidth,'#302d49','#49425f',14);
  l.y=pillY;l.text(clippedText(l,word,wordSize,pillWidth-pillPadding*2,500),wordSize,entry?.word&&!entry.timedOut?'#e7ddff':'#9994ad',wordX+pillPadding,pillWidth-pillPadding*2,'center',500,0);
  Object.assign(l.nodes[l.nodes.length-1]!,{y:pillY,h:pillHeight,baseline:'middle'});
 }

 // 房主在大厅可移出其他玩家：按钮固定在行右侧，昵称与状态文本自动避让。
 if(canKick){const kick=l.button('移出',()=>{wx.showModal({title:'移出玩家',content:`确定将「${p.nickname}」移出房间吗？`,success:(res:{confirm:boolean})=>{if(res.confirm)run('room:kick',{playerId:p.id});}});},game.available,x+l.contentWidth-64,64,'#392a3e','#efa7b8',34);kick.y=y+2;kick.size=11;kick.stroke='#5b3c50';}
 const status=room.view==='lobby'?(p.ready?'已准备':'未准备'):room.view==='writing'?(room.submittedPlayerIds.includes(p.id)?'✓ 已锁定':'思考中'):'';
 if(statusWidth){const ready=room.view==='lobby'?p.ready:room.submittedPlayerIds.includes(p.id),statusX=x+l.contentWidth-statusWidth-kickWidth;
  l.box(y+7,24,statusX,statusWidth,ready?'#303b2d':'#2c2b40','',12);
  l.y=y+7;l.text(room.view==='lobby'&&room.phase==='ended'&&!p.returnedToLobby?'看结果中':status,10,ready?lime:'#aaa5bf',statusX,statusWidth,'center',500,0);
  Object.assign(l.nodes[l.nodes.length-1]!,{y:y+7,h:24,baseline:'middle'});
 }l.y=y+38;};
 for(const group of room.view==='lobby'?[]:room.currentGroups){const members=group.members.map(id=>room.players.find(p=>p.id===id)).filter((p):p is typeof room.players[number]=>!!p);if(members.length)l.card(()=>{members.forEach((p,i)=>{if(i)l.y+=14;drawn.add(p.id);player(p);});},violet,'#23263b');}
 for(const p of room.players)if(!drawn.has(p.id)){player(p);l.y+=14;}
}
function timeline(l:Layout,feed:Parameters<typeof orderedTimeline>[0]){for(const item of orderedTimeline(feed)){const start=l.y,index=l.nodes.length,inset=l.inset;l.inset+=10;if(item.kind==='chat'){l.y=start+8;l.text(item.nickname,12,playerColor(item.colorId));l.text(item.text,14,'#f6f2eb',l.inset,l.contentWidth,'left',400,0);const end=l.y+8;l.nodes.splice(index,0,{kind:'box',x:inset,y:start,w:width-inset*2,h:end-start,fill:'#2b2e46',radius:10});l.y=end;}else{const text=formatEvent(item);let textNodes;if(item.kind==='merge'&&item.names){textNodes=l.rich([...item.names.flatMap((name,i)=>[{text:i?'、':'',color:muted},{text:name.nickname,color:playerColor(name.colorId)}]),{text:'达成同频',color:'#c6cedd'}]);}else if(['submission','proposed','agreed','refused'].includes(item.kind)){textNodes=l.rich([{text:item.nickname,color:playerColor(item.colorId)},{text:text.slice(item.nickname.length),color:'#c6cedd'}]);}else{const textIndex=l.nodes.length;l.text(text,12,'#c6cedd',l.inset,l.contentWidth,'left',400,0);textNodes=l.nodes.slice(textIndex);}const top=Math.min(...textNodes.map(n=>n.y)),bottom=Math.max(...textNodes.map(n=>n.y+n.h));l.nodes.splice(index,0,{kind:'box',x:inset,y:top,w:2,h:bottom-top,fill:'#7d869f',radius:0});l.y=bottom;}l.inset=inset;l.y+=6;}}
function submissions(l:Layout,items:NonNullable<typeof game.room>['visibleSubmissions']){
 const gap=10,tileWidth=(l.contentWidth-gap)/2;
 for(let i=0;i<items.length;i+=2){
  const rowY=l.y,tiles=items.slice(i,i+2).map((entry,index)=>{
   const tile=new Layout(tileWidth,l.measure,12);tile.y=14;
   tile.text(clippedText(tile,entry.nickname,11,tile.contentWidth,500),11,playerColor(entry.colorId),tile.inset,tile.contentWidth,'left',500,12);
   tile.text(entry.timedOut?'未作答':entry.word||'空白',18,entry.timedOut||!entry.word?'#9691aa':'#f1ebff',tile.inset,tile.contentWidth,'left',600,0);
   return {tile,x:l.inset+index*(tileWidth+gap),height:Math.max(88,tile.y+14)};
  });
  const height=Math.max(...tiles.map(t=>t.height));
  for(const {tile,x} of tiles){l.box(rowY,height,x,tileWidth,'#27243b','#453b59',16);l.nodes.push(...tile.nodes.map(n=>({...n,x:n.x+x,y:n.y+rowY})));}
  l.y=rowY+height+gap;
 }
 l.y+=6;
}
function settings(l:Layout){const room=game.room!,editable=game.available&&game.isOwner;
 l.card(()=>{
  const headerY=l.y,badgeWidth=84,badgeX=l.inset+l.contentWidth-badgeWidth;
  l.text('房间设置',16,'#f6f2ff',l.inset,l.contentWidth-badgeWidth-12,'left',600,0);
  l.box(headerY,24,badgeX,badgeWidth,'#302c48','',12);
  l.y=headerY;l.text(game.isOwner?'房主可修改':'仅房主可修改',10,'#c9b8f3',badgeX,badgeWidth,'center',500,0);
  Object.assign(l.nodes[l.nodes.length-1]!,{y:headerY,h:24,baseline:'middle'});
  l.y=headerY+40;
  for(const [label,detail,value,min,max,step,key] of [
   ['每轮计时','10–180 秒',room.settings.timerSeconds,10,180,5,'timerSeconds'],
   ['最多回合','1–30 回合',room.settings.maxRounds,1,30,1,'maxRounds'],
  ] as const){
   const y=l.y,controlW=144,controlX=l.inset+l.contentWidth-controlW,labelW=l.contentWidth-controlW-12;
   l.y=y+3;l.text(label,13,'#e8e3f2',l.inset,labelW,'left',500,0);
   l.y=y+25;l.text(detail,10,'#9693ad',l.inset,labelW,'left',400,0);
   l.box(y,44,controlX,controlW,'#191b2d','#3c3a52',12);
   const minus=l.button('−',()=>run('lobby:settings',{[key]:Math.max(min,value-step)}),editable&&value>min,controlX,44,'#282a40','#ddd5ef',44);
   minus.y=y;minus.radius=12;minus.size=20;
   l.y=y;l.text(`${value}${key==='timerSeconds'?' 秒':' 轮'}`,13,'#eee6ff',controlX+44,56,'center',600,0);
   Object.assign(l.nodes[l.nodes.length-1]!,{y,h:44,baseline:'middle'});
   l.y=y;const plus=l.button('＋',()=>run('lobby:settings',{[key]:Math.min(max,value+step)}),editable&&value<max,controlX+100,44,'#282a40','#ddd5ef',44);
   plus.radius=12;plus.size=18;
   l.y=y+60;
  }
  l.box(l.y,1,l.inset,l.contentWidth,'#39364e','',0);l.y+=16;
  const preventRepeatWords=room.settings.preventRepeatWords===true,y=l.y,switchWidth=64,labelW=l.contentWidth-switchWidth-12;
  l.text('禁止重复词语',13,'#e8e3f2',l.inset,labelW,'left',500,0);
  l.y=y+23;l.text('用过的词，本局不可再用',10,'#9693ad',l.inset,labelW,'left',400,0);
  l.y=y;const toggle=l.button(preventRepeatWords?'已开启':'已关闭',()=>run('lobby:settings',{preventRepeatWords:!preventRepeatWords}),editable,l.inset+l.contentWidth-switchWidth,switchWidth,preventRepeatWords?'#d8ff72':'#302d45',preventRepeatWords?'#20251a':'#b2aac5',44);
  toggle.radius=22;toggle.size=11;
  l.y=y+60;l.box(l.y,1,l.inset,l.contentWidth,'#39364e','',0);l.y+=14;
  l.text(game.isOwner?'全员准备后，自动开始游戏':'房主调整设置后，全员准备即可开始',10,'#9693ad',l.inset,l.contentWidth,'left',400,0);
 },'#3e3856','#232238',16,16);
}
function draw(){if(!active||!width)return;
 const measure=canvasMeasure(ctx);body=new Layout(width,measure);header=new Layout(width,measure);footer=new Layout(width,measure);
 header.y=top;const room=game.room;
 // 顶栏拥有独立安全区、字号层级和 44px 触控范围。
 if(room){Object.assign(secondary(header,history?'返回':'历史',()=>{history=!history;scroll=0;keyboard.close();draw();},true,16,52),{size:13,h:44});header.y=top;const label=width<360?`${room.code} · 复制`:`房间 ${room.code} · 复制`;const n=header.button(label,copyCode,true,76,width-152,'#282b42','#ececf5',44);n.size=13;header.y=top;Object.assign(secondary(header,'邀请',share,true,width-68,52),{size:13,h:44});}
 else {header.text('同频脑电波',13,'#d8d1ec',header.inset,header.contentWidth,'left',600);header.y=top+27;header.text('一个词，遇见相同的灵感',11,muted);}
 if(game.recovering)body.text('连接或身份恢复中，请稍候。',13,'#ffc078'); if(!room){body.hero();body.card(()=>{body.fieldButton(field(body,'你的昵称','nickname'),'随机昵称',()=>{nickname=randomNickname();draw();},game.available);body.button('创建房间',()=>run('room:create',{nickname}),game.available);body.y+=8;body.box(body.y,1,body.inset,body.contentWidth,'#39364e','',0);body.y+=18;field(body,'加入别人的房间','code',game.available,'输入六位房间码');secondary(body,'加入房间',()=>run('room:join',{code,nickname}),game.available&&code.length===6);});body.card(()=>{body.text('怎么玩',15,'#e8e1f4',body.inset,body.contentWidth,'left',600,14);
 for(const [i,tip] of ['写下一个词，寻找同频的伙伴','相同词语的伙伴合组，一起思考','组内全员同意候选词，即可锁定','全员同词获胜，达到回合上限揭晓'].entries()){
  const y=body.y;body.box(y,20,body.inset,20,'#35304d','',7);body.text(String(i+1),10,'#c9b8f3',body.inset,20,'center',600,0);Object.assign(body.nodes[body.nodes.length-1]!,{y,h:20,baseline:'middle'});
  body.y=y+3;body.text(tip,12,muted,body.inset+30,body.contentWidth-30,'left',400,0);body.y=Math.max(y+20,body.y)+12;
 }body.y-=6;});}
 else if(history){
  body.heading('我们的灵感足迹','回合历史',`${room.history.length} 回合`);
  if(!room.history.length)body.text('暂无回合记录',15,muted);
  if(room.history.length>1)secondary(body,newestRoundFirst?'倒序 · 点击切换正序':'正序 · 点击切换倒序',()=>{
   newestRoundFirst=!newestRoundFirst;scroll=0;draw();
  });
  historyLayout(body,room,expanded,round=>{
   if(expanded.has(round))expanded.delete(round);else expanded.add(round);
   draw();
  },newestRoundFirst);
 }
 else if(room.view==='lobby'){body.heading('相遇 / GATHER','房间大厅',`${room.players.length}/6 位伙伴`);body.card(()=>{players(body);body.y-=14;},'#3e3856','#232238');body.text('修改昵称',12,muted);{const y=body.y;const n=body.button(nickname||'点此输入',()=>input('nickname'),game.available,20,width-116,'#121421','#f6f2eb',44);n.field='nickname';n.focused=keyboard.kind==='nickname';if(!nickname){n.size=12;n.weight=400;n.color=muted;n.metrics=body.measure(n.text||'',12,400);}n.stroke='#4a4d60';body.y=y;const saveButton=secondary(body,'保存',()=>run('lobby:rename',nickname),game.available,width-88,68);saveButton.h=44;body.y=y+60;}settings(body);secondary(body,'离开房间',()=>run('room:leave'),game.available);footer.button(game.me?.ready?'取消准备':'我准备好了',()=>run('lobby:ready',!game.me?.ready),game.available,20,width-40,game.me?.ready?violet:lime,game.me?.ready?'#ffffff':'#17191f');}
 else if(room.view==='writing'){body.heading('灵感 / THINK',`第 ${room.round} 回合`,`${room.submittedPlayerIds.length}/${room.players.length} 已锁定`);{const seconds=deadlineSeconds(game.remaining('writing'),0);if(seconds!==undefined)body.timer(seconds,room.settings.timerSeconds);}
 // 上轮词语直接整合到玩家行，独立列位于昵称与锁定状态之间。
 players(body);
 if(!room.history.length)body.card(()=>{const promptY=body.y;body.text('写一个词，让脑电波相遇。',13,muted);const prompt=body.nodes[body.nodes.length-1]!;Object.assign(prompt,{y:promptY,h:Math.max(prompt.h,26),baseline:'middle'});body.y=promptY+prompt.h;});
 if(game.candidate){const proposal=game.candidate;body.card(()=>{body.text('同组候选',11,'#bca7f2');body.text(proposal.word,20,'#eee5ff',body.inset,body.contentWidth,'left',600,12);body.text(`已有 ${proposal.confirmations.length}/${proposal.memberIds.length} 位伙伴同意`,11,muted,body.inset,body.contentWidth,'left',400,16);const y=body.y,w=(body.contentWidth-10)/2;body.button('同意',()=>run('group:confirm',{...game.round(),proposalId:proposal.id}),game.available&&!proposal.confirmations.includes(game.me?.id||''),body.inset,w);body.y=y;body.button('否决',()=>run('group:reject',{...game.round(),proposalId:proposal.id}),game.available,body.inset+10+w,w,'#392a3e','#efa7b8');});}
 body.card(()=>{body.text(game.myGroup?'同组交流':'我的思考',15,'#e8e1f4',body.inset,body.contentWidth,'left',600,10);body.text(game.myGroup?'消息仅同组伙伴可见':'仅自己可见，记下你的灵感',11,'#9994ad',body.inset,body.contentWidth,'left',400,14);timeline(body,room.currentFeed);body.rowFields({text:chat,placeholder:'点此输入聊天内容',field:'chat',focused:keyboard.kind==='chat',action:()=>input('chat'),enabled:game.available},{text:'发送',action:()=>{const value=chat;void game.act('group:chat',{roundId:room.roundId,text:value}).then(()=>{chat='';keyboard.clear('chat');draw();}).catch(()=>{});},enabled:game.available&&!!chat.trim(),fill:'#8376ff'},width<=340?70:82);});footer.rowFields({text:game.word,placeholder:game.myGroup?'点此提议本轮词语，全组通过后锁定':'点此输入本轮词语',field:'word',focused:keyboard.kind==='word',action:()=>input('word'),enabled:game.available&&!game.submitted&&!game.candidate},{text:game.submitted?'已锁定':game.myGroup?'提议候选':'锁定',action:()=>run(game.myGroup?'group:propose':'game:submit',{...game.round(),word:game.word}),enabled:game.available&&!game.submitted&&!game.candidate&&!!game.word.trim(),fill:game.submitted?'#8376ff':'#d8ff72'},width<=340?82:96);}
 else {body.heading(room.view==='reveal'?'交汇 / REVEAL':'纪念 / TOGETHER',room.view==='reveal'?'本轮揭晓':room.endReason==='all-same'?'完美同频':'游戏结束',`第 ${room.round} 回合`);if(room.winnerWord)body.card(()=>{body.text('共同的词 / WORD',10,'#b9afe9',body.inset,body.contentWidth,'center',500,6);body.text(room.winnerWord!,22,'#f6f2ff',body.inset,body.contentWidth,'center',700,0);},'#51446c','#2c2643',20,16);submissions(body,room.visibleSubmissions);players(body);if(room.view==='reveal'){const seconds=deadlineSeconds(game.remaining('reveal'),0);if(seconds!==undefined)body.text(`${seconds} 秒后进入下一回合`,12,muted,body.inset,body.contentWidth,'center',400,10);}else{body.card(()=>{body.text('留下同频纪念',15,'#e8e1f4',body.inset,body.contentWidth,'left',600,12);secondary(body,`${logs?'☑':'□'} 包含聊天和思考内容`,()=>{logs=!logs;draw();},!exporting);body.button(exporting?'生成中':'生成本局游戏记录图',()=>{void generate();},!exporting);if(files.length){secondary(body,'查看记录图片',preview);body.text('打开图片后，可长按自行保存。',12,muted);}});secondary(body,'离开房间',()=>run('room:leave'),game.available);footer.button('再玩一次（返回房间）',()=>run('game:rematch',{gameId:room.gameId}),game.available);}}
 const contentTop=top+60;
 footerTop=dockTop(height,bottom,keyboard.occludedHeight,footer.y,fullHeight);
 viewport={x:0,y:contentTop,w:width,h:Math.max(0,footerTop-(footer.nodes.length?8:0)-contentTop)};scroll=clamp(scroll,Math.max(0,body.y-viewport.h));if(keyboard.kind){const focus=body.nodes.find(n=>n.field===keyboard.kind);if(focus){if(focus.y<scroll)scroll=focus.y;if(focus.y+focus.h>scroll+viewport.h)scroll=focus.y+focus.h-viewport.h;}}
 ctx.fillStyle='#111321';ctx.fillRect(0,0,width,height);const gradient=ctx.createLinearGradient(0,0,width,height*.7);gradient.addColorStop(0,'#29264a');gradient.addColorStop(1,'#111321');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
 ctx.save();ctx.beginPath();ctx.rect(viewport.x,viewport.y,viewport.w,viewport.h);ctx.clip();render(ctx,body.nodes,viewport.y-scroll);ctx.restore();ctx.fillStyle='#161727';ctx.fillRect(0,0,width,viewport.y-8);render(ctx,header.nodes);ctx.fillStyle='#35324c';ctx.fillRect(16,viewport.y-9,width-32,1);if(footer.nodes.length){const y=footerTop;ctx.fillStyle='#111321';ctx.fillRect(0,y-12,width,footer.y+bottom+12);ctx.fillStyle='#35324c';ctx.fillRect(20,y-12,width-40,1);render(ctx,footer.nodes,y);}
 const message=toast.visible()||(exporting?'正在生成单张纪念长图…':'');if(message){const notice=new Layout(width,measure);notice.inset=28;const padding=8,start=viewport.y;notice.y=start+padding;notice.text(message,13,toast.error?'#ff9fae':'#8acbff',notice.inset,width-notice.inset*2,'left',400,0);const contentBottom=Math.max(...notice.nodes.map(node=>node.y+node.h));notice.nodes.unshift({kind:'box',x:16,y:start,w:width-32,h:contentBottom-start+padding,fill:'#242138',stroke:'#514366',radius:12});render(ctx,notice.nodes);}

}
let touch:{x:number;y:number;last:number;moved:boolean;body:boolean}|undefined;
wx.onTouchStart((e:any)=>{const p=e.touches[0];if(p)touch={x:p.clientX,y:p.clientY,last:p.clientY,moved:false,body:contains(viewport,p.clientX,p.clientY)};});
wx.onTouchMove((e:any)=>{const p=e.touches[0];if(!p||!touch)return;if(Math.hypot(p.clientX-touch.x,p.clientY-touch.y)>6)touch.moved=true;if(touch.moved&&touch.body){scroll=clamp(scroll+touch.last-p.clientY,Math.max(0,body.y-viewport.h));draw();}touch.last=p.clientY;});
wx.onTouchEnd(()=>{if(touch&&!touch.moved){const {x,y}=touch;const n=hit(header.nodes,x,y)||hit(footer.nodes,x,y,footerTop)||(contains(viewport,x,y)?hit(body.nodes,x,y,viewport.y-scroll):undefined);n?.action?.();}touch=undefined;});
wx.onTouchCancel(()=>{touch=undefined;});
let previousStamp='',previousScrollKey='',previousIdentity='',previousGame='',previousNickname='';game.subscribe(()=>{toast.observeError(game.error);const identity=game.session?.playerId||'',gameId=game.room?.gameId||'';if(identity!==previousIdentity||(gameId&&gameId!==previousGame)){files=[];logs=false;toast.clear();history=false;expanded.clear();previousIdentity=identity;if(gameId)previousGame=gameId;}const key=stamp();if(key!==previousStamp){keyboard.close();previousStamp=key;}const scrollKey=`${identity}|${game.room?.view}|${game.room?.roundId}|${gameId}`;if(scrollKey!==previousScrollKey){chat='';scroll=0;previousScrollKey=scrollKey;}if(game.me&&`${identity}|${game.me.nickname}`!==previousNickname){nickname=game.me.nickname;previousNickname=`${identity}|${game.me.nickname}`;}draw();});
function query(q:any){if(typeof q?.roomCode==='string'&&!game.session)code=q.roomCode.slice(0,6).toUpperCase();}
query(wx.getLaunchOptionsSync()?.query);wx.onShow((e:any)=>{active=true;query(e?.query);game.show();draw();});wx.onHide(()=>{active=false;touch=undefined;keyboard.close();game.hide();});wx.onWindowResize(resize);wx.showShareMenu({menus:['shareAppMessage']});wx.onShareAppMessage(()=>({title:'来同频脑电波，看看我们能否想到一起',query:game.room?`roomCode=${encodeURIComponent(game.room.code)}`:''}));
setInterval(draw,250);resize();game.show();
