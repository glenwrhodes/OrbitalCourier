// Minimal PNG plotter for the level design script (no dependencies).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type RGB = [number, number, number];

export class Plot {
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  readonly px: Float32Array;

  constructor(w: number, h: number, scale: number) {
    this.w = w;
    this.h = h;
    this.scale = scale;
    this.px = new Float32Array(w * h * 3);
  }

  /** World → pixel. World origin is the image centre. */
  sx(x: number): number {
    return this.w / 2 + x * this.scale;
  }
  sy(y: number): number {
    return this.h / 2 + y * this.scale;
  }

  dot(x: number, y: number, c: RGB, a: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const o = (iy * this.w + ix) * 3;
    for (let k = 0; k < 3; k++) this.px[o + k] = this.px[o + k] * (1 - a) + c[k] * a;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
    const ax = this.sx(x0);
    const ay = this.sy(y0);
    const bx = this.sx(x1);
    const by = this.sy(y1);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let i = 0; i <= n; i++) this.dot(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, c, a);
  }

  path(points: number[], c: RGB, a = 1): void {
    for (let i = 2; i < points.length; i += 2) this.line(points[i - 2], points[i - 1], points[i], points[i + 1], c, a);
  }

  circle(x: number, y: number, r: number, c: RGB, a = 1, dashed = false): void {
    const n = Math.max(24, Math.ceil(r * this.scale * 0.8));
    for (let i = 0; i < n; i++) {
      if (dashed && i % 2) continue;
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      this.line(x + r * Math.cos(a0), y + r * Math.sin(a0), x + r * Math.cos(a1), y + r * Math.sin(a1), c, a);
    }
  }

  frame(halfW: number, halfH: number, c: RGB, a = 1): void {
    this.line(-halfW, -halfH, halfW, -halfH, c, a);
    this.line(halfW, -halfH, halfW, halfH, c, a);
    this.line(halfW, halfH, -halfW, halfH, c, a);
    this.line(-halfW, halfH, -halfW, -halfH, c, a);
  }

  save(file: string): void {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      for (let x = 0; x < this.w * 3; x++) raw[y * (this.w * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(this.px[y * this.w * 3 + x])));
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
  }
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
