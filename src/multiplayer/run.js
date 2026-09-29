import { HEIGHT } from '../level.js';
import { STALE_MS } from './protocol.js';
export const epochOf = state => Number.isInteger(state?.epoch)&&state.epoch>=0?state.epoch:0;
export function finishRun(current, arrival) {
  if(epochOf(current)!==arrival.epoch || current?.finishers?.[arrival.author])return;
  return {...current,epoch:arrival.epoch,winner:current?.winner||arrival,finishers:{...current?.finishers,[arrival.author]:arrival}};
}
export function canReplay(room, uid, now) {
  const state=room?.encounters, epoch=epochOf(state);
  if(!state?.winner || !state?.finishers?.[uid] || now-state.winner.at<9000)return false;
  const players=Object.entries(room.players||{}).filter(([,p])=>p.updatedAt>now-STALE_MS*2);
  return players.length>0 && players.every(([id,p])=>p.epoch===epoch && p.y>=HEIGHT && state.finishers[id]?.epoch===epoch);
}
export function replayRun(room, uid, now) {
  if(!canReplay(room,uid,now))return;
  return {...room,encounters:{epoch:epochOf(room.encounters)+1}};
}
