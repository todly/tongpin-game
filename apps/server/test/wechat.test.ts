import { describe, expect, it, vi } from 'vitest';
import { WechatContentSecurity, WechatApiError, ContentSecurityUnavailableError } from '../src/wechat.js';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function client(responses: Array<() => Response | Promise<Response>>, now = () => 0) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: any) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next();
  });
  const security = new WechatContentSecurity({ appid: 'wx-test', secret: 'secret-test', fetch: fetchImpl as any, now });
  return { security, calls, fetchImpl };
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
});
