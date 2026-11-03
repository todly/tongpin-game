import type { RoomState } from '@word-sync/shared';
export function syncInput(draft:string, previous:RoomState|undefined, room:RoomState, playerId:string) {
 if(room.lockedWord!==undefined) return room.lockedWord;
 const candidate=room.proposals.find(p=>p.memberIds.includes(playerId));
 if(candidate) return candidate.word;
 if(previous?.roundId!==room.roundId) return '';
 if(previous.proposals.some(p=>p.memberIds.includes(playerId)) && !candidate) return '';
 return draft;
}
