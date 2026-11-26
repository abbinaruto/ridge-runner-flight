// The world: a winding mountain valley per sortie, the rings to thread, the
// runway at its end, and the flight model. Everything is pure numbers — the
// renderer only paints what this module reports — so the autopilot, the tests
// and the screenshots all run the same rules.
import { LEGS, PLANE, RING, SCORE, STEP } from './config.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASH = 4;
export const EVENT_OVER = 8;
export const EVENT_FUEL_EMPTY = 16;

const SEG = 40; // metres between valley samples
const KTS_TO_MS = 0.514444; // one knot in metres per second
const MS_TO_FT = 3.28084;
const FT_TO_M = 0.3048;

/** Smoothstep between 0 and 1. */
function smooth(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Build one valley leg from a seeded random stream. */
function buildLeg(random, leg) {
  const count = Math.ceil((leg.length + 1200) / SEG) + 2;
  const centre = [];
  const height = [];
  const halfWidth = [];
  // A slow meander: a few sine waves with random phase, so the valley bends.
  const p1 = random.range(0, Math.PI * 2);
  const p2 = random.range(0, Math.PI * 2);
  const p3 = random.range(0, Math.PI * 2);
  let h = random.range(60, 140);
  for (let i = 0; i < count; i += 1) {
    const z = i * SEG;
    centre.push(
      160 * Math.sin(z / 2400 + p1) + 90 * Math.sin(z / 1100 + p2) + 40 * Math.sin(z / 520 + p3),
    );
    h += random.range(-9, 9);
    h = Math.max(40, Math.min(260, h));
    height.push(h);
    // The valley narrows in the middle of the leg and opens at the runway.
    const along = z / leg.length;
    const pinch = 1 - 0.35 * Math.sin(Math.PI * Math.min(1, along));
    halfWidth.push((150 + 40 * Math.sin(z / 900 + p1)) * pinch);
  }
  // The runway needs flat ground: blend the valley floor to the strip's height
  // over the last 200 m of the approach, then hold it flat through the strip
  // and a little past it, so a landing is fair and the approach is honest.
  const runwayIndex = Math.round(leg.length / SEG);
  const stripFloor = height[runwayIndex];
  const flatStart = Math.round((leg.length - 300) / SEG);
  const blendStart = Math.round((leg.length - 500) / SEG);
  const flatEnd = Math.round((leg.length + 820) / SEG);
  for (let i = blendStart; i <= flatEnd && i < count; i += 1) {
    if (i < flatStart) {
      const t = smooth((i - blendStart) / (flatStart - blendStart));
      height[i] = height[i] + (stripFloor - height[i]) * t;
    } else {
      height[i] = stripFloor;
    }
  }
  const rings = [];
  for (let r = 0; r < leg.rings; r += 1) {
    const z = 500 + ((leg.length - 1100) * (r + 0.5)) / leg.rings + random.range(-90, 90);
    const i = Math.max(0, Math.min(count - 1, Math.floor(z / SEG)));
    const sway = Math.sin((r / leg.rings) * Math.PI * 2.4 + p2) * 0.55;
    // The last ring sits low over the approach, like a final-approach fix, so
    // the plane is already coming down when the runway comes into view.
    const top = r === leg.rings - 1 ? 120 : 190;
    rings.push({
      z,
      x: centre[i] + sway * halfWidth[i] * 0.55,
      // Ring centre sits 90–190 m above the valley floor.
      y: height[i] + random.range(90, top),
      r: RING.radius,
      got: false,
    });
  }
  // Trees and rocks: deterministic scatter, kept off the runway and the river.
  const trees = [];
  const rocks = [];
  for (let i = 2; i < count - 4; i += 1) {
    const z = i * SEG;
    if (z > leg.length - 200) continue; // keep the runway clear
    const n = random.int(0, 3);
    for (let t = 0; t < n; t += 1) {
      const side = random.pick([-1, 1]);
      const off = side * random.range(halfWidth[i] * 0.25, halfWidth[i] * 0.95);
      trees.push({ z, x: centre[i] + off, y: height[i], s: random.range(7, 15) });
    }
    if (random.next() < 0.22) {
      const side = random.pick([-1, 1]);
      rocks.push({
        z,
        x: centre[i] + side * random.range(halfWidth[i] * 0.5, halfWidth[i] * 1.1),
        y: height[i],
        s: random.range(6, 14),
      });
    }
  }
  // Clouds: high, slow, spread over the whole leg.
  const clouds = [];
  for (let c = 0; c < 26; c += 1) {
    clouds.push({
      z: random.range(200, leg.length + 800),
      x: random.range(-900, 900),
      y: random.range(520, 780),
      s: random.range(60, 160),
    });
  }
  // Far ridge silhouettes: two layers of peaks, drawn behind the terrain.
  const ridges = [0, 1].map((layer) => {
    const peaks = [];
    for (let k = 0; k <= 24; k += 1) {
      peaks.push(random.range(0.25, 1) * (layer === 0 ? 0.55 : 0.9));
    }
    return { layer, peaks };
  });
  return {
    leg,
    count,
    centre,
    height,
    halfWidth,
    rings,
    trees,
    rocks,
    clouds,
    ridges,
    runwayZ: leg.length,
    runwayLength: 620,
  };
}

function sampleAt(leg, z, table) {
  const f = Math.max(0, Math.min(leg.count - 1.001, z / SEG));
  const i = Math.floor(f);
  const t = f - i;
  return table[i] + (table[i + 1] - table[i]) * t;
}

export function createWorld(random) {
  const legs = LEGS.map((leg) => buildLeg(random, leg));
  const state = {
    legIndex: 0,
    leg: null,
    // Flight state (metres, knots, degrees, feet where the HUD shows them).
    px: 0,
    pz: 0,
    altM: 0,
    speed: 0,
    throttle: 0,
    pitch: 0,
    bank: 0,
    heading: 0,
    fuel: 1,
    score: 0,
    ringsGot: 0,
    ringsTotal: 0,
    lives: 3,
    time: 0,
    legTime: 0,
    message: '',
    messageUntil: 0,
    landed: false,
    crashed: false,
    crashReason: '',
    // Camera shake on a hard landing or a near miss.
    shake: 0,
  };

  function loadLeg(index) {
    const built = legs[index];
    state.legIndex = index;
    state.leg = built;
    state.ringsTotal = built.rings.length;
    state.ringsGot = 0;
    for (const ring of built.rings) ring.got = false;
    state.px = sampleAt(built, 0, built.centre);
    state.pz = 0;
    state.altM = sampleAt(built, 0, built.height) + 55;
    state.speed = 95;
    state.throttle = 0.62;
    state.pitch = 0;
    state.bank = 0;
    state.heading = 0;
    state.fuel = 1;
    state.legTime = 0;
    state.landed = false;
    state.crashed = false;
    state.crashReason = '';
    state.message = built.leg.brief;
    state.messageUntil = 6;
  }

  function groundHeightAt(z, x) {
    const built = state.leg;
    const floor = sampleAt(built, z, built.height);
    const centre = sampleAt(built, z, built.centre);
    const half = sampleAt(built, z, built.halfWidth);
    const off = Math.abs(x - centre);
    if (off <= half) return floor;
    // Valley walls rise steeply beyond the floor edge.
    const over = off - half;
    return floor + over * over * 0.012 + over * 0.35;
  }

  function reset() {
    state.score = 0;
    state.lives = 3;
    state.time = 0;
    loadLeg(0);
  }

  /**
   * One fixed step. `ctl` is { pitch, bank, throttle } in [-1, 1] (throttle is a
   * target, -1 idle, 1 full); `attract` runs the title-screen drift. Returns an
   * event bitmask. `wind` is the leg's crosswind in knots, pushing the plane.
   */
  function step(dt, ctl, attract) {
    state.time += dt;
    if (attract) {
      // Title screen: the plane cruises hands-off down the valley for the backdrop.
      state.legTime += dt;
      state.speed = 110;
      state.pz += 110 * KTS_TO_MS * dt;
      state.heading = Math.sin(state.pz / 2600) * 6;
      state.px = sampleAt(state.leg, state.pz, state.leg.centre) + Math.sin(state.pz / 1400) * 30;
      state.altM = sampleAt(state.leg, state.pz, state.leg.height) + 120 + Math.sin(state.pz / 900) * 18;
      state.bank = Math.sin(state.pz / 1800) * 8;
      state.pitch = Math.sin(state.pz / 1100) * 2;
      if (state.pz > state.leg.length - 400) {
        state.pz = 0;
        state.px = sampleAt(state.leg, 0, state.leg.centre);
      }
      return 0;
    }
    if (state.landed || state.crashed) return 0;
    state.legTime += dt;
    const leg = state.leg;
    const wind = leg.leg.wind;

    // Throttle: stick target, spooling at a fixed rate; empty tank means idle.
    const target = state.fuel <= 0 ? 0 : (ctl.throttle + 1) / 2;
    const rate = PLANE.throttleRate * dt;
    state.throttle += Math.max(-rate, Math.min(rate, target - state.throttle));
    // Speed chases the throttle's speed, with drag; a dive adds a little.
    const wantSpeed = 40 + state.throttle * (PLANE.maxSpeed - 40) + Math.max(0, -state.pitch) * 0.5;
    state.speed += (wantSpeed - state.speed) * Math.min(1, dt * 0.55);
    // Fuel burns with throttle; an airbrake (ctl.brake) also bleeds speed.
    if (ctl.brake) state.speed = Math.max(45, state.speed - 55 * dt);
    state.fuel = Math.max(0, state.fuel - (state.throttle * dt) / PLANE.fuelSeconds);
    if (state.fuel <= 0 && state.throttle > 0.02) {
      state.message = 'FUEL EMPTY — GLIDE TO THE STRIP';
      state.messageUntil = state.time + 4;
    }

    // Pitch and bank follow the stick; bank turns the heading; gusts nudge it.
    const pitchTarget = ctl.pitch * 20;
    const bankTarget = ctl.bank * 52;
    state.pitch += (pitchTarget - state.pitch) * Math.min(1, dt * 3.2);
    state.bank += (bankTarget - state.bank) * Math.min(1, dt * 3.6);
    const gust = wind * Math.sin(state.time * 0.7) * 0.35;
    state.heading += (state.bank * PLANE.turnRate + gust) * dt;
    state.heading = ((state.heading + 540) % 360) - 180;

    // Vertical speed: pitch and speed, plus a stall drop below stall speed.
    let vsKts = Math.sin((state.pitch * Math.PI) / 180) * state.speed * PLANE.climbFactor;
    if (state.speed < PLANE.stallSpeed) {
      vsKts -= (PLANE.stallSpeed - state.speed) * 1.6;
      if (state.pitch > 4) {
        state.message = 'STALL — NOSE DOWN, THROTTLE UP';
        state.messageUntil = state.time + 1.2;
      }
    }
    state.vsKts = vsKts;
    state.altM += vsKts * KTS_TO_MS * dt; // knots of vertical speed -> metres

    // Forward motion along the heading, plus a crosswind push.
    const rad = (state.heading * Math.PI) / 180;
    const forward = state.speed * KTS_TO_MS * dt;
    state.pz += Math.cos(rad) * forward;
    state.px += Math.sin(rad) * forward + wind * KTS_TO_MS * 0.35 * dt * Math.sin(state.time * 0.5);

    // Rings: fly through the hoop to collect it.
    let events = 0;
    for (const ring of leg.rings) {
      if (ring.got) continue;
      if (Math.abs(state.pz - ring.z) > RING.collectWindow) continue;
      const dx = state.px - ring.x;
      const dy = state.altM - ring.y;
      if (dx * dx + dy * dy < ring.r * ring.r) {
        ring.got = true;
        state.ringsGot += 1;
        state.score += SCORE.ring;
        events |= EVENT_RING;
        state.message = `RING ${state.ringsGot}/${state.ringsTotal}  +${SCORE.ring}`;
        state.messageUntil = state.time + 2;
      }
    }

    // Terrain: the valley floor, the walls, and the runway strip.
    const ground = groundHeightAt(state.pz, state.px);
    const inRunway =
      state.pz >= leg.runwayZ - 40 && state.pz <= leg.runwayZ + leg.runwayLength;
    const centre = sampleAt(leg, state.pz, leg.centre);
    const onStrip = inRunway && Math.abs(state.px - centre) < 14;
    const clearance = state.altM - ground;

    if (clearance <= 1.5) {
      if (onStrip && state.speed <= PLANE.landSpeed && vsKts > -9) {
        // Touchdown: a clean landing ends the sortie.
        state.landed = true;
        const fuelBonus = Math.round(state.fuel * 100 * SCORE.fuelBonusPerLitre);
        const timeBonus = Math.max(0, Math.round((420 - state.legTime) * SCORE.timeBonusPerSec));
        state.score += SCORE.landing + fuelBonus + timeBonus;
        state.message = `TOUCHDOWN! +${SCORE.landing}  FUEL +${fuelBonus}  TIME +${timeBonus}`;
        state.messageUntil = state.time + 6;
        events |= EVENT_LANDED;
        return events;
      }
      // Anything else at ground level is a crash.
      state.crashed = true;
      state.crashReason = onStrip
        ? state.speed > PLANE.landSpeed
          ? 'Too fast for the strip — slow down before touchdown'
          : 'Came down too hard — ease the descent before touchdown'
        : state.pz > leg.runwayZ + leg.runwayLength
          ? 'Ran off the end of the runway'
          : Math.abs(state.px - centre) > sampleAt(leg, state.pz, leg.halfWidth)
            ? 'Flew into the mountainside'
            : 'Hit the valley floor';
      state.lives -= 1;
      state.shake = 1;
      events |= EVENT_CRASH;
      if (state.lives <= 0) events |= EVENT_OVER;
      return events;
    }
    // Low over the ground: warn, and shake the camera a little.
    if (clearance < 25) {
      state.message = 'TERRAIN — PULL UP';
      state.messageUntil = state.time + 0.8;
      state.shake = Math.max(state.shake, 0.25);
    }
    state.shake = Math.max(0, state.shake - dt * 1.5);
    return events;
  }

  function nextLeg() {
    if (state.legIndex + 1 < legs.length) {
      loadLeg(state.legIndex + 1);
      return true;
    }
    return false;
  }

  function retryLeg() {
    loadLeg(state.legIndex);
  }

  reset();

  return {
    state,
    legs,
    reset,
    step,
    loadLeg,
    nextLeg,
    retryLeg,
    groundHeightAt,
    sampleAt,
    // HUD helpers, in the units the pilot reads.
    altitudeFt() {
      return Math.round(state.altM * MS_TO_FT);
    },
    speedKts() {
      return Math.round(state.speed);
    },
    headingDeg() {
      return Math.round(((state.heading % 360) + 360) % 360);
    },
    verticalSpeedFpm() {
      return Math.round((state.vsKts ?? 0) * 101.27);
    },
    distanceToRunwayM() {
      return Math.max(0, Math.round(state.leg.runwayZ - state.pz));
    },
  };
}
