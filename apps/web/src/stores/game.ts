import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, RoomState, ServerToClientEvents, SessionPayload, Settings } from '@word-sync/shared';

const STORAGE = 'brainwave-sync-session';
export const useGameStore = defineStore('game', () => {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(import.meta.env.VITE_SERVER_URL || undefined, { autoConnect: false });
  const room = ref<RoomState>();
  const session = ref<SessionPayload>();
  const error = ref('');
  const connected = ref(false);
  const pending = ref(0);
  const restoring = ref(false);
  const connecting = computed(() => pending.value > 0 || restoring.value);
  const available = computed(() => connected.value && !connecting.value && (!session.value || !!room.value));
  const me = computed(() => room.value?.players.find((player) => player.id === session.value?.playerId));
  const myGroup = computed(() => room.value?.currentGroups.find((group) => group.members.includes(session.value?.playerId ?? '')));
  const cancellations = new Set<() => void>();
  function persist() { try { if (session.value) localStorage.setItem(STORAGE, JSON.stringify(session.value)); else localStorage.removeItem(STORAGE); } catch { /* 存储不可用时，当前页面仍可继续使用。 */ } }
  try {
    const stored = localStorage.getItem(STORAGE);
    if (stored) {
      const value = JSON.parse(stored);
      if (value && ['roomCode', 'playerId', 'reconnectToken'].every(key => typeof value[key] === 'string' && value[key])) session.value = value;
      else persist();
    }
  } catch { persist(); }
  socket.on('room:state', (value) => { room.value = value; });
  socket.on('room:error', (message) => error.value = message);
  socket.on('disconnect', () => { connected.value = false; error.value = '连接已断开，正在重连…'; for (const cancel of [...cancellations]) cancel(); });
  socket.on('connect_error', () => { connected.value = false; error.value = '无法连接服务器，请检查网络。'; });
  socket.on('connect', async () => {
    connected.value = true;
    error.value = '';
    if (!session.value) return;
    restoring.value = true;
    try { session.value = await emit<SessionPayload>('room:reconnect', session.value); persist(); }
    catch (cause) { if (cause instanceof ServerError && cause.message === '会话已过期。') clear(); }
    finally { restoring.value = false; }
  });
  class ServerError extends Error {}
  /** 只读校验专用：不占用 pending、不写 error，避免打断输入与按钮状态。 */
  function silent<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    if (!socket.connected) return Promise.reject(new Error('尚未连接服务器。'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('校验超时。')), 5000);
      const ack: Ack<T> = result => { clearTimeout(timer); result.ok ? resolve(result.data) : reject(new Error(result.error)); };
      if (payload === undefined) (socket.emit as any)(event, ack); else (socket.emit as any)(event, payload, ack);
    });
  }
  function emit<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    if (!socket.connected) { error.value = '尚未连接服务器，请稍后重试。'; return Promise.reject(new Error(error.value)); }
    pending.value++;
    error.value = '';
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (failure?: Error, data?: T) => {
        if (done) return;
        done = true; clearTimeout(timer); cancellations.delete(cancel); pending.value--;
        if (failure) { error.value = failure.message; reject(failure); } else resolve(data as T);
      };
      const cancel = () => finish(new Error('连接已断开，操作未确认，请重连后检查房间状态。'));
      const timer = setTimeout(() => finish(new Error('请求超时，操作可能已生效，请检查房间状态后重试。')), 8000);
      cancellations.add(cancel);
      const ack: Ack<T> = result => result.ok ? finish(undefined, result.data) : finish(new ServerError(result.error));
      if (payload === undefined) (socket.emit as any)(event, ack); else (socket.emit as any)(event, payload, ack);
    });
  }
  async function enter(event: 'room:create' | 'room:join', payload: unknown) {
    if (session.value || !available.value) return blocked('正在恢复已有会话，请稍后重试。');
    const value = await emit<SessionPayload>(event, payload); session.value = value; persist();
  }
  function clear() { session.value = undefined; room.value = undefined; persist(); }
  function blocked(message: string): Promise<never> { error.value = message; return Promise.reject(new Error(message)); }
  const isOwner = computed(() => !!session.value && room.value?.ownerId === session.value.playerId);
  const canLeave = computed(() => room.value?.phase === 'lobby' || room.value?.phase === 'ended');
  async function leave() { if (!canLeave.value) return blocked('游戏进行中不能离开房间。'); await emit('room:leave'); clear(); }
  socket.connect();
  return {
    room, session, error, connected, connecting, available, restoring, isOwner, canLeave, me, myGroup,
    create: (nickname?: string) => enter('room:create', { nickname }),
    join: (code: string, nickname?: string) => enter('room:join', { code: code.trim().toUpperCase(), nickname }),
    rename: (nickname: string) => emit('lobby:rename', nickname),
    ready: (ready: boolean) => emit('lobby:ready', ready),
    settings: (settings: Partial<Settings>) => isOwner.value && room.value?.view === 'lobby' ? emit('lobby:settings', settings) : blocked('只有房主可以在大厅修改设置。'),
    submit: (word: string) => myGroup.value ? blocked('小组成员只能提议、同意或否决候选词。') : emit('game:submit', { word, roundId: room.value?.roundId }),
    propose: (word: string) => emit('group:propose', { word, roundId: room.value?.roundId, proposalVersion: room.value?.proposalVersion }),
    confirm: (proposalId: string) => emit('group:confirm', { proposalId, roundId: room.value?.roundId, proposalVersion: room.value?.proposalVersion }),
    reject: (proposalId: string) => emit('group:reject', { proposalId, roundId: room.value?.roundId, proposalVersion: room.value?.proposalVersion }),
    chat: (text: string) => emit('group:chat', { text, roundId: room.value?.roundId }),
    rematch: () => emit('game:rematch', {gameId:room.value?.gameId}), leave, clear,
    /** 只读内容安全校验，供输入过程中实时检测；失败不写入全局 error，避免打断输入。 */
    check: async (text: string, scene?: number) => { try { return await silent<{ hit: boolean; message: string }>('content:check', { text, scene }); } catch { return { hit: false, message: '' }; } },
  };
});
