// 轻量 .env 加载：不引入额外依赖，不覆盖已存在的环境变量（部署平台注入优先）。
// 从当前工作目录向上查找 .env，兼容 pnpm --filter 在包目录启动的情况。
// 注意：.env 已被 .gitignore / .dockerignore 排除，云托管等部署环境不会包含该文件，
// 云调用无需 access_token，通常无需在部署平台配置任何微信凭据。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function parse(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(index + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** 从 start 目录向上查找 .env，仅填充尚未设置的环境变量。返回命中的文件路径。 */
export function loadEnv(start = process.cwd(), depth = 3): string | undefined {
  let dir = path.resolve(start);
  for (let i = 0; i <= depth; i++) {
    const file = path.join(dir, '.env');
    if (existsSync(file)) {
      for (const [key, value] of Object.entries(parse(readFileSync(file, 'utf8')))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return file;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** 启动诊断：打印 .env 命中情况与关键环境变量是否注入（不打印值）。 */
export function reportEnv() {
  if (process.env.NODE_ENV === 'test') return;
  const file = loadEnv();
  const keys = ['WECHAT_APPID', 'WECHAT_FROM_APPID', 'WECHAT_API_BASE', 'SENSITIVE_WORDS'];
  const status = keys.map((key) => `${key}=${process.env[key] ? '已设置' : '未设置'}`).join(' ');
  console.log(`[环境] .env ${file ? `已加载 ${file}` : '未找到（依赖部署平台环境变量）'}；${status}`);
}

loadEnv();
