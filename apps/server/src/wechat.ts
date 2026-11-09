// 微信官方内容安全识别（gameMsgSecCheck）客户端。
// 文档：POST https://api.weixin.qq.com/wxa/game/content_spam/msg_sec_check?access_token=ACCESS_TOKEN
// 仅限服务器端调用；access_token 由本模块统一缓存与刷新。
// 所有调用都会输出一行日志，便于在微信云托管日志中确认是否真正调用了官方接口。
import { MSG_SEC_CHECK_VERSION, mapMsgSecCheckResult, type MsgSecCheckPayload, type MsgSecCheckScene, type SensitiveCheckResult } from '@word-sync/shared';

const API_BASE = 'https://api.weixin.qq.com';
/** access_token 提前 5 分钟刷新，避免临界过期。 */
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;
/** 官方建议超时 1s，这里留出链路余量。 */
const REQUEST_TIMEOUT_MS = 3000;

const SCENE_NAMES: Record<number, string> = { 1: '资料', 2: '评论', 3: '论坛', 4: '社交日志', 5: '聊天' };

export interface WechatApiOptions {
  appid: string;
  secret: string;
  /** 注入 fetch 便于测试。 */
  fetch?: typeof fetch;
  /** 注入当前时间便于测试。 */
  now?: () => number;
  /** 注入日志输出，默认写 stdout；测试环境静默。 */
  log?: (line: string) => void;
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

function defaultLog(line: string) {
  if (process.env.NODE_ENV === 'test') return;
  console.log(line);
}

/** appid 脱敏：保留前 4 位与后 4 位。 */
export function maskAppId(appid: string): string {
  if (!appid) return '';
  if (appid.length <= 8) return `${appid.slice(0, 2)}****`;
  return `${appid.slice(0, 4)}****${appid.slice(-4)}`;
}

export class WechatContentSecurity {
  private token?: TokenCache;
  private pendingToken?: Promise<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private announced = false;

  constructor(private readonly options: WechatApiOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? defaultLog;
  }

  /** 是否已配置 appid/secret，未配置时调用方应回退到本地词库。 */
  get configured(): boolean {
    return !!this.options.appid && !!this.options.secret;
  }

  /** 首次使用时打印一次配置状态，便于确认线上是否读到凭据。 */
  announce() {
    if (this.announced) return;
    this.announced = true;
    if (this.configured) {
      this.log(`[内容安全] 已启用微信官方接口，appid=${maskAppId(this.options.appid)}`);
    } else {
      this.log('[内容安全] 未配置 WECHAT_APPID / WECHAT_APPSECRET，全部使用本地词库');
    }
  }

  /** 记录一条非接口调用事件（如回退本地词库），便于线上排查。 */
  note(detail: string) {
    this.log(`[内容安全] ${detail}`);
  }

  /** 主动探测 access_token 是否可用，用于线上自检。 */
  async probeToken(): Promise<{ ok: boolean; error?: string }> {
    if (!this.configured) return { ok: false, error: '未配置 WECHAT_APPID / WECHAT_APPSECRET。' };
    try {
      await this.accessToken();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /** 用 wx.login 的 code 换取 openid。 */
  async code2Session(code: string): Promise<string> {
    this.announce();
    const started = Date.now();
    try {
      const url = new URL(`${API_BASE}/sns/jscode2session`);
      url.searchParams.set('appid', this.options.appid);
      url.searchParams.set('secret', this.options.secret);
      url.searchParams.set('js_code', code);
      url.searchParams.set('grant_type', 'authorization_code');
      const payload = await this.request<Code2SessionResponse>(url, { method: 'GET' });
      if (payload.errcode) throw new WechatApiError(payload.errcode, payload.errmsg ?? '微信登录失败。');
      if (!payload.openid) throw new WechatApiError(-1, '微信登录未返回 openid。');
      this.log(`[内容安全] code2session 成功 openid=${payload.openid.slice(0, 6)}*** ${Date.now() - started}ms`);
      return payload.openid;
    } catch (error) {
      this.log(`[内容安全] code2session 失败 ${Date.now() - started}ms errcode=${(error as WechatApiError).code ?? '-'} ${(error as Error).message}`);
      throw error;
    }
  }

  /** 调用 gameMsgSecCheck 检测文本内容。 */
  async msgSecCheck(input: { openid: string; content: string; scene: MsgSecCheckScene; nickname?: string }): Promise<SensitiveCheckResult> {
    this.announce();
    const started = Date.now();
    const scene = SCENE_NAMES[input.scene] ?? String(input.scene);
    try {
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
      const result = mapMsgSecCheckResult(payload);
      this.log(`[内容安全] msgSecCheck 成功 scene=${scene} 字数=${input.content.length} suggest=${payload.result?.suggest ?? '-'} label=${payload.result?.label ?? '-'} ${Date.now() - started}ms`);
      return result;
    } catch (error) {
      this.log(`[内容安全] msgSecCheck 失败 scene=${scene} 字数=${input.content.length} ${Date.now() - started}ms errcode=${(error as WechatApiError).code ?? '-'} ${(error as Error).message}`);
      throw error;
    }
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
    const started = Date.now();
    try {
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
      this.log(`[内容安全] access_token 获取成功 有效期=${Math.round(ttl / 1000)}s ${Date.now() - started}ms`);
      return payload.access_token;
    } catch (error) {
      this.log(`[内容安全] access_token 获取失败 ${Date.now() - started}ms errcode=${(error as WechatApiError).code ?? '-'} ${(error as Error).message}`);
      throw error;
    }
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
