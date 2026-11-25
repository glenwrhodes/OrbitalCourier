import { DT, LAUNCH_CLEARANCE, TICK_RATE, TRAIL_EVERY, WORLD_HEIGHT, WORLD_WIDTH } from '../core/constants.ts';
import { ghostAt, type Ghost } from '../core/ghost.ts';
import type { Prediction } from '../core/predict.ts';
import type { Session } from '../core/sim.ts';
import { headingToDir } from '../core/vec.ts';
import { bodyX, bodyY, type World } from '../core/world.ts';
import { brackets, circle, clamp01, line, text, type View } from './draw.ts';
import { COLOR } from './theme.ts';

const HW = WORLD_WIDTH / 2;
const HH = WORLD_HEIGHT / 2;

export function drawGrid(ctx: CanvasRenderingContext2D, view: View): void {
  ctx.save();
  ctx.lineWidth = view.lw;
  for (const major of [false, true]) {
    ctx.strokeStyle = major ? COLOR.gridMajor : COLOR.grid;
    ctx.beginPath();
    for (let x = -HW; x <= HW; x += 60) {
      if ((x % 240 === 0) !== major) continue;
      ctx.moveTo(x, -HH);
      ctx.lineTo(x, HH);
    }
    for (let y = -HH; y <= HH; y += 60) {
      if ((y % 240 === 0) !== major) continue;
      ctx.moveTo(-HW, y);
      ctx.lineTo(HW, y);
    }
    ctx.stroke();
  }
  // Plotting-board frame with range ticks.
  const fx = HW - 16;
  const fy = HH - 16;
  ctx.strokeStyle = COLOR.frame;
  ctx.strokeRect(-fx, -fy, fx * 2, fy * 2);
  ctx.beginPath();
  for (let x = -HW + 60; x < HW; x += 60) {
    const len = x % 240 === 0 ? 10 : 5;
    ctx.moveTo(x, -fy);
    ctx.lineTo(x, -fy + len);
    ctx.moveTo(x, fy);
    ctx.lineTo(x, fy - len);
  }
  for (let y = -HH + 60; y < HH; y += 60) {
    const len = y % 240 === 0 ? 10 : 5;
    ctx.moveTo(-fx, y);
    ctx.lineTo(-fx + len, y);
    ctx.moveTo(fx, y);
    ctx.lineTo(fx - len, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawOrbits(ctx: CanvasRenderingContext2D, view: View, world: World, tick: number): void {
  const { sys } = world;
  ctx.save();
  ctx.lineWidth = view.lw;
  ctx.strokeStyle = COLOR.orbit;
  ctx.setLineDash([3, 7]);
  for (let i = 0; i < sys.count; i++) {
    if (sys.orbitR[i] === 0 || sys.defs[i].kind === 'rock') continue;
    const p = sys.parent[i];
    const cx = p >= 0 ? bodyX(world, tick, p) : sys.baseX[i];
    const cy = p >= 0 ? bodyY(world, tick, p) : sys.baseY[i];
    circle(ctx, cx, cy, sys.orbitR[i]);
  }
  ctx.restore();
}

function sciMu(mu: number): string {
  const [m, e] = mu.toExponential(1).toUpperCase().split('E');
  return `${m}E${Number(e)}`;
}

/** `aimAngle` (screen radians) is the launch direction while aiming, so the pickup label can keep clear of it. */
export function drawBodies(ctx: CanvasRenderingContext2D, view: View, world: World, tick: number, aimAngle: number | null = null): void {
  const { sys } = world;
  ctx.save();
  let beltLabel = -1;
  for (let i = 0; i < sys.count; i++) {
    const d = sys.defs[i];
    const x = bodyX(world, tick, i);
    const y = bodyY(world, tick, i);
    const r = sys.radius[i];
    if (d.kind === 'rock') {
      ctx.strokeStyle = COLOR.rock;
      ctx.lineWidth = view.lw;
      ctx.beginPath();
      for (let k = 0; k <= 7; k++) {
        const a = (k / 7) * Math.PI * 2 + i;
        const rr = r * (0.82 + 0.18 * Math.sin(i * 3.1 + k * 2.3));
        if (k === 0) ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
        else ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
      }
      ctx.stroke();
      if (beltLabel < 0 || x > bodyX(world, tick, beltLabel)) beltLabel = i;
      continue;
    }
    ctx.strokeStyle = COLOR.body;
    if (d.kind === 'planet') {
      ctx.lineWidth = 1.6 * view.lw;
      circle(ctx, x, y, r);
      ctx.lineWidth = view.lw;
      ctx.strokeStyle = COLOR.bodyDim;
      ctx.setLineDash([2, 5]);
      circle(ctx, x, y, r * 0.62);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.3 * view.lw;
      circle(ctx, x, y, r);
      ctx.fillStyle = COLOR.body;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    const role = i === world.pickup ? 'PICKUP' : i === world.target ? 'DROP' : d.kind === 'planet' ? `μ ${sciMu(d.mu)}` : 'MOON';
    const roleColor = i === world.pickup ? COLOR.amber : i === world.target ? COLOR.green : COLOR.labelDim;
    let angle = labelAngle(world, tick, i);
    if (i === world.pickup && aimAngle !== null) angle = awayFromAim(angle, aimAngle);
    drawLabel(ctx, view, x, y, labelReach(world, i), angle, d.name, role, roleColor);
  }
  if (beltLabel >= 0) {
    const bx = bodyX(world, tick, beltLabel);
    const by = bodyY(world, tick, beltLabel);
    drawLabel(ctx, view, bx, by, sys.radius[beltLabel], -Math.PI / 4, 'DEBRIS BELT', 'IMPASSABLE', COLOR.labelDim);
  }
  ctx.restore();
}

const LABEL_SPAN = 92;
const fixedLabelAngles = new WeakMap<World, Float64Array>();

/**
 * Direction a body's label leader points. Moons point away from what they
 * orbit, so they never sit on their planet. Everything else picks, once per
 * level, whichever diagonal has the most room around it at the start.
 */
function labelAngle(world: World, tick: number, i: number): number {
  const { sys } = world;
  if (sys.defs[i].kind === 'moon' && sys.orbitR[i] > 0) {
    const p = sys.parent[i];
    const cx = p >= 0 ? bodyX(world, tick, p) : sys.baseX[i];
    const cy = p >= 0 ? bodyY(world, tick, p) : sys.baseY[i];
    return Math.atan2(bodyY(world, tick, i) - cy, bodyX(world, tick, i) - cx);
  }
  let angles = fixedLabelAngles.get(world);
  if (!angles) {
    angles = new Float64Array(sys.count);
    for (let k = 0; k < sys.count; k++) angles[k] = bestDiagonal(world, k);
    fixedLabelAngles.set(world, angles);
  }
  return angles[i];
}

/** How far from a body's centre its label leader starts: clear of its moons, its delivery ring or its launch pad. */
function labelReach(world: World, i: number): number {
  const { sys } = world;
  if (i === world.pickup) return sys.radius[i] + 30;
  if (i === world.target) return world.deliveryRadius + 12;
  let reach = sys.radius[i];
  for (let j = 0; j < sys.count; j++) {
    if (sys.parent[j] === i) reach = Math.max(reach, sys.orbitR[j] + sys.radius[j] + 4);
  }
  return reach;
}

/** Turns a label away from the aim line if the two would overlap. */
function awayFromAim(angle: number, aim: number): number {
  const diff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  if (diff(angle, aim) > 1.2) return angle;
  for (const turn of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
    if (diff(angle + turn, aim) > 1.2) return angle + turn;
  }
  return angle;
}

function bestDiagonal(world: World, i: number): number {
  const { sys } = world;
  const x = bodyX(world, 0, i);
  const y = bodyY(world, 0, i);
  const r = labelReach(world, i);
  let best = -Math.PI / 4;
  let bestScore = -Infinity;
  for (const deg of [-45, -135, 45, 135]) {
    const a = (deg * Math.PI) / 180;
    const ca = Math.cos(a);
    const lx = x + ca * (r + 17) + Math.sign(ca) * (LABEL_SPAN / 2);
    const ly = y + Math.sin(a) * (r + 17);
    let score = deg === -45 ? 15 : 0;
    if (Math.abs(lx) > HW - LABEL_SPAN / 2 - 10 || Math.abs(ly) > HH - 60) score -= 1000;
    let clear = Infinity;
    for (let j = 0; j < sys.count; j++) {
      if (j === i) continue;
      const d = Math.hypot(bodyX(world, 0, j) - lx, bodyY(world, 0, j) - ly) - labelReach(world, j);
      clear = Math.min(clear, d);
    }
    score += Math.min(clear, 200);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function drawLabel(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, r: number, angle: number, name: string, role: string, roleColor: string): void {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const ax = x + ca * (r + 3);
  const ay = y + sa * (r + 3);
  const bx = x + ca * (r + 17);
  const by = y + sa * (r + 17);
  let sx = ca >= 0 ? 1 : -1;
  if (bx + sx * LABEL_SPAN > HW - 20) sx = -1;
  else if (bx + sx * LABEL_SPAN < -HW + 20) sx = 1;
  const flipX = sx < 0;
  const ex = bx + sx * LABEL_SPAN;
  ctx.save();
  ctx.strokeStyle = COLOR.labelDim;
  ctx.lineWidth = view.lw;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(ex, by);
  ctx.stroke();
  const align = flipX ? 'right' : 'left';
  const tx = bx + sx * 2;
  text(ctx, name, tx, by - 5, { size: 13, color: COLOR.label, align, spacing: 1.5 });
  text(ctx, role, tx, by + 14, { size: 11, color: roleColor, align, spacing: 1.5 });
  ctx.restore();
}

export function drawTargetRing(ctx: CanvasRenderingContext2D, view: View, world: World, tick: number, ts: number): void {
  const x = bodyX(world, tick, world.target);
  const y = bodyY(world, tick, world.target);
  const r = world.deliveryRadius;
  ctx.save();
  ctx.strokeStyle = COLOR.green;
  ctx.lineWidth = 1.4 * view.lw;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -ts * 0.012;
  circle(ctx, x, y, r);
  ctx.setLineDash([]);
  const pulse = 1 + 0.06 * Math.sin(ts * 0.004);
  const s = (r + 10) * pulse;
  ctx.strokeStyle = COLOR.greenDim;
  brackets(ctx, x - s, y - s, s * 2, s * 2, 9);
  ctx.restore();
}

/** Compass ring around the pickup moon while aiming. */
export function drawLaunchPad(ctx: CanvasRenderingContext2D, view: View, world: World): void {
  const x = bodyX(world, 0, world.pickup);
  const y = bodyY(world, 0, world.pickup);
  const r = world.sys.radius[world.pickup] + 24;
  ctx.save();
  ctx.strokeStyle = COLOR.amberDim;
  ctx.lineWidth = view.lw;
  circle(ctx, x, y, r);
  ctx.beginPath();
  for (let a = 0; a < 360; a += 30) {
    const d = headingToDir(a);
    const len = a % 90 === 0 ? 8 : 4;
    ctx.moveTo(x + d.x * r, y + d.y * r);
    ctx.lineTo(x + d.x * (r + len), y + d.y * (r + len));
  }
  ctx.stroke();
  ctx.restore();
}

export function drawAim(ctx: CanvasRenderingContext2D, view: View, s: Session): void {
  const w = s.world;
  const mx = bodyX(w, 0, w.pickup);
  const my = bodyY(w, 0, w.pickup);
  const d = headingToDir(s.heading);
  const r0 = w.sys.radius[w.pickup] + LAUNCH_CLEARANCE;
  const ex = mx + d.x * (r0 + s.power);
  const ey = my + d.y * (r0 + s.power);
  ctx.save();
  ctx.strokeStyle = COLOR.amber;
  ctx.lineWidth = 1.2 * view.lw;
  line(ctx, s.ship.x, s.ship.y, ex, ey);
  // Δv scale ticks every 25.
  ctx.beginPath();
  for (let p = 25; p < s.power; p += 25) {
    const tx = mx + d.x * (r0 + p);
    const ty = my + d.y * (r0 + p);
    const len = p % 100 === 0 ? 6 : 3;
    ctx.moveTo(tx - d.y * len, ty + d.x * len);
    ctx.lineTo(tx + d.y * len, ty - d.x * len);
  }
  ctx.stroke();
  // Reticle.
  circle(ctx, ex, ey, 8);
  ctx.beginPath();
  ctx.moveTo(ex - 14, ey);
  ctx.lineTo(ex - 4, ey);
  ctx.moveTo(ex + 4, ey);
  ctx.lineTo(ex + 14, ey);
  ctx.moveTo(ex, ey - 14);
  ctx.lineTo(ex, ey - 4);
  ctx.moveTo(ex, ey + 4);
  ctx.lineTo(ex, ey + 14);
  ctx.stroke();
  const right = d.x >= -0.3;
  const lx = ex + (right ? 20 : -20);
  const align = right ? 'left' : 'right';
  text(ctx, `HDG ${s.heading.toFixed(1).padStart(5, '0')}°`, lx, ey - 4, { size: 13, color: COLOR.amber, align });
  text(ctx, `ΔV  ${s.power.toFixed(1)}`, lx, ey + 13, { size: 13, color: COLOR.amber, align });
  ctx.restore();
}

export function drawTrail(ctx: CanvasRenderingContext2D, view: View, trail: number[]): void {
  if (trail.length < 4) return;
  ctx.save();
  ctx.strokeStyle = COLOR.cyan;
  ctx.lineWidth = 1.6 * view.lw;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(trail[0], trail[1]);
  for (let i = 2; i < trail.length; i += 2) ctx.lineTo(trail[i], trail[i + 1]);
  ctx.stroke();
  ctx.restore();
}

export function drawPreview(ctx: CanvasRenderingContext2D, view: View, world: World, pred: Prediction, ts: number): void {
  const pts = pred.points;
  if (pts.length < 4) return;
  ctx.save();
  ctx.lineWidth = 1.2 * view.lw;
  ctx.strokeStyle = COLOR.cyanDim;
  ctx.setLineDash([8, 7]);
  ctx.lineDashOffset = -ts * 0.03;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
  ctx.setLineDash([]);

  // One tick per second of flight, a label every five.
  const perSecond = TICK_RATE / TRAIL_EVERY;
  ctx.strokeStyle = COLOR.cyanDim;
  for (let k = perSecond, sec = 1; 2 * k + 3 < pts.length; k += perSecond, sec++) {
    const x = pts[2 * k];
    const y = pts[2 * k + 1];
    const dx = pts[2 * k + 2] - pts[2 * k - 2];
    const dy = pts[2 * k + 3] - pts[2 * k - 1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const len = sec % 5 === 0 ? 7 : 4;
    line(ctx, x - nx * len, y - ny * len, x + nx * len, y + ny * len);
    if (sec % 5 === 0) text(ctx, `+${sec}s`, x + nx * 12, y + ny * 12 + 4, { size: 11, color: COLOR.cyanDim, align: 'center' });
  }

  // Closest pass to the target, once the path is known to miss it (not when
  // the preview simply ends while still closing in).
  const c = pred.closest;
  const passed = pred.end !== 'horizon' || c.ticks < pred.endTicks - TICK_RATE / 4;
  if (pred.end !== 'delivered' && passed && c.ticks > 0 && c.dist < 450) {
    ctx.strokeStyle = COLOR.greenDim;
    ctx.lineWidth = view.lw;
    ctx.setLineDash([2, 4]);
    circle(ctx, c.targetX, c.targetY, world.deliveryRadius);
    line(ctx, c.x, c.y, c.targetX, c.targetY);
    ctx.setLineDash([]);
    const miss = Math.max(0, c.dist - world.deliveryRadius);
    text(ctx, `MISS ${miss.toFixed(0)}`, (c.x + c.targetX) / 2 + 8, (c.y + c.targetY) / 2 - 6, { size: 11, color: COLOR.green });
  }

  // How the prediction ends.
  const ex = pts[pts.length - 2];
  const ey = pts[pts.length - 1];
  const tLabel = `T+${(pred.endTicks * DT).toFixed(1)}`;
  if (pred.end === 'impact') {
    ctx.strokeStyle = COLOR.red;
    ctx.lineWidth = 1.6 * view.lw;
    line(ctx, ex - 8, ey - 8, ex + 8, ey + 8);
    line(ctx, ex - 8, ey + 8, ex + 8, ey - 8);
    text(ctx, `IMPACT ${tLabel}`, ex + 14, ey - 10, { size: 12, color: COLOR.red });
  } else if (pred.end === 'delivered') {
    ctx.strokeStyle = COLOR.green;
    ctx.lineWidth = 1.6 * view.lw;
    circle(ctx, ex, ey, 7);
    text(ctx, `INTERCEPT ${tLabel}`, ex + 14, ey - 10, { size: 12, color: COLOR.green });
  } else if (pred.end === 'out-of-bounds') {
    const cx = Math.max(-HW + 60, Math.min(HW - 60, ex));
    const cy = Math.max(-HH + 40, Math.min(HH - 40, ey));
    text(ctx, `SIGNAL LOSS ${tLabel}`, cx, cy, { size: 12, color: COLOR.amber, align: cx > 0 ? 'right' : 'left' });
  } else if (pred.end === 'timeout') {
    text(ctx, `WINDOW CLOSES ${tLabel}`, ex + 12, ey - 10, { size: 12, color: COLOR.amber });
  } else {
    ctx.strokeStyle = COLOR.cyanDim;
    circle(ctx, ex, ey, 3);
  }
  ctx.restore();
}

/** The best run: its whole path, faint and dotted, and a ghost ship at the same moment of its flight. */
export function drawGhost(ctx: CanvasRenderingContext2D, view: View, ghost: Ghost, tick: number): void {
  const pts = ghost.points;
  ctx.save();
  ctx.lineWidth = view.lw;
  ctx.strokeStyle = COLOR.ghostPath;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
  ctx.setLineDash([]);

  const pose = ghostAt(ghost, tick);
  ctx.globalAlpha = pose.finished ? 0.45 : 1;
  ctx.strokeStyle = COLOR.ghost;
  if (pose.finished) circle(ctx, pose.x, pose.y, 7);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.lineWidth = 1.2 * view.lw;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -6);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  text(ctx, 'BEST', pose.x + 12, pose.y - 10, { size: 10, color: COLOR.ghost, spacing: 2 });
  ctx.restore();
}

export function drawShip(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, angle: number, thrust: -1 | 0 | 1, ts: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (thrust !== 0) {
    const flicker = 0.75 + 0.25 * Math.sin(ts * 0.09) * Math.sin(ts * 0.031);
    ctx.strokeStyle = COLOR.amber;
    ctx.lineWidth = 1.6 * view.lw;
    ctx.beginPath();
    if (thrust === 1) {
      ctx.moveTo(-6, -3);
      ctx.lineTo(-6 - 16 * flicker, 0);
      ctx.lineTo(-6, 3);
    } else {
      ctx.moveTo(11, -3);
      ctx.lineTo(11 + 12 * flicker, 0);
      ctx.lineTo(11, 3);
    }
    ctx.stroke();
  }
  ctx.fillStyle = COLOR.bg;
  ctx.strokeStyle = COLOR.cyan;
  ctx.lineWidth = 1.6 * view.lw;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-7, -7);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawImpact(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, age: number): void {
  if (age < 0) return;
  ctx.save();
  ctx.lineWidth = 1.4 * view.lw;
  for (let k = 0; k < 3; k++) {
    const a = age - k * 140;
    if (a < 0) continue;
    const u = clamp01(a / 1100);
    ctx.globalAlpha = 1 - u;
    ctx.strokeStyle = COLOR.red;
    circle(ctx, x, y, 6 + u * 70);
  }
  const u = clamp01(age / 900);
  ctx.globalAlpha = 1 - u;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = k * 2.513 + 0.4;
    const r0 = 8 + u * 30;
    const r1 = r0 + 6 + (k % 3) * 4;
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawDelivery(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, age: number): void {
  if (age < 0) return;
  ctx.save();
  ctx.lineWidth = 1.4 * view.lw;
  ctx.strokeStyle = COLOR.green;
  for (let k = 0; k < 3; k++) {
    const a = age - k * 220;
    if (a < 0) continue;
    const u = clamp01(a / 1400);
    ctx.globalAlpha = 1 - u;
    circle(ctx, x, y, 10 + u * 110);
  }
  ctx.restore();
}
