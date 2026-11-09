import { describe, expect, it, vi } from 'vitest';
import { WechatContentSecurity, WechatApiError, ContentSecurityUnavailableError, maskAppId } from '../src/wechat.js';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function client(responses: Array<() => Response | Promise<Response>>, now = () => 0) {
  const calls: string[] = [];
  const logs: string[] = [];
  const fetchImpl = vi.fn(async (input: any) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next();
  });
  const security = new WechatContentSecurity({ appid: 'wx-test', secret: 'secret-test', fetch: fetchImpl as any, now, log: (line) => logs.push(line) });
  return { security, calls, fetchImpl, logs };
}

describe('微信内容安全客户端', () => {
  it('未配置凭据时 configured 为 false', () => {
    expect(new WechatContentSecurity({ appid: '', secret: '' }).configured).toBe(false);
    expect(new WechatContentSecurity({ appid: 'wx', secret: 's' }).configured).toBe(true);
  });

  it('code2Session 换取 openid', async () => {
    const { security, calls } = client([() => json({ openid: 'openid-1', session_key: 'k' })]);
    await expect(security.code2Session('code-1')).resolves.toBe('openid-1');
    expect(calls[0]).toContain('/sns/jscode2session');
    expect(calls[0]).toContain('js_code=code-1');
  });

  it('code2Session 业务错误抛出 WechatApiError', async () => {
    const { security } = client([() => json({ errcode: 40029, errmsg: 'invalid code' })]);
    await expect(security.code2Session('bad')).rejects.toBeInstanceOf(WechatApiError);
  });

  it('msgSecCheck 复用 access_token 并映射 risky 结果', async () => {
    const { security, calls } = client([
      () => json({ access_token: 'token-1', expires_in: 7200 }),
      () => json({ errcode: 0, result: { suggest: 'risky', label: 20003 } }),
      () => json({ errcode: 0, result: { suggest: 'pass', label: 100 } }),
    ]);
    const first = await security.msgSecCheck({ openid: 'o', content: '脏话', scene: 5 });
    expect(first.hit).toBe(true);
    expect(first.message).toContain('辱骂');
    const second = await security.msgSecCheck({ openid: 'o', content: '正常', scene: 5 });
    expect(second.hit).toBe(false);
    expect(calls.filter((url) => url.includes('/cgi-bin/token'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/msg_sec_check'))).toHaveLength(2);
  });

  it('access_token 过期后重新获取', async () => {
    let now = 0;
    const { security, calls } = client([
      () => json({ access_token: 'token-1', expires_in: 7200 }),
      () => json({ errcode: 0, result: { suggest: 'pass', label: 100 } }),
      () => json({ access_token: 'token-2', expires_in: 7200 }),
      () => json({ errcode: 0, result: { suggest: 'pass', label: 100 } }),
    ], () => now);
    await security.msgSecCheck({ openid: 'o', content: 'a', scene: 5 });
    now = 7200 * 1000;
    await security.msgSecCheck({ openid: 'o', content: 'b', scene: 5 });
    expect(calls.filter((url) => url.includes('/cgi-bin/token'))).toHaveLength(2);
  });

  it('并发请求共享同一次 token 刷新', async () => {
    const { security, calls } = client([
      () => json({ access_token: 'token-1', expires_in: 7200 }),
      () => json({ errcode: 0, result: { suggest: 'pass', label: 100 } }),
      () => json({ errcode: 0, result: { suggest: 'pass', label: 100 } }),
    ]);
    await Promise.all([
      security.msgSecCheck({ openid: 'o', content: 'a', scene: 5 }),
      security.msgSecCheck({ openid: 'o', content: 'b', scene: 5 }),
    ]);
    expect(calls.filter((url) => url.includes('/cgi-bin/token'))).toHaveLength(1);
  });

  it('接口业务错误抛出 WechatApiError', async () => {
    const { security } = client([
      () => json({ access_token: 'token-1', expires_in: 7200 }),
      () => json({ errcode: 40003, errmsg: 'invalid openid' }),
    ]);
    await expect(security.msgSecCheck({ openid: 'bad', content: 'a', scene: 5 })).rejects.toBeInstanceOf(WechatApiError);
  });

  it('HTTP 失败抛出 ContentSecurityUnavailableError', async () => {
    const { security } = client([() => json({}, 500)]);
    await expect(security.code2Session('code')).rejects.toBeInstanceOf(ContentSecurityUnavailableError);
  });

  it('网络异常包装为 ContentSecurityUnavailableError', async () => {
    const { security } = client([() => { throw new Error('network down'); }]);
    await expect(security.code2Session('code')).rejects.toBeInstanceOf(ContentSecurityUnavailableError);
  });

  it('日志包含调用类型、场景、字数与结果，且不含原文', async () => {
    const { security, logs } = client([
      () => json({ access_token: 'token-1', expires_in: 7200 }),
      () => json({ errcode: 0, result: { suggest: 'risky', label: 20003 } }),
    ]);
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
    const { security, logs } = client([
      () => json({ access_token: 'token-1', expires_in: 7200 }),
      () => json({ errcode: 40003, errmsg: 'invalid openid' }),
    ]);
    await expect(security.msgSecCheck({ openid: 'bad', content: 'a', scene: 5 })).rejects.toBeInstanceOf(WechatApiError);
    const text = logs.join('\n');
    expect(text).toContain('msgSecCheck 失败');
    expect(text).toContain('errcode=40003');
  });

  it('announce 只打印一次配置状态', () => {
    const logs: string[] = [];
    const security = new WechatContentSecurity({ appid: 'wx1234567890abcdef', secret: 's', log: (line) => logs.push(line) });
    security.announce();
    security.announce();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('已启用微信官方接口');
    expect(logs[0]).toContain('wx12****cdef');
  });

  it('未配置时 announce 提示使用本地词库', () => {
    const logs: string[] = [];
    new WechatContentSecurity({ appid: '', secret: '', log: (line) => logs.push(line) }).announce();
    expect(logs[0]).toContain('未配置');
    expect(logs[0]).toContain('本地词库');
  });

  it('probeToken 在未配置时返回错误', async () => {
    const security = new WechatContentSecurity({ appid: '', secret: '', log: () => {} });
    await expect(security.probeToken()).resolves.toEqual({ ok: false, error: '未配置 WECHAT_APPID / WECHAT_APPSECRET。' });
  });

  it('appid 脱敏', () => {
    expect(maskAppId('')).toBe('');
    expect(maskAppId('wx1234567890abcdef')).toBe('wx12****cdef');
    expect(maskAppId('short')).toBe('sh****');
  });
});
