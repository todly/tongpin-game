// 敏感词检测：客户端用于禁止提交并提示，服务端用于兜底校验。
// 词库内置一份默认列表，同时支持通过环境变量/配置注入扩展词库。

/** 默认内置敏感词库（兜底用） */
export const DEFAULT_SENSITIVE_WORDS = [
  '傻逼', '煞笔', '傻B', '傻b', 'SB', 'sb', '妈的', '他妈的', 'TMD', 'tmd',
  '操你', '草你', '日你', '干你', '滚蛋', '王八蛋', '混蛋', '畜生', '贱人',
  '婊子', '妓女', '嫖娼', '卖淫', '强奸', '轮奸', '猥亵', '鸡奸',
  '法轮功', '法轮', '六四事件', '六四', '天安门事件',
  '赌博', '赌场', '博彩', '色情', '淫秽', '裸聊', '援交',
  '毒品', '吸毒', '大麻', '冰毒', '海洛因', '摇头丸', 'K粉',
  '枪支', '买枪', '卖枪', '弹药', '炸弹', '爆炸物', '雷管',
  '诈骗', '传销', '洗钱', '高利贷', '套现',
  '习近平', '毛泽东', '邓小平', '江泽民', '胡锦涛', '温家宝',
  '李克强', '李鹏', '朱镕基', '温家', '常委', '政治局',
  '反动', '反华', '台独', '藏独', '疆独', '港独',
  '政变', '推翻政府', '颠覆国家', '分裂国家',
  '去死', '自杀', '上吊', '跳楼', '割腕', '安眠药自杀',
  '纳粹', '希特勒', '法西斯', '军国主义',
  '傻叉', '二逼', '二B', '装逼', '牛逼', 'NB', 'nb',
  '废物', '垃圾人', '人渣', '败类', '狗东西', '狗屎',
  '滚开', '闭嘴', '白痴', '智障', '脑残', '弱智', '低能',
  '变态', '死全家', '全家死', '不得好死', '断子绝孙',
] as const;

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 默认检测器，直接使用内置词库。 */
export const sensitiveChecker = createSensitiveWordChecker();

/** 便捷方法：检测文本是否包含敏感词。 */
export function checkSensitive(value: string): SensitiveCheckResult {
  return sensitiveChecker.check(value);
}
