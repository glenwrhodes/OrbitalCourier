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

GitHub Actions (`.github/workflows/ci.yml`) runs the type check, the tests and the build on every push. It is a check only, with no release and no deploy.

## How to play

- **Flights:** the title leads to the level select. Each flight opens when you deliver the one before it.
- **Aim:** press on or near the ship (the cursor turns into a hand) and drag. The launch vector runs from the pickup moon toward the pointer, and its length is the launch Δv. The dashed line is the predicted path for the next 10 seconds. Release to launch. A click that doesn't drag does nothing, and Esc cancels a drag.
- **Fine aim:** ←/→ turn 1° (Shift: 0.1°), ↑/↓ change Δv by 5 (Shift: 0.5). Space or Enter launches.
- **In flight:** hold W or ↑ to burn prograde (speed up along your path), S or ↓ to burn retrograde. The preview updates as you burn.
- **Time:** 1, 2, 3 for 1×, 2×, 4× warp; P pauses.
- **Anywhere in a flight:** R restarts; Esc goes back to the level select.
- **Win:** reach the green ring around the target moon. **Lose:** hit anything, leave the screen area, or run out of time.
- **Fuel:** the launch and every burn come out of one Δv budget per level.

### Stars and saved progress

| Stars | How to earn them |
| --- | --- |
| ★ | Deliver the parcel |
| ★★ | Deliver using no more Δv than the level's par |
| ★★★ | Do both of the above and also arrive within the par time |

Each level shows its par on its title card and next to the clock and Δv in the telemetry panel. A green tick on the fuel bar marks where you drop below two stars.

The best run on each level (most stars, then least Δv, then shortest time) is saved in the browser's localStorage under `orbital-courier:v1`. Failed flights are never recorded. To start over, run `localStorage.removeItem('orbital-courier:v1')` in the browser console.

### Ghost of your best run

On a level you have delivered before, your best run flies alongside you as a faint ghost:

- **While you aim:** its whole route shows as a faint dotted line.
- **In flight:** a pale ship outline marked BEST sits wherever your best run was at the same moment after its launch, so you can see whether you're ahead or behind.

The ghost is saved with the best run: its position 30 times a second, rounded to a tenth of a unit, about 2–8 KB per level. It plays back by interpolating between those samples, within a pixel of the real flight. A new best shows as the ghost from your next attempt.

Saves from before ghosts existed still load. Those levels just have no ghost until you beat that best. A damaged ghost in a save is dropped and the rest of the record is kept.

## URL options

| URL | Effect |
| --- | --- |
| `?level=4` | Opens straight into flight 4, even if it is still locked |
| `?level=4&demo=solution` | Demo mode: plays flight 4's stored solution through the normal game and renderer |
| `&speed=2` | Demo playback speed (default 1) |

### Demo mode, for recording

Demo mode shows the level card, sweeps the aim onto the stored solution with the preview visible, holds, launches, flies the solution (including any burns) and shows the results panel with its stars. It ignores input and hides the cursor.

Demo mode never reads or writes saved progress, and never shows a saved ghost. The results panel therefore looks the same on every machine: three stars, marked as a first delivery.

All timing, both animation and simulation, comes from the `requestAnimationFrame` timestamp; nothing reads the wall clock. A recording made on a fake clock is therefore the same at any frame rate.

Timeline, from the first frame:

| Time | What happens |
| --- | --- |
| 0 – 1.2 s | Level card, aim resting |
| 1.2 – 4.0 s | Aim sweeps onto the solution |
| 4.0 – 4.9 s | Aim held, preview showing |
| 4.9 s | Launch; then the flight plays in real time (÷ `speed`) |
| end + 0.7 s | Results panel fades in |
| end + 1.1 – 1.8 s | Stars appear one by one |
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
    scoring.ts    stars from Δv and time against each level's par
    progress.ts   saved best runs, unlocking, validation of stored data
    ghost.ts      recording and replaying the best run's path
    levels.ts     the ten levels, each with a par and a stored solution
  render/     canvas drawing (mission-control vector style)
  ui/         game state machine, demo timeline, DOM input
  main.ts     canvas, URL options, requestAnimationFrame loop
tests/        Vitest
scripts/      start script and level design tools
```

## Designing levels

Each level stores a known solution, a launch plus optional burns. `tests/levels.test.ts` checks that it:

- delivers within the fuel and time limits, earning three stars;
- stays on screen;
- survives small aiming errors.

The same file also checks that bodies never touch each other and never sit under the HUD.

After changing a level, run the design helper to find a new solution. Then set the level's `par` a little above that solution's Δv and flight time.

```
npm run design -- 4 --plot              # sweep level 4, print a robust solution, draw scripts/out/level-04.png
npm run design -- 4 --without=runner    # switch off a body's gravity to see what it contributes
npm run design -- 9 --burn=1100:1140:1  # fly every launch with a fixed burn (ticks after launch, direction)
npm run design -- 4 --minpower=80       # only consider launches at least this strong
```

It sweeps launch heading × power, reports how many launches deliver and the cheapest, and prints a solution from the middle of a wide window of working launches.
