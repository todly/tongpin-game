import { afterEach, expect, it, vi } from 'vitest';
import { Clipboard } from '../src/platform/clipboard';

afterEach(() => vi.useRealTimers());

it('连续点击只调用一次，间隔后可再次复制同一房间号', () => {
  vi.useFakeTimers();
  const notify = vi.fn();
  const api = { setClipboardData: vi.fn(options => options.success()) };
  const clipboard = new Clipboard(api, notify);
  clipboard.copy('ABC123'); clipboard.copy('ABC123');
  expect(api.setClipboardData).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1200); clipboard.copy('ABC123');
  expect(api.setClipboardData).toHaveBeenCalledTimes(2);
  expect(notify).toHaveBeenLastCalledWith('房间码已复制。');
});

it('失败和超时均释放请求，过期回调不影响下一次复制', () => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const callbacks: { success: () => void; fail: (error: { errMsg: string }) => void }[] = [];
  const api = { setClipboardData: vi.fn(options => callbacks.push(options)) };
  const notify = vi.fn(), clipboard = new Clipboard(api, notify);
  clipboard.copy('ABC123'); callbacks[0].fail({ errMsg: 'native failure' });
  vi.advanceTimersByTime(1200); clipboard.copy('ABC123');
  clipboard.copy('ABC123'); expect(api.setClipboardData).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(5000); clipboard.copy('ABC123');
  callbacks[1].success();
  expect(notify).toHaveBeenCalledTimes(2);
  callbacks[2].success();
  expect(notify).toHaveBeenLastCalledWith('房间码已复制。');
  warning.mockRestore();
});
