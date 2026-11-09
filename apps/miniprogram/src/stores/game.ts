import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { RoomState, SessionPayload } from '@word-sync/shared';
import { Transport } from '../platform/transport';
export const useGameStore = defineStore('game', () => {
  const room = ref<RoomState>(), session = ref<SessionPayload>(), connected = ref(false), restored = ref(false), error = ref('');
  const transport = new Transport(); let connecting = false; let retry: ReturnType<typeof setTimeout> | undefined; let background = false;
  const stored = uni.getStorageSync('word-sync-session');
  if (stored && typeof stored.roomCode === 'string' && typeof stored.playerId === 'string' && typeof stored.reconnectToken === 'string') session.value = stored;
  const available = computed(() => connected.value && restored.value);
  const me = computed(() => room.value?.players.find(p => p.id === session.value?.playerId));
  const myGroup = computed(() => room.value?.currentGroups.find(g => g.members.includes(session.value?.playerId || '')));
  const isOwner = computed(() => room.value?.ownerId === me.value?.id);
  const canLeave = computed(() => room.value?.phase === 'lobby' || room.value?.phase === 'ended');
  transport.onState = state => { room.value = state; if (session.value && state.players.some((p: any) => p.id === session.value!.playerId)) restored.value = true; };
  function queue() { clearTimeout(retry); retry = setTimeout(() => { void connect(); }, 1500); }
  transport.onClose = () => { connected.value = false; restored.value = false; queue(); };
  function save(value: SessionPayload) { session.value = value; uni.setStorageSync('word-sync-session', value); }
  // 微信端内容安全识别需要 openid：连接后用 wx.login 的 code 换取。
  // 上报失败不阻断连接，服务端会回退本地词库。
  function login() {
    try {
      uni.login({ provider: 'weixin', success: (r: any) => { if (r?.code) void transport.request('wechat:login', { code: r.code }).catch(() => {}); }, fail: () => {} });
    } catch { /* 未配置或登录失败时，服务端使用本地词库兜底。 */ }
  }
  async function connect() {
    if (connecting || connected.value) return; connecting = true; clearTimeout(retry);
    try {
      await transport.connect(); connected.value = true; error.value = '';
      login();
      if (session.value) {
        try { save(await transport.request<SessionPayload>('room:reconnect', session.value)); }
        catch (e) {
          if ((e as Error).message === '会话已过期。') { session.value = undefined; room.value = undefined; uni.removeStorageSync('word-sync-session'); restored.value = true; }
          else throw e;
        }
      } else restored.value = true;
    } catch (e) { error.value = (e as Error).message; connected.value = false; restored.value = false; transport.close(); queue(); }
    finally { connecting = false; }
  }
  async function act(event: string, data: unknown = null) {
    if (!available.value) throw new Error('身份恢复中，请稍候。');
    error.value = '';
    try {
      const value = await transport.request<SessionPayload | null>(event, data);
      if (event === 'room:create' || event === 'room:join') save(value!);
      if (event === 'room:leave') { session.value = undefined; room.value = undefined; uni.removeStorageSync('word-sync-session'); }
      return value;
    } catch (e) { error.value = (e as Error).message; throw e; }
  }
  const round = () => ({ roundId: room.value!.roundId, proposalVersion: room.value!.proposalVersion });
  function hide() { background = true; restored.value = false; }
  function show() {
    if (background) { background = false; transport.close(); connected.value = false; restored.value = false; }
    void connect();
  }
  return { room, session, connected, available, error, me, myGroup, isOwner, canLeave, connect, hide, show, act, round };
});
