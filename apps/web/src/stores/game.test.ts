import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const mock = vi.hoisted(() => ({ handlers: {} as Record<string, (...args: any[]) => any>, socket: { connected: true, on: vi.fn(), emit: vi.fn(), connect: vi.fn() } }));
vi.mock('socket.io-client', () => ({ io: () => mock.socket }));
import { useGameStore } from './game';
beforeEach(() => {
  vi.useFakeTimers(); setActivePinia(createPinia()); mock.handlers = {}; mock.socket.connected = true;
  mock.socket.on.mockImplementation((name, fn) => { mock.handlers[name] = fn; }); mock.socket.emit.mockReset();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('请求生命周期', () => {
  it('超时释放等待并忽略迟到确认', async () => {
    const game = useGameStore(); mock.handlers.connect!(); const promise = game.create().catch(e => e.message);
    expect(game.connecting).toBe(true); await vi.advanceTimersByTimeAsync(8000);
    expect(await promise).toContain('超时'); expect(game.connecting).toBe(false);
    mock.socket.emit.mock.calls[0]![2]({ ok: true, data: {} }); expect(game.session).toBeUndefined();
  });
  it('断线拒绝等待请求但保留身份', async () => {
    const game = useGameStore(); game.session = { roomCode: 'ABC123', playerId: 'p', reconnectToken: 'secret' };
    const promise = game.ready(true).catch(e => e.message); mock.socket.connected = false; mock.handlers.disconnect!();
    expect(await promise).toContain('断开'); expect(game.connecting).toBe(false); expect(game.session?.playerId).toBe('p');
  });
  it('离开失败保留身份', async () => {
    const game = useGameStore(); game.session = { roomCode: 'ABC123', playerId: 'p', reconnectToken: 'secret' };
    game.room = { view:'lobby',gameId:'test-game',phase: 'lobby' } as any;
    const promise = game.leave().catch(e => e.message); mock.socket.emit.mock.calls[0]![1]({ ok: false, error: '拒绝离开' });
    expect(await promise).toBe('拒绝离开'); expect(game.session?.playerId).toBe('p');
  });
  it('离线不缓存操作', async () => {
    const game = useGameStore(); mock.socket.connected = false;
    await expect(game.submit('word')).rejects.toThrow('尚未连接'); expect(mock.socket.emit).not.toHaveBeenCalled();
  });
});

describe('权限与恢复保护', () => {
  it('组员不发送个人提交，非房主不发送设置', async () => {
    const game = useGameStore(); game.session = { roomCode: 'ABC123', playerId: 'p', reconnectToken: 'secret' };
    game.room = { view:'lobby',gameId:'test-game',phase: 'writing', ownerId: 'other', currentGroups: [{ members: ['p', 'q'] }] } as any;
    await expect(game.submit('词')).rejects.toThrow('小组成员'); await expect(game.settings({ timerSeconds: 10 })).rejects.toThrow('房主'); expect(mock.socket.emit).not.toHaveBeenCalled();
  });
  it('恢复等待禁止进入，网络超时保留令牌，仅明确失效才删除', async () => {
    const game = useGameStore(); game.session = { roomCode: 'ABC123', playerId: 'p', reconnectToken: 'secret' };
    const restore = mock.handlers.connect!(); await expect(game.create()).rejects.toThrow('恢复'); await expect(game.join('ABC123')).rejects.toThrow('恢复');
    await vi.advanceTimersByTimeAsync(8000); await restore; expect(game.session?.reconnectToken).toBe('secret');
    const retry = mock.handlers.connect!(); mock.socket.emit.mock.calls.at(-1)![2]({ ok: false, error: '会话已过期。' }); await retry; expect(game.session).toBeUndefined();
  });
});

it('游戏中允许退出，确认成功后清理会话',async()=>{
 const game=useGameStore();game.session={roomCode:'ABC123',playerId:'p',reconnectToken:'secret'};game.room={phase:'writing'} as any;
 const leaving=game.leave();expect(mock.socket.emit.mock.calls[0]![0]).toBe('room:leave');mock.socket.emit.mock.calls[0]![1]({ok:true,data:null});await leaving;expect(game.session).toBeUndefined();expect(game.room).toBeUndefined();
});
