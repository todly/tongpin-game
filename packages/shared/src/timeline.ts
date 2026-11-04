import type { FeedItem } from './index.js';
export function orderedTimeline(items: FeedItem[]) { return [...items].sort((a,b) => a.createdAt-b.createdAt); }
export function formatEvent(i: FeedItem): string {
 const word=`「${i.text || '空白'}」`;
 switch(i.kind) {
 case 'chat': return i.text;
 case 'proposed': return `${i.nickname}提议用${word}`;
 case 'agreed': return `${i.nickname}同意了这个词`;
 case 'refused': return `${i.nickname}拒绝了这个词`;
 case 'rejected': return '提议已驳回，大家可以重新提议';
 case 'approved': return `大家都同意了，${word}已提交`;
 case 'timeout': return `计时结束，采用当前候选${word}`;
 case 'merge': return i.text;
 case 'submission': return `${i.nickname}提交了${word}`;
 }
}
