// 输入过程中的实时内容安全校验：防抖后请求服务端只读接口 content:check。
// 命中敏感词时立即回调，由各端清空输入框，避免违规内容停留在输入框里。

export interface ContentGuardOptions {
  /** 请求服务端校验，返回是否命中。 */
  check: (text: string) => Promise<{ hit: boolean; message: string }>;
  /** 命中时回调，通常用于清空输入框并提示。 */
  onHit: (message: string) => void;
  /** 防抖间隔，默认 500ms。 */
  delay?: number;
  /** 最短触发长度，默认 2 个字符，避免单字频繁请求。 */
  minLength?: number;
}

/** 创建输入实时校验器：同一时刻只保留最后一次输入，过期响应自动丢弃。 */
export function createContentGuard(options: ContentGuardOptions) {
  const delay = options.delay ?? 500;
  const minLength = options.minLength ?? 2;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;
  let lastChecked = '';

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    sequence++;
  }

  /** 输入变化时调用；命中会触发 onHit。 */
  function input(text: string) {
    cancel();
    const value = text.trim();
    if (value.length < minLength || value === lastChecked) return;
    const current = sequence;
    timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await options.check(value);
          // 期间又有新输入或已取消，丢弃过期结果。
          if (current !== sequence) return;
          lastChecked = value;
          if (result.hit) options.onHit(result.message);
        } catch {
          // 校验失败不阻断输入，提交时服务端仍会再次校验。
        }
      })();
    }, delay);
  }

  /** 提交成功后重置，避免同一文本重复校验。 */
  function reset() {
    cancel();
    lastChecked = '';
  }

  return { input, cancel, reset };
}
