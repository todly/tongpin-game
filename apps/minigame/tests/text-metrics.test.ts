import {describe,it,expect} from 'vitest';
import {stableTextMetrics,textBaselineY,textInkBounds} from '../src/ui/text';
import {Layout,nodeBounds} from '../src/ui/layout';

const fallback=(text:string,size:number)=>({...stableTextMetrics({width:Array.from(text).length*size},size),width:Array.from(text).length*size});

describe('统一文字度量',()=>{
 it('使用完整 Canvas ink metrics',()=>{const m=stableTextMetrics({width:42,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3},12);expect(m).toEqual({width:42,ascent:9,descent:3,ink:12,lineHeight:12,baseline:9});});
 it('微信缺失 actualBoundingBox 时稳定回退',()=>{expect(stableTextMetrics({width:20},10)).toEqual({width:20,ascent:8,descent:2,ink:10,lineHeight:10,baseline:8});expect(stableTextMetrics({width:20,actualBoundingBoxAscent:0,actualBoundingBoxDescent:0},10)).toEqual({width:20,ascent:8,descent:2,ink:10,lineHeight:10,baseline:8});});
 it('中英文数字在盒内按 ink 居中',()=>{for(const text of ['同频','Word','123']){const m=fallback(text,20);const baseline=textBaselineY(10,44,m),bounds=textInkBounds(10+(44-m.ink)/2,m);expect(baseline).toBe(10+(44-m.ink)/2+m.ascent);expect(bounds.height).toBe(20);expect(bounds.top-10).toBe(12);expect(54-bounds.bottom).toBe(12);}});
 it('text 与 rich block 末行没有额外 leading',()=>{const l=new Layout(100,fallback);const h=l.text('一二三四五六',10,'#fff',20,30,'left',400,0);const text=l.nodes[0];expect(text.lines).toHaveLength(2);expect(h).toBe(25);expect(text.h).toBe(25);const rich=new Layout(100,fallback);const nodes=rich.rich([{text:'一二三四五六七八',color:'#fff'}],10);const b=nodeBounds(nodes);expect(rich.y).toBe(b.y+b.h);expect(b.h).toBe(25);});
 it('button、field、timer 均保留明确视觉盒',()=>{const l=new Layout(320,fallback);const button=l.button('确认',()=>{},true,20,100,'#fff','#000',44);const fields=l.rowFields({text:'候选词',action:()=>{},enabled:true},{text:'锁定',action:()=>{},enabled:true},82);l.timer(12,60);expect(button.metrics?.ink).toBe(15);expect(fields.input.h).toBe(44);expect(fields.button.h).toBe(44);expect(l.nodes.find(n=>n.kind==='timer')?.h).toBe(88);});
});
