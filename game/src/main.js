// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play,
// paused, sortie clear, crash and win.
//
// ?seed=N fixes the valley. ?shot=start|play|ring|land (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_LANDED, EVENT_OVER, EVENT_RING } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_CLEAR,
  SCREEN_CRASH,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(scene.screen, world, scene.best, world.state.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.start();
    audio.click();
    world.reset();
    input.resetThrottle();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Flying sortie 1. Thread the rings, then land on runway 09.`);
  }

  function endGame(win) {
    screen = win ? SCREEN_WIN : SCREEN_CRASH;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(win ? `All mail delivered. Score ${world.state.score}.` : `Crashed. Score ${world.state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_CRASH)) {
      audio.start();
      world.retryLeg();
      input.resetThrottle();
      screen = SCREEN_PLAY;
      announce('Sortie restarted.');
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_CLEAR) {
        if (world.nextLeg()) {
          input.resetThrottle();
          screen = SCREEN_PLAY;
          announce(`Flying ${world.state.leg.leg.name}.`);
        } else {
          endGame(true);
        }
      } else if (screen === SCREEN_CRASH) {
        if (world.state.lives > 0) {
          world.retryLeg();
          input.resetThrottle();
          screen = SCREEN_PLAY;
        } else {
          endGame(false);
        }
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { pitch: 0, bank: 0, throttle: 0, brake: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, input.control(), false);
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_LANDED) {
      audio.land();
      screen = SCREEN_CLEAR;
      announce('Landed. Sortie complete.');
    } else if (events & EVENT_CRASH) {
      audio.crash();
      screen = SCREEN_CRASH;
      announce(`Crashed: ${world.state.crashReason}`);
      if (events & EVENT_OVER) announce('Out of airframes.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.update(world.state.throttle, world.state.speed, screen === SCREEN_PLAY);
    renderer.draw(screen, world, best, world.state.time);
  }

  // Leaving the tab pauses a running game rather than letting it fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Ridge Runner. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
