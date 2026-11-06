// 敏感词检测：客户端用于禁止提交并提示，服务端用于兜底校验。
// 词库内置于 sensitive-words.ts（fwwdn/sensitive-stop-words + 日常脏话补充），
// 支持通过配置注入扩展词库。
import { DEFAULT_SENSITIVE_WORDS } from './sensitive-words.js';

export { DEFAULT_SENSITIVE_WORDS } from './sensitive-words.js';

/** 归一化：全角转半角、去空白、统一小写，用于绕过简单变体。 */
export function normalizeForSensitiveCheck(value: string): string {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '')
    .toLowerCase();
}

export interface SensitiveCheckResult {
  /** 是否包含敏感词。 */
  hit: boolean;
  /** 命中的敏感词列表（去重）。 */
  words: string[];
  /** 提示文案。 */
  message: string;
}

export interface SensitiveWordOptions {
  /** 额外词库，会与默认词库合并。 */
  extraWords?: readonly string[];
  /** 完全替换默认词库。 */
  replaceDefault?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 构建敏感词检测器（大小写不敏感、忽略空白与全角变体）。 */
export function createSensitiveWordChecker(options: SensitiveWordOptions = {}) {
  const base = options.replaceDefault ? [] : DEFAULT_SENSITIVE_WORDS;
  const words = [...new Set([...base, ...(options.extraWords ?? []).map((w) => w.trim()).filter(Boolean)])];
  const normalized = words.map((w) => normalizeForSensitiveCheck(w)).filter(Boolean);
  // 按长度降序，保证优先命中更长的词，避免部分匹配。
  const sorted = [...new Set(normalized)].sort((a, b) => b.length - a.length);
  const pattern = sorted.length
    ? new RegExp(`(?:${sorted.map(escapeRegExp).join('|')})`, 'i')
    : null;

  function check(value: string): SensitiveCheckResult {
    if (!value || !pattern) return { hit: false, words: [], message: '' };
    const normalizedValue = normalizeForSensitiveCheck(value);
    const hits = sorted.filter((w) => normalizedValue.includes(w));
    return hits.length
      ? { hit: true, words: hits, message: `包含敏感词「${hits[0]}」，请修改后再提交。` }
      : { hit: false, words: [], message: '' };
  }

  return { check, words: sorted };
}

/** 默认检测器，直接使用内置词库。 */
export const sensitiveChecker = createSensitiveWordChecker();

/** 便捷方法：检测文本是否包含敏感词。 */
export function checkSensitive(value: string): SensitiveCheckResult {
  return sensitiveChecker.check(value);
}
