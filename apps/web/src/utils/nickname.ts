import { loadNickname, rememberNickname } from '@word-sync/shared';

// 延迟访问 localStorage，让共享逻辑统一处理浏览器禁用存储的情况。
const storage = {
  getStorageSync: (key: string) => localStorage.getItem(key),
  setStorageSync: (key: string, value: string) => localStorage.setItem(key, value),
};
export const readNickname = () => loadNickname(storage);
export const saveNickname = (value: string) => rememberNickname(storage, value);
