import { describe, expect, it } from 'vitest';
import { checkSensitive, createSensitiveWordChecker, DEFAULT_SENSITIVE_WORDS, normalizeForSensitiveCheck } from './index.js';

describe('敏感词检测', () => {
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

  it('命中词库：开源词库来源（fwwdn/sensitive-stop-words）', () => {
    // 政治类
    expect(checkSensitive('习近平讲话').hit).toBe(true);
    // 色情类
    expect(checkSensitive('按摩棒').hit).toBe(true);
    // 涉枪涉爆
    expect(checkSensitive('出售炸药').hit).toBe(true);
    // 广告类
    expect(checkSensitive('兼职').hit).toBe(true);
  });

  it('命中词库：日常脏话补充', () => {
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
    // 全角字母 ｓｂ 归一化后为 sb
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

  it('检测性能：千级词库下单次检测耗时可接受', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) checkSensitive('这是一段完全正常的游戏词语输入测试');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});
