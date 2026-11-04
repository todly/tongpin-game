import {describe,it,expect} from 'vitest';
import {Layout,clamp,contains} from '../src/ui/layout';
import {hit} from '../src/ui/renderer';
describe('独立布局与命中',()=>{
 it('嵌套组卡四边保持16像素且圆环窄屏不溢出',()=>{const l=new Layout(320,s=>s.length*8);l.card(()=>{l.box(l.y,38,l.inset,l.contentWidth);l.y+=38;});const [card,player]=l.nodes;expect(player.x-card.x).toBe(16);expect(player.y-card.y).toBe(16);expect(card.x+card.w-player.x-player.w).toBe(16);expect(card.y+card.h-player.y-player.h).toBe(16);l.timer(180,180);const timer=l.nodes.at(-1)!;expect(timer.kind).toBe('timer');expect(timer.progress).toBe(1);expect(timer.x+timer.w).toBeLessThanOrEqual(320);});
 it('长词测量换行，控件始终从顶边布局',()=>{for(const width of [320,375,430]){const l=new Layout(width,(s,size)=>s.length*size);l.text('长昵称与长词'.repeat(30));const y=l.y;l.button('确认',()=>{});expect(l.nodes.at(-1)?.y).toBe(y);expect(l.nodes.at(-1)?.h).toBeGreaterThanOrEqual(44);for(const n of l.nodes)expect(n.x+n.w).toBeLessThanOrEqual(width);}});
 it('共享坐标偏移且右下边界互斥',()=>{const l=new Layout(320,s=>s.length*8);const n=l.button('确认',()=>{});expect(hit(l.nodes,20,100,100)).toBe(n);expect(hit(l.nodes,300,100,100)).toBeUndefined();expect(contains(n,20,48)).toBe(false);expect(clamp(500,80)).toBe(80);expect(clamp(-5,80)).toBe(0);});
});
