import { describe,it,expect } from 'vitest';
import { unzlibSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { PngStream } from '../src/utils/png';
describe('streaming PNG',()=>{
 it('日志初始及身份重置均保持主动授权',()=>{const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');expect(main).not.toContain('logs=true');expect(main).toContain('history=false,logs=false');expect(main).toContain('files=[];logs=false');});
 it('多块单一zlib流首尾完整、可完整解码且显著压缩',()=>{const chunks:Uint8Array[]=[];const png=new PngStream(b=>chunks.push(b),64,1024),rgba=new Uint8Array(64*4*512).fill(120);png.rows(rgba,64,512);png.rows(rgba,64,512);png.finish();expect([...chunks[0]!.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);expect(String.fromCharCode(...chunks.at(-1)!.subarray(4,8))).toBe('IEND');const data:Uint8Array[]=[];for(const c of chunks.slice(1)){const type=String.fromCharCode(...c.subarray(4,8));if(type==='IDAT')data.push(c.subarray(8,c.length-4));}const stream=new Uint8Array(data.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of data){stream.set(c,offset);offset+=c.length;}const raw=unzlibSync(stream);expect(raw.length).toBe((64*4+1)*1024);expect(raw[0]).toBe(1);expect(raw.at(-1)).toBe(0);expect(stream.length).toBeLessThan(raw.length/10);});
});
