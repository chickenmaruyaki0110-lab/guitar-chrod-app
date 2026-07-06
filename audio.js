/* ============================================================
   audio.js
   Web Audio API によるアコースティックギター風ストローク音
   ダイアグラム(フレット位置)ではなく、コードの理論的な構成音(ルート+度数+
   テンション+変化5度)から直接ピッチを計算して鳴らす。これにより、ギターでは
   正確に押さえきれない9th/13th/b5/#5等のテンションコードも、実際のコードと
   一致した音で「ポローン」と鳴らせるようにしている。
   ============================================================ */

const CHORD_ROOT_REGISTER_FREQ = 130.81; // ルート音の基準オクターブ(C3)。ここからの半音差で各音を配置する
const STRUM_STEP_SEC = 0.02; // 音ごとのピッキング時間差
const PLUCK_DURATION_SEC = 1.7; // 1音の減衰にかける時間

// テンション表記 → ルートからの半音差(オクターブ込みの実際の距離。9th/13th等は1オクターブ上に自然に配置される)
const TENSION_SEMITONES = {
  b9: 13, "9": 14, "#9": 15,
  "11": 17, "#11": 18,
  b13: 20, "13": 21,
};

// 完全5度(7半音)を置き換える(b5→6半音, #5→8半音)。カッコ内テンション表記("(b5)"等)からも、
// bare表記("-5"等)からも同じ意味で来ることがあるため、共通のヘルパーにまとめている。
function applyAlteredFifth(semitones, altered5) {
  const target = altered5 === "b5" ? 6 : 8;
  semitones.delete(7);
  semitones.add(target);
}

/**
 * コード品質(qualityKey) + 追加テンション + 変化5度から、ルートを0とした
 * 半音差の配列(重複なし・昇順)を求める。qualityKey が未対応の場合は
 * メジャートライアドで代用する(無音にはしない)。
 */
function computeChordSemitones(qualityKey, tensions, altered5) {
  const base = (CHORD_INTERVALS[qualityKey] || CHORD_INTERVALS.maj).slice();
  const semitones = new Set(base);

  if (altered5) applyAlteredFifth(semitones, altered5);

  (tensions || []).forEach((t) => {
    if (t === "b5" || t === "-5") {
      applyAlteredFifth(semitones, "b5");
      return;
    }
    if (t === "#5" || t === "+5") {
      applyAlteredFifth(semitones, "#5");
      return;
    }
    const value = TENSION_SEMITONES[t];
    if (value !== undefined) semitones.add(value);
  });

  return Array.from(semitones).sort((a, b) => a - b);
}

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
 * コードの構成音を低い音から高い音へ少しずつ遅らせて再生する(ジャカランというストローク感)。
 * root: ルート音名(例: "C", "F#")。qualityKey: コードの品質(未対応の場合はメジャーで代用)。
 * tensions: "(9,13)"等から抽出したテンション文字列の配列(省略可)。
 * altered5: "b5"|"#5"|null (省略可)。
 */
function playChordStrum(root, qualityKey, tensions, altered5) {
  const rootIndex = ROOT_NOTES.indexOf(root);
  if (rootIndex < 0) return;

  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  const semitones = computeChordSemitones(qualityKey, tensions, altered5);

  semitones.forEach((semitone, idx) => {
    const freq = CHORD_ROOT_REGISTER_FREQ * Math.pow(2, (rootIndex + semitone) / 12);
    pluckString(ctx, masterGain, freq, now + idx * STRUM_STEP_SEC);
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
