import { ledges, nearHolds, HEIGHT } from './level.js';
import { NORMAL } from './conditions.js';

export class Climber {
  constructor() { this.reset(); }
  reset(epoch = 0) {
    Object.assign(this, { x: ledges[0].x, y: 28, vx: 0, vy: 0, grips: [null, null], next: 0,
      count: 0, checkpoint: 0, reach: 113, target: null, cooldown: 0, grounded: true,
      angle: 0, catchPulse: 0, finished: false, pending: null, strain: 0, modifiers: NORMAL,
      slip: 0, mantle: null, epoch });
  }
  release() {
    if (this.finished || this.mantle) return;
    const supported = this.grounded || this.grips.some(Boolean);
    this.pending = null; this.grips = [null, null]; this.grounded = false;
    if (supported) this.vy += -25 + this.modifiers.float * 130;
    this.cooldown = .3;
  }
  reachToward(target) {
    if (this.finished || this.mantle || this.pending || this.cooldown > 0) return;
    const rock = nearHolds(target.x, target.y, 35).sort((a,b) =>
      Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];
    if (rock && !this.grips.includes(rock) && Math.hypot(rock.x-this.x,rock.y-this.y-13)<=this.reach)
      this.pending = { hold: rock, time: 0, hand: this.next };
  }
  grab(hold, feedback) {
    if (this.finished || this.mantle || this.cooldown>0 || this.grips.includes(hold) ||
      Math.hypot(hold.x-this.x,hold.y-this.y-13)>this.reach) return false;
    const distance = Math.hypot(hold.x-this.x,hold.y-this.y);
    this.grips[this.next] = hold; this.next = 1-this.next; this.grips[this.next] = null;
    this.count++; this.cooldown = .23; this.grounded = false; this.catchPulse = 1;
    this.vy = Math.max(this.vy,-120); feedback(hold,distance>100); return true;
  }
  update(dt, input, feedback, checkpoint, modifiers = NORMAL) {
    this.modifiers = modifiers;
    this.cooldown = Math.max(0,this.cooldown-dt);
    this.catchPulse = Math.max(0,this.catchPulse-dt*3);
    if (this.finished) { this.target=null; this.angle*=Math.exp(-dt*5); return; }
    if (this.mantle) {
      const m=this.mantle; m.time+=dt;
      const t=Math.min(1,m.time/.85), eased=t*t*(3-2*t), ledge=ledges[4];
      this.x=m.x+(Math.max(ledge.x-75,Math.min(ledge.x+75,m.x))-m.x)*eased;
      this.y=m.y+(HEIGHT+25-m.y)*eased; this.vx=this.vy=0; this.target=null;
      if(t>.65)this.grips=[null,null];
      if(t===1){this.mantle=null;this.finished=true;this.checkpoint=4;this.grounded=true;checkpoint(4);}
      return;
    }
    const m=modifiers;
    this.target=input.active?input.world:null;
    if(input.active)this.reachToward(input.world);
    if(this.pending){this.pending.time+=dt*m.tempo;if(this.pending.time>=.14){this.grab(this.pending.hold,feedback);this.pending=null;}}
    this.strain=this.target&&this.grips.some(Boolean)&&Math.hypot(this.target.x-this.x,this.target.y-this.y)>this.reach+45?this.strain+dt:0;
    if(this.strain>1.6){this.release();this.strain=0;this.slip=0;}
    const grip=this.grips.find(Boolean), previousY=this.y;
    if(grip){this.vx+=(grip.x-this.x)*32*m.spring*dt;this.vy+=(grip.y-43-this.y)*36*m.spring*dt;
      this.vx*=Math.exp(-6*m.damping*dt);this.vy*=Math.exp(-7*m.damping*dt);
    }else if(!this.grounded){this.vy-=640*m.gravity*dt;this.vx*=Math.exp(-.3*(1-m.float*.65)*dt);}
    if(!this.grounded){this.vx+=m.wind*dt;if(m.wind||m.float||m.tempo!==1||m.rockfall){this.vx=Math.max(-280,Math.min(280,this.vx));this.vy=Math.max(-850,Math.min(380,this.vy));}}
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    if(grip){const dx=this.x-grip.x,dy=this.y-grip.y,d=Math.hypot(dx,dy);if(d>88){this.x=grip.x+dx/d*88;this.y=grip.y+dy/d*88;}}
    if(!grip&&this.vy<=0)for(const ledge of ledges){
      if(previousY>=ledge.y+25&&this.y<=ledge.y+25&&Math.abs(this.x-ledge.x)<ledge.width*.6){
        this.y=ledge.y+25;this.vy=this.vx=0;this.grounded=true;
      }
    }
    const cp=Math.min(3,Math.floor((this.y+48)/1600));
    if(cp>this.checkpoint){this.checkpoint=cp;checkpoint(cp);}
    if(grip&&grip.y>=HEIGHT+12&&this.y>=HEIGHT-35&&Math.abs(this.x-ledges[4].x)<130){
      this.mantle={x:this.x,y:this.y,time:0};this.pending=null;
    }
    if(this.y<ledges[this.checkpoint].y-460){const ledge=ledges[this.checkpoint];
      this.x=ledge.x;this.y=ledge.y+27;this.vx=this.vy=0;this.grounded=true;this.grips=[null,null];this.pending=null;this.slip=0;checkpoint(this.checkpoint,true);
    }
    this.angle+=(Math.max(-.55,Math.min(.55,-this.vx*.004-m.wind*.00016+Math.sin(this.count+this.cooldown*25)*this.slip*.08))-this.angle)*dt*7;
  }
}
