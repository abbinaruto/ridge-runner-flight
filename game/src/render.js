// The painter: sky, ridges, clouds, the projected valley, rings, runway, the
// Kestrel mail plane, and the full HUD — all drawn in code, no assets. The
// camera sits behind the plane and looks along its heading, so the world is
// projected with one small pinhole step shared by terrain, trees and rings.
import { FIELD, FOCAL, PALETTES, PLANE_SCREEN, FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_CRASH = 'crash';
export const SCREEN_WIN = 'win';

const W = FIELD.width;
const H = FIELD.height;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = W;
  let viewH = H;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = canvas.clientWidth || W;
    viewH = canvas.clientHeight || H;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform((canvas.width / W) * 1, 0, 0, canvas.height / H, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // Project a world point into screen space. Returns null behind the camera.
  function project(state, x, y, z, horizonY) {
    const h = (state.heading * Math.PI) / 180;
    const dx = x - state.px;
    const dy = y - state.altM;
    const dz = z - state.pz;
    const fwd = dx * Math.sin(h) + dz * Math.cos(h);
    if (fwd < 10) return null;
    const right = dx * Math.cos(h) - dz * Math.sin(h);
    return {
      x: W / 2 + (FOCAL * right) / fwd,
      y: horizonY - (FOCAL * dy) / fwd,
      d: fwd,
      s: FOCAL / fwd,
    };
  }

  function drawSky(state, pal, horizonY, t) {
    const g = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.55, pal.skyMid);
    g.addColorStop(1, pal.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizonY + 40);
    // Sun: low, warm, offset by heading so it stays put in the world.
    const sunX = W / 2 - state.heading * 9 + Math.sin(t * 0.05) * 6;
    const sunY = horizonY - 150;
    const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    sg.addColorStop(0, pal.sun);
    sg.addColorStop(0.35, pal.sun + 'cc');
    sg.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRidges(state, pal, horizonY) {
    const leg = state.leg;
    const layers = [
      { h: 150, col: pal.mountainFar, shift: 2.2, peaks: leg.ridges[0].peaks },
      { h: 105, col: pal.mountainNear, shift: 4.0, peaks: leg.ridges[1].peaks },
    ];
    for (const layer of layers) {
      ctx.fillStyle = layer.col;
      ctx.beginPath();
      ctx.moveTo(-20, horizonY + 2);
      const off = ((-state.heading * layer.shift) % (W / 12) + W / 12) % (W / 12);
      for (let k = 0; k <= 12; k += 1) {
        const x = k * (W / 12) - off;
        const peak = layer.peaks[k % layer.peaks.length];
        ctx.lineTo(x, horizonY - peak * layer.h);
        ctx.lineTo(x + (W / 24), horizonY - peak * layer.h * 0.55);
      }
      ctx.lineTo(W + 20, horizonY + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds(state, pal, horizonY) {
    ctx.fillStyle = pal.cloud;
    const leg = state.leg;
    for (const c of leg.clouds) {
      const p = project(state, c.x, c.y, c.z, horizonY);
      if (!p || p.x < -200 || p.x > W + 200 || p.y < -40 || p.y > horizonY) continue;
      const s = p.s * c.s * 0.014;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 46 * s, 13 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - 26 * s, p.y + 4 * s, 28 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + 28 * s, p.y + 4 * s, 30 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTerrain(state, pal, horizonY) {
    const leg = state.leg;
    const SEG = 40;
    const startZ = state.pz + 2600;
    const endZ = state.pz + 30;
    // Far to near so near quads paint over far ones.
    for (let z = startZ; z > endZ; z -= SEG) {
      const z0 = z;
      const z1 = z - SEG;
      const centre0 = leg.centre[Math.max(0, Math.min(leg.count - 1, Math.round(z0 / SEG)))];
      const centre1 = leg.centre[Math.max(0, Math.min(leg.count - 1, Math.round(z1 / SEG)))];
      const h0 = leg.height[Math.max(0, Math.min(leg.count - 1, Math.round(z0 / SEG)))];
      const h1 = leg.height[Math.max(0, Math.min(leg.count - 1, Math.round(z1 / SEG)))];
      const w0 = leg.halfWidth[Math.max(0, Math.min(leg.count - 1, Math.round(z0 / SEG)))];
      const w1 = leg.halfWidth[Math.max(0, Math.min(leg.count - 1, Math.round(z1 / SEG)))];
      const l0 = project(state, centre0 - w0, h0, z0, horizonY);
      const r0 = project(state, centre0 + w0, h0, z0, horizonY);
      const l1 = project(state, centre1 - w1, h1, z1, horizonY);
      const r1 = project(state, centre1 + w1, h1, z1, horizonY);
      if (!l0 || !r0 || !l1 || !r1) continue;
      const segIndex = Math.round(z0 / SEG);
      // Valley floor, alternating mow stripes for a sense of speed.
      ctx.fillStyle = segIndex % 2 === 0 ? pal.ground : pal.groundDark;
      ctx.beginPath();
      ctx.moveTo(l0.x, l0.y);
      ctx.lineTo(r0.x, r0.y);
      ctx.lineTo(r1.x, r1.y);
      ctx.lineTo(l1.x, l1.y);
      ctx.closePath();
      ctx.fill();
      // River ribbon down the middle of the floor.
      const m0a = project(state, centre0 - 11, h0 + 0.6, z0, horizonY);
      const m0b = project(state, centre0 + 11, h0 + 0.6, z0, horizonY);
      const m1a = project(state, centre1 - 11, h1 + 0.6, z1, horizonY);
      const m1b = project(state, centre1 + 11, h1 + 0.6, z1, horizonY);
      if (m0a && m0b && m1a && m1b) {
        ctx.fillStyle = pal.river;
        ctx.beginPath();
        ctx.moveTo(m0a.x, m0a.y);
        ctx.lineTo(m0b.x, m0b.y);
        ctx.lineTo(m1b.x, m1b.y);
        ctx.lineTo(m1a.x, m1a.y);
        ctx.closePath();
        ctx.fill();
      }
      // Valley walls: floor edge up to a ridge line.
      const wallH = 300;
      const wl0 = project(state, centre0 - w0 - 260, h0 + wallH, z0, horizonY);
      const wl1 = project(state, centre1 - w1 - 260, h1 + wallH, z1, horizonY);
      const wr0 = project(state, centre0 + w0 + 260, h0 + wallH, z0, horizonY);
      const wr1 = project(state, centre1 + w1 + 260, h1 + wallH, z1, horizonY);
      ctx.fillStyle = pal.slope;
      if (wl0 && wl1) {
        ctx.beginPath();
        ctx.moveTo(l0.x, l0.y);
        ctx.lineTo(wl0.x, wl0.y);
        ctx.lineTo(wl1.x, wl1.y);
        ctx.lineTo(l1.x, l1.y);
        ctx.closePath();
        ctx.fill();
      }
      if (wr0 && wr1) {
        ctx.beginPath();
        ctx.moveTo(r0.x, r0.y);
        ctx.lineTo(wr0.x, wr0.y);
        ctx.lineTo(wr1.x, wr1.y);
        ctx.lineTo(r1.x, r1.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawTreesAndRocks(state, pal, horizonY) {
    const leg = state.leg;
    const items = [];
    for (const t of leg.trees) {
      if (t.z < state.pz + 12 || t.z > state.pz + 2400) continue;
      items.push({ kind: 'tree', ...t });
    }
    for (const r of leg.rocks) {
      if (r.z < state.pz + 12 || r.z > state.pz + 2400) continue;
      items.push({ kind: 'rock', ...r });
    }
    items.sort((a, b) => b.z - a.z); // far first
    for (const it of items) {
      const p = project(state, it.x, it.y, it.z, horizonY);
      if (!p || p.x < -60 || p.x > W + 60 || p.y > H + 40) continue;
      const s = p.s * it.s * 0.055;
      if (s < 1.5) continue;
      if (it.kind === 'tree') {
        ctx.fillStyle = pal.treeDark;
        ctx.fillRect(p.x - 1.5 * s, p.y - 6 * s, 3 * s, 6 * s);
        ctx.fillStyle = pal.tree;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 26 * s);
        ctx.lineTo(p.x - 11 * s, p.y - 4 * s);
        ctx.lineTo(p.x + 11 * s, p.y - 4 * s);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 34 * s);
        ctx.lineTo(p.x - 8 * s, p.y - 14 * s);
        ctx.lineTo(p.x + 8 * s, p.y - 14 * s);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#6b6f75';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 10 * s);
        ctx.lineTo(p.x - 9 * s, p.y);
        ctx.lineTo(p.x + 9 * s, p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRings(state, horizonY, t, showLabels) {
    const leg = state.leg;
    const rings = leg.rings.filter((r) => !r.got && r.z > state.pz + 10 && r.z < state.pz + 2600);
    rings.sort((a, b) => b.z - a.z);
    // Only the nearest ring ahead carries a distance tag: a tag on every ring
    // piles the numbers on top of each other.
    const nearest = rings.length > 0 ? rings[rings.length - 1] : null;
    for (const ring of rings) {
      const p = project(state, ring.x, ring.y, ring.z, horizonY);
      if (!p) continue;
      const rad = p.s * ring.r;
      if (rad < 2 || rad > 900) continue;
      const pulse = 0.75 + 0.25 * Math.sin(t * 3 + ring.z);
      ctx.lineWidth = Math.max(2, rad * 0.09);
      ctx.strokeStyle = `rgba(255,190,60,${0.35 * pulse})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(3, rad * 0.12);
      ctx.strokeStyle = '#ffc93c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, rad * 0.04);
      ctx.strokeStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 0.88, 0, Math.PI * 2);
      ctx.stroke();
      // Distance tag on the nearest ring only, and only while flying: on the
      // title screen it would show through the overlay.
      if (showLabels && ring === nearest && ring.z - state.pz > 500) {
        ctx.fillStyle = '#ffe9a8';
        ctx.font = `700 ${Math.max(11, Math.min(18, rad * 0.22))}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(ring.z - state.pz)} m`, p.x, p.y - rad - 8);
      }
    }
  }

  function drawRunway(state, pal, horizonY, t) {
    const leg = state.leg;
    const z0 = leg.runwayZ;
    const z1 = leg.runwayZ + leg.runwayLength;
    if (z1 < state.pz + 10 || z0 > state.pz + 2600) return;
    const c0 = leg.centre[Math.max(0, Math.min(leg.count - 1, Math.round(z0 / 40)))];
    const c1 = leg.centre[Math.max(0, Math.min(leg.count - 1, Math.round(z1 / 40)))];
    const h0 = leg.height[Math.max(0, Math.min(leg.count - 1, Math.round(z0 / 40)))];
    const h1 = leg.height[Math.max(0, Math.min(leg.count - 1, Math.round(z1 / 40)))];
    const a = project(state, c0 - 13, h0 + 0.8, z0, horizonY);
    const b = project(state, c0 + 13, h0 + 0.8, z0, horizonY);
    const c = project(state, c1 + 13, h1 + 0.8, z1, horizonY);
    const d = project(state, c1 - 13, h1 + 0.8, z1, horizonY);
    if (!a || !b || !c || !d) return;
    ctx.fillStyle = pal.runway;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.fillStyle = pal.runwayLine;
    for (let k = 0; k < 8; k += 1) {
      const zz = z0 + ((z1 - z0) * (k + 0.25)) / 8;
      const zz2 = z0 + ((z1 - z0) * (k + 0.75)) / 8;
      const cc = leg.centre[Math.max(0, Math.min(leg.count - 1, Math.round(zz / 40)))];
      const cc2 = leg.centre[Math.max(0, Math.min(leg.count - 1, Math.round(zz2 / 40)))];
      const hh = leg.height[Math.max(0, Math.min(leg.count - 1, Math.round(zz / 40)))];
      const hh2 = leg.height[Math.max(0, Math.min(leg.count - 1, Math.round(zz2 / 40)))];
      const p1 = project(state, cc - 1.2, hh + 1, zz, horizonY);
      const p2 = project(state, cc + 1.2, hh + 1, zz, horizonY);
      const p3 = project(state, cc2 + 1.2, hh2 + 1, zz2, horizonY);
      const p4 = project(state, cc2 - 1.2, hh2 + 1, zz2, horizonY);
      if (!p1 || !p2 || !p3 || !p4) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }
    // Threshold lights and a windsock at the near end.
    const blink = 0.6 + 0.4 * Math.sin(t * 4);
    for (const side of [-1, 1]) {
      const p = project(state, c0 + side * 15, h0 + 2, z0 - 6, horizonY);
      if (!p) continue;
      ctx.fillStyle = `rgba(80,255,140,${blink})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, p.s * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
    const ws = project(state, c0 + 26, h0 + 14, z0 + 30, horizonY);
    if (ws) {
      ctx.strokeStyle = '#e8e4d8';
      ctx.lineWidth = Math.max(1.5, ws.s * 0.5);
      ctx.beginPath();
      ctx.moveTo(ws.x, ws.y + 14 * ws.s * 0.4);
      ctx.lineTo(ws.x, ws.y);
      ctx.stroke();
      ctx.fillStyle = '#ff7a3c';
      ctx.beginPath();
      ctx.moveTo(ws.x, ws.y);
      ctx.lineTo(ws.x + 22 * ws.s * 0.4, ws.y + 3 * ws.s * 0.4);
      ctx.lineTo(ws.x, ws.y + 7 * ws.s * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    // "RWY 09" tag while it is far ahead.
    if (z0 - state.pz > 600) {
      const tag = project(state, c0, h0 + 26, z0, horizonY);
      if (tag) {
        ctx.fillStyle = '#ffe9a8';
        ctx.font = `700 ${Math.max(12, Math.min(20, tag.s * 2.2))}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('RUNWAY 09', tag.x, tag.y);
      }
    }
  }

  function drawPlane(state, t) {
    const bank = (state.bank * Math.PI) / 180;
    const x = PLANE_SCREEN.x;
    const y = PLANE_SCREEN.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank * 0.9);
    // Soft shadow blob under the plane for height cue.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 108, 130, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wings (rear 3/4 view): one long swept wing each side.
    ctx.fillStyle = '#c9402e';
    ctx.beginPath();
    ctx.moveTo(-14, 6);
    ctx.lineTo(-168, 26);
    ctx.lineTo(-172, 44);
    ctx.lineTo(-10, 30);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 6);
    ctx.lineTo(168, 26);
    ctx.lineTo(172, 44);
    ctx.lineTo(10, 30);
    ctx.closePath();
    ctx.fill();
    // Wing tip nav lights: red left, green right, white tail strobe blinking.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-170, 35, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#35e065';
    ctx.beginPath();
    ctx.arc(170, 35, 5, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(t * 6) > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 66, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Tailplane and fin.
    ctx.fillStyle = '#a93226';
    ctx.beginPath();
    ctx.moveTo(-52, 52);
    ctx.lineTo(-96, 66);
    ctx.lineTo(-92, 76);
    ctx.lineTo(-46, 66);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(52, 52);
    ctx.lineTo(96, 66);
    ctx.lineTo(92, 76);
    ctx.lineTo(46, 66);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-8, 44);
    ctx.lineTo(-16, -6);
    ctx.lineTo(16, -6);
    ctx.lineTo(8, 44);
    ctx.closePath();
    ctx.fill();
    // Fuselage: cream body, red cheatline, lit cockpit windows.
    ctx.fillStyle = '#f3ead2';
    ctx.beginPath();
    ctx.moveTo(-26, 78);
    ctx.quadraticCurveTo(-30, 20, -16, -14);
    ctx.quadraticCurveTo(0, -26, 16, -14);
    ctx.quadraticCurveTo(30, 20, 26, 78);
    ctx.quadraticCurveTo(0, 88, -26, 78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c9402e';
    ctx.fillRect(-27, 34, 54, 7);
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.roundRect(-15, -8, 30, 20, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,40,20,0.55)';
    ctx.beginPath();
    ctx.moveTo(-15, 2);
    ctx.lineTo(15, 2);
    ctx.lineTo(15, 12);
    ctx.lineTo(-15, 12);
    ctx.closePath();
    ctx.fill();
    // Propeller: spinning disc and blades above the nose.
    const propA = t * 22;
    ctx.save();
    ctx.translate(0, -30);
    ctx.rotate(propA);
    ctx.fillStyle = 'rgba(40,40,40,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(0, -30, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, -30, 6, 0, Math.PI * 2);
    ctx.fill();
    // Registration, short so it stays on the fuselage even when banked.
    ctx.fillStyle = '#5a4632';
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('RR-01', 0, 62);
    ctx.restore();
  }

  function panel(x, y, w, h, pal) {
    ctx.fillStyle = pal.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function drawHud(state, world, pal, t) {
    const altFt = world.altitudeFt();
    const spd = world.speedKts();
    const hdg = world.headingDeg();
    const vs = world.verticalSpeedFpm();
    ctx.textAlign = 'left';
    // Top-left: speed, altitude, vertical speed, score, lives.
    panel(18, 16, 208, 152, pal);
    ctx.fillStyle = pal.hud;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText('SPEED', 32, 40);
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(`${spd}`, 32, 74);
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText('KT', 108, 74);
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText('ALTITUDE', 32, 100);
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(`${altFt.toLocaleString('en-US')}`, 32, 128);
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText('FT', 148, 128);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = vs >= 0 ? '#9fe870' : '#ff9d7a';
    ctx.fillText(`V/S ${vs >= 0 ? '+' : ''}${vs} FPM`, 32, 152);
    ctx.fillStyle = pal.hud;
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(`SCORE ${state.score.toLocaleString('en-US')}`, 18, 190);
    ctx.fillStyle = '#ff5a4e';
    for (let i = 0; i < state.lives; i += 1) {
      ctx.beginPath();
      ctx.moveTo(24 + i * 26, 200);
      ctx.lineTo(38 + i * 26, 200);
      ctx.lineTo(44 + i * 26, 208);
      ctx.lineTo(31 + i * 26, 214);
      ctx.closePath();
      ctx.fill();
    }
    // Top-right: compass strip + heading.
    panel(W - 226, 16, 208, 78, pal);
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    ctx.save();
    ctx.beginPath();
    ctx.rect(W - 226, 16, 208, 78);
    ctx.clip();
    ctx.fillStyle = pal.hud;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 15) {
      const deg = ((hdg + d) % 360 + 360) % 360;
      const x = W - 122 + d * 1.7;
      const major = deg % 45 === 0;
      ctx.fillRect(x - 1, 52, 2, major ? 14 : 8);
      if (major) {
        const label = deg % 90 === 0 ? dirs[Math.round(deg / 45) % 8] : String(deg).padStart(3, '0');
        ctx.fillText(label, x, 42);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffc93c';
    ctx.beginPath();
    ctx.moveTo(W - 122, 30);
    ctx.lineTo(W - 116, 22);
    ctx.lineTo(W - 128, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.hud;
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${String(hdg).padStart(3, '0')}°`, W - 122, 88);
    ctx.textAlign = 'left';
    // Top-centre: mission + rings.
    const leg = state.leg.leg;
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.hud;
    ctx.font = `800 17px ${FONT}`;
    ctx.fillText(leg.name, W / 2, 38);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const ringsText = `RINGS ${state.ringsGot}/${state.ringsTotal}   ·   ${leg.brief.split('.')[0]}`;
    ctx.fillText(ringsText, W / 2, 58);
    ctx.textAlign = 'left';
    // Bottom-left: artificial horizon.
    const ahX = 92;
    const ahY = H - 92;
    const ahR = 56;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ahX, ahY, ahR, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(ahX, ahY);
    ctx.rotate((-state.bank * Math.PI) / 180);
    ctx.translate(0, clamp(state.pitch * 1.6, -ahR, ahR));
    ctx.fillStyle = '#4a90d9';
    ctx.fillRect(-ahR - 4, -ahR * 2 - 4, ahR * 2 + 8, ahR * 2 + 4);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-ahR - 4, 0, ahR * 2 + 8, ahR * 2 + 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-ahR, 0);
    ctx.lineTo(ahR, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = pal.hud;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ahX, ahY, ahR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffc93c';
    ctx.beginPath();
    ctx.moveTo(ahX - 22, ahY);
    ctx.lineTo(ahX - 6, ahY);
    ctx.lineTo(ahX, ahY + 6);
    ctx.lineTo(ahX + 6, ahY);
    ctx.lineTo(ahX + 22, ahY);
    ctx.lineTo(ahX + 6, ahY + 2);
    ctx.lineTo(ahX, ahY + 8);
    ctx.lineTo(ahX - 6, ahY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.hud;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', ahX, ahY + ahR + 16);
    ctx.textAlign = 'left';
    // Bottom-right: throttle + fuel. Percentages sit on the label rows, clear
    // of the bars.
    panel(W - 226, H - 108, 208, 92, pal);
    ctx.fillStyle = pal.hud;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('THROTTLE', W - 212, H - 84);
    ctx.fillText('FUEL', W - 212, H - 44);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(state.throttle * 100)}%`, W - 32, H - 84);
    ctx.fillText(`${Math.round(state.fuel * 100)}%`, W - 32, H - 44);
    ctx.textAlign = 'left';
    bar(W - 212, H - 74, 180, 12, state.throttle, '#ffc93c');
    bar(W - 212, H - 34, 180, 12, state.fuel, state.fuel < 0.25 ? '#ff5a4e' : '#7ee787');
    // Runway distance when close.
    const dist = world.distanceToRunwayM();
    if (dist < 2000 && dist > 0 && !state.landed) {
      ctx.fillStyle = '#ffe9a8';
      ctx.font = `800 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(
        `RUNWAY 09 — ${(dist / 1000).toFixed(1)} KM`,
        W / 2,
        H - 24,
      );
      ctx.textAlign = 'left';
    }
    // Centre message (warnings, ring pickups, touchdown).
    if (state.message && state.time < state.messageUntil) {
      const warn = /TERRAIN|STALL|FUEL/.test(state.message);
      ctx.fillStyle = warn && Math.sin(t * 10) > 0 ? '#ff5a4e' : '#ffe9a8';
      ctx.font = `800 24px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(state.message, W / 2, 116);
      ctx.textAlign = 'left';
    }
  }

  function bar(x, y, w, h, frac, col) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(4, w * clamp(frac, 0, 1)), h, 4);
    ctx.fill();
  }

  function overlay(title, lines, accent, foot) {
    ctx.fillStyle = 'rgba(8,12,24,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(title, W / 2, 210);
    ctx.fillStyle = '#f2ede0';
    ctx.font = `600 19px ${FONT}`;
    let y = 258;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += 30;
    }
    if (foot) {
      ctx.fillStyle = '#ffc93c';
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText(foot, W / 2, y + 26);
    }
    ctx.textAlign = 'left';
  }

  function drawTitle(state, best) {
    overlay(
      'RIDGE RUNNER',
      [
        'ALPINE AIR MAIL  ·  an original flight game',
        'Fly the Kestrel mail plane down three mountain valleys.',
        'Thread the golden rings, mind your fuel, and land on runway 09.',
        '',
        '↑ / ↓ or W / S  pitch      ← / → or A / D  bank & turn',
        'SHIFT / CTRL or wheel  throttle  ·  Mouse steers too  ·  SPACE airbrake',
        'P pause  ·  M mute  ·  R retry',
      ],
      '#ffe9a8',
      best > 0 ? `BEST SCORE ${best.toLocaleString('en-US')} — PRESS ENTER OR CLICK TO FLY` : 'PRESS ENTER OR CLICK TO FLY',
    );
  }

  function draw(screen, world, best, t) {
    const state = world.state;
    const pal = PALETTES[state.leg.leg.palette];
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 14 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 10 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    const horizonY = 300 + Math.tan((state.pitch * Math.PI) / 180) * FOCAL;
    // Fog wash over the low ground for depth.
    drawSky(state, pal, horizonY, t);
    drawRidges(state, pal, horizonY);
    drawClouds(state, pal, horizonY);
    drawTerrain(state, pal, horizonY);
    drawRunway(state, pal, horizonY, t);
    drawTreesAndRocks(state, pal, horizonY);
    drawRings(state, horizonY, t, screen === SCREEN_PLAY);
    ctx.fillStyle = pal.fog;
    ctx.fillRect(0, horizonY, W, H - horizonY);
    if (screen !== SCREEN_TITLE) drawPlane(state, t);
    else {
      // Title screen: the plane sits on the strip, parked, prop turning slow.
      const parked = { ...state, bank: 0, pitch: 0 };
      drawPlane(parked, t * 0.25);
    }
    ctx.restore();
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_CLEAR || screen === SCREEN_CRASH) {
      drawHud(state, world, pal, t);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Take a breath. The valley waits.', '', 'P or ENTER to keep flying'], '#eaf6ff', '');
    } else if (screen === SCREEN_CLEAR) {
      const leg = state.leg.leg;
      overlay(
        'SORTIE COMPLETE',
        [
          `${leg.name} — landed clean on runway 09.`,
          `Rings ${state.ringsGot}/${state.ringsTotal}  ·  Score ${state.score.toLocaleString('en-US')}`,
          state.legIndex + 1 < 3 ? 'Next: ' + world.legs[state.legIndex + 1].leg.brief : 'That was the last valley.',
        ],
        '#9fe870',
        state.legIndex + 1 < 3 ? 'PRESS ENTER FOR THE NEXT SORTIE' : 'PRESS ENTER FOR YOUR FINAL SCORE',
      );
    } else if (screen === SCREEN_CRASH) {
      overlay(
        'CRASHED',
        [
          state.crashReason || 'The Kestrel came down in the valley.',
          `Airframes left: ${state.lives}`,
          `Score ${state.score.toLocaleString('en-US')}`,
        ],
        '#ff5a4e',
        state.lives > 0 ? 'PRESS R TO FLY THE SORTIE AGAIN' : 'PRESS ENTER — OUT OF AIRFRAMES',
      );
    } else if (screen === SCREEN_WIN) {
      const rank =
        state.score >= 6000 ? 'LEGEND OF THE VALLEY' : state.score >= 4000 ? 'SKY COURIER' : 'MAIL PILOT';
      overlay(
        'ALL MAIL DELIVERED',
        [
          `Three valleys, three landings. Final score ${state.score.toLocaleString('en-US')}.`,
          `Rank: ${rank}`,
          best > 0 ? `Best score ${Math.max(best, state.score).toLocaleString('en-US')}` : '',
        ],
        '#ffc93c',
        'PRESS ENTER TO FLY AGAIN',
      );
    }
  }

  return { draw, resize };
}
