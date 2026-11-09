// 敏感词检测：
// - 微信端（小游戏/小程序）由服务端调用微信官方 gameMsgSecCheck（文本内容安全识别）完成；
// - web 端保留本地词库兜底（官方接口仅限服务器端调用，且需要 openid）。
// 本文件同时提供本地词库检测器与微信接口结果映射。
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

/** gameMsgSecCheck 场景枚举：1 资料;2 评论;3 论坛;4 社交日志;5 聊天。 */
export const MSG_SEC_CHECK_SCENE = { profile: 1, comment: 2, forum: 3, socialLog: 4, chat: 5 } as const;
export type MsgSecCheckScene = (typeof MSG_SEC_CHECK_SCENE)[keyof typeof MSG_SEC_CHECK_SCENE];

/** gameMsgSecCheck 接口版本，固定值 2。 */
export const MSG_SEC_CHECK_VERSION = 2;

/** 命中标签枚举：见官方文档 Res.result.label。 */
export const MSG_SEC_CHECK_LABELS: Record<number, string> = {
  100: '正常',
  10001: '营销广告',
  20001: '时政',
  20002: '色情',
  20003: '辱骂',
  20006: '违法犯罪',
  20012: '低俗',
  21000: '其他',
};

/** 微信 gameMsgSecCheck 响应中与判定相关的字段。 */
export interface MsgSecCheckPayload {
  errcode?: number;
  errmsg?: string;
  result?: { suggest?: string; label?: number; replaced_content?: string };
}

/** 根据微信 gameMsgSecCheck 响应映射为统一检测结果。 */
export function mapMsgSecCheckResult(payload: MsgSecCheckPayload): SensitiveCheckResult {
  const label = payload.result?.label ?? 100;
  if (payload.result?.suggest !== 'risky') return { hit: false, words: [], message: '' };
  const text = MSG_SEC_CHECK_LABELS[label] ?? '其他';
  return { hit: true, words: [], message: `内容包含${text}类违规信息，请修改后再提交。` };
}
