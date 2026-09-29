export const HEIGHT=6400;
export const rand=(n)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
export const ledges=[0,1600,3200,4800,6400].map((y,i)=>({x:i===0?-95:Math.sin(i*2.3)*100,y,width:i===4?210:150}));
export const holds=[];
// Deliberately braided routes: short traverses, long central catches, and lower recovery shelves.
for(let section=0;section<4;section++){
 const start=ledges[section];
 for(let row=0;row<23;row++){
  const y=section*1600+60+row*68;
  const spine=start.x*(1-row/23)+Math.sin(row*.53+section)*85;
  for(let lane=-1;lane<=1;lane++){
   const x=spine+lane*(79+Math.sin(row*.7)*14);
   holds.push({id:holds.length,x,y:y+(lane===0?16:lane*11),w:lane===0?16:21+rand(row+section*99+lane)*10,seed:holds.length+4});
  }
 }
 // Safe approach to each next terrace.
 for(let j=0;j<3;j++) holds.push({id:holds.length,x:ledges[section+1].x+(j-1)*55,y:(section+1)*1600-35,w:25,seed:600+section*3+j});
}
export function nearHolds(x,y,r){return holds.filter(h=>Math.hypot(h.x-x,h.y-y)<r)}

holds.push({id:holds.length,x:ledges[4].x,y:6450,w:29,seed:999});
// Broad terrace lips bridge the change in direction between neighboring regions.
for(let section=1;section<=4;section++)for(let lane=-2;lane<=2;lane++)holds.push({id:holds.length,x:ledges[section].x+lane*48,y:section*1600+12,w:24+lane%2*3,seed:1100+section*5+lane});

// Suspicious holds favor the faster central braid. Nearby ordinary lanes remain
// available, and the first event sits well beyond the introductory grips.
const strangeRoutes = [
  [[8, 'WIND'], [17, 'SLOW']],
  [[3, 'SPEED'], [8, 'WIND'], [13, 'LOW_GRAVITY'], [19, 'ROCKFALL']],
  [[2, 'ICE'], [6, 'DARKNESS'], [9, 'SLOW'], [12, 'ICE'], [16, 'ROCKFALL'], [20, 'LOW_GRAVITY']],
  [[2, 'WIND'], [4, 'LOW_GRAVITY'], [7, 'SPEED'], [9, 'DARKNESS'], [12, 'ICE'], [14, 'SLOW'], [17, 'ROCKFALL'], [19, 'LOW_GRAVITY'], [21, 'WIND']],
];
strangeRoutes.forEach((entries, section) => entries.forEach(([row, effect]) => {
  const rock = holds[section * 72 + row * 3 + 1];
  rock.effect = effect;
}));
