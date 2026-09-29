import { writeFileSync } from 'node:fs';
import { holds } from '../src/level.js';
import { DEFINITIONS } from '../src/conditions.js';
const numeric = (lo, hi) => ({ '.validate': `newData.isNumber() && newData.val() >= ${lo} && newData.val() <= ${hi}` });
const integer = (lo, hi) => ({ '.validate': `newData.isNumber() && newData.val() >= ${lo} && newData.val() <= ${hi} && newData.val() % 1 === 0` });
const bool = { '.validate': 'newData.isBoolean()' };
const state = {
  '.write': "auth != null && ($run === 'mountain-v1' || $run.beginsWith('test-')) && (auth.uid === $uid || (!newData.exists() && data.child('updatedAt').isNumber() && data.child('updatedAt').val() < now - 90000))",
  '.validate': "newData.hasChildren(['v','name','x','y','vx','vy','angle','checkpoint','grounded','left','right','next','tx','ty','reaching','wind','slip','updatedAt'])",
  v: { '.validate': 'newData.val() === 1' },
  name: { '.validate': "newData.isString() && newData.val().matches(/^CLIMBER [A-Z0-9]{4}$/)" },
  x: numeric(-10000, 10000), y: numeric(-1000, 7000), vx: numeric(-3000, 3000), vy: numeric(-4000, 4000),
  angle: numeric(-2, 2), checkpoint: integer(0,4), grounded: bool,
  left: integer(-1, holds.length-1), right: integer(-1, holds.length-1), next: integer(0,1),
  tx: numeric(-20000,20000), ty: numeric(-20000,20000), reaching: bool, wind: numeric(-1000,1000), slip: numeric(0,1),
  updatedAt: { '.validate': 'newData.isNumber() && newData.val() >= now - 5000 && newData.val() <= now + 1000' },
  '$other': { '.validate': false },
};
const rocks = { '$other': { '.validate': false } }, events = { '$other': { '.validate': false } };
const preserve = [];
for (const h of holds.filter(h => h.effect)) {
  const id = `rock-${h.id}`;
  rocks[h.id] = { '.validate': `newData.val() === '${id}' && newData.parent().parent().child('events/${id}').exists()` };
  preserve.push(`(!data.child('rocks/${h.id}').exists() || (newData.child('rocks/${h.id}').val() === data.child('rocks/${h.id}').val() && newData.child('events/${id}').exists()))`);
  events[id] = {
    '.validate': `data.exists() ? (${['id','rock','type','author','name','requestedAt','startedAt','duration'].map(k=>`newData.child('${k}').val() === data.child('${k}').val()`).join(' && ')}) : (newData.hasChildren(['id','rock','type','author','name','requestedAt','startedAt','duration']) && newData.child('id').val() === '${id}' && newData.child('rock').val() === ${h.id} && newData.child('type').val() === '${h.effect}' && newData.child('duration').val() === ${DEFINITIONS[h.effect].duration*1000} && newData.child('author').val() === auth.uid && newData.child('name').val() === root.child('stillward/runs').child($run).child('players').child(auth.uid).child('name').val() && newData.child('requestedAt').isNumber() && newData.child('requestedAt').val() >= now - 3000 && newData.child('requestedAt').val() <= now + 2000 && newData.child('startedAt').isNumber() && newData.child('startedAt').val() >= now - 5000 && newData.child('startedAt').val() <= now + 1000 && newData.parent().parent().child('rocks/${h.id}').val() === '${id}')`,
    ...Object.fromEntries(['id','rock','type','author','name','requestedAt','startedAt','duration'].map(key=>[key,{'.validate':true}])),
    '$other': { '.validate': false },
  };
}
const rules = { rules: { '.read': false, '.write': false, stillward: { runs: { '$run': {
  '.read': "auth != null && ($run === 'mountain-v1' || $run.beginsWith('test-'))",
  '.write': "auth != null && $run === 'test-' + auth.uid && !newData.exists()",
  players: { '$uid': state },
  encounters: {
    '.write': "auth != null && ($run === 'mountain-v1' || $run.beginsWith('test-')) && newData.exists() && newData.hasChildren(['rocks','events'])",
    '.validate': preserve.join(' && '), rocks, events, '$other': { '.validate': false },
  }, '$other': { '.validate': false },
} } } } };
writeFileSync(new URL('../database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
console.log('Generated immutable special-rock rules from the actual level data.');
