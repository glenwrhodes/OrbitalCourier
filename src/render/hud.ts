import { DT, WORLD_HEIGHT, WORLD_WIDTH } from '../core/constants.ts';
import { LEVELS } from '../core/levels.ts';
import { flightSeconds, fuelUsed, type Session } from '../core/sim.ts';
import { bodyX, bodyY } from '../core/world.ts';
import type { Play } from '../ui/game.ts';
import { clamp01, clock, line, panel, text, wrap, type View } from './draw.ts';
import { FLIGHT_PLAN, TELEMETRY } from './layout.ts';
import { COLOR } from './theme.ts';

const HW = WORLD_WIDTH / 2;
const HH = WORLD_HEIGHT / 2;

export const COPYRIGHT = '© 2026 Tiny Moosh Games Inc.';

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** Telemetry panel, flight plan, status line and key hints. */
export function drawHud(ctx: CanvasRenderingContext2D, view: View, play: Play, ts: number): void {
  const s = play.session;
  const level = s.level;
  const w = s.world;

  // Telemetry, top left.
  const px = TELEMETRY.x;
  const py = TELEMETRY.y;
  const pw = TELEMETRY.w;
  panel(ctx, view, px, py, pw, TELEMETRY.h);
  text(ctx, 'ORBITAL COURIER', px + 20, py + 26, { size: 12, color: COLOR.textDim, spacing: 3 });
  text(ctx, `FLT ${two(level.id)}/${LEVELS.length}`, px + pw - 20, py + 26, { size: 12, color: COLOR.textDim, align: 'right', spacing: 2 });
  text(ctx, level.name, px + 20, py + 56, { size: 22, color: COLOR.cyan, weight: 500, spacing: 2 });
  ctx.save();
  ctx.strokeStyle = 'rgba(150, 195, 215, 0.25)';
  ctx.lineWidth = view.lw;
  line(ctx, px + 20, py + 70, px + pw - 20, py + 70);
  ctx.restore();

  const flying = s.phase !== 'aiming';
  const tick = flying ? s.tick : 0;
  const speed = flying ? Math.hypot(s.ship.vx, s.ship.vy) : 0;
  const tx = bodyX(w, tick, w.target);
  const ty = bodyY(w, tick, w.target);
  const range = Math.max(0, Math.hypot(s.ship.x - tx, s.ship.y - ty) - w.deliveryRadius);
  const left = level.timeLimit - tick * DT;
  const rows: [string, string, string?][] = [
    ['MET', `T+${clock(flightSeconds(s))}`],
    ['VELOCITY', flying ? speed.toFixed(1) : '---.-'],
    ['TARGET', w.sys.defs[w.target].name],
    ['RANGE', range.toFixed(0)],
    ['WINDOW', clock(left), left < 5 ? COLOR.amber : undefined],
  ];
  let y = py + 96;
  for (const [label, value, color] of rows) {
    text(ctx, label, px + 20, y, { size: 12, color: COLOR.textDim, spacing: 2 });
    text(ctx, value, px + pw - 20, y, { size: 15, color: color ?? COLOR.text, align: 'right' });
    y += 24;
  }

  // Δv: fuel left as a bar.
  const fuel = s.phase === 'aiming' ? level.fuel - s.power : s.fuel;
  const frac = clamp01(fuel / level.fuel);
  const low = frac < 0.2;
  text(ctx, 'ΔV REMAINING', px + 20, y + 4, { size: 12, color: COLOR.textDim, spacing: 2 });
  text(ctx, `${fuel.toFixed(1)} / ${level.fuel}`, px + pw - 20, y + 4, { size: 15, color: low ? COLOR.amber : COLOR.text, align: 'right' });
  const bx = px + 20;
  const by = y + 14;
  const bw = pw - 40;
  ctx.save();
  ctx.strokeStyle = 'rgba(150, 195, 215, 0.35)';
  ctx.lineWidth = view.lw;
  ctx.strokeRect(bx, by, bw, 8);
  ctx.fillStyle = low ? COLOR.amber : COLOR.cyan;
  ctx.fillRect(bx + 2, by + 2, (bw - 4) * frac, 4);
  if (s.phase === 'aiming') {
    // Show what the launch will cost.
    ctx.fillStyle = COLOR.amberDim;
    ctx.fillRect(bx + 2 + (bw - 4) * frac, by + 2, (bw - 4) * clamp01(s.power / level.fuel), 4);
  }
  ctx.restore();

  // Flight plan, top right.
  const fw = FLIGHT_PLAN.w;
  const fx = FLIGHT_PLAN.x;
  const lines = wrap(ctx, level.brief, fw - 40, 15).slice(0, 3);
  panel(ctx, view, fx, FLIGHT_PLAN.y, fw, Math.min(FLIGHT_PLAN.h, 50 + lines.length * 21));
  text(ctx, 'FLIGHT PLAN', fx + 20, py + 26, { size: 12, color: COLOR.textDim, spacing: 3 });
  lines.forEach((l, i) => text(ctx, l, fx + 20, py + 52 + i * 21, { size: 15, color: COLOR.text, spacing: 0.5 }));

  // Status line, bottom centre.
  const [status, statusColor] = statusText(s, play);
  const caret = Math.floor(ts / 530) % 2 === 0 ? '_' : ' ';
  text(ctx, `▸ ${status}${caret}`, 0, HH - 46, { size: 15, color: statusColor, align: 'center', spacing: 2 });

  // Key hints, bottom left; warp, bottom right.
  const hints =
    s.phase === 'aiming'
      ? 'DRAG FROM SHIP: AIM · RELEASE: LAUNCH · ←→↑↓ FINE (SHIFT FINER) · SPACE: LAUNCH'
      : s.phase === 'flying'
        ? 'W/↑ PROGRADE · S/↓ RETROGRADE · 1-3 WARP · P PAUSE · R RESTART · ESC TITLE'
        : 'R RESTART · ESC TITLE';
  text(ctx, hints, -HW + 28, HH - 24, { size: 11, color: COLOR.textDim, spacing: 1.5 });
  if (s.phase === 'flying' && (play.warp > 1 || play.paused)) {
    text(ctx, play.paused ? 'PAUSED' : `WARP ${play.warp}×`, HW - 28, HH - 24, { size: 13, color: COLOR.amber, align: 'right', spacing: 2 });
  }
}

