import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'artifacts');
const require=createRequire(path.join(root,'apps/server/package.json')),{io}=require('socket.io-client');
const report={状态:'未完成',检查:[],限制:['未验证真实移动设备原生分享；分享PNG验证下载降级']};
let browser,service;const sockets=[];const pause=ms=>new Promise(r=>setTimeout(r,ms));
const emit=(s,e,p)=>new Promise((resolve,reject)=>s.emit(e,p,r=>r.ok?resolve(r.data):reject(Error(r.error))));
try{
 await mkdir(out,{recursive:true});const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/tmp/word-sync-browser/node_modules/playwright/index.mjs');
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const url=`http://127.0.0.1:${port}`;
 service=spawn(process.execPath,[path.join(root,'apps/server/dist/index.js')],{env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await pause(50);}
 for(let i=0;i<2;i++){const s=io(url);sockets.push(s);await new Promise(r=>s.on('connect',r));}
 const a=await emit(sockets[0],'room:create',{nickname:'甲'}),b=await emit(sockets[1],'room:join',{code:a.roomCode,nickname:'乙'});
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const pages=[];
 for(const session of [a,b]){const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});await context.addInitScript(s=>localStorage.setItem('brainwave-sync-session',JSON.stringify(s)),session);await context.addInitScript(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));const page=await context.newPage();await page.goto(url+'/room');await page.getByRole('heading',{name:'房间大厅'}).waitFor();pages.push(page);}
 const [pa,pb]=pages;await pa.getByRole('button',{name:'我准备好了'}).click();await pb.getByRole('button',{name:'我准备好了'}).click();for(const p of pages){await p.locator('.word-input').fill('星');await p.getByRole('button',{name:'锁定这个词',exact:true}).click();}await pb.getByRole('button',{name:'一键分享',exact:true}).waitFor();
 await pa.getByRole('button',{name:'再玩一次',exact:true}).click();await pa.getByRole('heading',{name:'房间大厅'}).waitFor();assert.ok(await pb.locator('.finish').isVisible());report.检查.push('A点击返回仅A大厅，B仍结果');
 for(const p of pages)await p.reload();await pa.getByRole('heading',{name:'房间大厅'}).waitFor();await pb.getByRole('button',{name:'一键分享',exact:true}).waitFor();report.检查.push('两个独立浏览器上下文刷新恢复各自view');
 await pa.screenshot({path:path.join(out,'个人返房-A大厅.png'),fullPage:true});await pb.screenshot({path:path.join(out,'个人返房-B结果.png'),fullPage:true});
 const dark=await pa.locator('.players strong span').evaluateAll(es=>es.map(e=>({姓名:e.textContent,颜色:getComputedStyle(e).color})));assert.equal(new Set(dark.map(x=>x.颜色)).size,2);report.深色昵称=dark;
 const download=pb.waitForEvent('download');await pb.getByRole('button',{name:'一键分享',exact:true}).click();await (await download).saveAs(path.join(out,'个人返房-浅色分享.png'));await pb.getByRole('status').filter({hasText:'已下载'}).waitFor();const light=await pb.locator('.share-report section p span').evaluateAll(es=>es.map(e=>({姓名:e.textContent,颜色:getComputedStyle(e).color})));assert.equal(new Set(light.map(x=>x.颜色)).size,2);report.浅色昵称=light;report.检查.push('深色两人昵称不同，白底分享两人深色昵称不同，真实PNG下载保存');
 await pa.getByRole('button',{name:'我准备好了'}).click();assert.ok(await pa.getByRole('heading',{name:'房间大厅'}).isVisible());assert.ok(await pb.locator('.finish').isVisible());report.检查.push('B未返回，A准备不能提前开局');report.状态='通过';
}catch(error){report.状态='失败或阻塞';report.错误=error.stack;process.exitCode=1;}finally{await browser?.close();for(const s of sockets)s.disconnect();if(service){service.kill('SIGTERM');await pause(300);if(service.exitCode===null&&service.signalCode===null){service.kill('SIGKILL');await pause(100);}report.自行启动服务已停止=service.exitCode!==null||service.signalCode!==null;}await mkdir(out,{recursive:true});await writeFile(path.join(out,'个人返房浏览器验证.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
