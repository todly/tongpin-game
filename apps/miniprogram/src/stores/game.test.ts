import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const mock = vi.hoisted(() => ({ instances: [] as any[], saved: { roomCode: 'ABCDEF', playerId: '本人', reconnectToken: '本地令牌' } }));
vi.mock('../platform/transport', () => ({ Transport: class {
 onState: any; onClose: any; connect = vi.fn(async () => {}); close = vi.fn();
 request = vi.fn(async () => { this.onState({ players: [{ id: '本人', colorId: 3 }], currentGroups: [], view: 'writing' }); return mock.saved; });
 constructor() { mock.instances.push(this); }
} }));
import { useGameStore } from './game';
beforeEach(() => { mock.instances.length = 0; setActivePinia(createPinia()); vi.stubGlobal('uni', { getStorageSync: () => mock.saved, setStorageSync: vi.fn(), removeStorageSync: vi.fn() }); });
it('前后台恢复保留令牌并重新确认个人状态后开放操作', async () => {
 const game = useGameStore(); await game.connect(); expect(game.available).toBe(true); expect(game.me?.colorId).toBe(3);
 game.hide(); expect(game.available).toBe(false); expect(game.session).toEqual(mock.saved);
 game.show(); await vi.waitFor(() => expect(game.available).toBe(true));
 expect(mock.instances[0].request).toHaveBeenCalledTimes(2); expect(game.me?.colorId).toBe(3);
});
it('恢复前拒绝写操作且不发送请求', async () => {
 const game = useGameStore(); await expect(game.act('game:submit', {})).rejects.toThrow('身份恢复中'); expect(mock.instances[0].request).not.toHaveBeenCalled();
});
