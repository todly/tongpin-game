import { describe,it,expect } from 'vitest';
import type { RoomState,FeedItem } from '@word-sync/shared';
import { syncInput } from './inputSync';
import { paginate } from './shareReport';
import { formatEvent } from './timeline';
const state=(extra:Partial<RoomState>={})=>({roundId:'本轮',proposals:[],...extra} as RoomState);
describe('输入与完整分享',()=>{
 it('否决清草稿且重复推送保留新草稿',()=>{const previous=state({proposals:[{memberIds:['本人'],word:'月亮'} as any]});expect(syncInput('旧词',previous,state(),'本人')).toBe('');expect(syncInput('新词',state(),state(),'本人')).toBe('新词');});
 it('他人候选通过恢复服务端实际锁词',()=>{expect(syncInput('旧词',state(),state({lockedWord:'星空'}),'本人')).toBe('星空');});
 it('别组事件不影响本人',()=>{expect(syncInput('草稿',state(),state({proposals:[{memberIds:['别人'],word:'海洋'} as any]}),'本人')).toBe('草稿');});
 it('新回合清空，空白锁词也恢复',()=>{expect(syncInput('草稿',state(),state({roundId:'下轮'}),'本人')).toBe('');expect(syncInput('草稿',state(),state({lockedWord:''}),'本人')).toBe('');});
 it('分页保留全部记录与最后一轮',()=>{const pages=paginate(Array(300).fill(160));expect(pages.length).toBeGreaterThan(1);expect(pages.flat()).toEqual(Array.from({length:300},(_,i)=>i));});
 it('通过与拒绝为白话',()=>{expect(formatEvent({kind:'approved',text:'星空'} as FeedItem)).toBe('大家都同意了，「星空」已提交');expect(formatEvent({kind:'rejected'} as FeedItem)).toContain('重新提议');});
});
