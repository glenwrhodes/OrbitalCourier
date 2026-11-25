# Orbital Courier

Deliver parcels between moons by slingshotting around planets. Every planet and moon pulls on your ship, and a live trajectory preview shows exactly where the current launch, or your current coast, will take you. Ten hand-made flights, each with a fuel limit.

TypeScript, HTML canvas, Vite. No runtime dependencies.

© 2026 Tiny Moosh Games Inc.

## Run it

```
npm start
```

Installs dependencies on the first run, starts the Vite dev server and opens the game in your browser (http://localhost:5173).

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the test suite (Vitest) |
| `npm run build` | Type-checks, then builds the static site into `dist/` |
| `npm run design` | Level design helper (see below) |

## How to play

- **Aim:** press anywhere and drag. The launch vector runs from the pickup moon toward the pointer; its length is the launch Δv. The dashed line is the predicted path for the next 10 seconds. Release to launch.
- **Fine aim:** ←/→ turn 1° (Shift: 0.1°), ↑/↓ change Δv by 5 (Shift: 0.5). Space or Enter launches.
- **In flight:** hold W or ↑ to burn prograde (speed up along your path), S or ↓ to burn retrograde. The preview updates as you burn.
- **Time:** 1, 2, 3 for 1×, 2×, 4× warp; P pauses.
- **Anywhere:** R restarts the flight; Esc goes back to the title.
- **Win:** reach the green ring around the target moon. **Lose:** hit anything, leave the screen area, or run out of time.
- **Fuel:** the launch and every burn come out of one Δv budget per level.

## URL options

| URL | Effect |
| --- | --- |
| `?level=4` | Opens straight into flight 4 |
| `?level=4&demo=solution` | Demo mode: plays flight 4's stored solution through the normal game and renderer |
| `&speed=2` | Demo playback speed (default 1) |

### Demo mode, for recording

Demo mode shows the level card, sweeps the aim onto the stored solution with the preview visible, holds, launches, flies the solution (including any burns) and shows the results panel. It ignores input and hides the cursor.

All timing, both animation and simulation, comes from the `requestAnimationFrame` timestamp; nothing reads the wall clock. A recording made on a fake clock is therefore the same at any frame rate.

Timeline, from the first frame:

| Time | What happens |
| --- | --- |
| 0 – 1.2 s | Level card, aim resting |
| 1.2 – 4.0 s | Aim sweeps onto the solution |
| 4.0 – 4.9 s | Aim held, preview showing |
| 4.9 s | Launch; then the flight plays in real time (÷ `speed`) |
| end + 0.7 s | Results panel fades in |
| end + 2.2 s | Demo reports `done` |

To know when to stop recording, read `window.orbitalCourier.demo` or the `data-demo` attribute on `<html>`. Both step through `intro`, `aiming`, `flying`, `ended`, `done`; `window.orbitalCourier.outcome` holds the result.

Flight lengths at speed 1 (add 4.9 s before launch and about 2.2 s after):

| Flight | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Seconds | 13.1 | 5.7 | 11.7 | 5.8 | 10.1 | 10.1 | 9.0 | 14.2 | 19.2 | 15.7 |

Flight 9's solution includes a burn, so it is the one to record if you want to show the engine.

## How it works

- **Gravity:** the ship feels every body (`a = Σ μ / r²`). Planets and moons follow scripted circular orbits, which can be nested (moons around planets, planets around a fixed point). Bodies therefore don't pull on each other, and levels stay exactly as designed.
- **Fixed step:** the simulation advances in fixed 1/120 s steps using velocity Verlet. It is deterministic: the same inputs always give the same flight.
- **Exact preview:** body positions are tabulated for every tick of a level, and the preview and the real flight share one step function. With no burns, the predicted path is the flight to the last bit; a test checks this on every level.
- **Collisions:** detected along each step's segment, in the moving body's frame, so a fast ship can't tunnel through a moon between ticks.

```
src/
  core/       pure game logic, no DOM, fully tested
    bodies.ts     scripted orbits
    physics.ts    gravity, Verlet step, swept collision
    world.ts      a level compiled for flight; the shared step function
    predict.ts    trajectory preview
    sim.ts        flight session: aim, launch, burns, fuel, outcomes
    levels.ts     the ten levels, each with a stored solution
  render/     canvas drawing (mission-control vector style)
  ui/         game state machine, demo timeline, DOM input
  main.ts     canvas, URL options, requestAnimationFrame loop
tests/        Vitest
scripts/      start script and level design tools
```

## Designing levels

Each level stores a known solution, a launch plus optional burns. `tests/levels.test.ts` checks that it:

- delivers within the fuel and time limits;
- stays on screen;
- survives small aiming errors.

The same file also checks that bodies never touch each other and never sit under the HUD.

After changing a level, run the design helper to find a new solution:

```
npm run design -- 4 --plot              # sweep level 4, print a robust solution, draw scripts/out/level-04.png
npm run design -- 4 --without=runner    # switch off a body's gravity to see what it contributes
npm run design -- 9 --burn=1100:1140:1  # fly every launch with a fixed burn (ticks after launch, direction)
npm run design -- 4 --minpower=80       # only consider launches at least this strong
```

It sweeps launch heading × power, reports how many launches deliver and the cheapest, and prints a solution from the middle of a wide window of working launches.
