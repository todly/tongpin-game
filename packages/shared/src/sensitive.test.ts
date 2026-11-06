import { describe, expect, it } from 'vitest';
import { checkSensitive, createSensitiveWordChecker, DEFAULT_SENSITIVE_WORDS, normalizeForSensitiveCheck } from './sensitive.js';

describe('敏感词检测', () => {
  it('正常文本不命中', () => {
    expect(checkSensitive('星空').hit).toBe(false);
    expect(checkSensitive('月亮').hit).toBe(false);
    expect(checkSensitive('').hit).toBe(false);
  });

  it('直接命中内置词库', () => {
    const result = checkSensitive('你是个傻逼');
    expect(result.hit).toBe(true);
    expect(result.words).toContain('傻逼');
    expect(result.message).toContain('傻逼');
  });

  it('大小写不敏感', () => {
    expect(checkSensitive('sB 内容').hit).toBe(true);
    expect(checkSensitive('TMD').hit).toBe(true);
  });

  it('忽略空白与全角变体绕过', () => {
    expect(checkSensitive('傻 逼').hit).toBe(true);
    expect(checkSensitive('傻\u3000逼').hit).toBe(true);
    // 全角字母 s ｂ 归一化后为 sb
    expect(checkSensitive('ｓｂ').hit).toBe(true);
  });

  it('归一化函数：全角转半角并去空白', () => {
    expect(normalizeForSensitiveCheck('Ａ ｂ Ｃ')).toBe('abc');
    expect(normalizeForSensitiveCheck('傻 逼')).toBe('傻逼');
  });

  it('支持扩展词库', () => {
    const checker = createSensitiveWordChecker({ extraWords: ['自定义坏词'] });
    expect(checker.check('包含自定义坏词的文本').hit).toBe(true);
    expect(checker.check('正常文本').hit).toBe(false);
    // 默认词库仍然生效
    expect(checker.check('傻逼').hit).toBe(true);
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
    expect(result.message).toMatch(/^包含敏感词「.+」，请修改后再提交。$/);
  });

  it('默认词库非空且去重', () => {
    expect(DEFAULT_SENSITIVE_WORDS.length).toBeGreaterThan(0);
    const checker = createSensitiveWordChecker();
    expect(new Set(checker.words).size).toBe(checker.words.length);
  });
});