function statusText(s: Session, play: Play): [string, string] {
  if (s.phase === 'aiming') return ['AIMING · SET LAUNCH VECTOR', COLOR.amber];
  if (s.phase === 'flying') {
    if (play.paused) return ['PAUSED', COLOR.amber];
    if (s.thrust === 1) return ['BURN · PROGRADE', COLOR.amber];
    if (s.thrust === -1) return ['BURN · RETROGRADE', COLOR.amber];
    if (s.fuel <= 0) return ['COASTING · ΔV EXHAUSTED', COLOR.amber];
    return ['COASTING', COLOR.cyan];
  }
  const o = s.outcome!;
  if (o.reason === 'delivered') return ['PARCEL DELIVERED', COLOR.green];
  if (o.reason === 'impact') return [`IMPACT · ${bodyName(s, o.bodyId)}`, COLOR.red];
  if (o.reason === 'out-of-bounds') return ['SIGNAL LOST', COLOR.amber];
  return ['DELIVERY WINDOW CLOSED', COLOR.amber];
}

function bodyName(s: Session, id: string | null): string {
  if (!id) return '';
  return s.level.bodies.find((b) => b.id === id)?.name ?? id.toUpperCase();
}

/** Big level title shown for the first moments of a level. */
export function drawLevelCard(ctx: CanvasRenderingContext2D, play: Play, ts: number): void {
  const age = ts - play.startTs;
  if (age > 2800) return;
  const a = age < 300 ? age / 300 : age > 2200 ? 1 - (age - 2200) / 600 : 1;
  const level = play.session.level;
  ctx.save();
  ctx.globalAlpha = clamp01(a);
  text(ctx, `FLIGHT ${two(level.id)}`, 0, -HH + 92, { size: 14, color: COLOR.textDim, align: 'center', spacing: 6 });
  text(ctx, level.name, 0, -HH + 140, { size: 42, weight: 300, color: COLOR.text, align: 'center', spacing: 10 });
  ctx.restore();
}

