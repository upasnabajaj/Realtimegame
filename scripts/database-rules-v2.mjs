import { writeFileSync } from 'node:fs';
import { holds } from '../src/level.js';
import { DEFINITIONS } from '../src/conditions.js';
// No parent write grant: ownership checks at leaves cannot be bypassed by bulk writes.
const google="auth != null && auth.token.firebase.sign_in_provider === 'google.com'";
const base="root.child('stillward/runs/mountain-v2')";
const ep=`(${base}.child('encounters/epoch').exists() ? ${base}.child('encounters/epoch').val() : 0)`;
const num=(lo,hi)=>({'.validate':`newData.isNumber() && newData.val() >= ${lo} && newData.val() <= ${hi}`});
const int=(lo,hi)=>({'.validate':`${num(lo,hi)['.validate']} && newData.val() % 1 === 0`});
const text={'.validate':"newData.isString() && newData.val().length > 0 && newData.val().length <= 40"};
const fresh="newData.isNumber() && newData.val() >= now - 5000 && newData.val() <= now + 1000";
const fields=['v','epoch','owner','name','x','y','vx','vy','angle','checkpoint','grounded','left','right','next','tx','ty','reaching','wind','slip','updatedAt'];
const player={
 '.write':`${google} && ($session.beginsWith(auth.uid + '_')) && (!data.exists() || data.child('owner').val() === auth.uid)`,
 '.validate':`newData.hasChildren(${JSON.stringify(fields)}) && newData.child('owner').val() === auth.uid`,
 v:{'.validate':'newData.val() === 2'},epoch:int(0,1000000),owner:{'.validate':"newData.val() === auth.uid"},name:text,
 x:num(-10000,10000),y:num(-1000,7000),vx:num(-3000,3000),vy:num(-4000,4000),angle:num(-2,2),checkpoint:int(0,4),
 grounded:{'.validate':'newData.isBoolean()'},left:int(-1,holds.length-1),right:int(-1,holds.length-1),next:int(0,1),
 tx:num(-20000,20000),ty:num(-20000,20000),reaching:{'.validate':'newData.isBoolean()'},wind:num(-1000,1000),slip:num(0,1),updatedAt:{'.validate':fresh},'$other':{'.validate':false}
};
// Google clients may prune only expired presence; a fresh heartbeat wins a transaction retry.
player['.write']=`(${player['.write']}) || (${google} && !newData.exists() && data.child('updatedAt').isNumber() && data.child('updatedAt').val() < now - 90000)`;
const actor=`${base}.child('players').child(newData.child('author').val())`;
const ownActor=`${actor}.child('owner').val() === auth.uid && ${actor}.child('updatedAt').val() > now - 45000 && ${actor}.child('epoch').val() === ${ep}`;
const slot = `${base}.child('encounters/slot')`;
const eventFields=['id','rock','type','author','name','requestedAt','startedAt','duration','epoch'];
const events={'$other':{'.validate':false}};
for(const h of holds.filter(h=>h.effect)){
 const key=`rock-${h.id}`;
 events[key]={
  '.write':`${google} && !data.exists() && newData.exists() && ${ownActor} && ${slot}.child('id').val() === '${key}' && ${slot}.child('author').val() === newData.child('author').val() && ${slot}.child('startedAt').val() === newData.child('startedAt').val() && ${slot}.child('duration').val() === newData.child('duration').val() && ${slot}.child('epoch').val() === ${ep}`,
  '.validate':`newData.hasChildren(${JSON.stringify(eventFields)}) && newData.child('id').val() === '${key}' && newData.child('rock').val() === ${h.id} && newData.child('type').val() === '${h.effect}' && newData.child('duration').val() === ${DEFINITIONS[h.effect].duration*1000} && newData.child('epoch').val() === ${ep} && newData.child('name').val() === ${actor}.child('name').val() && (${actor}.child('left').val() === ${h.id} || ${actor}.child('right').val() === ${h.id})`,
  ...Object.fromEntries(eventFields.map(k=>[k,{'.validate':true}])),
  requestedAt:{'.validate':'newData.isNumber() && newData.val() >= now - 3000 && newData.val() <= now + 2000'},startedAt:{'.validate':fresh},'$other':{'.validate':false}
 };
}
const finish={
 '.write':`${google} && !data.exists() && newData.exists() && ${ownActor} && ${actor}.child('y').val() >= 6400 && ${actor}.child('checkpoint').val() === 4`,
 '.validate':`newData.hasChildren(['author','name','epoch','at']) && newData.child('name').val() === ${actor}.child('name').val() && newData.child('epoch').val() === ${ep}`,
 author:{'.validate':'newData.isString()'},name:text,epoch:int(0,1000000),at:{'.validate':fresh},'$other':{'.validate':false}
};
// Reset only the encounter subtree; clients restart themselves on the new epoch.
// The replay actor must have a recorded summit finish, and cannot reset mid-climb.
const replayActor=`${base}.child('players').child(newData.child('resetBy').val())`;
const reservationActor=`${base}.child('players').child(newData.child('author').val())`;
const archive=`${base}.child('encounters/events')`;
const knownSlot=holds.filter(h=>h.effect).map(h=>`(newData.child('id').val() === 'rock-${h.id}' && newData.child('duration').val() === ${DEFINITIONS[h.effect].duration*1000})`).join(' || ');
const reservation={
 '.write':`${google} && ((newData.exists() && ${reservationActor}.child('owner').val() === auth.uid && ${reservationActor}.child('updatedAt').val() > now - 45000 && ${reservationActor}.child('epoch').val() === ${ep} && !${archive}.child(newData.child('id').val()).exists() && (!data.exists() || data.child('startedAt').val() + data.child('duration').val() + 12000 <= now || (!${archive}.child(data.child('id').val()).exists() && data.child('startedAt').val() < now - 5000))) || (!newData.exists() && ${base}.child('players').child(data.child('author').val()).child('owner').val() === auth.uid && !${archive}.child(data.child('id').val()).exists()))`,
 '.validate':`newData.hasChildren(['id','author','epoch','startedAt','duration']) && newData.child('epoch').val() === ${ep} && (${knownSlot})`,
 id:{'.validate':'newData.isString()'},author:{'.validate':'newData.isString()'},epoch:int(0,1000000),startedAt:{'.validate':fresh},duration:num(1000,20000),'$other':{'.validate':false}
};
const encounters={
 '.write':`${google} && newData.child('epoch').val() === ${ep} + 1 && ${replayActor}.child('owner').val() === auth.uid && ${replayActor}.child('y').val() >= 6400 && data.child('finishers').child(newData.child('resetBy').val()).child('epoch').val() === ${ep} && data.child('winner/at').isNumber() && data.child('winner/at').val() <= now - 9000 && !newData.child('events').exists() && !newData.child('finishers').exists() && !newData.child('winner').exists() && !newData.child('slot').exists()`,
 slot:reservation,epoch:int(0,1000000),resetBy:{'.validate':'newData.isString() && newData.val().length <= 128'},events,
 finishers:{'$session':{...finish,'.validate':finish['.validate']+" && newData.child('author').val() === $session"}},
 winner:{...finish,'.write':finish['.write']+` && ${base}.child('encounters/finishers').child(newData.child('author').val()).exists()`},
 '$other':{'.validate':false}
};
const rules={rules:{'.read':false,'.write':false,stillward:{runs:{'mountain-v2':{
 '.read':google,players:{'$session':player},encounters,'$other':{'.validate':false}
}}}}};
writeFileSync(new URL('../database.v2.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
console.log('Prepared Google-only Version 2 rules. No rules were deployed.');
