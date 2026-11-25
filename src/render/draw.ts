import { COLOR, font } from './theme.ts';

/**
 * How the 1920×1080 world maps onto the canvas. `lw` is the world-unit width
 * of one CSS pixel (at least 1), so hairlines stay visible in small windows.
 */
export interface View {
  scale: number;
  lw: number;
}

export interface TextOpts {
  size?: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  spacing?: number;
  alpha?: number;
}

export function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts = {}): void {
  ctx.save();
  ctx.font = font(o.size ?? 16, o.weight ?? 400);
  ctx.fillStyle = o.color ?? COLOR.text;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${o.spacing ?? 1}px`;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function measure(ctx: CanvasRenderingContext2D, str: string, size: number, weight = 400, spacing = 1): number {
  ctx.save();
  ctx.font = font(size, weight);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

/** Splits text into lines no wider than maxWidth. */
export function wrap(ctx: CanvasRenderingContext2D, str: string, maxWidth: number, size: number): string[] {
  const words = str.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(ctx, next, size) > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.stroke();
}

/** Corner brackets around a rectangle: the mission-control "selection" look. */
export function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  ctx.moveTo(x + w, y + h - len);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - len, y + h);
  ctx.moveTo(x + len, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - len);
  ctx.stroke();
}

/** A framed panel with a dark fill and corner brackets. */
export function panel(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, w: number, h: number, accent: string = COLOR.frame): void {
  ctx.save();
  ctx.fillStyle = COLOR.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(150, 195, 215, 0.16)';
  ctx.lineWidth = view.lw;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5 * view.lw;
  brackets(ctx, x - 3, y - 3, w + 6, h + 6, 14);
  ctx.restore();
}

/** mm:ss.t */
export function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${String(m).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}

export function pad3(n: number): string {
  return n.toFixed(1).padStart(5, '0');
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