export function drawResults(ctx: CanvasRenderingContext2D, view: View, play: Play, ts: number): void {
  const s = play.session;
  if (s.phase !== 'ended' || play.endTs === null) return;
  const a = clamp01((ts - play.endTs - 700) / 400);
  if (a <= 0) return;
  const o = s.outcome!;
  const level = s.level;
  const delivered = o.reason === 'delivered';
  const [title, color] =
    o.reason === 'delivered'
      ? ['PARCEL DELIVERED', COLOR.green]
      : o.reason === 'impact'
        ? [`IMPACT · ${bodyName(s, o.bodyId)}`, COLOR.red]
        : o.reason === 'out-of-bounds'
          ? ['SIGNAL LOST', COLOR.amber]
          : ['DELIVERY WINDOW CLOSED', COLOR.amber];

  const w = 620;
  const h = 300;
  const x = -w / 2;
  const y = -h / 2 + 10 + (1 - a) * 12;
  ctx.save();
  ctx.globalAlpha = a;
  panel(ctx, view, x, y, w, h, color);
  text(ctx, `FLIGHT ${two(level.id)} · ${level.name}`, 0, y + 38, { size: 13, color: COLOR.textDim, align: 'center', spacing: 3 });
  text(ctx, title, 0, y + 84, { size: 34, weight: 300, color, align: 'center', spacing: 6 });

  const rows: [string, string][] = [
    ['FLIGHT TIME', clock(flightSeconds(s))],
    ['LAUNCH ΔV', s.launchDv.toFixed(1)],
    ['BURN ΔV', s.burnDv.toFixed(1)],
    ['ΔV USED', `${fuelUsed(s).toFixed(1)} / ${level.fuel}`],
  ];
  let ry = y + 128;
  for (const [label, value] of rows) {
    text(ctx, label, x + 150, ry, { size: 12, color: COLOR.textDim, spacing: 2 });
    text(ctx, value, x + w - 150, ry, { size: 15, color: COLOR.text, align: 'right' });
    ry += 26;
  }
  const last = play.levelIndex + 1 >= LEVELS.length;
  const hint = delivered
    ? last
      ? 'ENTER: TITLE · R: FLY AGAIN'
      : 'ENTER: NEXT FLIGHT · R: FLY AGAIN · ESC: TITLE'
    : 'ENTER / R: RETRY · ESC: TITLE';
  text(ctx, hint, 0, y + h - 26, { size: 12, color: COLOR.textDim, align: 'center', spacing: 2 });
  if (delivered && last) text(ctx, 'ALL TEN PARCELS DELIVERED', 0, y + h - 52, { size: 13, color: COLOR.green, align: 'center', spacing: 3 });
  ctx.restore();
}

export function drawTitle(ctx: CanvasRenderingContext2D, view: View, ts: number): void {
  // A small animated orrery behind the title.
  const cx = 0;
  const cy = 90;
  ctx.save();
  ctx.lineWidth = view.lw;
  ctx.strokeStyle = COLOR.body;
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = COLOR.orbit;
  ctx.setLineDash([3, 7]);
  for (const r of [130, 210]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const a1 = ts * 0.0006;
  const a2 = -ts * 0.00035 + 2;
  ctx.strokeStyle = COLOR.body;
  for (const [r, a, size] of [[130, a1, 10], [210, a2, 13]] as const) {
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, size, 0, Math.PI * 2);
    ctx.stroke();
  }
  // A courier on a long ellipse, trailing its path.
  ctx.strokeStyle = COLOR.cyanDim;
  ctx.setLineDash([8, 7]);
  ctx.lineDashOffset = -ts * 0.03;
  ctx.beginPath();
  ctx.ellipse(cx + 60, cy, 330, 150, -0.25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const e = ts * 0.0009;
  const ex = cx + 60 + Math.cos(e) * 330 * Math.cos(-0.25) - Math.sin(e) * 150 * Math.sin(-0.25);
  const ey = cy + Math.cos(e) * 330 * Math.sin(-0.25) + Math.sin(e) * 150 * Math.cos(-0.25);
  ctx.fillStyle = COLOR.cyan;
  ctx.fillRect(ex - 2.5, ey - 2.5, 5, 5);
  ctx.restore();

  text(ctx, 'ORBITAL COURIER', 0, -250, { size: 92, weight: 300, color: COLOR.text, align: 'center', spacing: 16 });
  text(ctx, 'INTERPLANETARY PARCEL SERVICE · FLIGHT DIRECTOR CONSOLE', 0, -196, { size: 16, color: COLOR.cyan, align: 'center', spacing: 5 });
  text(ctx, 'Deliver parcels between moons. Slingshot around planets. Mind the fuel.', 0, -152, { size: 15, color: COLOR.textDim, align: 'center', spacing: 1 });
  const blink = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(ts * 0.004));
  text(ctx, 'PRESS ENTER TO BEGIN', 0, 380, { size: 18, color: COLOR.amber, align: 'center', spacing: 6, alpha: blink });
  text(ctx, `${LEVELS.length} FLIGHTS · N-BODY GRAVITY · LIVE TRAJECTORY PREVIEW`, 0, 420, { size: 12, color: COLOR.textDim, align: 'center', spacing: 3 });
  text(ctx, COPYRIGHT, 0, HH - 30, { size: 12, color: COLOR.textDim, align: 'center', spacing: 1 });
}
