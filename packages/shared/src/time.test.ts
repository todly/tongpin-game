import { describe, expect, it } from 'vitest';
import { normalizeEpoch, SafeMonotonic, StateCountdown } from './time.js';

describe('共享安全时钟', () => {
  it('规范化数字和字符串形式的秒/毫秒 epoch', () => {
    expect(normalizeEpoch(1_700_000_000)).toBe(1_700_000_000_000);
    expect(normalizeEpoch('1700000000000')).toBe(1_700_000_000_000);
    expect(normalizeEpoch('')).toBeUndefined();
    expect(normalizeEpoch(NaN)).toBeUndefined();
    expect(normalizeEpoch(-1)).toBeUndefined();
  });

  it.each([
    ['毫秒', 1, 20], ['秒', .001, 20], ['微秒', 1000, 20]
  ])('识别%s performance 单位', (_name, rawStep, wallStep) => {
    let raw = 100, wall = 10_000;
    const clock = new SafeMonotonic(() => raw, { wall: () => wall });
    raw += rawStep as number; wall += wallStep as number;
    expect(clock.now()).toBeCloseTo(1, 5);
  });

  it.each([1, .001, 1000])('初始化连续采样不锁错单位 %s', multiplier => {
    let raw = 0, wall = 10_000;
    const clock = new SafeMonotonic(() => raw, { wall: () => wall });
    clock.now(); raw += .1 * multiplier; clock.now();
    for (let i = 0; i < 8; i++) {
      raw += 250 * multiplier; wall += 250;
      expect(clock.now()).toBeCloseTo((i + 1) * 250);
    }
  });

  it('原生时钟暂时停住时仍按墙钟推进，恢复后继续计时', () => {
    let raw = 0, wall = 10_000;
    const clock = new SafeMonotonic(() => raw, { wall: () => wall });
    wall += 250; expect(clock.now()).toBe(250);
    raw += .25; wall += 250; expect(clock.now()).toBe(500);
  });

  it('NaN、负向和跳变时采用连续 wall delta，并对诊断限流', () => {
    let raw = 100, wall = 1000; const events:string[]=[];
    const clock = new SafeMonotonic(() => raw, { wall: () => wall, debug: true, diagnose: e => events.push(e.reason) });
    raw = NaN; wall += 20; expect(clock.now()).toBe(20);
    raw = NaN; wall += 20; expect(clock.now()).toBe(40);
    raw = 90; wall += 20; expect(clock.now()).toBe(60);
    raw = 10_000_000; wall += 20; expect(clock.now()).toBe(80);
    expect(events.filter(v => v === 'invalid')).toHaveLength(1);
    expect(clock.now()).toBeGreaterThanOrEqual(80);
  });

  it.each([-86_400_000, 86_400_000])('state 以 serverNow 锚定，不受设备 wall 偏移 %s', offset => {
    let mono = 0; const countdown = new StateCountdown(() => mono);
    countdown.anchor({ roundId:'r1', serverNow: 1_700_000_000_000, deadline: 1_700_000_010_000 }, 1_700_000_000_000 + offset);
    expect(countdown.remaining('writing')).toBe(10_000);
    mono = 1250; expect(countdown.remaining('writing')).toBe(8750);
  });

  it('新 round 重建锚点，旧 server 可用同步时钟 fallback 且不会把缺失值当零', () => {
    let mono = 0; const countdown = new StateCountdown(() => mono);
    countdown.anchor({ roundId:'r1', deadline:1_700_000_005_000 }, 1_700_000_000_000);
    expect(countdown.remaining('writing')).toBe(5000);
    mono = 1000; countdown.anchor({ roundId:'r2', deadline:'1700000010' }, 1_700_000_001_000);
    expect(countdown.remaining('writing')).toBe(9000);
    countdown.anchor({ roundId:'r3' }, 1_700_000_001_000);
    expect(countdown.remaining('writing')).toBeUndefined();
  });
});
