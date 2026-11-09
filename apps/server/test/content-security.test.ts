import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp } from '../src/index.js';
type Client = Socket; let clients: Client[]=[]; let closeServer:(()=>Promise<void>)|undefined; let url='';
const emitAck=<T>(s:Client,e:string,p?:unknown)=>new Promise<any>(resolve=>p===undefined?s.emit(e,resolve):s.emit(e,p,resolve));
const client=async()=>{const s=connect(url,{transports:['websocket'],forceNew:true});clients.push(s);await new Promise<void>(r=>s.on('connect',()=>r()));return s};
beforeEach(async()=>{process.env.NODE_ENV='test';const app=createApp();await new Promise<void>(r=>app.httpServer.listen(0,r));const a=app.httpServer.address();url=`http://127.0.0.1:${typeof a==='object'&&a?a.port:0}`;closeServer=async()=>{await app.io.close();await new Promise<void>(r=>app.httpServer.close(()=>r()))}});
afterEach(async()=>{clients.forEach(c=>c.close());clients=[];await closeServer?.();vi.unstubAllGlobals()});
describe('内容安全校验接入',()=>{
 it('未配置微信凭据时 wechat:login 明确失败，本地词库仍兜底',async()=>{const a=await client();const login=await emitAck(a,'wechat:login',{code:'any'});expect(login.ok).toBe(false);expect(login.error).toContain('未配置');const bad=await emitAck(a,'room:create',{nickname:'傻逼玩家'});expect(bad.ok).toBe(false);expect(bad.error).toContain('敏感词');const good=await emitAck(a,'room:create',{nickname:'正常玩家'});expect(good.ok).toBe(true)});
 it('wechat:login 参数校验拒绝空 code',async()=>{const a=await client();const r=await emitAck(a,'wechat:login',{code:''});expect(r.ok).toBe(false)});
});
