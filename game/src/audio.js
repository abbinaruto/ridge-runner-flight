// Procedural sound, all synthesized with WebAudio — no audio files. The engine
// is two detuned saws through a lowpass, the wind is looped noise whose gain
// follows speed, and the ring, touchdown and crash are short envelopes.
export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two saws a few Hz apart, lowpassed, quiet.
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engine = [ctx.createOscillator(), ctx.createOscillator()];
      engine[0].type = 'sawtooth';
      engine[0].frequency.value = 62;
      engine[1].type = 'sawtooth';
      engine[1].frequency.value = 65.5;
      for (const osc of engine) {
        osc.connect(filter);
        osc.start();
      }
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      // Wind: a 2 s noise buffer looped through a bandpass.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      noise.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  return {
    /** Start the audio graph on the first user gesture; safe to call twice. */
    start() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') void ctx.resume();
    },
    /** Continuous engine + wind levels, called every frame while flying. */
    update(throttle, speed, flying) {
      if (!ctx || !started || muted) return;
      const target = flying ? 0.05 + throttle * 0.075 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const f = 52 + throttle * 46 + speed * 0.12;
      engine[0].frequency.setTargetAtTime(f, ctx.currentTime, 0.1);
      engine[1].frequency.setTargetAtTime(f * 1.056, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.14, speed * 0.0006) : 0, ctx.currentTime, 0.15);
      windFilter.frequency.setTargetAtTime(400 + speed * 4, ctx.currentTime, 0.15);
    },
    ring() {
      tone(880, 0.22, 'sine', 0.22);
      tone(1318, 0.3, 'sine', 0.18, 0.07);
    },
    land() {
      tone(196, 0.4, 'sine', 0.3);
      noiseBurst(0.25, 0.2, 300);
    },
    crash() {
      noiseBurst(0.9, 0.5, 900);
      tone(55, 0.8, 'sawtooth', 0.25);
    },
    click() {
      tone(660, 0.08, 'square', 0.08);
    },
    toggleMute() {
      muted = !muted;
      if (ctx && muted) {
        engineGain.gain.value = 0;
        windGain.gain.value = 0;
      }
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
