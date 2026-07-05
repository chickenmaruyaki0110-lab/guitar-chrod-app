/* ============================================================
   app.js
   UIの状態管理、タイムライン操作、LocalStorageへの保存/読込
   ============================================================ */

const STORAGE_KEY = "chordSheetApp.songs";
const DRAFT_KEY = "chordSheetApp.draft";

const state = {
  root: "C",
  qualityKey: "maj",
  variantIndex: 0,    // ビルダーで選んでいる押さえ方のバリエーション(フォーム)の番号
  timeline: [],       // {id, type: 'segment'|'linebreak', root?, qualityKey?, name?, lyricText?, variantIndex?}
  currentSongId: null,
  mode: "edit",       // 'edit' | 'preview'
};

// item.root/qualityKey から使えるフォーム一覧と、item.variantIndex が指す現在のフォームを取得する
function getItemVariants(item) {
  return getChordFretVariants(item.root, item.qualityKey);
}
function clampVariantIndex(index, length) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/* ---------- DOM参照 ---------- */
const el = {
  rootGrid: document.getElementById("rootGrid"),
  qualityGrid: document.getElementById("qualityGrid"),
  previewName: document.getElementById("previewName"),
  previewDiagram: document.getElementById("previewDiagram"),
  previewNote: document.getElementById("previewNote"),
  addChordBtn: document.getElementById("addChordBtn"),
  lyricInput: document.getElementById("lyricInput"),
  addLyricBtn: document.getElementById("addLyricBtn"),
  addLineBreakBtn: document.getElementById("addLineBreakBtn"),
  timelineEdit: document.getElementById("timelineEdit"),
  timelinePreview: document.getElementById("timelinePreview"),
  editModeBtn: document.getElementById("editModeBtn"),
  previewModeBtn: document.getElementById("previewModeBtn"),
  songTitleInput: document.getElementById("songTitleInput"),
  newSongBtn: document.getElementById("newSongBtn"),
  saveSongBtn: document.getElementById("saveSongBtn"),
  openListBtn: document.getElementById("openListBtn"),
  songListModal: document.getElementById("songListModal"),
  modalOverlay: document.getElementById("modalOverlay"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  songListBody: document.getElementById("songListBody"),
  toast: document.getElementById("toast"),
  chordPopup: document.getElementById("chordPopup"),
  chordPopupName: document.getElementById("chordPopupName"),
  chordPopupDiagram: document.getElementById("chordPopupDiagram"),
  muteBtn: document.getElementById("muteBtn"),
  volumeSlider: document.getElementById("volumeSlider"),
  openImportBtn: document.getElementById("openImportBtn"),
  importModal: document.getElementById("importModal"),
  importOverlay: document.getElementById("importOverlay"),
  closeImportBtn: document.getElementById("closeImportBtn"),
  importTextarea: document.getElementById("importTextarea"),
  generateImportBtn: document.getElementById("generateImportBtn"),
  variantPrevBtn: document.getElementById("variantPrevBtn"),
  variantNextBtn: document.getElementById("variantNextBtn"),
  variantLabel: document.getElementById("variantLabel"),
  popupVariantPrevBtn: document.getElementById("popupVariantPrevBtn"),
  popupVariantNextBtn: document.getElementById("popupVariantNextBtn"),
  popupVariantLabel: document.getElementById("popupVariantLabel"),
};

/* ---------- ユーティリティ ---------- */
function uid() {
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let toastTimer = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2200);
}

/* ============================================================
   コードビルダー（ルート / テンション選択 & プレビュー）
   ============================================================ */
function renderRootGrid() {
  el.rootGrid.innerHTML = ROOT_NOTES.map(
    (note) =>
      `<button type="button" class="chip-btn root-btn" data-root="${note}">${note}</button>`
  ).join("");
  syncActiveButtons();
}

function renderQualityGrid() {
  el.qualityGrid.innerHTML = QUALITIES.map(
    (q) =>
      `<button type="button" class="chip-btn quality-btn" data-quality="${q.key}" title="${q.desc}">${
        q.label === "" ? "maj" : q.label
      }</button>`
  ).join("");
  syncActiveButtons();
}

function syncActiveButtons() {
  el.rootGrid.querySelectorAll(".root-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.root === state.root);
  });
  el.qualityGrid.querySelectorAll(".quality-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.quality === state.qualityKey);
  });
}

function currentBuilderVariants() {
  return getChordFretVariants(state.root, state.qualityKey);
}

