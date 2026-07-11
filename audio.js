/* ============================================================
   audio.js
   Web Audio API によるアコースティックギター風ストローク音
   frets配列 (6弦=低いE→1弦=高いe、"x"|-1=ミュート、0=開放、n=フレット番号) から、
   実際にギターで鳴る物理的な周波数を弦ごとに計算して再生する。
   コード名からの理論値計算ではなく、画面に表示されている「そのポジション」の
   実際の押さえ方をそのまま音にするため、ハイポジション等に切り替えれば
   再生されるピッチもそれに応じて変わる。
   ============================================================ */

// 標準チューニングの開放弦の基準周波数(Hz)。6弦(E2)→1弦(E4)の順
const GUITAR_OPEN_STRING_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

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

// 弦の開放周波数とフレット番号から、実際に鳴る周波数を物理式で求める: f = f_open * 2^(n/12)
function frequencyForFret(stringIndex, fret) {
  return GUITAR_OPEN_STRING_FREQS[stringIndex] * Math.pow(2, fret / 12);
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

/**
 * frets: ["x"|number, ...] 長さ6 (6弦→1弦)。ミュート("x"または-1)の弦は完全に除外し、
 * 低い弦から高い弦へ少しずつ時間差をつけて再生する(ジャカランというストローク感)。
 * 画面に表示されている実際のポジション(フレット配列)をそのまま渡すことで、
 * ローポジション/ハイポジションを切り替えれば鳴る音の高さもそれに応じて変わる。
 */
function playChordStrum(frets) {
  if (!Array.isArray(frets)) return;
  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  let step = 0;

  frets.forEach((fret, stringIndex) => {
    if (fret === "x" || fret === -1 || typeof fret !== "number" || fret < 0) return;
    const freq = frequencyForFret(stringIndex, fret);
    pluckString(ctx, masterGain, freq, now + step * STRUM_STEP_SEC);
    step++;
  });
}

// 開放弦の音高(半音番号、C=0基準)。ルート音がどの弦で鳴っているかを見つけるために使う。
// diagram.jsのOPEN_STRING_SEMITONESと同じ値だが、audio.jsを独立して動かせるようここでも保持する。
const OPEN_STRING_SEMITONES_FOR_AUDIO = [4, 9, 2, 7, 11, 4]; // E, A, D, G, B, E
const ROOT_FIRST_LEAD_SEC = 0.16; // ルート音を「ジャスト」で鳴らしてから、残りの弦が追いかけてくるまでの間

/**
 * 【練習ドリル用】Root-First(ルート先行)アルペジオ再生。
 * frets配列の中から、指定したルート音を鳴らしている最も低い弦を1本特定し、
 * それだけをt=0で「ジャスト」に鳴らす。残りの弦はそこから少し間を置いて、
 * 通常のストロークと同様に低い弦から高い弦へ時間差で追いかけるように鳴らす。
 * ルート音を鳴らしている弦が見つからない場合は、通常のストローク再生にフォールバックする。
 */
function playChordRootFirst(frets, rootNoteName) {
  if (!Array.isArray(frets)) return;
  const rootSemitone = ROOT_NOTES.indexOf(rootNoteName);
  if (rootSemitone < 0) {
    playChordStrum(frets);
    return;
  }

  let rootStringIndex = -1;
  for (let i = 0; i < frets.length; i++) {
    const f = frets[i];
    if (f === "x" || f === -1 || typeof f !== "number" || f < 0) continue;
    const noteSemitone = (OPEN_STRING_SEMITONES_FOR_AUDIO[i] + f) % 12;
    if (noteSemitone === rootSemitone) {
      rootStringIndex = i;
      break;
    }
  }

  if (rootStringIndex < 0) {
    playChordStrum(frets);
    return;
  }

  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  let step = 0;

  frets.forEach((fret, stringIndex) => {
    if (fret === "x" || fret === -1 || typeof fret !== "number" || fret < 0) return;
    const freq = frequencyForFret(stringIndex, fret);
    if (stringIndex === rootStringIndex) {
      pluckString(ctx, masterGain, freq, now); // ルートはジャストで先に
    } else {
      pluckString(ctx, masterGain, freq, now + ROOT_FIRST_LEAD_SEC + step * STRUM_STEP_SEC);
      step++;
    }
  });
}

/**
 * 【練習ドリル用】メトロノームの短いクリック音。1分間コードチェンジ・カウンターの
 * テンポガイドとして使う、アコースティックな弦音とは別の短い電子音。
 */
function playMetronomeClick(accent) {
  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = accent ? 1400 : 1000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.06);
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
