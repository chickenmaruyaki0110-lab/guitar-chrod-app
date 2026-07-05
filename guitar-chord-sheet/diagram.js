/* ============================================================
   diagram.js
   frets配列 (6弦→1弦, 数値/'x') から SVG のコードダイアグラムを生成する
   ============================================================ */

const DIAGRAM_ROWS = 4; // 表示するフレット数(段数)

// 開放弦の音高(半音番号、C=0基準)。6弦(低いE)→1弦(高いe)の順
const OPEN_STRING_SEMITONES = [4, 9, 2, 7, 11, 4]; // E, A, D, G, B, E

// ルートからの半音差 → 度数表示ラベル(学習用に簡略化。長短は区別せず「3」「7」等で表示)
const INTERVAL_DEGREE_LABELS = {
  0: "R",
  1: "♭9",
  2: "9",
  3: "3",
  4: "3",
  5: "4",
  6: "♭5",
  7: "5",
  8: "♯5",
  9: "6",
  10: "7",
  11: "7",
};

/**
 * frets: ["x"|number, ...] 長さ6 (6弦→1弦)
 * options.compact: true の場合は小さいサムネイル用の簡略SVGを返す
 * options.root: ルート音名(例: "C", "F#")。指定すると各押さえ位置に度数(R/3/5/7等)を表示し、
 *               ルート音の丸だけ色を変えて強調する(音楽理論の学習用)
 * options.bass: オンコード(分数コード、例: CM7/G)のベース音名。この音を鳴らしている中で最も低い
 *               弦(開放弦も含む)を「ベース音」として強調表示する(押さえ方自体は変えない)
 */
