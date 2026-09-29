// The ending stays in the mountain. Only the local arrival changes its camera;
// the first shared arrival produces one brief environmental response for everyone.
export class Summit {
  constructor(world, sound, notice) { Object.assign(this,{world,sound,notice});this.reset(); }
  reset() { this.arrival=0;this.arrived=false;this.event=null;this.shaken=false;this.announced=false;this.elapsed=0;this.world.reveal=0;this.world.tremor=0; }
  arrive() { this.arrived=true; }
  winner(record, now) {
    if(this.event || !record || now-record.at>10000)return;
    this.event=record;this.elapsed=Math.max(0,(now-record.at)/1000);
  }
  update(dt, player) {
    if(this.arrived){this.arrival+=dt;this.world.reveal+=(1-this.world.reveal)*(1-Math.exp(-dt*.65));}
    if(!this.event)return;
    this.elapsed+=dt;
    if(this.elapsed>2.3&&!this.shaken){
      this.shaken=true;this.world.tremor=1.65;this.sound.summit();
      for(let i=0;i<24;i++)this.world.particles.push({x:player.x+(i-12)*10,y:player.y+85+Math.sin(i*7)*24,vx:Math.sin(i)*8,vy:-12,life:2.4,size:1+i%3});
    }
    if(this.elapsed>4.1&&!this.announced){this.announced=true;this.notice(`${this.event.name} REACHED THE SUMMIT`,4200);}
  }
}
