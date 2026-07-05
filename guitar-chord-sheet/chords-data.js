/* ============================================================
   chords-data.js
   コードの押さえ方（フォーム）データと自動生成ロジック
   弦の並びは常に「6弦(低いE)→1弦(高いe)」の順の配列で扱う
   例: [E, A, D, G, B, e]
   値: 数値 = 押さえるフレット / 0 = 開放 / 'x' = ミュート(弾かない)
   ============================================================ */

// ルート音（表示・入力に使う12音、シャープ表記）
const ROOT_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// テンション（コードの種類）。key = 内部識別子 / label = コード名に付く文字列 / desc = 短い説明
const QUALITIES = [
  { key: "maj",  label: "",     desc: "メジャー" },
  { key: "m",    label: "m",    desc: "マイナー" },
  { key: "7",    label: "7",    desc: "セブンス" },
  { key: "m7",   label: "m7",   desc: "マイナーセブンス" },
  { key: "maj7", label: "maj7", desc: "メジャーセブンス" },
  { key: "sus4", label: "sus4", desc: "サスフォー" },
  { key: "6",    label: "6",    desc: "シックス" },
  { key: "m6",   label: "m6",   desc: "マイナーシックス" },
  { key: "dim",  label: "dim",  desc: "ディミニッシュ" },
  { key: "aug",  label: "aug",  desc: "オーギュメント" },
  { key: "9",    label: "9",    desc: "ナインス" },
];

// クロマチック(半音階) 各弦の開放弦を起点にした音名リスト。何フレット目がそのルート音かを調べるために使う。
const E_CHROMATIC = ["E", "F", "F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#"]; // 6弦(E)基準
const A_CHROMATIC = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"]; // 5弦(A)基準

