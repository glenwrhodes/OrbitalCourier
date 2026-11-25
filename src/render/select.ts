import { compileSystem, positionsAt } from '../core/bodies.ts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../core/constants.ts';
import type { Level } from '../core/level.ts';
import { LEVELS } from '../core/levels.ts';
import { isUnlocked, totalStars } from '../core/progress.ts';
import type { Game } from '../ui/game.ts';
import { brackets, circle, clock, panel, starRow, text, type View } from './draw.ts';
import { COPYRIGHT } from './hud.ts';
import { selectCardRect } from './layout.ts';
import { COLOR } from './theme.ts';

const HH = WORLD_HEIGHT / 2;

export function drawSelect(ctx: CanvasRenderingContext2D, view: View, game: Game, ts: number): void {
  const progress = game.progress;
  text(ctx, 'SELECT FLIGHT', 0, -420, { size: 34, weight: 300, color: COLOR.text, align: 'center', spacing: 10 });
  text(ctx, `★ ${totalStars(progress)} / ${LEVELS.length * 3} STARS`, 0, -380, { size: 13, color: COLOR.amber, align: 'center', spacing: 4 });

  LEVELS.forEach((level, i) => {
    const r = selectCardRect(i);
    const unlocked = isUnlocked(progress, LEVELS, i);
    const selected = i === game.select.index;
    const record = progress.levels[String(level.id)];
    panel(ctx, view, r.x, r.y, r.w, r.h, selected ? COLOR.cyan : 'rgba(150, 195, 215, 0.3)');
    if (selected) {
      const grow = 4 + 2 * Math.sin(ts * 0.006);
      ctx.save();
      ctx.strokeStyle = COLOR.cyanDim;
      ctx.lineWidth = view.lw;
      brackets(ctx, r.x - 3 - grow, r.y - 3 - grow, r.w + 6 + grow * 2, r.h + 6 + grow * 2, 18);
      ctx.restore();
    }

    text(ctx, `FLIGHT ${String(level.id).padStart(2, '0')}`, r.x + 18, r.y + 28, { size: 12, color: COLOR.textDim, spacing: 3 });
    if (unlocked) starRow(ctx, view, r.x + r.w - 52, r.y + 23, 8, record?.stars ?? 0, 20);
    text(ctx, level.name, r.x + 18, r.y + 56, { size: 19, color: !unlocked ? COLOR.textDim : selected ? COLOR.cyan : COLOR.text, spacing: 2 });

    drawMiniMap(ctx, view, level, r.x + 18, r.y + 72, r.w - 36, 160, unlocked);

    const foot = record
      ? `BEST ΔV ${record.fuel.toFixed(1)} · ${clock(record.time)}`
      : unlocked
        ? 'NOT YET FLOWN'
        : `LOCKED · DELIVER FLIGHT ${String(level.id - 1).padStart(2, '0')}`;
    text(ctx, foot, r.x + 18, r.y + r.h - 22, { size: 12, color: record ? COLOR.text : COLOR.textDim, spacing: 1.5 });
  });

  text(ctx, '←→↑↓ SELECT · ENTER: FLY · ESC: TITLE', 0, 420, { size: 12, color: COLOR.textDim, align: 'center', spacing: 3 });
  text(ctx, COPYRIGHT, 0, HH - 30, { size: 12, color: COLOR.textDim, align: 'center', spacing: 1 });
}

const startPositions = new Map<number, { pos: Float64Array; pickup: number; target: number }>();

function layoutOf(level: Level) {
  let l = startPositions.get(level.id);
  if (!l) {
    const sys = compileSystem(level.bodies);
    const pos = new Float64Array(2 * sys.count);
    positionsAt(sys, 0, pos);
    l = { pos, pickup: sys.index.get(level.pickup)!, target: sys.index.get(level.target)! };
    startPositions.set(level.id, l);
  }
  return l;
}

/** The level at t = 0, scaled into a box. */
function drawMiniMap(ctx: CanvasRenderingContext2D, view: View, level: Level, x: number, y: number, w: number, h: number, unlocked: boolean): void {
  const s = Math.min(w / WORLD_WIDTH, h / WORLD_HEIGHT);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const { pos, pickup, target } = layoutOf(level);
  ctx.save();
  ctx.strokeStyle = 'rgba(150, 195, 215, 0.14)';
  ctx.lineWidth = view.lw;
  ctx.strokeRect(cx - (WORLD_WIDTH * s) / 2, cy - (WORLD_HEIGHT * s) / 2, WORLD_WIDTH * s, WORLD_HEIGHT * s);
  ctx.globalAlpha = unlocked ? 1 : 0.35;
  level.bodies.forEach((b, i) => {
    const bx = cx + pos[2 * i] * s;
    const by = cy + pos[2 * i + 1] * s;
    ctx.strokeStyle = i === pickup ? COLOR.amber : i === target ? COLOR.green : b.kind === 'rock' ? COLOR.rock : COLOR.body;
    circle(ctx, bx, by, Math.max(1.5, b.radius * s));
    if (i === target) {
      ctx.setLineDash([2, 2]);
      circle(ctx, bx, by, level.deliveryRadius * s);
      ctx.setLineDash([]);
    }
  });
  ctx.restore();
  if (!unlocked) drawLock(ctx, view, cx, cy);
}

function drawLock(ctx: CanvasRenderingContext2D, view: View, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = COLOR.text;
  ctx.lineWidth = 1.6 * view.lw;
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(x - 15, y - 4, 30, 22);
  ctx.strokeRect(x - 15, y - 4, 30, 22);
  ctx.beginPath();
  ctx.arc(x, y - 4, 9, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = COLOR.text;
  ctx.fillRect(x - 1.5, y + 3, 3, 7);
  ctx.restore();
}