function updatePreview() {
  const variants = currentBuilderVariants();
  state.variantIndex = clampVariantIndex(state.variantIndex, variants.length);
  const variant = variants[state.variantIndex];
  const name = buildChordName(state.root, state.qualityKey);

  el.previewName.textContent = name;
  el.previewDiagram.innerHTML = renderChordSvg(variant.frets, { compact: false, root: state.root });
  el.previewNote.textContent = variant.manual
    ? ""
    : "※ このフォームは自動生成された参考の押さえ方です";

  el.variantLabel.textContent = variants.length > 1 ? `${variant.label}（${state.variantIndex + 1}/${variants.length}）` : variant.label;
  el.variantPrevBtn.disabled = variants.length <= 1;
  el.variantNextBtn.disabled = variants.length <= 1;
}

el.rootGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".root-btn");
  if (!btn) return;
  state.root = btn.dataset.root;
  state.variantIndex = 0;
  syncActiveButtons();
  updatePreview();
  saveDraft();
});

el.qualityGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".quality-btn");
  if (!btn) return;
  state.qualityKey = btn.dataset.quality;
  state.variantIndex = 0;
  syncActiveButtons();
  updatePreview();
  saveDraft();
});

// フォーム(押さえ方のポジション)を切り替える
el.variantPrevBtn.addEventListener("click", () => {
  const variants = currentBuilderVariants();
  state.variantIndex = clampVariantIndex(state.variantIndex - 1, variants.length);
  updatePreview();
  saveDraft();
});
el.variantNextBtn.addEventListener("click", () => {
  const variants = currentBuilderVariants();
  state.variantIndex = clampVariantIndex(state.variantIndex + 1, variants.length);
  updatePreview();
  saveDraft();
});

// ビルダーのダイアグラムをクリックしたら、今選んでいるコードの音を鳴らす
el.previewDiagram.addEventListener("click", () => {
  const variants = currentBuilderVariants();
  playChordStrum(variants[state.variantIndex].frets);
});

// コード + 歌詞をセットでタイムラインに追加（U-FRET風の1ブロック）
el.addChordBtn.addEventListener("click", () => {
  state.timeline.push({
    id: uid(),
    type: "segment",
    root: state.root,
    qualityKey: state.qualityKey,
    name: buildChordName(state.root, state.qualityKey),
    lyricText: el.lyricInput.value.trim(),
    variantIndex: state.variantIndex,
  });
  el.lyricInput.value = "";
  renderTimeline();
});

el.addLyricBtn.addEventListener("click", () => addLyricOnlyRow());
el.lyricInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") el.addChordBtn.click();
});

// コードを付けない歌詞だけの行（イントロのセリフ等）を追加
function addLyricOnlyRow() {
  const text = el.lyricInput.value.trim();
  if (!text) return;
  state.timeline.push({ id: uid(), type: "segment", root: null, qualityKey: null, name: null, lyricText: text });
  el.lyricInput.value = "";
  el.lyricInput.focus();
  renderTimeline();
}

el.addLineBreakBtn.addEventListener("click", () => {
  state.timeline.push({ id: uid(), type: "linebreak" });
  renderTimeline();
});

/* ============================================================
   タイムライン（編集モード / プレビューモード）
   ============================================================ */
function renderTimeline() {
  hideChordPopup();
  renderTimelineEdit();
  renderTimelinePreview();
  saveDraft();
}

