// Opt-in service integration test. Uses a disposable test run, never live rocks.
// This tests Auth + RTDB REST semantics, not browser WebSocket/onDisconnect behavior.
import assert from 'node:assert/strict';
import { firebaseConfig as config } from '../src/firebase-config.js';
import { holds } from '../src/level.js';
import { Climber } from '../src/climber.js';
import { claimEncounter, encodePlayer } from '../src/multiplayer/protocol.js';
import { DEFINITIONS } from '../src/conditions.js';
const accounts=[]; let run, offset=0;
async function auth(method, body) {
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${config.apiKey}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
  });
  const data=await response.json();
  if(!response.ok)throw new Error(`Firebase Authentication: ${data.error?.message || response.status}`);
  return data;
}
async function request(account,path,options={}) {
  return fetch(`${config.databaseURL}/stillward/runs/${run}/${path}.json?auth=${encodeURIComponent(account.idToken)}`,{
    ...options,headers:{'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000),
  });
}
async function claim(account, rock) {
  const requestedAt=Date.now()+offset;
  for(let attempt=0;attempt<4;attempt++){
    const read=await request(account,'encounters',{headers:{'X-Firebase-ETag':'true'}});
    if(!read.ok)throw new Error(`Read encounters denied (${read.status}); install the scoped database rules.`);
    const current=await read.json();
    const event={id:`rock-${rock.id}`,rock:rock.id,type:rock.effect,author:account.localId,name:account.name,
      requestedAt,startedAt:{'.sv':'timestamp'},duration:DEFINITIONS[rock.effect].duration*1000};
    const next=claimEncounter(current,event);if(!next)return false;
    const write=await request(account,'encounters',{method:'PUT',headers:{'If-Match':read.headers.get('etag')},body:JSON.stringify(next)});
    if(write.ok)return true;
    if(write.status!==412)throw new Error(`Claim rejected (${write.status}); verify database rules and server time.`);
  }
  throw new Error('Claim contention did not settle');
}
try {
  for(let i=0;i<3;i++)accounts.push({...await auth('signUp',{returnSecureToken:true}),name:`CLIMBER T00${i}`});
  run=`test-${accounts[0].localId}`;
  for(const a of accounts){
    const response=await request(a,`players/${a.localId}`,{method:'PUT',body:JSON.stringify({...encodePlayer(new Climber(),a.name),updatedAt:{'.sv':'timestamp'}})});
    assert(response.ok,`Player write rejected: ${response.status}`);
    offset=Date.parse(response.headers.get('date'))-Date.now();
  }
  const players=await request(accounts[0],'players');assert(players.ok);assert.equal(Object.keys(await players.json()).length,3);
  const movement=await request(accounts[0],`players/${accounts[0].localId}`,{method:'PATCH',body:JSON.stringify({x:12,y:460,updatedAt:{'.sv':'timestamp'}})});
  assert(movement.ok);const seen=await request(accounts[1],`players/${accounts[0].localId}`);assert.equal((await seen.json()).y,460);
  const wind=holds.find(h=>h.effect==='WIND');
  const raced=await Promise.all(accounts.map(a=>claim(a,wind)));assert.equal(raced.filter(Boolean).length,1);
  const low=holds.find(h=>h.effect==='LOW_GRAVITY');assert(await claim(accounts[1],low));
  const snapshot=await request(accounts[2],'encounters');const data=await snapshot.json();
  assert.equal(Object.keys(data.rocks).length,2);assert.equal(Object.keys(data.events).length,2);
  for(const e of Object.values(data.events))assert.equal(typeof e.startedAt,'number');
  const leaving=await request(accounts[0],`players/${accounts[0].localId}`,{method:'DELETE'});assert(leaving.ok);
  const remaining=await request(accounts[1],'players');assert.equal(Object.keys(await remaining.json()).length,2);
  console.log('LIVE SERVICE PASS: three anonymous identities, player writes/reads, movement, one atomic race winner, shared events with server timestamps, and player removal. Browser presence still requires UI testing.');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
  if(run){
    const response=await fetch(`${config.databaseURL}/stillward/runs/${run}.json?auth=${encodeURIComponent(accounts[0].idToken)}`,{method:'DELETE',signal:AbortSignal.timeout(15000)}).catch(()=>null);
    if(!response?.ok){console.error(`Test-run cleanup needs attention: stillward/runs/${run}`);process.exitCode=1;}
    else console.log('Disposable database test run removed.');
  }
  for(const account of accounts)await auth('delete',{idToken:account.idToken}).catch(()=>{console.error('A temporary test identity could not be deleted.');process.exitCode=1;});
}
