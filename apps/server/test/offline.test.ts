import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameService } from '../src/game.js';
import type { GameConnection } from '../src/connection.js';

const FIVE_MINUTES = 5 * 60 * 1000;
function connection(game: GameService, id: string) {
  const handlers = new Map<string, (...args: any[]) => void>();
  const socket = {
    id,
    on: (event: string, handler: (...args: any[]) => void) => handlers.set(event, handler),
    join: vi.fn(), leave: vi.fn(), emit: vi.fn(),
    disconnect: () => handlers.get('disconnect')?.(),
  };
  game.bind(socket as GameConnection);
  return {
    socket,
    request: (event: string, data?: unknown): any => {
      let result: any;
      const ack = (value: unknown) => { result = value; };
      if (event === 'room:leave') handlers.get(event)!(ack);
      else handlers.get(event)!(data, ack);
      return result;
    },
  };
}

describe('离线玩家和空房间回收', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('离线未满五分钟保留身份，到期退出并转交房主，旧令牌失效', () => {
    const game = new GameService();
    const a = connection(game, 'a'), b = connection(game, 'b');
    const session = a.request('room:create', {}).data;
    const joined = b.request('room:join', { code: session.roomCode }).data;
    const room = game.rooms.get(session.roomCode)!;
    a.socket.disconnect();
    vi.advanceTimersByTime(FIVE_MINUTES - 1);
    expect(room.players.get(session.playerId)?.connected).toBe(false);
    vi.advanceTimersByTime(1);
    expect(room.players.has(session.playerId)).toBe(false);
    expect(room.ownerId).toBe(joined.playerId);
    expect(connection(game, 'replacement').request('room:reconnect', session).ok).toBe(false);
    expect(b.socket.emit).toHaveBeenLastCalledWith('room:state', expect.objectContaining({ players: expect.arrayContaining([expect.objectContaining({ id: joined.playerId })]) }));
  });

  it('重连取消旧超时，再次离线重新计时，最后一人到期回收房间', () => {
    const game = new GameService();
    const a = connection(game, 'a');
    const session = a.request('room:create', {}).data;
    a.socket.disconnect();
    vi.advanceTimersByTime(FIVE_MINUTES - 1);
    const b = connection(game, 'b');
    expect(b.request('room:reconnect', session).ok).toBe(true);
    vi.advanceTimersByTime(FIVE_MINUTES);
    expect(game.rooms.get(session.roomCode)?.players.get(session.playerId)?.connected).toBe(true);
    b.socket.disconnect();
    vi.advanceTimersByTime(FIVE_MINUTES - 1);
    expect(game.rooms.has(session.roomCode)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(game.rooms.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('全员离线后逐个超时回收，游戏人数不足时结算并清理回合计时器', () => {
    const game = new GameService();
    const a = connection(game, 'a'), b = connection(game, 'b');
    const session = a.request('room:create', {}).data;
    b.request('room:join', { code: session.roomCode });
    a.request('lobby:ready', true); b.request('lobby:ready', true);
    const room = game.rooms.get(session.roomCode)!;
    expect(room.phase).toBe('writing');
    a.socket.disconnect();
    // 让离线期限先于回合期限，验证退出触发的结算。
    clearTimeout(room.timer);
    vi.advanceTimersByTime(FIVE_MINUTES);
    expect(room.phase).toBe('ended');
    expect(room.endReason).toBe('insufficient-players');
    b.socket.disconnect();
    vi.advanceTimersByTime(FIVE_MINUTES);
    expect(game.rooms.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('主动离开立即回收空房间，踢出离线玩家取消其超时', () => {
    const game = new GameService();
    const a = connection(game, 'a'), b = connection(game, 'b');
    const session = a.request('room:create', {}).data;
    const joined = b.request('room:join', { code: session.roomCode }).data;
    b.socket.disconnect();
    expect(a.request('room:kick', { playerId: joined.playerId }).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(a.request('room:leave').ok).toBe(true);
    expect(game.rooms.size).toBe(0);
  });
});