function renderTimelineEdit() {
  if (state.timeline.length === 0) {
    el.timelineEdit.innerHTML = `<div class="timeline-empty">左のパネルからコードや歌詞を追加すると、ここに並びます。</div>`;
    return;
  }

  el.timelineEdit.innerHTML = state.timeline
    .map((item) => {
      let body = "";
      if (item.type === "segment") {
        let chordPart;
        if (!item.root) {
          chordPart = `<div class="tl-seg-chord-empty">コードなし</div>`;
        } else if (item.qualityKey) {
          const variants = getItemVariants(item);
          const idx = clampVariantIndex(item.variantIndex || 0, variants.length);
          const variant = variants[idx];
          const arrows =
            variants.length > 1
              ? `
                <div class="tl-variant-switcher variant-switcher" data-id="${item.id}">
                  <button type="button" class="variant-arrow-btn" data-action="variant-prev" title="前のフォーム">◀</button>
                  <div class="tl-thumb">${renderChordSvg(variant.frets, { compact: true, root: item.root, bass: item.bass })}</div>
                  <button type="button" class="variant-arrow-btn" data-action="variant-next" title="次のフォーム">▶</button>
                </div>
              `
              : `<div class="tl-thumb">${renderChordSvg(variant.frets, { compact: true, root: item.root, bass: item.bass })}</div>`;
          chordPart = `
            ${arrows}
            <div class="tl-chord-name">${escapeHtml(item.name)}</div>
          `;
        } else {
          // 辞書にない特殊なコード: ダイアグラムは省略し、コード名だけを大きく表示する
          chordPart = `<div class="tl-chord-name tl-chord-name-lg" title="未対応のコード品質のためダイアグラムは省略しています">${escapeHtml(item.name)}</div>`;
        }

        body = `
          <div class="tl-seg-body">
            ${chordPart}
            <div class="tl-lyric-text tl-seg-lyric-row" contenteditable="true" data-id="${item.id}">${escapeHtml(
              item.lyricText || ""
            )}</div>
          </div>
        `;
      } else {
        body = `<div class="tl-linebreak-label">↵ 改行</div>`;
      }

      return `
        <div class="tl-item type-${item.type}" data-id="${item.id}" draggable="true">
          <span class="tl-drag" title="ドラッグして並び替え">⠿</span>
          ${body}
          <div class="tl-controls">
            <button type="button" class="tl-btn danger" data-action="delete" title="削除">✕</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTimelinePreview() {
  if (state.timeline.length === 0) {
    el.timelinePreview.innerHTML = `<div class="timeline-empty">ここに完成した楽譜が表示されます。</div>`;
    return;
  }
  el.timelinePreview.innerHTML = state.timeline
    .map((item) => {
      if (item.type === "segment") {
        const chordHtml = item.root
          ? `<span class="pv-chord" data-id="${item.id}">${escapeHtml(item.name)}</span>`
          : `<span class="pv-chord pv-chord-empty">&nbsp;</span>`;
        const lyricHtml = `<span class="pv-lyric">${escapeHtml(item.lyricText || " ")}</span>`;
        return `<span class="pv-segment" data-id="${item.id}">${chordHtml}${lyricHtml}</span>`;
      }
      return `<span class="pv-break"></span>`;
    })
    .join("");
}

// コードのフォーム(押さえ方のポジション)を切り替え、そのブロックのサムネイルだけを更新する。
// タイムライン全体を再描画しないので、開いているポップアップやドラッグ状態を壊さない。
function changeItemVariant(itemId, delta) {
  const item = state.timeline.find((i) => i.id === itemId);
  if (!item || !item.root || !item.qualityKey) return;

  const variants = getItemVariants(item);
  item.variantIndex = clampVariantIndex((item.variantIndex || 0) + delta, variants.length);
  const variant = variants[item.variantIndex];
  saveDraft();

  document.querySelectorAll(`.tl-item[data-id="${itemId}"] .tl-thumb`).forEach((thumbEl) => {
    thumbEl.innerHTML = renderChordSvg(variant.frets, { compact: true, root: item.root, bass: item.bass });
  });

  if (activeChordPopupId === itemId) {
    refreshChordPopupContent(item);
  }
}

// タイムライン内の操作（削除 / フォーム切り替え / コードのプレビュー）
el.timelineEdit.addEventListener("click", (e) => {
  const variantBtn = e.target.closest(".tl-variant-switcher .variant-arrow-btn");
  if (variantBtn) {
    const switcher = e.target.closest(".tl-variant-switcher");
    changeItemVariant(switcher.dataset.id, variantBtn.dataset.action === "variant-prev" ? -1 : 1);
    return;
  }

  const btn = e.target.closest(".tl-btn");
  if (!btn) {
    const chordPart = e.target.closest(".tl-thumb, .tl-chord-name");
    if (chordPart) toggleChordPopup(e.target.closest(".tl-item"));
    return;
  }
  const itemEl = e.target.closest(".tl-item");
  const id = itemEl.dataset.id;
  const idx = state.timeline.findIndex((i) => i.id === id);
  if (idx === -1) return;

  if (btn.dataset.action === "delete") {
    state.timeline.splice(idx, 1);
    renderTimeline();
  }
});

/* ============================================================
   タイムライン項目のドラッグ&ドロップ並び替え
   ============================================================ */
let draggedId = null;

function clearDragIndicators() {
  el.timelineEdit
    .querySelectorAll(".dragging, .drag-over-before, .drag-over-after")
    .forEach((n) => n.classList.remove("dragging", "drag-over-before", "drag-over-after"));
}

el.timelineEdit.addEventListener("dragstart", (e) => {
  if (e.target.closest(".tl-lyric-text")) {
    e.preventDefault();
    return;
  }
  const itemEl = e.target.closest(".tl-item");
  if (!itemEl) return;
  draggedId = itemEl.dataset.id;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedId);
  itemEl.classList.add("dragging");
});

el.timelineEdit.addEventListener("dragover", (e) => {
  if (!draggedId) return;
  e.preventDefault();
  const itemEl = e.target.closest(".tl-item");
  el.timelineEdit
    .querySelectorAll(".drag-over-before, .drag-over-after")
    .forEach((n) => n.classList.remove("drag-over-before", "drag-over-after"));
  if (!itemEl || itemEl.dataset.id === draggedId) return;
  const rect = itemEl.getBoundingClientRect();
  const before = e.clientX < rect.left + rect.width / 2;
  itemEl.classList.add(before ? "drag-over-before" : "drag-over-after");
});

el.timelineEdit.addEventListener("dragend", clearDragIndicators);

el.timelineEdit.addEventListener("drop", (e) => {
  e.preventDefault();
  if (!draggedId) return;
  const itemEl = e.target.closest(".tl-item");
  clearDragIndicators();

  const fromIdx = state.timeline.findIndex((i) => i.id === draggedId);
  draggedId = null;
  if (fromIdx === -1) return;
  const [moved] = state.timeline.splice(fromIdx, 1);

  if (!itemEl || itemEl.dataset.id === moved.id) {
    state.timeline.push(moved);
  } else {
    const rect = itemEl.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    let targetIdx = state.timeline.findIndex((i) => i.id === itemEl.dataset.id);
    if (!before) targetIdx += 1;
    state.timeline.splice(targetIdx, 0, moved);
  }
  renderTimeline();
});

// プレビュー画面のコードバッジをクリック → 瞬時に押さえ方を表示
el.timelinePreview.addEventListener("click", (e) => {
  const chip = e.target.closest(".pv-chord");
  if (!chip) return;
  toggleChordPopup(chip);
});

/* ============================================================
   コード選択→瞬時プレビュー（ポップアップ）
   ============================================================ */
let activeChordPopupId = null;

function toggleChordPopup(anchorEl) {
  const id = anchorEl.dataset.id;
  const item = state.timeline.find((i) => i.id === id);
  if (!item || !item.root) return;

  if (item.qualityKey) {
    const variants = getItemVariants(item);
    const idx = clampVariantIndex(item.variantIndex || 0, variants.length);
    playChordStrum(variants[idx].frets);
  }

  if (activeChordPopupId === id) {
    hideChordPopup();
    return;
  }
  showChordPopup(item, anchorEl);
}

// ポップアップの名前・ダイアグラム・フォーム切り替えラベルを更新する(表示位置/開閉状態は変更しない)
function refreshChordPopupContent(item) {
  el.chordPopupName.textContent = item.name;

  if (!item.qualityKey) {
    // 辞書にない特殊なコード: ダイアグラムは空欄にし、コード名だけ大きく見せる
    el.chordPopupDiagram.innerHTML = "";
    el.chordPopupDiagram.classList.add("empty");
    el.popupVariantLabel.textContent = "";
    el.popupVariantPrevBtn.disabled = true;
    el.popupVariantNextBtn.disabled = true;
    return;
  }

  const variants = getItemVariants(item);
  item.variantIndex = clampVariantIndex(item.variantIndex || 0, variants.length);
  const variant = variants[item.variantIndex];

  el.chordPopupDiagram.innerHTML = renderChordSvg(variant.frets, { compact: false, root: item.root, bass: item.bass });
  el.chordPopupDiagram.classList.remove("empty");
  el.popupVariantLabel.textContent =
    variants.length > 1 ? `${variant.label}（${item.variantIndex + 1}/${variants.length}）` : variant.label;
  el.popupVariantPrevBtn.disabled = variants.length <= 1;
  el.popupVariantNextBtn.disabled = variants.length <= 1;
}

function showChordPopup(item, anchorEl) {
  refreshChordPopupContent(item);
  el.chordPopup.classList.remove("hidden");
  positionChordPopup(anchorEl);
  activeChordPopupId = item.id;
  markActiveChordEls(item.id);
}

// ポップアップ自身の◀▶でもフォームを切り替えられるようにする
el.popupVariantPrevBtn.addEventListener("click", () => {
  if (activeChordPopupId) changeItemVariant(activeChordPopupId, -1);
});
el.popupVariantNextBtn.addEventListener("click", () => {
  if (activeChordPopupId) changeItemVariant(activeChordPopupId, 1);
});

function hideChordPopup() {
  el.chordPopup.classList.add("hidden");
  activeChordPopupId = null;
  markActiveChordEls(null);
}

function markActiveChordEls(id) {
  document.querySelectorAll(".pv-chord.active, .tl-item.active").forEach((n) => n.classList.remove("active"));
  if (!id) return;
  document.querySelectorAll(`.pv-chord[data-id="${id}"], .tl-item[data-id="${id}"]`).forEach((n) =>
    n.classList.add("active")
  );
}

function positionChordPopup(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const popupRect = el.chordPopup.getBoundingClientRect();
  const margin = 8;

  let top = rect.bottom + 8;
  let left = rect.left + rect.width / 2 - popupRect.width / 2;

  left = Math.max(margin, Math.min(left, window.innerWidth - popupRect.width - margin));
  if (top + popupRect.height > window.innerHeight - margin) {
    top = rect.top - popupRect.height - 8;
  }

  el.chordPopup.style.top = `${top}px`;
  el.chordPopup.style.left = `${left}px`;
}

// ポップアップ内の拡大ダイアグラムをクリックしても再生できるように
el.chordPopupDiagram.addEventListener("click", () => {
  const item = state.timeline.find((i) => i.id === activeChordPopupId);
  if (!item || !item.root || !item.qualityKey) return;
  const variants = getItemVariants(item);
  const idx = clampVariantIndex(item.variantIndex || 0, variants.length);
  playChordStrum(variants[idx].frets);
});

document.addEventListener("click", (e) => {
  if (el.chordPopup.classList.contains("hidden")) return;
  if (e.target.closest(".chord-popup, .pv-chord, .tl-thumb, .tl-chord-name, .tl-variant-switcher")) return;
  hideChordPopup();
});
window.addEventListener("resize", hideChordPopup);
window.addEventListener("scroll", hideChordPopup, true);

// 歌詞のインライン編集（focusを外した時に反映）
el.timelineEdit.addEventListener("blur", (e) => {
  const t = e.target;
  if (!t.classList || !t.classList.contains("tl-lyric-text")) return;
  const id = t.dataset.id;
  const item = state.timeline.find((i) => i.id === id);
  if (item) {
    item.lyricText = t.textContent;
    renderTimelinePreview();
  }
}, true);

// 編集/プレビュー 切り替え
el.editModeBtn.addEventListener("click", () => switchMode("edit"));
el.previewModeBtn.addEventListener("click", () => switchMode("preview"));

function switchMode(mode) {
  hideChordPopup();
  state.mode = mode;
  el.editModeBtn.classList.toggle("active", mode === "edit");
  el.previewModeBtn.classList.toggle("active", mode === "preview");
  el.timelineEdit.classList.toggle("hidden", mode !== "edit");
  el.timelinePreview.classList.toggle("hidden", mode !== "preview");
}

/* ============================================================
   一括インポート: 歌詞+コードのテキストをタイムラインへ自動変換
   ============================================================ */
// 一般的でない異名同音表記(E#=F, B#=C等)も含めてシャープ表記に正規化する
const FLAT_TO_SHARP = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
  "E#": "F", "B#": "C", Cb: "B", Fb: "E",
};

// 対応していない品質(add9等)は近いコードフォームへ近似し、表示名(name)には元の表記をそのまま残す
const QUALITY_ALIASES = {
  "": "maj", maj: "maj", M: "maj",
  m: "m", min: "m",
  "7": "7", "11": "7",
  m7: "m7", min7: "m7", minor7: "m7", m7b5: "m7", m11: "m7",
  mM7: "m",
  maj7: "maj7", M7: "maj7",
  sus4: "sus4", sus: "sus4", sus2: "sus4", "7sus4": "sus4",
  "6": "6",
  m6: "m6", "69": "6",
  dim: "dim", dim7: "dim",
  aug: "aug", aug7: "aug",
  "9": "9",
  add9: "maj", add11: "maj",
};

// 既知の品質表記(コード名から自動でダイアグラムを引ける範囲)。
// 前方一致で解析するため、短い表記(例:"m")は必ずそれを含む長い表記(例:"m7","mM7")より後に置く。
// これを誤ると「連結してしまったコードの分割」や「A7sus4のような複合語」が正しく切り出せなくなる。
const CHORD_QUALITY_PATTERN = [
  "mM7", "m7b5", "m7", "m6", "m11", "minor7", "min7", "maj7", "min", "maj", "m",
  "M7", "M",
  "7sus4", "sus4", "sus2", "sus",
  "dim7", "dim",
  "aug7", "aug",
  "add9", "add11",
  "69", "6", "7", "9", "11",
].join("|");

// ルート、品質、フラット5度(-5等)、テンション(9,13等のカッコ表記)、ベース音(オンコード)まで
// まとめて1つのコード表記としてキャッチする。末尾の$は付けず「先頭から何文字消費できるか」を見る
// ことで、コードが区切り文字なしで連続してしまった文字列も1つずつ切り出せるようにしている。
const CHORD_PATTERN_BODY =
  `([A-G])(#|b)?(${CHORD_QUALITY_PATTERN})?(-5|\\+5|#5|b5)?(\\((?:b|#)?\\d{1,2}(?:,\\s*(?:b|#)?\\d{1,2})*\\))?(?:/([A-G])(#|b)?)?`;
const CHORD_PREFIX_REGEX = new RegExp(`^${CHORD_PATTERN_BODY}`);

function normalizeAccidentals(str) {
  return str.replace(/♯/g, "#").replace(/♭/g, "b");
}

/**
 * 区切り文字(スペース等)なしで連結してしまったコード表記(例: "CmM7/GGM7(9)")を、
 * 先頭から貪欲にコードとして解釈できる範囲を切り出しながら複数のコードに分割する。
 * 1つも解釈できなければ null(コードではない)を返す。品質が辞書に無い残り文字列は、
 * 直前に切り出したコード名にそのまま含めて保持する(データを失わないためのフォールバック)。
 */
function splitConcatenatedChordTokens(rawToken) {
  let remaining = normalizeAccidentals(rawToken);
  const results = [];

  while (remaining.length > 0) {
    const match = CHORD_PREFIX_REGEX.exec(remaining);
    if (!match || match[0].length === 0) break;
    results.push(match[0]);
    remaining = remaining.slice(match[0].length);
  }

  if (results.length === 0) return null;
  if (remaining.length > 0) {
    results[results.length - 1] += remaining;
  }
  return results;
}

// 行がコード行かどうかの判定。連結してしまったコードも分解できれば「コードらしい行」とみなす。
function isChordToken(rawToken) {
  return splitConcatenatedChordTokens(rawToken) !== null;
}

/**
 * 1つのコード表記(連結コードは分割済みの前提)を解析する。
 * - 既知の品質・テンション・オンコードのベース音まで含めて丸ごと解釈できればダイアグラム計算可能な
 *   qualityKey と bass(オンコードの分母の音、無ければ null)を返す。
 * - ルートは判定できるが品質が未知(辞書にない極めて特殊なコード)の場合は qualityKey: null を返し、
 *   呼び出し側でダイアグラムを省略してコード名だけを表示できるようにする。
 * - ルートすら判定できない場合は null(コードではない)を返す。
 */
function parseChordToken(rawToken) {
  const normalized = normalizeAccidentals(rawToken);
  const match = CHORD_PREFIX_REGEX.exec(normalized);
  if (!match || match[0].length === 0) return null;

  const [, letter, accidental, qualityRaw, , , bassLetter, bassAccidental] = match;
  const rawRoot = letter + (accidental || "");
  const root = FLAT_TO_SHARP[rawRoot] || rawRoot;

  let bass = null;
  if (bassLetter) {
    const rawBass = bassLetter + (bassAccidental || "");
    bass = FLAT_TO_SHARP[rawBass] || rawBass;
  }

  // カッコ内のテンションや読めない残り文字がある場合、品質を確実には断定できないため
  // ダイアグラムは省略し、コード名だけを表示するフォールバックに回す。
  const leftover = normalized.slice(match[0].length);
  const qualityKey = leftover ? null : QUALITY_ALIASES[qualityRaw || ""] || "maj";

  return { root, qualityKey, name: rawToken, bass };
}

// 全角文字(ひらがな・カタカナ・漢字・全角記号など)は半角の2倍の表示幅として数える。
// コード(半角英字)行と歌詞(全角)行を実際の文字数だけで揃えると、全角の歌詞側がずれてしまうため、
// 「表示上の桁位置」で揃える。
function charVisualWidth(ch) {
  const code = ch.codePointAt(0);
  const isFullWidth =
    (code >= 0x1100 && code <= 0x115f) || // ハングル字母
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK部首・漢字など
    (code >= 0xac00 && code <= 0xd7a3) || // ハングル音節
    (code >= 0x3000 && code <= 0x303e) || // 全角句読点
    (code >= 0x3041 && code <= 0x30ff) || // ひらがな・カタカナ
    (code >= 0xf900 && code <= 0xfaff) || // CJK互換漢字
    (code >= 0xff00 && code <= 0xff60) || // 全角英数・記号
    (code >= 0xffe0 && code <= 0xffe6);
  return isFullWidth ? 2 : 1;
}

// 文字インデックス(charIndex文字目の直前まで)の表示上の桁位置を求める
function visualColumnAt(line, charIndex) {
  let col = 0;
  for (let i = 0; i < charIndex; i++) col += charVisualWidth(line[i]);
  return col;
}

// 表示上の桁位置(targetColumn)に対応する文字インデックスを求める(逆変換)
function charIndexAtColumn(line, targetColumn) {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    if (col >= targetColumn) return i;
    col += charVisualWidth(line[i]);
  }
  return line.length;
}

// 行内の空白区切りトークンと、その表示上の桁位置(column)を取得する
function extractTokensWithPositions(line) {
  const tokens = [];
  const regex = /\S+/g;
  let m;
  while ((m = regex.exec(line))) {
    tokens.push({ text: m[0], column: visualColumnAt(line, m.index) });
  }
  return tokens;
}

// 行のトークンがすべてコード表記なら位置情報付きで返す。歌詞行なら null
function extractChordLine(line) {
  const tokens = extractTokensWithPositions(line);
  if (tokens.length === 0) return null;
  return tokens.every((t) => isChordToken(t.text)) ? tokens : null;
}

function makeChordSegment(token, lyricText) {
  const parsed = parseChordToken(token);
  return {
    id: uid(),
    type: "segment",
    root: parsed.root,
    qualityKey: parsed.qualityKey,
    name: parsed.name,
    bass: parsed.bass || null,
    lyricText: (lyricText || "").trim(),
    variantIndex: 0,
  };
}

function makeLyricOnlySegment(text) {
  return { id: uid(), type: "segment", root: null, qualityKey: null, name: null, lyricText: text };
}

/**
 * 歌詞+コードのテキストをタイムライン項目の配列に変換する。
 * 「1行目にコード、2行目に歌詞」のU-FRET風レイアウトを認識し、コードの文字位置に
 * 合わせて歌詞を分割することで、コードとその真下の歌詞を1つのブロックにまとめる。
 */
function parseImportText(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const items = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      if (items.length && items[items.length - 1].type !== "linebreak") {
        items.push({ id: uid(), type: "linebreak" });
      }
      i++;
      continue;
    }

    const chordLine = extractChordLine(line);
    if (chordLine) {
      const nextLine = lines[i + 1];
      const nextIsLyric = nextLine !== undefined && nextLine.trim() !== "" && !extractChordLine(nextLine);

      if (nextIsLyric) {
        const leadingEnd = charIndexAtColumn(nextLine, chordLine[0].column);
        const leading = nextLine.slice(0, leadingEnd).trim();
        if (leading) items.push(makeLyricOnlySegment(leading));

        chordLine.forEach((tok, idx) => {
          const startIdx = charIndexAtColumn(nextLine, tok.column);
          const endIdx =
            idx + 1 < chordLine.length ? charIndexAtColumn(nextLine, chordLine[idx + 1].column) : nextLine.length;
          const lyricSlice = nextLine.slice(startIdx, endIdx);
          // 区切り文字なしで連結してしまったコード(例: "CmM7/GGM7(9)")も分解してから追加する
          splitConcatenatedChordTokens(tok.text).forEach((subTok, subIdx) => {
            items.push(makeChordSegment(subTok, subIdx === 0 ? lyricSlice : ""));
          });
        });
        i += 2;
      } else {
        chordLine.forEach((tok) => {
          splitConcatenatedChordTokens(tok.text).forEach((subTok) => items.push(makeChordSegment(subTok, "")));
        });
        i += 1;
      }
    } else {
      items.push(makeLyricOnlySegment(line.trim()));
      i += 1;
    }
  }

  return items;
}

function openImportModal() {
  el.importModal.classList.remove("hidden");
  el.importTextarea.focus();
}

function closeImportModal() {
  el.importModal.classList.add("hidden");
}

el.openImportBtn.addEventListener("click", openImportModal);
el.closeImportBtn.addEventListener("click", closeImportModal);
el.importOverlay.addEventListener("click", closeImportModal);

el.generateImportBtn.addEventListener("click", () => {
  const text = el.importTextarea.value;
  if (!text.trim()) {
    showToast("テキストを貼り付けてください");
    return;
  }
  if (state.timeline.length > 0) {
    if (!confirm("現在のタイムラインは上書きされます。よろしいですか？")) return;
  }

  const items = parseImportText(text);
  if (items.length === 0) {
    showToast("コード・歌詞を認識できませんでした");
    return;
  }

  state.timeline = items;
  el.importTextarea.value = "";
  closeImportModal();
  renderTimeline();
  showToast(`${items.length}個のブロックを読み込みました`);
});

/* ============================================================
   楽譜の保存 / 読込 / 削除 (LocalStorage)
   ============================================================ */
function loadAllSongs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("保存データの読み込みに失敗しました", err);
    return [];
  }
}

