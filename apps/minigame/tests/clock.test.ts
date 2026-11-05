import {it,expect} from 'vitest';
import {ServerClock} from '../src/platform/clock';
import {deadlineSeconds} from '../src/ui/layout';
it.each([-30000,30000])('校准设备偏差 %s 并用单调时间推进',offset=>{let tick=100;const c=new ServerClock(()=>tick,100000+offset);tick=140;expect(c.sample(100,140,{receivedAt:100010,sentAt:100010})).toBe(true);expect(c.now()).toBe(100030);tick+=1000;expect(c.now()).toBe(100930);expect(c.sample(100,1140,{receivedAt:999999,sentAt:999999})).toBe(false);c.reset();expect(c.sample(1100,1140,{receivedAt:101010,sentAt:101010})).toBe(true);});
it('同步deadline helper对空值、分数秒与到期边界稳定',()=>{expect(deadlineSeconds(null,0)).toBeUndefined();expect(deadlineSeconds(undefined,0)).toBeUndefined();expect(deadlineSeconds(500,0)).toBe(1);expect(deadlineSeconds(1000,1)).toBe(1);expect(deadlineSeconds(0,1)).toBe(0);});
it('拒绝无效与高延迟时钟样本',()=>{const c=new ServerClock(()=>0,0);expect(c.sample(0,3000,{receivedAt:10,sentAt:10})).toBe(false);expect(c.sample(0,10,{receivedAt:NaN,sentAt:0})).toBe(false);});
