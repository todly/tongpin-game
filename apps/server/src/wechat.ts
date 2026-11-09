// 微信官方内容安全识别（gameMsgSecCheck）客户端。
// 文档：POST https://api.weixin.qq.com/wxa/game/content_spam/msg_sec_check?access_token=ACCESS_TOKEN
// 仅限服务器端调用；access_token 由本模块统一缓存与刷新。
import { MSG_SEC_CHECK_VERSION, mapMsgSecCheckResult, type MsgSecCheckPayload, type MsgSecCheckScene, type SensitiveCheckResult } from '@word-sync/shared';

const API_BASE = 'https://api.weixin.qq.com';
/** access_token 提前 5 分钟刷新，避免临界过期。 */
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;
/** 官方建议超时 1s，这里留出链路余量。 */
const REQUEST_TIMEOUT_MS = 3000;

export interface WechatApiOptions {
  appid: string;
  secret: string;
  /** 注入 fetch 便于测试。 */
  fetch?: typeof fetch;
  /** 注入当前时间便于测试。 */
  now?: () => number;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface Code2SessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/** 微信接口返回的业务错误。 */
export class WechatApiError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'WechatApiError';
  }
}

/** 内容安全识别不可用（未配置凭据、网络失败、接口报错等）。 */
export class ContentSecurityUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ContentSecurityUnavailableError';
  }
}

export class WechatContentSecurity {
  private token?: TokenCache;
  private pendingToken?: Promise<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: WechatApiOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  /** 是否已配置 appid/secret，未配置时调用方应回退到本地词库。 */
  get configured(): boolean {
    return !!this.options.appid && !!this.options.secret;
  }

  /** 用 wx.login 的 code 换取 openid。 */
  async code2Session(code: string): Promise<string> {
    const url = new URL(`${API_BASE}/sns/jscode2session`);
    url.searchParams.set('appid', this.options.appid);
    url.searchParams.set('secret', this.options.secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const payload = await this.request<Code2SessionResponse>(url, { method: 'GET' });
    if (payload.errcode) throw new WechatApiError(payload.errcode, payload.errmsg ?? '微信登录失败。');
    if (!payload.openid) throw new WechatApiError(-1, '微信登录未返回 openid。');
    return payload.openid;
  }

  /** 调用 gameMsgSecCheck 检测文本内容。 */
  async msgSecCheck(input: { openid: string; content: string; scene: MsgSecCheckScene; nickname?: string }): Promise<SensitiveCheckResult> {
    const token = await this.accessToken();
    const url = new URL(`${API_BASE}/wxa/game/content_spam/msg_sec_check`);
    url.searchParams.set('access_token', token);
    const body: Record<string, unknown> = {
      openid: input.openid,
      version: MSG_SEC_CHECK_VERSION,
      scene: input.scene,
      content: input.content,
    };
    if (input.nickname) body.nickname = input.nickname;
    const payload = await this.request<MsgSecCheckPayload>(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (payload.errcode) throw new WechatApiError(payload.errcode, payload.errmsg ?? '内容安全识别失败。');
    return mapMsgSecCheckResult(payload);
  }

  /** 获取并缓存 access_token，并发请求共享同一次刷新。 */
  private async accessToken(): Promise<string> {
    const cached = this.token;
    if (cached && cached.expiresAt > this.now()) return cached.token;
    if (this.pendingToken) return this.pendingToken;
    this.pendingToken = this.refreshToken().finally(() => { this.pendingToken = undefined; });
    return this.pendingToken;
  }

  private async refreshToken(): Promise<string> {
    const url = new URL(`${API_BASE}/cgi-bin/token`);
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', this.options.appid);
    url.searchParams.set('secret', this.options.secret);
    const payload = await this.request<{ access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }>(url, { method: 'GET' });
    if (payload.errcode || !payload.access_token) {
      throw new WechatApiError(payload.errcode ?? -1, payload.errmsg ?? '获取 access_token 失败。');
    }
    const ttl = Math.max(60_000, (payload.expires_in ?? 7200) * 1000 - TOKEN_SAFETY_WINDOW_MS);
    this.token = { token: payload.access_token, expiresAt: this.now() + ttl };
    return payload.access_token;
  }

  private async request<T>(url: URL, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      if (!response.ok) throw new ContentSecurityUnavailableError(`微信接口 HTTP ${response.status}。`);
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof WechatApiError || error instanceof ContentSecurityUnavailableError) throw error;
      throw new ContentSecurityUnavailableError('微信接口请求失败。', error);
    } finally {
      clearTimeout(timer);
    }
  }
}