function persistSongs(songs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
}

// ページの再読み込みで編集中の内容が消えないよう、下書きを自動保存/復元する
function saveDraft() {
  const draft = {
    title: el.songTitleInput.value,
    currentSongId: state.currentSongId,
    timeline: state.timeline,
    root: state.root,
    qualityKey: state.qualityKey,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("下書きの読み込みに失敗しました", err);
    return null;
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function saveCurrentSong() {
  const title = el.songTitleInput.value.trim();
  if (!title) {
    showToast("タイトルを入力してください");
    el.songTitleInput.focus();
    return;
  }
  const songs = loadAllSongs();
  const now = new Date().toISOString();

  if (state.currentSongId) {
    const idx = songs.findIndex((s) => s.id === state.currentSongId);
    if (idx !== -1) {
      songs[idx] = { ...songs[idx], title, timeline: state.timeline, updatedAt: now };
    } else {
      songs.push({ id: state.currentSongId, title, timeline: state.timeline, updatedAt: now });
    }
  } else {
    state.currentSongId = uid();
    songs.push({ id: state.currentSongId, title, timeline: state.timeline, updatedAt: now });
  }

  persistSongs(songs);
  saveDraft();
  showToast("保存しました");
}

function newSong() {
  if (state.timeline.length > 0 || el.songTitleInput.value.trim()) {
    if (!confirm("今の編集内容は保存されていません。新しい楽譜を作成しますか？")) return;
  }
  state.currentSongId = null;
  state.timeline = [];
  el.songTitleInput.value = "";
  clearDraft();
  renderTimeline();
  showToast("新しい楽譜を作成しました");
}

function loadSong(id) {
  const songs = loadAllSongs();
  const song = songs.find((s) => s.id === id);
  if (!song) return;
  state.currentSongId = song.id;
  state.timeline = Array.isArray(song.timeline) ? song.timeline : [];
  el.songTitleInput.value = song.title || "";
  renderTimeline();
  closeModal();
  showToast(`「${song.title}」を開きました`);
}

function deleteSong(id) {
  if (!confirm("この楽譜を削除します。よろしいですか？")) return;
  let songs = loadAllSongs();
  songs = songs.filter((s) => s.id !== id);
  persistSongs(songs);
  if (state.currentSongId === id) {
    state.currentSongId = null;
  }
  renderSongList();
}

function renderSongList() {
  const songs = loadAllSongs().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  if (songs.length === 0) {
    el.songListBody.innerHTML = `<div class="song-list-empty">まだ保存された楽譜はありません。</div>`;
    return;
  }
  el.songListBody.innerHTML = songs
    .map((s) => {
      const date = s.updatedAt ? new Date(s.updatedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      const chordCount = (s.timeline || []).filter((i) => i.type === "segment" && i.root).length;
      return `
        <div class="song-row" data-id="${s.id}">
          <div class="song-row-info">
            <div class="song-row-title">${escapeHtml(s.title || "(無題)")}</div>
            <div class="song-row-meta">コード${chordCount}個 ・ 更新: ${date}</div>
          </div>
          <div class="song-row-actions">
            <button type="button" class="btn btn-secondary" data-action="open">開く</button>
            <button type="button" class="btn btn-ghost" data-action="delete" style="color:var(--danger); border-color:var(--danger-tint);">削除</button>
          </div>
        </div>
      `;
    })
    .join("");
}

el.songListBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const row = e.target.closest(".song-row");
  const id = row.dataset.id;
  if (btn.dataset.action === "open") loadSong(id);
  if (btn.dataset.action === "delete") deleteSong(id);
});

function openModal() {
  renderSongList();
  el.songListModal.classList.remove("hidden");
}
function closeModal() {
  el.songListModal.classList.add("hidden");
}

el.openListBtn.addEventListener("click", openModal);
el.closeModalBtn.addEventListener("click", closeModal);
el.modalOverlay.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeImportModal();
    hideChordPopup();
  }
});

