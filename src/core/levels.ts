import type { BodyDef } from './bodies.ts';
import type { Level } from './level.ts';

// World space is 1920×1080 centred on the origin, y down. Keep bodies inside
// roughly x ±880, y ±460, and clear of the HUD panel in the top-left corner.
//
// Each level's stored solution was found with `npm run design` (the middle of
// a wide window of working launches) and is verified by tests/levels.test.ts.
// After moving a body, re-run the design script and update the solution.

function planet(id: string, name: string, x: number, y: number, radius: number, mu: number): BodyDef {
  return { id, name, kind: 'planet', radius, mu, pos: { x, y } };
}

/** A planet that travels on a circle around a fixed point. */
function rover(
  id: string,
  name: string,
  cx: number,
  cy: number,
  orbitRadius: number,
  period: number,
  phase: number,
  radius: number,
  mu: number,
): BodyDef {
  return { id, name, kind: 'planet', radius, mu, orbit: { center: { x: cx, y: cy }, radius: orbitRadius, period, phase } };
}

function moon(id: string, name: string, around: string, orbitRadius: number, period: number, phase: number, radius = 12, mu = 1.5e4): BodyDef {
  return { id, name, kind: 'moon', radius, mu, orbit: { around, radius: orbitRadius, period, phase } };
}

/** An unbroken line of rocks from (x0, y) to (x1, y), with a fixed wobble so it looks natural. */
function belt(prefix: string, x0: number, x1: number, y: number, spacing = 28, radius = 16): BodyDef[] {
  const rocks: BodyDef[] = [];
  const n = Math.round((x1 - x0) / spacing);
  for (let i = 0; i <= n; i++) {
    const wobble = Math.sin(i * 2.399) * 7;
    const r = radius + Math.sin(i * 1.7) * 3;
    rocks.push({
      id: `${prefix}${i}`,
      name: 'BELT',
      kind: 'rock',
      radius: r,
      mu: 3e3,
      pos: { x: x0 + i * spacing, y: y + wobble },
    });
  }
  return rocks;
}

