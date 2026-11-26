// Keyboard + mouse, read once a frame: the stick (-1..1 pitch and bank), the
// throttle target (-1 idle .. 1 full), the airbrake, and the edge-triggered
// actions (confirm, pause, mute, restart).
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  // Mouse steering: the pointer's offset from the centre of the screen is the
  // stick while the mouse has moved recently; keys always override it.
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;
  let mouseAt = 0;
  let wheelDelta = 0;

  function keyName(event) {
    // Lowercase everything: 'Enter', 'ArrowUp', 'Shift' and ' ' must match the
    // lowercase names the controls check for.
    return event.key.toLowerCase();
  }

  function onKeyDown(event) {
    const k = keyName(event);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(k);
    if (k === 'enter' || k === ' ') actions |= ACTION_CONFIRM;
    if (k === 'p' || k === 'escape') actions |= ACTION_PAUSE;
    if (k === 'm') actions |= ACTION_MUTE;
    if (k === 'r') actions |= ACTION_RESTART;
  }

  function onKeyUp(event) {
    keys.delete(keyName(event));
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    mouseY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    mouseActive = true;
    mouseAt = performance.now();
  }

  function onWheel(event) {
    event.preventDefault();
    wheelDelta += event.deltaY < 0 ? 0.12 : -0.12;
  }

  function onMouseDown() {
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);

  let throttle = 0.24; // throttle target, -1..1; starts at a cruise setting

  return {
    /** The stick and throttle for this frame. */
    control() {
      const up = keys.has('arrowup') || keys.has('w');
      const down = keys.has('arrowdown') || keys.has('s');
      const left = keys.has('arrowleft') || keys.has('a');
      const right = keys.has('arrowright') || keys.has('d');
      // Up is climb, down is descend: the arcade way, not the stick way.
      let pitch = (up ? 1 : 0) - (down ? 1 : 0);
      let bank = (right ? 1 : 0) - (left ? 1 : 0);
      const keysUsed = up || down || left || right;
      if (!keysUsed && mouseActive && performance.now() - mouseAt < 4000) {
        // Mouse: push the stick toward the pointer; up on screen is nose up.
        pitch = Math.max(-1, Math.min(1, -mouseY * 1.6));
        bank = Math.max(-1, Math.min(1, mouseX * 1.6));
      }
      if (keys.has('shift')) throttle = Math.min(1, throttle + 0.02);
      if (keys.has('control')) throttle = Math.max(-1, throttle - 0.02);
      if (wheelDelta !== 0) {
        throttle = Math.max(-1, Math.min(1, throttle + wheelDelta));
        wheelDelta = 0;
      }
      return {
        pitch,
        bank,
        throttle,
        brake: keys.has(' '),
      };
    },
    /** Edge-triggered actions since the last call; clears them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** A fresh start puts the throttle back at cruise. */
    resetThrottle() {
      throttle = 0.24;
    },
  };
}