function renderChordSvg(frets, options = {}) {
  const compact = !!options.compact;
  const rootSemitone = options.root ? ROOT_NOTES.indexOf(options.root) : -1;
  const bassSemitone = options.bass ? ROOT_NOTES.indexOf(options.bass) : -1;

  // 指定の弦・フレットの音が、ルートから見て何度にあたるかを求める
  function degreeInfo(stringIndex, fret) {
    if (rootSemitone < 0) return null;
    const noteSemitone = (OPEN_STRING_SEMITONES[stringIndex] + fret) % 12;
    const interval = (noteSemitone - rootSemitone + 12) % 12;
    return { isRoot: interval === 0, label: INTERVAL_DEGREE_LABELS[interval] };
  }

  // オンコードのベース音と同じ音を鳴らしている、最も低い(=最初に見つかる)弦を1本だけ特定する
  let bassStringIndex = -1;
  if (bassSemitone >= 0) {
    for (let i = 0; i < frets.length; i++) {
      const f = frets[i];
      if (typeof f !== "number" || f < 0) continue; // "x"はスキップ、開放(0)は対象に含める
      const noteSemitone = (OPEN_STRING_SEMITONES[i] + f) % 12;
      if (noteSemitone === bassSemitone) {
        bassStringIndex = i;
        break;
      }
    }
  }

  const W = compact ? 72 : 168;
  const H = compact ? 88 : 208;
  const padTop = compact ? 18 : 34;
  const padSide = compact ? 16 : 22;
  const stringGap = (W - padSide * 2) / 5;
  const rowGap = compact ? 16 : 34;

  const numericFrets = frets.filter((f) => typeof f === "number" && f > 0);
  const maxFret = numericFrets.length ? Math.max(...numericFrets) : 0;
  const minFret = numericFrets.length ? Math.min(...numericFrets) : 0;

  // 開放弦(0)を含む場合は必ずナット(1フレット目)から表示する。
  // 開放弦がなければ、実際に押さえている最低フレットから表示する(バレーコード対応)。
  const hasOpenString = frets.some((f) => f === 0);
  let baseFret = hasOpenString ? 1 : minFret > 1 ? minFret : 1;

  // バレー検出: ミュートされていない最初/最後の弦が baseFret と同じ値なら barre とみなす
  let barre = null;
  const nonMutedIdx = [];
  frets.forEach((f, i) => {
    if (f !== "x") nonMutedIdx.push(i);
  });
  if (nonMutedIdx.length >= 2 && baseFret > 0) {
    const first = nonMutedIdx[0];
    const last = nonMutedIdx[nonMutedIdx.length - 1];
    if (frets[first] === baseFret && frets[last] === baseFret && last - first >= 2) {
      barre = { from: first, to: last, fret: baseFret };
    }
  }

  const stringX = (i) => padSide + i * stringGap;
  const rowY = (row) => padTop + row * rowGap; // row: 0 = ナット(または基準フレット)の線

  let svg = "";
  svg += `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chord-svg${compact ? " compact" : ""}">`;

  // フレット位置の数字（ローコード/開放形では表示せず、ハイコード時のみ最上段の高さに揃えて表示）
  if (baseFret > 1) {
    const labelX = padSide - (compact ? 5 : 7);
    const labelY = rowY(0) + rowGap / 2;
    // 2桁(10フレット以上)は幅が増えるので、はみ出さないよう一段小さいフォントサイズを使う
    const labelClass = baseFret >= 10 ? "fret-label two-digit" : "fret-label";
    svg += `<text x="${labelX}" y="${labelY}" class="${labelClass}" text-anchor="end" dominant-baseline="central">${baseFret}</text>`;
  }

  // ナット（1フレット開始の時だけ太線）
  const nutWidth = baseFret === 1 ? (compact ? 3 : 5) : (compact ? 1 : 1.5);
  svg += `<line x1="${stringX(0)}" y1="${rowY(0)}" x2="${stringX(5)}" y2="${rowY(0)}" class="fret-line nut" stroke-width="${nutWidth}" />`;

  // フレット横線
  for (let r = 1; r <= DIAGRAM_ROWS; r++) {
    svg += `<line x1="${stringX(0)}" y1="${rowY(r)}" x2="${stringX(5)}" y2="${rowY(r)}" class="fret-line" />`;
  }

  // 弦の縦線
  for (let i = 0; i < 6; i++) {
    svg += `<line x1="${stringX(i)}" y1="${rowY(0)}" x2="${stringX(i)}" y2="${rowY(DIAGRAM_ROWS)}" class="string-line" />`;
  }

  // 開放弦(o) / ミュート(x) の記号
  frets.forEach((f, i) => {
    const x = stringX(i);
    const y = rowY(0) - (compact ? 7 : 12);
    if (f === "x") {
      svg += `<text x="${x}" y="${y}" class="mute-mark" text-anchor="middle">×</text>`;
    } else if (f === 0) {
      const openMarkClass = i === bassStringIndex ? "open-mark bass-note" : "open-mark";
      svg += `<text x="${x}" y="${y}" class="${openMarkClass}" text-anchor="middle">○</text>`;
    }
  });

  // バレー(セーハ)の帯
  if (barre) {
    const row = barre.fret - baseFret;
    const y = rowY(row) + rowGap / 2;
    const x1 = stringX(barre.from);
    const x2 = stringX(barre.to);
    const r = compact ? 5 : 9;
    svg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="barre-bar" stroke-width="${r * 2}" stroke-linecap="round" />`;
  }

  // 各フレットの押さえる位置（丸ポイント）。バレーで覆われている弦も、
  // 帯の上に重ねて個別の丸+度数を表示する(学習用に、どの弦がどの度数かを見せるため)。
  frets.forEach((f, i) => {
    if (typeof f !== "number" || f <= 0) return;
    const row = f - baseFret;
    if (row < 0 || row > DIAGRAM_ROWS - 1) return;
    const x = stringX(i);
    const y = rowY(row) + rowGap / 2;
    const r = compact ? 5 : 9;
    const degree = degreeInfo(i, f);
    let dotClass = degree && degree.isRoot ? "finger-dot root" : "finger-dot";
    if (i === bassStringIndex) dotClass += " bass-note";
    svg += `<circle cx="${x}" cy="${y}" r="${r}" class="${dotClass}" />`;
    if (degree) {
      svg += `<text x="${x}" y="${y}" class="degree-label" text-anchor="middle" dominant-baseline="central">${degree.label}</text>`;
    }
  });

  svg += `</svg>`;
  return svg;
}
