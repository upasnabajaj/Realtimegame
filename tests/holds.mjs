import assert from 'node:assert/strict';
import {holds,ledges} from '../src/level.js';
import {Climber} from '../src/climber.js';
import {Conditions} from '../src/conditions.js';
const reached=new Set(holds.filter(h=>Math.hypot(h.x-ledges[0].x,h.y-41)<=113).map(h=>h.id));
let changed=true;
while(changed){changed=false;for(const h of holds)if(!reached.has(h.id)&&holds.some(a=>reached.has(a.id)&&Math.hypot(h.x-a.x,h.y-a.y+30)<=113)){reached.add(h.id);changed=true;}}
assert.equal(reached.size,holds.length,'Every hold belongs to the reachable network');
for(const h of holds){
 assert.equal(holds[h.id],h);assert(Number.isFinite(h.x)&&Number.isFinite(h.y));
 const p=new Climber();p.x=h.x;p.y=h.y-65;p.grounded=false;
 p.reachToward(h);assert(p.pending,`Hold ${h.id} accepts a reach`);
 let caught=false;for(let i=0;i<20;i++)p.update(1/120,{active:false},rock=>{caught=true;assert.equal(rock.id,h.id)},()=>{});
 assert(caught,`Hold ${h.id} attaches the hand`);
}
// A held stone closer to the pointer must not hide another reachable stone.
const a=holds.find(h=>holds.some(b=>b!==h&&Math.hypot(b.x-h.x,b.y-h.y)<30));
if(a){const b=holds.find(h=>h!==a&&Math.hypot(h.x-a.x,h.y-a.y)<30),p=new Climber();p.x=b.x;p.y=b.y-43;p.grips=[a,null];p.reachToward(a);assert(p.pending&&!p.grips.includes(p.pending.hold));}
const p=new Climber(),c=new Conditions(),aStone=holds[30],bStone=holds[31];
p.x=aStone.x;p.y=aStone.y-43;p.grips=[aStone,null];p.grounded=false;c.trigger('ICE');
c.update(.8,p);assert(c.gripAge>=.8);
p.x=bStone.x;p.y=bStone.y-43;p.cooldown=0;assert(p.grab(bStone,()=>{}));c.update(.01,p);
assert(c.gripAge<.02,'Only a successful different hold resets frost dwell');
console.log(`All ${holds.length} holds reachable and catchable; neighboring-grip selection and different-stone frost reset pass.`);