el.newSongBtn.addEventListener("click", newSong);
el.saveSongBtn.addEventListener("click", saveCurrentSong);
el.songTitleInput.addEventListener("input", saveDraft);

/* ============================================================
   音量 / ミュート操作
   ============================================================ */
function updateSoundIcon() {
  el.muteBtn.textContent = isMuted() ? "🔇" : "🔊";
}

el.muteBtn.addEventListener("click", () => {
  setMuted(!isMuted());
  updateSoundIcon();
});

el.volumeSlider.addEventListener("input", () => {
  const value = Number(el.volumeSlider.value) / 100;
  if (isMuted() && value > 0) setMuted(false);
  setVolume(value);
  updateSoundIcon();
});

/* ============================================================
   初期化
   ============================================================ */
function init() {
  const draft = loadDraft();
  if (draft) {
    state.currentSongId = draft.currentSongId || null;
    state.timeline = Array.isArray(draft.timeline) ? draft.timeline : [];
    state.root = draft.root || state.root;
    state.qualityKey = draft.qualityKey || state.qualityKey;
    el.songTitleInput.value = draft.title || "";
  }

  renderRootGrid();
  renderQualityGrid();
  updatePreview();
  renderTimeline();
  switchMode("edit");
  setVolume(Number(el.volumeSlider.value) / 100);
  updateSoundIcon();
}

init();
