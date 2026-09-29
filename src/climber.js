import{ledges,nearHolds,HEIGHT}from './level.js';
import { NORMAL } from './conditions.js';
export class Climber{
 constructor(){this.x=ledges[0].x;this.y=28;this.vx=0;this.vy=0;this.grips=[null,null];this.next=0;this.count=0;this.checkpoint=0;this.reach=113;this.target=null;this.cooldown=0;this.grounded=true;this.angle=0;this.catchPulse=0;this.finished=false;this.pending=null;this.strain=0;this.modifiers=NORMAL;this.slip=0}
 release(){const supported=this.grounded||this.grips.some(Boolean);this.pending=null;this.grips=[null,null];this.grounded=false;if(supported)this.vy+=-25+this.modifiers.float*130;this.cooldown=.3}
 grab(h,feedback){if(this.cooldown>0||this.grips.includes(h)||Math.hypot(h.x-this.x,h.y-(this.y+13))>this.reach)return false;const dist=Math.hypot(h.x-this.x,h.y-this.y);this.grips[this.next]=h;this.next=1-this.next;this.grips[this.next]=null;this.count++;this.cooldown=.23;this.grounded=false;this.catchPulse=1;this.vy=Math.max(this.vy,-120);feedback(h,dist>100);return true}
 update(dt,input,feedback,checkpoint,modifiers=NORMAL){this.modifiers=modifiers;const m=modifiers;this.cooldown=Math.max(0,this.cooldown-dt);this.catchPulse=Math.max(0,this.catchPulse-dt*3);this.target=input.active?input.world:null;
 if(input.active){const candidates=nearHolds(input.world.x,input.world.y,35).sort((a,b)=>Math.hypot(a.x-input.world.x,a.y-input.world.y)-Math.hypot(b.x-input.world.x,b.y-input.world.y));if(candidates[0]&&!this.pending&&this.cooldown<=0&&!this.grips.includes(candidates[0])&&Math.hypot(candidates[0].x-this.x,candidates[0].y-this.y-13)<=this.reach)this.pending={hold:candidates[0],time:0,hand:this.next};}
 if(this.pending){this.pending.time+=dt*m.tempo;if(this.pending.time>=.14){this.grab(this.pending.hold,feedback);this.pending=null}}
 this.strain=this.target&&this.grips.some(Boolean)&&Math.hypot(this.target.x-this.x,this.target.y-this.y)>this.reach+45?this.strain+dt:0;if(this.strain>1.6){this.release();this.strain=0;this.slip=0}
 const g=this.grips.find(Boolean);const prevY=this.y;
 if(g){const tx=g.x,ty=g.y-43;this.vx+=(tx-this.x)*32*m.spring*dt;this.vy+=(ty-this.y)*36*m.spring*dt;this.vx*=Math.exp(-6*m.damping*dt);this.vy*=Math.exp(-7*m.damping*dt);}
 else if(!this.grounded){this.vy-=640*m.gravity*dt;this.vx*=Math.exp(-.3*(1-m.float*.65)*dt)}
 if(!this.grounded){this.vx+=m.wind*dt;if(m.wind||m.float||m.tempo!==1||m.rockfall){this.vx=Math.max(-280,Math.min(280,this.vx));this.vy=Math.max(-850,Math.min(380,this.vy));}}
 this.x+=this.vx*dt;this.y+=this.vy*dt;
 if(g){const dx=this.x-g.x,dy=this.y-g.y,d=Math.hypot(dx,dy);if(d>88){this.x=g.x+dx/d*88;this.y=g.y+dy/d*88}}
 if(!g&&this.vy<=0){for(const l of ledges){if(prevY>=l.y+25&&this.y<=l.y+25&&Math.abs(this.x-l.x)<l.width*.6){this.y=l.y+25;this.vy=0;this.vx=0;this.grounded=true;}}}
 const cp=Math.min(4,Math.floor((this.y+48)/1600));if(cp>this.checkpoint){this.checkpoint=cp;checkpoint(cp);if(cp===4)this.finished=true}
 if(this.y<ledges[this.checkpoint].y-460){const l=ledges[this.checkpoint];this.x=l.x;this.y=l.y+27;this.vx=this.vy=0;this.grounded=true;this.grips=[null,null];this.pending=null;this.slip=0;checkpoint(this.checkpoint,true)}
 this.angle+=(Math.max(-.55,Math.min(.55,-this.vx*.004-m.wind*.00016+Math.sin(this.count+this.cooldown*25)*this.slip*.08)) -this.angle)*dt*7;
 }
}
