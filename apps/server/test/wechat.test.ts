import { describe, expect, it, vi } from 'vitest';
import { WechatContentSecurity, WechatApiError, ContentSecurityUnavailableError, maskAppId, describeError } from '../src/wechat.js';

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });

function client(responses: Array<() => Response | Promise<Response>>, options: { fromAppid?: string; apiBase?: string } = {}) {
  const calls: string[] = [];
  const bodies: any[] = [];
  const logs: string[] = [];
  const fetchImpl = vi.fn(async (input: any, init?: any) => {
    calls.push(String(input));
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next();
  });
  const security = new WechatContentSecurity({ appid: 'wx-test', fetch: fetchImpl as any, log: (line) => logs.push(line), ...options });
  return { security, calls, bodies, fetchImpl, logs };
}

describe('微信云调用内容安全客户端', () => {
  it('云调用无需本地凭据，configured 恒为 true', () => {
    expect(new WechatContentSecurity({ log: () => {} }).configured).toBe(true);
  });

  it('默认使用云调用内网 HTTP 域名与游戏专用接口', async () => {
    const { security, calls } = client([() => json({ errcode: 0, result: { suggest: 'pass', label: 100 } })]);
    await security.msgSecCheck({ openid: 'o-1', content: '正常文本', scene: 5 });
    expect(calls[0]).toBe('http://api.weixin.qq.com/wxa/game/content_spam/msg_sec_check');
  });

  it('请求体包含 openid、version=2、scene 与 content', async () => {
    const { security, bodies } = client([() => json({ errcode: 0, result: { suggest: 'pass', label: 100 } })]);
    await security.msgSecCheck({ openid: 'o-1', content: '最新队换马嗖红胡子攻略团', scene: 5 });
    expect(bodies[0]).toEqual({ openid: 'o-1', version: 2, scene: 5, content: '最新队换马嗖红胡子攻略团' });
  });

  it('传入 nickname 时附加到请求体', async () => {
    const { security, bodies } = client([() => json({ errcode: 0, result: { suggest: 'pass', label: 100 } })]);
    await security.msgSecCheck({ openid: 'o-1', content: '文本', scene: 1, nickname: '快乐苹果' });
    expect(bodies[0].nickname).toBe('快乐苹果');
  });

  it('配置 fromAppid 时附加 from_appid 查询参数', async () => {
    const { security, calls } = client([() => json({ errcode: 0, result: { suggest: 'pass', label: 100 } })], { fromAppid: 'wx-from' });
    await security.msgSecCheck({ openid: 'o-1', content: '文本', scene: 5 });
    expect(calls[0]).toContain('from_appid=wx-from');
  });

  it('risky 结果映射为命中并带标签文案', async () => {
    const { security } = client([() => json({ errcode: 0, result: { suggest: 'risky', label: 20003 } })]);
    const result = await security.msgSecCheck({ openid: 'o', content: '脏话', scene: 5 });
    expect(result.hit).toBe(true);
    expect(result.message).toContain('辱骂');
  });

  it('pass 结果不拦截', async () => {
    const { security } = client([() => json({ errcode: 0, result: { suggest: 'pass', label: 100 } })]);
    const result = await security.msgSecCheck({ openid: 'o', content: '正常', scene: 5 });
    expect(result.hit).toBe(false);
    expect(result.message).toBe('');
  });

  it('记录回包 x-openapi-seqid 作为云调用链路凭证', async () => {
    const { security, logs } = client([() => json({ errcode: 0, result: { suggest: 'pass', label: 100 } }, 200, { 'x-openapi-seqid': 'seq-123' })]);
    await security.msgSecCheck({ openid: 'o', content: '文本', scene: 5 });
    expect(security.seqId).toBe('seq-123');
    expect(logs.join('\n')).toContain('云调用=seq-123');
  });

  it('缺少 x-openapi-seqid 时日志提示检查开关与权限', async () => {
    const { security, logs } = client([() => json({ errcode: 0, result: { suggest: 'pass', label: 100 } })]);
    await security.msgSecCheck({ openid: 'o', content: '文本', scene: 5 });
    expect(security.seqId).toBeUndefined();
    expect(logs.join('\n')).toContain('未命中');
  });

  it('接口业务错误抛出 WechatApiError', async () => {
    const { security } = client([() => json({ errcode: 40003, errmsg: 'invalid openid' })]);
    await expect(security.msgSecCheck({ openid: 'bad', content: 'a', scene: 5 })).rejects.toBeInstanceOf(WechatApiError);
  });

  it('HTTP 失败抛出 ContentSecurityUnavailableError', async () => {
    const { security } = client([() => json({}, 500)]);
    await expect(security.msgSecCheck({ openid: 'o', content: 'a', scene: 5 })).rejects.toBeInstanceOf(ContentSecurityUnavailableError);
  });

  it('网络异常包装为 ContentSecurityUnavailableError', async () => {
    const { security } = client([() => { throw new Error('network down'); }]);
    await expect(security.msgSecCheck({ openid: 'o', content: 'a', scene: 5 })).rejects.toBeInstanceOf(ContentSecurityUnavailableError);
  });

  it('成功日志包含场景、字数、结果与耗时，且不含原文', async () => {
    const { security, logs } = client([() => json({ errcode: 0, result: { suggest: 'risky', label: 20003 } })]);
    await security.msgSecCheck({ openid: 'o', content: '这是一段很长的敏感原文', scene: 5 });
    const text = logs.join('\n');
    expect(text).toContain('msgSecCheck 成功');
    expect(text).toContain('scene=聊天');
    expect(text).toContain('字数=11');
    expect(text).toContain('suggest=risky');
    expect(text).toContain('label=20003');
    expect(text).not.toContain('敏感原文');
  });

  it('失败日志包含 errcode 与原因', async () => {
    const { security, logs } = client([() => json({ errcode: 40003, errmsg: 'invalid openid' })]);
    await expect(security.msgSecCheck({ openid: 'bad', content: 'a', scene: 5 })).rejects.toBeInstanceOf(WechatApiError);
    const text = logs.join('\n');
    expect(text).toContain('msgSecCheck 失败');
    expect(text).toContain('errcode=40003');
  });

  it('announce 只打印一次并说明云调用与脱敏 appid', () => {
    const logs: string[] = [];
    const security = new WechatContentSecurity({ appid: 'wx1234567890abcdef', log: (line) => logs.push(line) });
    security.announce();
    security.announce();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('云调用');
    expect(logs[0]).toContain('wx12****cdef');
  });

  it('note 输出回退原因', () => {
    const logs: string[] = [];
    new WechatContentSecurity({ log: (line) => logs.push(line) }).note('无 openid，使用本地词库');
    expect(logs[0]).toContain('无 openid');
  });

  it('appid 脱敏', () => {
    expect(maskAppId('')).toBe('');
    expect(maskAppId('wx1234567890abcdef')).toBe('wx12****cdef');
    expect(maskAppId('short')).toBe('sh****');
  });

  it('describeError 提取底层网络错误码', () => {
    const error = new ContentSecurityUnavailableError('微信接口请求失败。', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    expect(describeError(error)).toContain('ECONNREFUSED');
  });
});
