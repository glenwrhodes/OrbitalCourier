import type { Game } from '../ui/game.ts';
import type { View } from './draw.ts';
import { drawHud, drawLevelCard, drawResults, drawTitle } from './hud.ts';
import { drawAim, drawBodies, drawDelivery, drawGrid, drawImpact, drawLaunchPad, drawOrbits, drawPreview, drawShip, drawTargetRing, drawTrail } from './scene.ts';
import { headingToDir } from '../core/vec.ts';
import { totalStars } from '../core/progress.ts';
import { drawSelect } from './select.ts';

/** Draws one frame. The context must already map world space (origin at centre) onto the canvas. */
export function drawGame(ctx: CanvasRenderingContext2D, view: View, game: Game, ts: number): void {
  drawGrid(ctx, view);
  if (game.screen === 'select') {
    drawSelect(ctx, view, game, ts);
    return;
  }
  if (game.screen === 'title' || !game.play) {
    drawTitle(ctx, view, ts, totalStars(game.progress));
    return;
  }
  const play = game.play;
  const s = play.session;
  const w = s.world;
  const tick = s.phase === 'aiming' ? 0 : s.tick;

  const aim = headingToDir(s.heading);
  const aimAngle = Math.atan2(aim.y, aim.x);
  drawOrbits(ctx, view, w, tick);
  drawTargetRing(ctx, view, w, tick, ts);
  drawBodies(ctx, view, w, tick, s.phase === 'aiming' ? aimAngle : null);

  if (s.phase === 'aiming') {
    drawLaunchPad(ctx, view, w);
    if (play.preview) drawPreview(ctx, view, w, play.preview, ts);
    drawAim(ctx, view, s);
    drawShip(ctx, view, s.ship.x, s.ship.y, aimAngle, 0, ts);
  } else {
    drawTrail(ctx, view, s.trail);
    if (play.preview) drawPreview(ctx, view, w, play.preview, ts);
    const o = s.outcome;
    const age = play.endTs === null ? 0 : ts - play.endTs;
    if (o?.reason === 'impact') {
      drawImpact(ctx, view, o.x, o.y, age);
    } else {
      drawShip(ctx, view, s.ship.x, s.ship.y, Math.atan2(s.ship.vy, s.ship.vx), s.thrust, ts);
      if (o?.reason === 'delivered') drawDelivery(ctx, view, o.x, o.y, age);
    }
  }

  drawHud(ctx, view, play, ts);
  drawLevelCard(ctx, play, ts);
  drawResults(ctx, view, play, ts);
}
