import type { ClientToServerEvents, RoomState } from '@word-sync/shared';

/** 仅负责连接与定向消息，不承载房间业务。 */
export interface GameConnection {
  id: string;
  /** 云托管注入的微信用户 openid（请求头 x-wx-openid），非微信端为 undefined。 */
  openid?: string;
  on<E extends keyof ClientToServerEvents>(event: E, listener: ClientToServerEvents[E]): unknown;
  on(event: 'disconnect', listener: () => void): unknown;
  join(room: string): unknown;
  leave(room: string): unknown;
  disconnect(close?: boolean): unknown;
  emit(event: 'room:state', state: RoomState): unknown;
  /** 定向通知：目前用于被房主移出房间的玩家。 */
  emit(event: 'room:kicked', payload: { reason: string }): unknown;
}
