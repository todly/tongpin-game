import vm from 'node:vm';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),require=createRequire(new URL('../apps/server/package.json',import.meta.url));
const {WebSocket}=require('ws'),{io}=require('socket.io-client');
const port=32188,server=spawn(process.execPath,['apps/server/dist/index.js'],{cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','inherit']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){const end=Date.now()+12000;while(!fn()){if(Date.now()>end)throw new Error('运行界面等待超时');await sleep(25);}}
const frames=[],sockets=[],timers=new Set(),callbacks={},saved=new Map();let rendered=[];
const ctx=new Proxy({setTransform(){},measureText:s=>({width:s.length*8}),createLinearGradient:()=>({addColorStop(){}}),fillRect(x,y,w,h){if(x===0&&y===0&&h===2400)rendered=[];},fillText(text,x,y){rendered.push({text,x,y});}}, {get:(obj,key)=>obj[key]||(()=>{})});
const wx={createCanvas:()=>({getContext:()=>ctx}),getSystemInfoSync:()=>({windowWidth:400,windowHeight:2400,pixelRatio:2,safeArea:{top:20,bottom:2380}}),getLaunchOptionsSync:()=>({query:{}}),getStorageSync:k=>saved.get(k),setStorageSync:(k,v)=>saved.set(k,v),removeStorageSync:k=>saved.delete(k),showShareMenu(){},hideKeyboard(){},showKeyboard(){},shareAppMessage:v=>frames.push({分享:v}),
 connectSocket(){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);sockets.push(ws);return {onOpen:f=>ws.on('open',f),onMessage:f=>ws.on('message',data=>f({data:String(data)})),onClose:f=>ws.on('close',f),onError:f=>ws.on('error',f),send:({data,fail})=>ws.send(data,e=>e&&fail?.(e)),close:()=>{if(ws.readyState===WebSocket.OPEN)ws.close();else ws.once('open',()=>ws.close());}};}};
for(const name of ['Show','Hide','WindowResize','TouchStart','TouchMove','TouchEnd','TouchCancel','ShareAppMessage','KeyboardInput','KeyboardConfirm','KeyboardComplete']){wx['on'+name]=f=>callbacks[name]=f;wx['off'+name]=f=>{if(callbacks[name]===f)delete callbacks[name];};}
const text=()=>rendered.map(x=>x.text).join('\n');
function click(label){const item=rendered.find(x=>x.text===label);assert(item,`未找到按钮：${label}\n${text()}`);callbacks.TouchStart({touches:[{clientX:item.x,clientY:item.y+8}]});callbacks.TouchEnd({});}
function input(label,value){click(label);callbacks.KeyboardInput({value});callbacks.KeyboardConfirm({value});}
let web;
try{await once(server.stdout,'data');let bundle=await readFile(new URL('../apps/minigame/dist/game.js',import.meta.url),'utf8');bundle=bundle.replace('mode: "cloud"','mode: "local"');
 vm.runInNewContext(bundle,{wx,Date,Promise,JSON,Math,Map,Set,Error,setTimeout,clearTimeout,setInterval:(f,n)=>{const id=setInterval(f,n);timers.add(id);return id;},clearInterval:id=>{clearInterval(id);timers.delete(id);}});
 await wait(()=>!text().includes('恢复中'));click('创建房间');await wait(()=>text().includes('房间大厅'));const session=saved.get('word-sync-session');assert(session?.reconnectToken);frames.push({首页大厅:text()});
 web=io(`http://127.0.0.1:${port}`,{transports:['websocket'],reconnection:false});let state;web.on('room:state',s=>state=s);await once(web,'connect');const request=(event,data)=>new Promise((resolve,reject)=>web.emit(event,data,r=>r.ok?resolve(r.data):reject(new Error(r.error))));
 await request('room:join',{code:session.roomCode,nickname:'网页伙伴'});await request('lobby:ready',true);await wait(()=>text().includes('网页伙伴'));click('我准备好了');await wait(()=>text().includes('点此输入'));const wordLabel='点此输入本轮词语';input(wordLabel,'苹果');click('锁定');await wait(()=>text().includes('已锁定'));await request('game:submit',{roundId:state.roundId,word:'香蕉'});await wait(()=>state?.phase==='reveal'||text().includes('本轮揭晓'));frames.push({揭晓界面:text()});assert(!text().includes('✓'));assert(!JSON.stringify(state).includes(session.reconnectToken));await wait(()=>state?.phase==='writing'&&state.round===2);await request('game:submit',{roundId:state.roundId,word:'苹果'});input('点此输入本轮词语','苹果');click('锁定');await wait(()=>state?.phase==='ended');
 click('再玩一次（仅自己返回大厅）');await wait(()=>text().includes('房间大厅'));assert.equal(state.view,'ended');callbacks.Hide();assert.equal(saved.get('word-sync-session').reconnectToken,session.reconnectToken);callbacks.Show({query:{}});await wait(()=>text().includes('房间大厅')&&!text().includes('恢复中'));frames.push({隐藏恢复:text()});click('邀请');assert(!JSON.stringify(frames.at(-1)).includes(session.reconnectToken));
 await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(new URL('../artifacts/小游戏运行验证.json',import.meta.url),JSON.stringify({结论:'通过',环境:'整个 game.js 在模拟 wx Canvas/SocketTask 中运行，对接真实服务器与网页协议客户端；非真机',frames},null,2));console.log(JSON.stringify({结论:'通过',事实:['完整bundle触摸创建、键盘作答、锁词、混合对局胜利','个人返房不改变网页结果视图','隐藏保留令牌、显示恢复大厅','房间分享不含令牌'],frames},null,2));
}finally{callbacks.Hide?.();for(const id of timers)clearInterval(id);for(const ws of sockets)ws.close();web?.disconnect();server.kill();}
