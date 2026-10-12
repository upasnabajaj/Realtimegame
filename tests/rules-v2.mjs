// Requires only the local Database emulator. Never accepts a production hostname.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodePlayer} from '../src/multiplayer/protocol.js';
import {Climber} from '../src/climber.js';
import {holds} from '../src/level.js';
import {DEFINITIONS} from '../src/conditions.js';
const base='http://127.0.0.1:9000', ns='demo-stillward-v2';
const rules=await readFile(new URL('../database.v2.rules.json',import.meta.url),'utf8');
const token=(uid,provider='google.com')=>{
 const now=Math.floor(Date.now()/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 return `${encode({alg:'none',typ:'JWT'})}.${encode({iss:`https://securetoken.google.com/${ns}`,aud:ns,sub:uid,user_id:uid,iat:now,exp:now+3600,auth_time:now,firebase:{identities:{},sign_in_provider:provider}})}.`;
};
async function request(path,method='GET',body,auth){
 const url=`${base}/${path}.json?ns=${ns}${auth&&auth!=='owner'?`&auth=${encodeURIComponent(auth)}`:''}`;
 return fetch(url,{method,headers:{'Content-Type':'application/json',...(auth==='owner'?{Authorization:'Bearer owner'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
let r=await request('.settings/rules','PUT',JSON.parse(rules),'owner');assert(r.ok,await r.text());
await request('','DELETE',undefined,'owner');
const path='stillward/runs/mountain-v2',alice=token('alice'),bob=token('bob'),anon=token('anonymous','anonymous');
const pose=(owner)=>({...encodePlayer(new Climber(),owner==='alice'?'Alice':'Bob'),owner,updatedAt:{'.sv':'timestamp'}});
async function allowed(p,m,d,t){const response=await request(p,m,d,t);assert(response.ok,`${m} ${p} should pass: ${await response.text()}`);}
async function denied(p,m,d,t){const response=await request(p,m,d,t);assert.equal(response.status,401,`${m} ${p} should be denied: ${await response.text()}`);}
await denied(`${path}/players/alice_tab`,'PUT',pose('alice'));
await denied(`${path}/players/anonymous_tab`,'PUT',pose('anonymous'),anon);
await denied(path,'GET',undefined);
await allowed(`${path}/players/alice_tab`,'PUT',pose('alice'),alice);
await allowed(`${path}/players/bob_tab`,'PUT',pose('bob'),bob);
await allowed(`${path}/players/alice_other`,'PUT',pose('alice'),alice);
await denied(`${path}/players/alice_tab`,'PUT',pose('alice'),bob);
await denied(`${path}/players/alice_tab`,'DELETE',undefined,bob);
await denied(`${path}/players/alice_tab`,'PATCH',{x:999999},alice);
await denied(`${path}/players/alice_tab`,'PATCH',{owner:'bob'},alice);
const wind=holds.find(h=>h.effect==='WIND');
await allowed(`${path}/players/alice_tab`,'PATCH',{x:wind.x,y:wind.y-43,left:wind.id,updatedAt:{'.sv':'timestamp'}},alice);
const event={id:`rock-${wind.id}`,rock:wind.id,type:'WIND',author:'alice_tab',name:'Alice',requestedAt:Date.now(),startedAt:{'.sv':'timestamp'},duration:DEFINITIONS.WIND.duration*1000,epoch:0};
const eventPath=`${path}/encounters/events/${event.id}`;
await denied(eventPath,'PUT',event,bob);
await allowed(eventPath,'PUT',event,alice);
await denied(eventPath,'PUT',{...event,type:'SPEED'},alice);
await denied(eventPath,'DELETE',undefined,alice);
await denied(`${path}/encounters`,'PUT',{epoch:0},alice);
await denied(`${path}/encounters`,'DELETE',undefined,alice);
await denied(`${path}/encounters/finishers/alice_tab`,'PUT',{author:'alice_tab',name:'Alice',epoch:0,at:{'.sv':'timestamp'}},alice);
await allowed(`${path}/players/alice_tab`,'PATCH',{y:6425,checkpoint:4,updatedAt:{'.sv':'timestamp'}},alice);
const finish={author:'alice_tab',name:'Alice',epoch:0,at:{'.sv':'timestamp'}};
await allowed(`${path}/encounters/finishers/alice_tab`,'PUT',finish,alice);
await denied(`${path}/encounters/finishers/bob_tab`,'PUT',finish,alice);
await allowed(`${path}/encounters/winner`,'PUT',finish,alice);
await denied(`${path}/encounters/winner`,'DELETE',undefined,alice);
await denied(`${path}/encounters/finishers/alice_tab`,'DELETE',undefined,bob);
await denied(`${path}/encounters`,'PUT',{epoch:1,resetBy:'alice_tab'},alice);
// Advance only emulator fixture time; no waiting or production writes.
await allowed(`${path}/encounters/winner/at`,'PUT',Date.now()-10000,'owner');
await denied(`${path}/encounters`,'PUT',{epoch:1,resetBy:'alice_tab'},bob);
await allowed(`${path}/encounters`,'PUT',{epoch:1,resetBy:'alice_tab'},alice);
await denied(eventPath,'PUT',event,alice); // Old epoch cannot leak into replay.
await allowed(`${path}/players/alice_tab`,'PATCH',{epoch:1,y:wind.y-43,left:wind.id,checkpoint:0,updatedAt:{'.sv':'timestamp'}},alice);
await allowed(eventPath,'PUT',{...event,epoch:1,requestedAt:Date.now()},alice);
await allowed(`${path}/players/alice_tab`,'DELETE',undefined,alice);
await denied(`${path}/players/alice_other`,'DELETE',undefined,bob);
await allowed(`${path}/players/alice_other/updatedAt`,'PUT',Date.now()-95000,'owner');
await allowed(`${path}/players/alice_other`,'DELETE',undefined,bob);
await request('','DELETE',undefined,'owner');
console.log('Local emulator: Google-only reads/writes, ownership, tab isolation, numeric validation, immutable events, summit authorization, replay isolation and stale-presence pruning pass.');
