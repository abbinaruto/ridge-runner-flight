// RIDGE RUNNER — Alpine Air Mail. Every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. Units: metres, knots, feet.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Focal length (px) of the chase camera's projection at 1280 wide. */
export const FOCAL = 700;

/** Where the aircraft sprite sits on screen (chase view, plane in frame). */
export const PLANE_SCREEN = { x: 640, y: 472 };

export const PLANE = {
  /** Top speed at full throttle, knots. */
  maxSpeed: 210,
  /** Stall speed, knots: below it the nose drops no matter the pitch. */
  stallSpeed: 62,
  /** Best landing speed, knots: touch down at or below this on the runway. */
  landSpeed: 95,
  /** Throttle change per second (0..1). */
  throttleRate: 0.55,
  /** Pitch change per second, degrees, at full stick. */
  pitchRate: 26,
  /** Bank change per second, degrees, at full stick. */
  bankRate: 70,
  /** How fast the heading follows the bank, degrees per second per degree of bank. */
  turnRate: 0.5,
  /** Climb/descent, ft per second per knot of speed per degree of pitch (tuned). */
  climbFactor: 0.6,
  /** Fuel, seconds of full-throttle flight. */
  fuelSeconds: 420,
  /** How far ahead the camera looks for terrain height, metres. */
  terrainLook: 40,
};

export const LIVES = 3;

/** Valley legs: one per sortie. length is metres of valley, rings to thread. */
export const LEGS = [
  {
    name: 'SORTIE 1 · FIRST LIGHT',
    brief: 'Dawn mail run. Thread 8 rings down the valley, then land on the strip.',
    rings: 8,
    length: 7000,
    palette: 'dawn',
    wind: 0,
  },
  {
    name: 'SORTIE 2 · STORM PASS',
    brief: 'Midday gusts over the high pass. 10 rings, a tighter valley, less fuel.',
    rings: 10,
    length: 7600,
    palette: 'noon',
    wind: 14,
  },
  {
    name: 'SORTIE 3 · NIGHT MAIL',
    brief: 'Dusk delivery. 12 rings in fading light — follow the runway lights home.',
    rings: 12,
    length: 8200,
    palette: 'dusk',
    wind: 8,
  },
];

export const RING = { radius: 26, points: 100, collectWindow: 18 };

export const SCORE = { ring: 100, landing: 500, fuelBonusPerLitre: 4, timeBonusPerSec: 2 };

export const PALETTES = {
  dawn: {
    skyTop: '#2e4a7a', skyMid: '#e8907c', skyLow: '#f7c98b',
    sun: '#ffd9a0', mountainFar: '#7d8fb0', mountainNear: '#5a6d8f',
    ground: '#6f8f5a', groundDark: '#55703f', slope: '#4c5e43',
    river: '#7fb3d5', tree: '#2f5233', treeDark: '#243f28',
    runway: '#3a3f46', runwayLine: '#f5f0dc', cloud: 'rgba(255,235,220,0.85)',
    fog: 'rgba(247,201,139,0.25)', hud: '#ffe9c4', panel: 'rgba(20,28,44,0.72)',
  },
  noon: {
    skyTop: '#2f6fb4', skyMid: '#7fb8e8', skyLow: '#cfe8f7',
    sun: '#fff3c4', mountainFar: '#8aa5c4', mountainNear: '#5f7d9e',
    ground: '#7fae62', groundDark: '#5d8a48', slope: '#55694a',
    river: '#4f9fd8', tree: '#2e6b34', treeDark: '#235229',
    runway: '#34383f', runwayLine: '#ffffff', cloud: 'rgba(255,255,255,0.9)',
    fog: 'rgba(207,232,247,0.22)', hud: '#eaf6ff', panel: 'rgba(16,32,52,0.72)',
  },
  dusk: {
    skyTop: '#1c2340', skyMid: '#7a4a72', skyLow: '#e07a5f',
    sun: '#ff9e6b', mountainFar: '#4d4468', mountainNear: '#38304f',
    ground: '#4a5a44', groundDark: '#37452f', slope: '#2f3a2c',
    river: '#5a7fa8', tree: '#1f3324', treeDark: '#17251b',
    runway: '#2c2f36', runwayLine: '#ffe9a8', cloud: 'rgba(224,122,95,0.5)',
    fog: 'rgba(122,74,114,0.3)', hud: '#ffd9a8', panel: 'rgba(24,18,40,0.78)',
  },
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ridge-runner.best';