/* ---------- movable shape（バレーコードの型）オフセット ----------
   6弦(or5弦)を0フレットとした「相対フレット」。null=ミュート。
   E型: 6弦にルート。A型: 5弦にルート(6弦は常にミュート)。
   実際の押さえるフレット = バレーの位置(=ルートのフレット) + オフセット
*/
const E_SHAPE_OFFSETS = {
  maj:  [0, 2, 2, 1, 0, 0],
  m:    [0, 2, 2, 0, 0, 0],
  "7":  [0, 2, 0, 1, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  m7:   [0, 2, 0, 0, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  "6":  [0, 2, 2, 1, 2, 0],
  m6:   [0, 2, 1, 0, 2, 0],
  dim:  [0, 1, 2, 0, 1, null],
  aug:  [0, 3, 2, 1, 1, 0],
  "9":  [0, 2, 0, 1, 0, 2],
};

const A_SHAPE_OFFSETS = {
  maj:  [null, 0, 2, 2, 2, 0],
  m:    [null, 0, 2, 2, 1, 0],
  "7":  [null, 0, 2, 0, 2, 0],
  maj7: [null, 0, 2, 1, 2, 0],
  m7:   [null, 0, 2, 0, 1, 0],
  sus4: [null, 0, 2, 2, 3, 0],
  "6":  [null, 0, 2, 2, 2, 2],
  m6:   [null, 0, 2, 1, 2, 2],
  dim:  [null, 0, 1, 2, 1, null],
  aug:  [null, 0, 3, 2, 2, 1],
  "9":  [null, 0, 2, 3, 2, 0],
};

/* ---------- よく使う「開放形」コードの手打ちデータ ----------
   初心者が最も目にする形（オープンコード）は自動生成だと不自然になりがちなので、
   代表的な7つのルート(C,D,E,F,G,A,B) × 主要5種は手動で正確な形を用意する。
   それ以外のルート・テンションは自動生成(movable shape)にフォールバックする。
*/
const MANUAL_CHORDS = {
  // --- C ---
  "C_maj":  [ "x", 3, 2, 0, 1, 0 ],
  "C_m":    [ "x", 3, 5, 5, 4, 3 ],
  "C_7":    [ "x", 3, 2, 3, 1, 0 ],
  "C_maj7": [ "x", 3, 2, 0, 0, 0 ],
  "C_m7":   [ "x", 3, 5, 3, 4, 3 ],
  // --- D ---
  "D_maj":  [ "x", "x", 0, 2, 3, 2 ],
  "D_m":    [ "x", "x", 0, 2, 3, 1 ],
  "D_7":    [ "x", "x", 0, 2, 1, 2 ],
  "D_maj7": [ "x", "x", 0, 2, 2, 2 ],
  "D_m7":   [ "x", "x", 0, 2, 1, 1 ],
  // --- E ---
  "E_maj":  [ 0, 2, 2, 1, 0, 0 ],
  "E_m":    [ 0, 2, 2, 0, 0, 0 ],
  "E_7":    [ 0, 2, 0, 1, 0, 0 ],
  "E_maj7": [ 0, 2, 1, 1, 0, 0 ],
  "E_m7":   [ 0, 2, 0, 0, 0, 0 ],
  // --- F ---
  "F_maj":  [ 1, 3, 3, 2, 1, 1 ],
  "F_m":    [ 1, 3, 3, 1, 1, 1 ],
  "F_7":    [ 1, 3, 1, 2, 1, 1 ],
  "F_maj7": [ "x", "x", 3, 2, 1, 0 ],
  "F_m7":   [ 1, 3, 1, 1, 1, 1 ],
  // --- G ---
  "G_maj":  [ 3, 2, 0, 0, 0, 3 ],
  "G_m":    [ 3, 5, 5, 3, 3, 3 ],
  "G_7":    [ 3, 2, 0, 0, 0, 1 ],
  "G_maj7": [ 3, 2, 0, 0, 0, 2 ],
  "G_m7":   [ 3, 5, 3, 3, 3, 3 ],
  // --- A ---
  "A_maj":  [ "x", 0, 2, 2, 2, 0 ],
  "A_m":    [ "x", 0, 2, 2, 1, 0 ],
  "A_7":    [ "x", 0, 2, 0, 2, 0 ],
  "A_maj7": [ "x", 0, 2, 1, 2, 0 ],
  "A_m7":   [ "x", 0, 2, 0, 1, 0 ],
  // --- B ---
  "B_maj":  [ "x", 2, 4, 4, 4, 2 ],
  "B_m":    [ "x", 2, 4, 4, 3, 2 ],
  "B_7":    [ "x", 2, 1, 2, 0, 2 ],
  "B_maj7": [ "x", 2, 4, 3, 4, 2 ],
  "B_m7":   [ "x", 2, 0, 2, 0, 2 ],
};

// frets配列から実際にダイアグラムが表示を始めるフレット(基準フレット)を求める。
// diagram.js の baseFret 計算と揃えることで、フォーム一覧の並び順と表示が一致する。
function computeBaseFret(frets) {
  const numericFrets = frets.filter((f) => typeof f === "number" && f > 0);
  const minFret = numericFrets.length ? Math.min(...numericFrets) : 0;
  const hasOpenString = frets.some((f) => f === 0);
  return hasOpenString ? 1 : minFret > 1 ? minFret : 1;
}

/**
 * ルート音とテンションから「押さえ方のバリエーション」を一覧で取得する。
 * 1) 手打ちデータ(MANUAL_CHORDS、ローポジション)があれば先頭候補として含める
 * 2) A型・E型のムーバブルシェイプ(バレーコード)も別ポジションとして含める
 * 同じ押さえ方が重複する場合は1つにまとめ、基準フレットの低い順(ローポジション→ハイポジション)に並べる。
 */
function getChordFretVariants(root, qualityKey) {
  const variants = [];
  const seen = new Set();

  function addVariant(frets, manual) {
    const key = frets.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    const baseFret = computeBaseFret(frets);
    variants.push({
      frets: frets.slice(),
      baseFret,
      manual,
      label: baseFret <= 1 ? "ローポジション" : `${baseFret}フレット付近`,
    });
  }

  const manualKey = `${root}_${qualityKey}`;
  if (MANUAL_CHORDS[manualKey]) {
    addVariant(MANUAL_CHORDS[manualKey], true);
  }

  const idxA = A_CHROMATIC.indexOf(root);
  const idxE = E_CHROMATIC.indexOf(root);
  const aOffsets = A_SHAPE_OFFSETS[qualityKey] || A_SHAPE_OFFSETS.maj;
  const eOffsets = E_SHAPE_OFFSETS[qualityKey] || E_SHAPE_OFFSETS.maj;

  if (idxA >= 0) {
    addVariant(aOffsets.map((o) => (o === null ? "x" : o + idxA)), false);
  }
  if (idxE >= 0) {
    addVariant(eOffsets.map((o) => (o === null ? "x" : o + idxE)), false);
  }

  variants.sort((a, b) => a.baseFret - b.baseFret);
  return variants;
}

/**
 * ルート音とテンションから押さえ方(6要素配列)を取得する(先頭=最もローポジションのフォーム)。
 */
function getChordFrets(root, qualityKey) {
  const variants = getChordFretVariants(root, qualityKey);
  const first = variants[0];
  return { frets: first.frets.slice(), generated: !first.manual };
}

/** コード名の文字列を作る（例: "C", "Am7", "F#dim"） */
function buildChordName(root, qualityKey) {
  const q = QUALITIES.find((q) => q.key === qualityKey);
  return `${root}${q ? q.label : ""}`;
}
