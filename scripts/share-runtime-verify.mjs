import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'apps/server/package.json'));
const {io}=require('socket.io-client');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/tmp/word-sync-browser/node_modules/playwright/index.mjs');
const port=32187,url=`http://127.0.0.1:${port}`;
const service=spawn(process.execPath,[path.join(root,'apps/server/dist/index.js')],{cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'production'}});
const sockets=[];let browser;
const evidence={checks:[],status:'未完成'};
const emit=(s,e,p)=>new Promise((resolve,reject)=>s.emit(e,p,r=>r.ok?resolve(r.data):reject(new Error(r.error))));
try {
 for(let n=0;n<100;n++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(let n=0;n<2;n++){const s=io(url);sockets.push(s);await new Promise(r=>s.on('connect',r));}
 const session=await emit(sockets[0],'room:create',{nickname:'小林'});await emit(sockets[1],'room:join',{code:session.roomCode,nickname:'小周'});
 let state; sockets[0].on('room:state',v=>state=v);
 await emit(sockets[0],'lobby:settings',{timerSeconds:30,maxRounds:1});await emit(sockets[0],'lobby:ready',true);await emit(sockets[1],'lobby:ready',true);await new Promise(r=>setTimeout(r,100));
 await emit(sockets[0],'group:chat',{roundId:state.roundId,text:'我的私密思考：星空'});await emit(sockets[0],'game:submit',{roundId:state.roundId,word:'星空'});await emit(sockets[1],'game:submit',{roundId:state.roundId,word:'海洋'});
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});await context.addInitScript(()=>Object.defineProperty(navigator,'canShare',{value:()=>false}));await context.addInitScript(s=>localStorage.setItem('brainwave-sync-session',JSON.stringify(s)),session);
 const page=await context.newPage();await page.goto(url+'/room');await page.getByRole('button',{name:'一键分享',exact:true}).waitFor();
 await mkdir(path.join(root,'artifacts'),{recursive:true});
 for(const logs of [false,true]){
 if(logs)await page.getByRole('checkbox').check();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'一键分享',exact:true}).click();const file=await download;await file.saveAs(path.join(root,'artifacts',logs?'分享含日志.png':'分享仅词语.png'));
 await page.getByRole('status').filter({hasText:'已下载'}).waitFor();const report=await page.locator('.report-host').innerText();if(!report.includes('星空')||!report.includes('海洋')||logs!==report.includes('我的私密思考'))throw new Error('分享内容不符合选择');evidence.checks.push({mode:logs?'本人可见日志':'默认仅词语',report,message:await page.getByRole('status').innerText()});
 }
 await page.screenshot({path:path.join(root,'artifacts/分享结束页.png'),fullPage:true});evidence.status='通过';
}catch(error){evidence.status='失败';evidence.error=error.message;process.exitCode=1;}finally{await browser?.close();sockets.forEach(s=>s.disconnect());service.kill();await writeFile(path.join(root,'artifacts/share-runtime-verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
