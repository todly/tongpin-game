import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),require=createRequire(new URL('../apps/server/package.json',import.meta.url));
const {WebSocket}=require('ws');const server=spawn(process.execPath,['apps/server/dist/index.js'],{cwd:root,env:{...process.env,PORT:'32190',NODE_ENV:'production'},stdio:['ignore','pipe','inherit']});
let socket;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',resolve);server.on('error',reject);});
 socket=new WebSocket('ws://127.0.0.1:32190/ws');await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
 const request=(requestId,event,data)=>new Promise(resolve=>{socket.once('message',raw=>resolve(JSON.parse(String(raw))));socket.send(JSON.stringify({requestId,event,data}));});
 const before=Date.now(),reply=await request('clock','time:sync',null),after=Date.now();
 assert.equal(reply.ok,true);assert(reply.data.receivedAt>=before&&reply.data.sentAt<=after&&reply.data.sentAt>=reply.data.receivedAt);
 const invalid=await request('invalid','time:sync',{write:true});assert.equal(invalid.ok,false);
 console.log(JSON.stringify({result:'通过',rtt:after-before,response:reply,readOnlyValidation:invalid.ok===false},null,2));
}finally{socket?.terminate();server.kill();}
