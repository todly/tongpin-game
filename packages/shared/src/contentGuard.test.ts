import { describe, expect, it, vi } from 'vitest';
import { createContentGuard } from './contentGuard.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(result: { hit: boolean; message: string } = { hit: false, message: '' }, delay = 0) {
  const hits: string[] = [];
  const checked: string[] = [];
  const check = vi.fn(async (text: string) => { checked.push(text); return result; });
  const guard = createContentGuard({ check, onHit: (message) => hits.push(message), delay, minLength: 2 });
  return { guard, check, hits, checked };
}

describe('输入实时内容校验', () => {
  it('命中时回调提示', async () => {
    const { guard, hits } = setup({ hit: true, message: '内容包含辱骂类违规信息，请修改后再提交。' });
    guard.input('傻逼');
    await flush();
    expect(hits).toEqual(['内容包含辱骂类违规信息，请修改后再提交。']);
  });

  it('未命中不回调', async () => {
    const { guard, hits } = setup();
    guard.input('星空');
    await flush();
    expect(hits).toEqual([]);
  });

  it('短于最小长度不请求', async () => {
    const { guard, check } = setup();
    guard.input('a');
    await flush();
    expect(check).not.toHaveBeenCalled();
  });

  it('连续输入只校验最后一次', async () => {
    const { guard, checked } = setup();
    guard.input('第一');
    guard.input('第二');
    guard.input('第三');
    await flush();
    expect(checked).toEqual(['第三']);
  });

  it('相同文本不重复校验', async () => {
    const { guard, check } = setup();
    guard.input('星空');
    await flush();
    guard.input('星空');
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('cancel 后丢弃结果', async () => {
    const { guard, hits } = setup({ hit: true, message: '命中' });
    guard.input('傻逼');
    guard.cancel();
    await flush();
    expect(hits).toEqual([]);
  });

  it('reset 后允许重新校验同一文本', async () => {
    const { guard, check } = setup();
    guard.input('星空');
    await flush();
    guard.reset();
    guard.input('星空');
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('校验异常不抛出，也不回调', async () => {
    const hits: string[] = [];
    const guard = createContentGuard({ check: async () => { throw new Error('network'); }, onHit: (m) => hits.push(m), delay: 0 });
    guard.input('星空');
    await flush();
    expect(hits).toEqual([]);
  });

  it('输入前后空白会被裁剪', async () => {
    const { guard, checked } = setup();
    guard.input('  星空  ');
    await flush();
    expect(checked).toEqual(['星空']);
  });
});
