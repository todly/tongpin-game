type ClipboardError = { errMsg?: string; errno?: number };
type ClipboardApi = {
  setClipboardData(options: { data: string; success: () => void; fail: (error: ClipboardError) => void }): void;
};

export class Clipboard {
  private pending = false;
  private lastAttempt = -Infinity;
  private sequence = 0;

  constructor(private api: ClipboardApi, private notify: (message: string) => void,
    private now = () => Date.now()) {}

  copy(value: string) {
    if (!value || this.pending || this.now() - this.lastAttempt < 1200) return;
    this.pending = true;
    this.lastAttempt = this.now();
    const sequence = ++this.sequence;
    const finish = (error?: ClipboardError) => {
      if (sequence !== this.sequence) return;
      ++this.sequence;
      clearTimeout(timer);
      this.pending = false;
      if (error) (globalThis as any).console?.warn?.('[clipboard]', error.errMsg, error.errno);
      this.notify(error ? `复制失败，请稍后重试或手动输入房间号 ${value}。` : '房间码已复制。');
    };
    const timer = setTimeout(() => finish({ errMsg: 'setClipboardData:timeout' }), 5000);
    // Invoke directly in the touch callback to retain the native user gesture.
    try { this.api.setClipboardData({ data: value, success: () => finish(), fail: finish }); }
    catch (error) { finish({ errMsg: String(error) }); }
  }
}
