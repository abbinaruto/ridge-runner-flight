// The screenshot scenes behind ?shot=start|play|ring|land. Each one flies the
// real rules forward from a fresh valley for a fixed stretch, steered by a
// simple autopilot (bank toward the next ring, pitch toward its height, cruise
// throttle, climb out of terrain, slow down on final), so the frame is what a
// short flight really looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_CRASH, EVENT_LANDED, EVENT_OVER } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

/** Clamp a number into [lo, hi]. */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Linear interpolation. */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * One autopilot decision. It flies by pure pursuit with a short lookahead and
 * a bank that holds the heading the target asks for, so it tracks a ring or
 * the runway centreline without weaving. On final it flies a glide slope that
 * holds clearance over the floor just ahead of the plane — a rise in the
 * valley cannot catch it out — and the slope blends in as the plane lines up
 * on the centreline instead of snapping between two targets. Low over the
 * floor it pulls up and steers back to the valley centre, never just levelling
 * the wings, so it cannot slide sideways into a wall while climbing. Over the
 * runway itself the slope owns the descent: the terrain pull-up is off there
 * (the strip is flat), the descent is capped so the vertical speed stays
 * landable, and the target drops to the strip so the plane actually settles.
 */
export function autopilot(world) {
  const s = world.state;
  const leg = s.leg;
  const centreNow = world.sampleAt(leg, s.pz + 80, leg.centre);
  const floorNow = world.sampleAt(leg, s.pz + 80, leg.height);
  const clearance = s.altM - world.groundHeightAt(s.pz + 80, s.px);

  let target = null;
  for (const ring of leg.rings) {
    if (!ring.got) {
      if (!target) target = ring;
    }
  }
  const centreLocal = world.sampleAt(leg, s.pz, leg.centre);
  const centreAhead = world.sampleAt(leg, s.pz + 200, leg.centre);
  const toThreshold = leg.runwayZ - s.pz;
  const offCentre = Math.abs(s.px - centreLocal);
  const overRunway =
    s.pz > leg.runwayZ - 300 && s.pz < leg.runwayZ + leg.runwayLength + 100;

  let tx;
  let ty;
  let tz;
  let final = false;
  let throttle = 0.45;
  let brake = false;
  if (target) {
    tx = target.x;
    ty = target.y;
    tz = target.z;
    if (Math.max(30, tz - s.pz) < 260) throttle = 0.1;
  } else {
    final = true;
    // Follow the valley's own curve all the way in — the runway is built
    // along the valley centreline, which keeps meandering past the threshold,
    // so steering at a fixed point would leave the plane off the strip.
    tx = centreAhead;
    tz = leg.runwayZ - 150;
    if (s.pz > leg.runwayZ) {
      // Over the strip: settle onto it — the target sits just under the
      // floor, so the plane keeps descending through the touchdown instead
      // of levelling off a few metres above it. Keep flying speed (no stall).
      ty = floorNow - 5;
      throttle = -0.6;
    } else if (toThreshold < 1200) {
      const align = clamp(1 - offCentre / 60, 0, 1);
      const slopeClearance = Math.max(6, toThreshold * 0.06);
      ty = floorNow + lerp(90, slopeClearance, align);
      throttle = lerp(-0.2, -0.6, align);
    } else {
      ty = floorNow + 110;
      throttle = -0.35;
    }
    if (overRunway && s.speed > 92) brake = true;
  }

  // Pure pursuit with a short lookahead, damped on the heading error. On final
  // the lookahead shortens and the gain rises, so the plane holds the
  // centreline instead of weaving across it.
  const lookahead = final ? 120 : clamp(tz - s.pz, 120, 500);
  const dx = tx - s.px;
  const desired = (Math.atan2(dx, lookahead) * 180) / Math.PI;
  const herr = ((desired - s.heading + 540) % 360) - 180;
  let bank = clamp(herr / (final ? 8 : 12), -1, 1);
  const altErr = ty - s.altM;
  // A firm pitch response, so the plane tracks ring heights instead of
  // floating high above them on the way to the next one.
  let pitch = clamp(altErr / 25, -1, 1);

  // Terrain: pull up when the floor is close and steer back to the centre of
  // the valley — except over the runway, where the strip is flat and the glide
  // slope owns the descent, and except on final when lined up, where only a
  // last-moment pull-up before the threshold applies.
  const alignedFinal = final && offCentre < 16 && toThreshold < 1200;
  if (!overRunway && !alignedFinal && clearance < 50) {
    pitch = Math.max(pitch, 0.5);
    bank = clamp((centreNow - s.px) / 50, -1, 1);
  }
  if (!overRunway && !alignedFinal && clearance < 30) {
    pitch = 1;
    bank = clamp((centreNow - s.px) / 40, -1, 1);
  }
  if (alignedFinal && clearance < 25 && toThreshold > 60) pitch = Math.max(pitch, 0.5);
  // On final, cap the descent by height above the ground: steep while high,
  // gentle once low, so the vertical speed at touchdown stays landable (the
  // limit is 9 kt down) while the plane still loses the approach altitude.
  if (final) {
    const capVs = clearance > 60 ? 14 : clearance > 25 ? 10 : 6;
    const capDeg =
      (-Math.asin(Math.min(0.9, capVs / Math.max(40, s.speed * 0.6))) * 180) / Math.PI;
    pitch = Math.max(pitch, capDeg / 20);
  }
  return { pitch, bank, throttle, brake };
}

/** Run the world forward `seconds` under the autopilot; stop early on an event. */
function fly(world, seconds, stopWhen) {
  let events = 0;
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    events = world.step(SAMPLE, autopilot(world), false);
    if (events & (EVENT_CRASH | EVENT_LANDED | EVENT_OVER)) break;
    if (stopWhen && stopWhen(world)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene (start, play, ring or land; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'ring' && name !== 'land') {
    for (let i = 0; i < 5 / SAMPLE; i += 1) world.step(SAMPLE, { pitch: 0, bank: 0, throttle: 0, brake: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'land') {
    world.loadLeg(2);
    fly(world, 220, (w) => w.state.pz > w.state.leg.runwayZ - 150);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'ring') {
    fly(world, 100, (w) => {
      for (const ring of w.state.leg.rings) {
        if (!ring.got && ring.z - w.state.pz > 60 && ring.z - w.state.pz < 300) return true;
      }
      return false;
    });
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  fly(world, 26);
  return { screen: SCREEN_PLAY, best: world.state.score };
}