export const LEVELS: Level[] = [
  {
    id: 1,
    name: 'FIRST LIGHT',
    brief: 'Drag from the ship to aim, release to launch. Fly into the green ring.',
    bodies: [
      planet('aura', 'AURA', -560, 140, 28, 6e5),
      moon('aura-i', 'AURA-I', 'aura', 95, 40, -20),
      planet('bram', 'BRAM', 560, -60, 30, 6e5),
      moon('bram-i', 'BRAM-I', 'bram', 95, -40, 200),
    ],
    pickup: 'aura-i',
    target: 'bram-i',
    fuel: 250,
    maxLaunch: 250,
    timeLimit: 30,
    deliveryRadius: 40,
    solution: { heading: 76.6, power: 115, burns: [] },
  },
  {
    id: 2,
    name: 'THE BEND',
    brief: 'GOLIATH blocks the straight line. Let its gravity bend you around it.',
    bodies: [
      planet('kiln', 'KILN', -640, 260, 26, 5e5),
      moon('kiln-i', 'KILN-I', 'kiln', 85, 36, -45),
      planet('goliath', 'GOLIATH', 0, 20, 56, 5e6),
      planet('vesta', 'VESTA', 650, -210, 26, 5e5),
      moon('vesta-i', 'VESTA-I', 'vesta', 85, -36, 180),
    ],
    pickup: 'kiln-i',
    target: 'vesta-i',
    fuel: 220,
    maxLaunch: 220,
    timeLimit: 35,
    deliveryRadius: 40,
    solution: { heading: 97.5, power: 200, burns: [] },
  },
  {
    id: 3,
    name: 'LEAD THE TARGET',
    brief: 'HELIX-II races around its planet. Aim for where it will be, not where it is.',
    bodies: [
      planet('tor', 'TOR', -620, -150, 28, 6e5),
      moon('tor-i', 'TOR-I', 'tor', 90, 40, 60),
      planet('helix', 'HELIX', 420, 120, 40, 2.2e6),
      moon('helix-ii', 'HELIX-II', 'helix', 230, 14, 200),
    ],
    pickup: 'tor-i',
    target: 'helix-ii',
    fuel: 190,
    maxLaunch: 190,
    timeLimit: 35,
    deliveryRadius: 40,
    solution: { heading: 123.7, power: 115, burns: [] },
  },
  {
    id: 4,
    name: 'CATCH A RIDE',
    brief: 'No launch can climb out of EMBER’s pull. Drop onto RUNNER and let it carry you.',
    bodies: [
      planet('ember', 'EMBER', -560, 120, 34, 1.4e6),
      moon('ember-i', 'EMBER-I', 'ember', 100, 30, 5),
      rover('runner', 'RUNNER', 420, 1560, 1545, 63.6, -122.8, 42, 3.2e6),
      planet('farpoint', 'FARPOINT', 510, -170, 26, 5e5),
      moon('farpoint-i', 'FARPOINT-I', 'farpoint', 90, -50, 160),
    ],
    pickup: 'ember-i',
    target: 'farpoint-i',
    fuel: 110,
    maxLaunch: 100,
    timeLimit: 40,
    deliveryRadius: 60,
    solution: { heading: 129.6, power: 45, burns: [] },
  },
  {
    id: 5,
    name: 'THE GAP',
    brief: 'Two worlds guard the drop. Thread the gap between them.',
    bodies: [
      planet('orin', 'ORIN', -680, 0, 28, 6e5),
      moon('orin-i', 'ORIN-I', 'orin', 90, 34, 0),
      planet('castor', 'CASTOR', -40, -150, 56, 5e6),
      planet('pollux', 'POLLUX', 60, 170, 38, 2e6),
      planet('dell', 'DELL', 680, 60, 28, 6e5),
      moon('dell-i', 'DELL-I', 'dell', 90, -34, 180),
    ],
    pickup: 'orin-i',
    target: 'dell-i',
    fuel: 150,
    maxLaunch: 150,
    timeLimit: 35,
    deliveryRadius: 40,
    solution: { heading: 108.8, power: 118.4, burns: [] },
  },
  {
    id: 6,
    name: 'S-CURVE',
    brief: 'MONOLITH sits dead centre. Curve past it on its neighbours’ pull.',
    bodies: [
      planet('quill', 'QUILL', -720, -170, 26, 5e5),
      moon('quill-i', 'QUILL-I', 'quill', 85, 36, 45),
      planet('anvil', 'ANVIL', -300, 170, 44, 3e6),
      planet('monolith', 'MONOLITH', 20, -10, 60, 4e6),
      planet('crest', 'CREST', 330, -200, 44, 3e6),
      planet('juno', 'JUNO', 740, 300, 26, 5e5),
      moon('juno-i', 'JUNO-I', 'juno', 85, -36, 225),
    ],
    pickup: 'quill-i',
    target: 'juno-i',
    fuel: 170,
    maxLaunch: 170,
    timeLimit: 40,
    deliveryRadius: 40,
    solution: { heading: 101.8, power: 149, burns: [] },
  },
  {
    id: 7,
    name: 'THE MAW',
    brief: 'MAW-I hugs a heavy world. Fall in fast and catch it on the way past.',
    bodies: [
      planet('lark', 'LARK', -700, 300, 28, 6e5),
      moon('lark-i', 'LARK-I', 'lark', 90, 40, -45),
      planet('decoy', 'SHALE', -200, -300, 30, 8e5),
      planet('maw', 'MAW', 260, -40, 60, 6e6),
      moon('maw-i', 'MAW-I', 'maw', 150, 12, 180),
    ],
    pickup: 'lark-i',
    target: 'maw-i',
    fuel: 140,
    maxLaunch: 140,
    timeLimit: 35,
    deliveryRadius: 40,
    solution: { heading: 90.6, power: 95, burns: [] },
  },
  {
    id: 8,
    name: 'CORRIDOR',
    brief: 'Four worlds in a zigzag. Find the one line that slips through them all.',
    bodies: [
      planet('nadir', 'NADIR', -780, 370, 26, 5e5),
      moon('nadir-i', 'NADIR-I', 'nadir', 80, 36, -45),
      planet('k1', 'KESTREL', -380, 120, 40, 2.5e6),
      planet('k2', 'HARROW', -100, -200, 40, 2.5e6),
      planet('k3', 'TALON', 180, 140, 40, 2.5e6),
      planet('k4', 'GYRE', 460, -180, 40, 2.5e6),
      planet('zenith', 'ZENITH', 760, -300, 26, 5e5),
      moon('zenith-i', 'ZENITH-I', 'zenith', 80, -36, 135),
    ],
    pickup: 'nadir-i',
    target: 'zenith-i',
    fuel: 150,
    maxLaunch: 150,
    timeLimit: 40,
    deliveryRadius: 40,
    solution: { heading: 102.4, power: 118.1, burns: [] },
  },
  {
    id: 9,
    name: 'SUNDIVER',
    brief: 'The belt is closed. Dive around SOL and let it throw you back.',
    bodies: [
      planet('upper', 'UPPER', -560, -170, 26, 5e5),
      moon('upper-i', 'UPPER-I', 'upper', 80, 36, 0),
      ...belt('belt', -1090, -250, 10),
      planet('sol', 'SOL', 320, 10, 80, 9e6),
      planet('lower', 'LOWER', -620, 300, 26, 5e5),
      moon('lower-i', 'LOWER-I', 'lower', 80, -36, 0),
    ],
    pickup: 'upper-i',
    target: 'lower-i',
    fuel: 185,
    maxLaunch: 150,
    timeLimit: 40,
    deliveryRadius: 40,
    // Launch, swing around SOL, then a short prograde burn on the way back reaches LOWER-I.
    solution: { heading: 39.4, power: 140.5, burns: [{ start: 1100, end: 1140, dir: 1 }] },
  },
  {
    id: 10,
    name: 'GRAND TOUR',
    brief: 'Everything is moving. Plan the whole route before you light the engine.',
    bodies: [
      planet('home', 'HOME', -760, 360, 28, 6e5),
      moon('home-i', 'HOME-I', 'home', 90, 40, -60),
      rover('drifter', 'DRIFTER', -280, 0, 200, 50, 90, 40, 2.5e6),
      planet('bastion', 'BASTION', 120, -220, 52, 4.5e6),
      rover('wanderer', 'WANDERER', 420, 250, 140, -40, 0, 38, 2e6),
      planet('terminus', 'TERMINUS', 780, -60, 28, 6e5),
      moon('terminus-i', 'TERMINUS-I', 'terminus', 90, 20, 180),
    ],
    pickup: 'home-i',
    target: 'terminus-i',
    fuel: 160,
    maxLaunch: 120,
    timeLimit: 45,
    deliveryRadius: 40,
    solution: { heading: 94.9, power: 110, burns: [] },
  },
];
