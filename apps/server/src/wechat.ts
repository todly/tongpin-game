// 微信云托管「开放接口服务」云调用客户端。
// 文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/openapi/
//
// 云调用要点：
// 1. 容器内用 HTTP 请求 api.weixin.qq.com（内网旁加载代理），无需 access_token；
// 2. openid 由云托管在请求头 x-wx-openid 中自动注入，无需 wx.login 换 code；
// 3. 需在控制台「云调用-微信令牌权限配置」中开通 /wxa/game/content_spam/msg_sec_check；
// 4. 回包 Header 带 x-openapi-seqid 表示确实走了云调用链路。
import { MSG_SEC_CHECK_VERSION, mapMsgSecCheckResult, type MsgSecCheckPayload, type MsgSecCheckScene, type SensitiveCheckResult } from '@word-sync/shared';

/** 云调用固定使用 HTTP 内网域名，HTTPS 需额外信任容器内自签证书。 */
const DEFAULT_API_BASE = 'http://api.weixin.qq.com';
/** 官方建议超时 1s，这里留出链路余量。 */
const REQUEST_TIMEOUT_MS = 3000;

const SCENE_NAMES: Record<number, string> = { 1: '资料', 2: '评论', 3: '论坛', 4: '社交日志', 5: '聊天' };

export interface WechatApiOptions {
  /** 云调用无需 appid/secret，保留用于日志与资源复用场景的 from_appid。 */
  appid?: string;
  /** 资源复用时指定归属小程序，会作为 from_appid 参数附加。 */
  fromAppid?: string;
  /** 微信 API 域名，默认云调用内网地址。 */
  apiBase?: string;
  /** 注入 fetch 便于测试。 */
  fetch?: typeof fetch;
  /** 注入日志输出，默认写 stdout；测试环境静默。 */
  log?: (line: string) => void;
}

/** 微信接口返回的业务错误。 */
export class WechatApiError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'WechatApiError';
  }
}

/** 内容安全识别不可用（网络失败、接口报错等）。 */
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

/** 提取底层网络错误码，便于定位 DNS/连接/超时问题。 */
export function describeError(error: unknown): string {
  const cause = (error as ContentSecurityUnavailableError)?.cause as any;
  const code = cause?.code ?? cause?.cause?.code;
  const detail = cause?.message ?? (error as Error)?.message ?? String(error);
  return code ? `${code} ${detail}` : detail;
}

export class WechatContentSecurity {
  private readonly log: (line: string) => void;
  private readonly apiBase: string;
  private announced = false;
  /** 最近一次调用是否命中云调用链路（回包带 x-openapi-seqid）。 */
  private lastSeqId?: string;

  constructor(private readonly options: WechatApiOptions = {}) {
    this.log = options.log ?? defaultLog;
    // 空字符串（如 .env 中留空的 WECHAT_API_BASE=）同样回退默认域名。
    this.apiBase = (options.apiBase?.trim() || DEFAULT_API_BASE).replace(/\/$/, '');
  }

  /** 云调用始终可用（不依赖本地凭据），保留该属性兼容调用方判断。 */
  get configured(): boolean {
    return true;
  }

  /** 最近一次云调用链路标识，undefined 表示未走云调用或尚未调用。 */
  get seqId(): string | undefined {
    return this.lastSeqId;
  }

  /** 首次使用时打印一次配置状态，便于确认线上是否启用云调用。 */
  announce() {
    if (this.announced) return;
    this.announced = true;
    const appid = this.options.appid ? ` appid=${maskAppId(this.options.appid)}` : '';
    this.log(`[内容安全] 已启用微信云调用（开放接口服务）api=${this.apiBase}${appid}`);
  }

  /** 记录一条非接口调用事件（如回退本地词库），便于线上排查。 */
  note(detail: string) {
    this.log(`[内容安全] ${detail}`);
  }

  /** 调用 gameMsgSecCheck 检测文本内容。openid 来自云托管请求头 x-wx-openid。 */
  async msgSecCheck(input: { openid: string; content: string; scene: MsgSecCheckScene; nickname?: string }): Promise<SensitiveCheckResult> {
    this.announce();
    const started = Date.now();
    const scene = SCENE_NAMES[input.scene] ?? String(input.scene);
    try {
      const url = new URL(`${this.apiBase}/wxa/game/content_spam/msg_sec_check`);
      if (this.options.fromAppid) url.searchParams.set('from_appid', this.options.fromAppid);
      const body: Record<string, unknown> = {
        openid: input.openid,
        version: MSG_SEC_CHECK_VERSION,
        scene: input.scene,
        content: input.content,
      };
      if (input.nickname) body.nickname = input.nickname;
      const { payload, seqId } = await this.request<MsgSecCheckPayload>(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (payload.errcode) throw new WechatApiError(payload.errcode, payload.errmsg ?? '内容安全识别失败。');
      const result = mapMsgSecCheckResult(payload);
      const via = seqId ? `云调用=${seqId}` : '云调用=未命中(检查开放接口服务开关与权限配置)';
      this.log(`[内容安全] msgSecCheck 成功 scene=${scene} 字数=${input.content.length} suggest=${payload.result?.suggest ?? '-'} label=${payload.result?.label ?? '-'} ${via} ${Date.now() - started}ms`);
      return result;
    } catch (error) {
      this.log(`[内容安全] msgSecCheck 失败 scene=${scene} 字数=${input.content.length} ${Date.now() - started}ms errcode=${(error as WechatApiError).code ?? '-'} ${describeError(error)}`);
      throw error;
    }
  }

  private async request<T>(url: URL, init: RequestInit): Promise<{ payload: T; seqId?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      // 延迟解析 fetch，便于测试替换全局实现。
      const response = await (this.options.fetch ?? globalThis.fetch)(url, { ...init, signal: controller.signal });
      if (!response.ok) throw new ContentSecurityUnavailableError(`微信接口 HTTP ${response.status}。`);
      const seqId = response.headers.get('x-openapi-seqid') ?? undefined;
      if (seqId) this.lastSeqId = seqId;
      return { payload: (await response.json()) as T, seqId };
    } catch (error) {
      if (error instanceof WechatApiError || error instanceof ContentSecurityUnavailableError) throw error;
      throw new ContentSecurityUnavailableError('微信接口请求失败。', error);
    } finally {
      clearTimeout(timer);
    }
  }
}
