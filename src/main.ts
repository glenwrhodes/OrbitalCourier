// Browser entry point: canvas sizing, input, and the requestAnimationFrame loop.
//
// URL options:
//   ?level=N                 open straight into level N (1-10)
//   ?level=N&demo=solution   play level N's stored solution (for recording)
//   &speed=2                 demo playback speed (default 1)
//
// All animation and simulation timing comes from the rAF timestamp, so a
// recording on a fake clock looks the same at any frame rate. In demo mode,
// window.orbitalCourier.demo and <html data-demo="..."> report progress:
// intro → aiming → flying → ended → done.
import { WORLD_HEIGHT, WORLD_WIDTH } from './core/constants.ts';
import { LEVELS } from './core/levels.ts';
import type { Outcome } from './core/sim.ts';
import { COLOR } from './render/theme.ts';
import { drawGame } from './render/frame.ts';
import type { View } from './render/draw.ts';
import type { DemoState } from './ui/demo.ts';
import { createGame, updateGame, type GameOptions } from './ui/game.ts';
import { InputCollector } from './ui/input.ts';

declare global {
  interface Window {
    orbitalCourier?: { demo: DemoState | null; outcome: Outcome | null };
  }
}

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const params = new URLSearchParams(location.search);
const levelParam = Number(params.get('level'));
const demo = params.get('demo') === 'solution';
const options: GameOptions = {};
if (Number.isInteger(levelParam) && levelParam >= 1 && levelParam <= LEVELS.length) options.startLevel = levelParam - 1;
if (demo) {
  options.startLevel ??= 0;
  const speed = Number(params.get('speed') ?? 1);
  options.demo = { speed: Number.isFinite(speed) && speed > 0 ? speed : 1 };
  window.orbitalCourier = { demo: null, outcome: null };
  options.onDemoState = (state, outcome) => {
    window.orbitalCourier = { demo: state, outcome };
    document.documentElement.dataset.demo = state;
  };
  canvas.style.cursor = 'none';
}

const game = createGame(options);
const input = new InputCollector();
if (!demo) input.attach(canvas);

let scale = 1;
let cssW = 0;
let cssH = 0;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  cssW = canvas.clientWidth;
  cssH = canvas.clientHeight;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  scale = Math.min(cssW / WORLD_WIDTH, cssH / WORLD_HEIGHT);
}

function toWorld(clientX: number, clientY: number): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: (clientX - r.left - cssW / 2) / scale, y: (clientY - r.top - cssH / 2) / scale };
}

function frame(ts: number): void {
  resize();
  updateGame(game, ts, input.take(toWorld));

  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (cssW / 2) * dpr, (cssH / 2) * dpr);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.clip();
  const view: View = { scale, lw: Math.max(1, 1 / scale) };
  drawGame(ctx, view, game, ts);
  ctx.restore();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
