import type { InputFrame } from './game.ts';

/** Collects DOM keyboard and pointer events between frames. */
export class InputCollector {
  private readonly held = new Set<string>();
  private presses: string[] = [];
  private shift = false;
  private px = 0;
  private py = 0;
  private pressX = 0;
  private pressY = 0;
  private down = false;
  private pressed = false;
  private released = false;

  attach(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.held.add(e.code);
      this.presses.push(e.code);
      this.shift = e.shiftKey;
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.shift = e.shiftKey;
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.down = false;
    });
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.px = e.clientX;
      this.py = e.clientY;
      this.pressX = e.clientX;
      this.pressY = e.clientY;
      this.down = true;
      this.pressed = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      this.px = e.clientX;
      this.py = e.clientY;
    });
    const up = (e: PointerEvent) => {
      this.px = e.clientX;
      this.py = e.clientY;
      if (this.down) this.released = true;
      this.down = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Snapshot for this frame, with the pointer mapped to world coordinates. */
  take(toWorld: (clientX: number, clientY: number) => { x: number; y: number }): InputFrame {
    const p = toWorld(this.px, this.py);
    const press = toWorld(this.pressX, this.pressY);
    const frame: InputFrame = {
      presses: this.presses,
      held: new Set(this.held),
      shift: this.shift,
      pointer: { x: p.x, y: p.y, pressX: press.x, pressY: press.y, down: this.down, pressed: this.pressed, released: this.released },
    };
    this.presses = [];
    this.pressed = false;
    this.released = false;
    return frame;
  }
}
