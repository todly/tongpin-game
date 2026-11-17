import { normalizeNickname, randomNickname } from './index.js';

const KEY = 'word-sync-nickname';
interface NicknameStorage {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: string): void;
}
/** 昵称偏好独立于房间会话，退出和会话过期后仍保留。 */
export function loadNickname(storage: NicknameStorage): string {
  try {
    const value = storage.getStorageSync(KEY);
    if (typeof value === 'string' && value.trim()) return normalizeNickname(value);
  } catch {}
  return randomNickname();
}
export function rememberNickname(storage: NicknameStorage, value: string): void {
  if (!value.trim()) return;
  // 本地缓存失败不影响已经成功的房间操作。
  try { storage.setStorageSync(KEY, normalizeNickname(value)); } catch {}
}
