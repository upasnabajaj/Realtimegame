import { DEFINITIONS } from './conditions.js';

// Drawn in the same world coordinates and stone palette as the existing mountain.
export function drawStrangeRock(world, rock, x, y, conditions) {
  if (!conditions) return;
  const c = world.ctx, t = world.time;
  const flash = conditions.flashes.get(rock.id) || 0;
  const spent = conditions.spent.has(rock.id);
  if (rock.effect) {
    const color = DEFINITIONS[rock.effect].color;
    c.save();
    c.globalAlpha = spent ? .3 + flash * .7 : .45 + Math.sin(t * 1.7 + rock.id) * .12;
    c.strokeStyle = spent && !flash ? '#4f5953' : color;
    c.lineWidth = spent ? 1 : 1.3;
    if (!spent || flash) { c.shadowColor = color; c.shadowBlur = 5 + flash * 10; }
    c.beginPath();
    c.moveTo(x - rock.w * .45, y + 3);
    c.lineTo(x - 3, y + 1);
    c.lineTo(x + 2, y + 5);
    c.lineTo(x + 6, y - 2);
    c.lineTo(x + rock.w * .6, y);
    c.stroke();
    c.shadowBlur = 0;
    if (!spent) {
      for (let i = 0; i < 3; i++) {
        const phase = (t * .28 + i / 3 + rock.id * .03) % 1;
        c.globalAlpha = (1 - phase) * .28;
        c.fillStyle = color;
        c.fillRect(x + Math.sin(i * 5 + t) * 9, y + 4 + phase * 14, 1, 1);
      }
    }
    c.restore();
  }
  if (conditions.slippery(rock) && conditions.modifiers.ice > .01) {
    c.save();
    c.globalAlpha = conditions.modifiers.ice * .7;
    c.strokeStyle = '#e1f1ef'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x - rock.w * .8, y + 3);
    c.lineTo(x - 3, y + 7); c.lineTo(x + rock.w * .7, y + 4);
    c.moveTo(x - 5, y + 5); c.lineTo(x - 7, y - 4);
    c.moveTo(x + 8, y + 4); c.lineTo(x + 9, y - 6);
    c.stroke();
    c.restore();
  }
}

export function drawDebris(world, conditions) {
  if (!conditions) return;
  const c = world.ctx;
  for (const stone of conditions.debris) {
    c.save();
    c.translate(stone.x, stone.y);
    if (stone.warning > 0) {
      // A trembling seam and trickling grit mark the origin, not a UI target.
      c.strokeStyle = '#e6c798'; c.globalAlpha = .5 + Math.sin(world.time * 22) * .2;
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-11, 5); c.lineTo(-3, 0); c.lineTo(3, 3); c.lineTo(12, -1); c.stroke();
      c.fillStyle = '#ddc8a3';
      for (let i = 0; i < 7; i++) c.fillRect(Math.sin(i * 12) * 7, -((world.time * 42 + i * 9) % 65), 1.3, 2);
    } else {
      c.globalAlpha = Math.min(1, stone.life);
      c.strokeStyle = '#c7b69a55'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, 8); c.lineTo(-stone.vx * .04, 24); c.stroke();
      c.rotate(stone.spin);
      const r = stone.radius;
      world.path([[-r, 0], [-r * .5, r], [r * .5, r * .7], [r, -r * .4], [0, -r]], '#666d62');
      world.path([[-r, 0], [-r * .5, r], [r * .5, r * .7], [0, 0]], '#b3ad96');
    }
    c.restore();
  }
}

export function drawAtmosphere(world, player, conditions) {
  if (!conditions) return;
  const c = world.ctx, m = conditions.modifiers, w = world.w, h = world.h;
  c.save();
  if (Math.abs(m.wind) > 10) {
    c.strokeStyle = '#edf0d8'; c.lineWidth = .7;
    c.globalAlpha = Math.abs(m.wind) / 900 * .2;
    for (let i = 0; i < 23; i++) {
      const x = ((i * 137 + world.airOffset * (1 + i % 3)) % (w + 200) + w + 200) % (w + 200) - 100;
      const y = (i * 97 + Math.sin(world.time + i) * 5) % h;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - m.wind * .035, y + 2); c.stroke();
    }
  }
  c.globalAlpha = 1;
  if (m.darkness > .001) {
    const point = world.screen(player.x, player.y + 18);
    const radius = 155 * world.scale;
    const glow = c.createRadialGradient(point.x, point.y, 28 * world.scale, point.x, point.y, radius * 1.7);
    glow.addColorStop(0, `rgba(16,24,38,${m.darkness * .06})`);
    glow.addColorStop(.46, `rgba(16,24,38,${m.darkness * .25})`);
    glow.addColorStop(.73, `rgba(12,20,33,${m.darkness * .86})`);
    glow.addColorStop(1, `rgba(10,17,29,${m.darkness * .97})`);
    c.fillStyle = glow; c.fillRect(0, 0, w, h);
  }
  c.restore();
}
