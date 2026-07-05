/* ============================================================
   audio.js
   Web Audio API によるアコースティックギター風ストローク音
   frets: ["x"|number, ...] 長さ6 (6弦=低いE → 1弦=高いe)
   低音弦から高音弦へわずかな時間差をつけて鳴らし、
   ジャカランというストローク感を再現する。
   ============================================================ */

const OPEN_STRING_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63]; // 6弦(E2)→1弦(E4)
const STRUM_STEP_SEC = 0.02; // 弦ごとのピッキング時間差
const PLUCK_DURATION_SEC = 1.7; // 1音の減衰にかける時間

let audioCtx = null;
let masterGain = null;
let currentVolume = 0.7;
let muted = false;

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : currentVolume;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function frequencyForString(stringIndex, fret) {
  return OPEN_STRING_FREQS[stringIndex] * Math.pow(2, fret / 12);
}

// サイン波+三角波を重ね、ローパスフィルターと指数減衰エンベロープで
// アコースティックな1音の「ポローン」を作る
function pluckString(ctx, destination, freq, startTime) {
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = freq;

  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = freq * 2;

  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.8;
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.16;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(4200, startTime);
  tone.frequency.exponentialRampToValueAtTime(700, startTime + PLUCK_DURATION_SEC);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(1, startTime + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + PLUCK_DURATION_SEC);

  body.connect(bodyGain);
  shimmer.connect(shimmerGain);
  bodyGain.connect(tone);
  shimmerGain.connect(tone);
  tone.connect(envelope);
  envelope.connect(destination);

  body.start(startTime);
  shimmer.start(startTime);
  body.stop(startTime + PLUCK_DURATION_SEC + 0.05);
  shimmer.stop(startTime + PLUCK_DURATION_SEC + 0.05);
}

// ミュート弦("x")は鳴らさず、低音弦(6弦)→高音弦(1弦)の順に少しずつ遅らせて再生
function playChordStrum(frets) {
  const ctx = ensureAudioContext();
  const now = ctx.currentTime;

  frets.forEach((fret, stringIndex) => {
    if (fret === "x") return;
    const freq = frequencyForString(stringIndex, fret);
    pluckString(ctx, masterGain, freq, now + stringIndex * STRUM_STEP_SEC);
  });
}

function setVolume(value) {
  currentVolume = Math.min(1, Math.max(0, value));
  if (masterGain && !muted) masterGain.gain.value = currentVolume;
}

function setMuted(next) {
  muted = next;
  if (masterGain) masterGain.gain.value = muted ? 0 : currentVolume;
}

function isMuted() {
  return muted;
}

function getVolume() {
  return currentVolume;
}
