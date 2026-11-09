import { describe, expect, it } from 'vitest';
import { checkSensitive, createSensitiveWordChecker, DEFAULT_SENSITIVE_WORDS, normalizeForSensitiveCheck, mapMsgSecCheckResult, MSG_SEC_CHECK_LABELS, MSG_SEC_CHECK_SCENE, MSG_SEC_CHECK_VERSION } from './index.js';

describe('本地敏感词检测（web 端兜底）', () => {
  it('正常文本不命中', () => {
    expect(checkSensitive('星空').hit).toBe(false);
    expect(checkSensitive('月亮').hit).toBe(false);
    expect(checkSensitive('苹果').hit).toBe(false);
    expect(checkSensitive('').hit).toBe(false);
  });

  it('词库已加载且无重复', () => {
    expect(DEFAULT_SENSITIVE_WORDS.length).toBeGreaterThan(1000);
    expect(new Set(DEFAULT_SENSITIVE_WORDS).size).toBe(DEFAULT_SENSITIVE_WORDS.length);
  });

  it('命中词库：政治/色情/涉枪涉爆/广告', () => {
    expect(checkSensitive('习近平讲话').hit).toBe(true);
    expect(checkSensitive('按摩棒').hit).toBe(true);
    expect(checkSensitive('出售炸药').hit).toBe(true);
    expect(checkSensitive('兼职').hit).toBe(true);
  });

  it('命中词库：日常脏话补充', () => {
    const result = checkSensitive('你是个傻逼');
    expect(result.hit).toBe(true);
    expect(result.words).toContain('傻逼');
    expect(result.message).toContain('敏感词');
  });

  it('大小写不敏感', () => {
    expect(checkSensitive('sB 内容').hit).toBe(true);
    expect(checkSensitive('TMD').hit).toBe(true);
  });

  it('忽略空白与全角变体绕过', () => {
    expect(checkSensitive('傻 逼').hit).toBe(true);
    expect(checkSensitive('傻\u3000逼').hit).toBe(true);
    expect(checkSensitive('ｓｂ').hit).toBe(true);
  });

  it('归一化函数：全角转半角并去空白', () => {
    expect(normalizeForSensitiveCheck('Ａ ｂ Ｃ')).toBe('abc');
    expect(normalizeForSensitiveCheck('傻 逼')).toBe('傻逼');
  });

  it('支持扩展词库', () => {
    const checker = createSensitiveWordChecker({ extraWords: ['自定义坏词'] });
    expect(checker.check('包含自定义坏词的文本').hit).toBe(true);
  });

  it('支持替换默认词库', () => {
    const checker = createSensitiveWordChecker({ extraWords: ['仅此一个'], replaceDefault: true });
    expect(checker.check('傻逼').hit).toBe(false);
    expect(checker.check('仅此一个').hit).toBe(true);
  });

  it('命中多个词时返回列表且提示包含首个', () => {
    const result = checkSensitive('傻逼和TMD');
    expect(result.hit).toBe(true);
    expect(result.words.length).toBeGreaterThanOrEqual(2);
    expect(result.message).toContain(result.words[0]!);
  });

  it('检测性能满足客户端预检', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) checkSensitive('这是一段完全正常的游戏词语输入测试');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('微信 gameMsgSecCheck 结果映射', () => {
  it('场景与版本常量符合官方文档', () => {
    expect(MSG_SEC_CHECK_VERSION).toBe(2);
    expect(MSG_SEC_CHECK_SCENE).toEqual({ profile: 1, comment: 2, forum: 3, socialLog: 4, chat: 5 });
  });

  it('标签枚举覆盖官方全部取值', () => {
    expect(Object.keys(MSG_SEC_CHECK_LABELS).map(Number).sort((a, b) => a - b)).toEqual([100, 10001, 20001, 20002, 20003, 20006, 20012, 21000]);
  });

  it('pass 视为通过', () => {
    expect(mapMsgSecCheckResult({ errcode: 0, result: { suggest: 'pass', label: 100 } })).toEqual({ hit: false, words: [], message: '' });
  });

  it('risky 命中并给出中文标签提示', () => {
    const result = mapMsgSecCheckResult({ errcode: 0, result: { suggest: 'risky', label: 20003 } });
    expect(result.hit).toBe(true);
    expect(result.message).toContain('辱骂');
  });

  it('未知标签回退为其他', () => {
    const result = mapMsgSecCheckResult({ errcode: 0, result: { suggest: 'risky', label: 99999 } });
    expect(result.hit).toBe(true);
    expect(result.message).toContain('其他');
  });

  it('缺少 result 时视为通过', () => {
    expect(mapMsgSecCheckResult({ errcode: 0 }).hit).toBe(false);
  });
});
