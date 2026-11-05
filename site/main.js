import { PIECES, PIECE_MAP, RARITIES, MAX_LINEUP, applyPieceText } from "./data.js";
import { createRun, parseStages, startBattle, toggleLineup, legalActions, takeAction, skipEnemyTurn, chooseEnemyAction, claimReward, createUnit } from "./game.js";

const app = document.getElementById("app");
const STORAGE = "chess-like-save-v1";
const FORMATION = [[4, 7], [3, 7], [5, 7], [2, 7], [4, 6], [3, 6], [5, 6], [2, 6]];
let state = createRun();
let stages = [];
let busy = false;
let showHelp = false;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const profile = (name) => PIECE_MAP[name];
const rarityName = (name) => RARITIES[profile(name).rarity].name;
const typeLabel = (p) => p.trait === "bomb" || p.trait === "parasite" || p.trait === "execute" ? "ダメージ＋効果" : "ダメージ";
const total = (side) => state.units.filter((p) => p.side === side).length;

function save() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(state));
  } catch { /* ストレージが無効なら一時プレイのみ */ }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (!s || !Number.isInteger(s.stage) || s.stage < 1 || s.stage > 15 ||
        !["setup", "battle", "reward", "defeat", "complete"].includes(s.phase) ||
        !Array.isArray(s.collection) || !s.collection.includes("王将") ||
        !Array.isArray(s.lineup) || !Array.isArray(s.units) || !Array.isArray(s.log) ||
        !Array.isArray(s.rewards) || !s.units.every((p) => PIECE_MAP[p.name])) return;
    state = s;
    state.selected = null;
  } catch { /* 壊れた保存データは使用しない */ }
}

function store(next) {
  state = next;
  save();
  render();
}

function pieceCard(name, options = {}) {
  const p = profile(name);
  const selected = options.selected ? " active" : "";
  const locked = options.locked ? " locked" : "";
  const attr = options.action ? ` data-${options.action}="${escapeHtml(name)}"` : "";
  return `<button class="collection-card${selected}${locked}"${attr} ${options.disabled ? "disabled" : ""} type="button">
    <span class="card-symbol ${p.rarity}">${p.glyph}</span>
    <span class="card-description"><span class="unit-name ${p.rarity}">${name}</span><span class="card-detail">攻 ${p.attack} · 体 ${p.hp} · 防 ${p.defense}</span></span>
    <span class="card-indicator">${options.selected ? "✓" : options.locked ? "—" : "+"}</span>
  </button>`;
}

function setupPreview() {
  const chosen = ["王将", ...state.lineup.filter((n) => n !== "王将")].slice(0, MAX_LINEUP);
  return [
    ...chosen.map((n, i) => createUnit(n, "player", ...FORMATION[i], `preview-p-${i}`)),
    ...stages[state.stage - 1].enemies.map((p, i) => createUnit(p.name, "enemy", p.x, p.y, `preview-e-${i}`)),
  ];
}

function renderBoard() {
  const units = state.phase === "setup" ? setupPreview() : state.units;
  const selectedUnit = units.find((p) => p.id === state.selected);
  const actions = selectedUnit ? legalActions(state, selectedUnit.id) : [];
  const cells = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const unit = units.find((p) => p.x === x && p.y === y);
      const p = unit && profile(unit.name);
      const action = actions.find((a) => a.x === x && a.y === y);
      const chosen = unit?.id === state.selected;
      const pawn = unit ? `<span class="chess-token ${unit.side} ${p.rarity} ${chosen ? "chosen" : ""}">
        <span class="token-glyph">${p.glyph}</span><span class="token-name ${p.rarity}">${unit.name}</span>
        ${unit.bomb ? `<span class="bomb-icon" title="残り${unit.bomb.turns}ターン">${unit.bomb.turns}</span>` : ""}
        ${unit.repelActive ? `<span class="aura-icon" title="接近阻止">◈</span>` : ""}
        ${state.phase === "battle" ? `<span class="token-bars"><i style="width:${Math.max(0, unit.hp / p.hp * 100)}%"></i><b style="width:${Math.max(0, unit.defense / Math.max(1, p.defense) * 100)}%"></b></span>` : ""}
      </span>` : "";
      const status = action?.kind === "attack" ? " target" : action ? " reachable" : "";
      const label = `${String.fromCharCode(65 + x)}${8 - y}${unit ? ` ${unit.side === "player" ? "味方" : "敵"} ${unit.name} HP${unit.hp} 防御${unit.defense}` : " 空き"}${action ? ` ${action.kind === "attack" ? "攻撃可能" : "移動可能"}` : ""}`;
      cells.push(`<button type="button" class="square ${(x + y) % 2 ? "dark" : "light"}${status}${chosen ? " selected" : ""}" data-x="${x}" data-y="${y}" aria-label="${label}" ${state.phase !== "battle" || state.turn !== "player" || busy ? "disabled" : ""}>
        ${x === 0 ? `<span class="coord rank">${8 - y}</span>` : ""}
        ${y === 7 ? `<span class="coord file">${String.fromCharCode(65 + x)}</span>` : ""}
        ${!unit && action ? '<span class="move-dot"></span>' : ""}
        ${pawn}
      </button>`);
    }
  }
  return `<div class="board-shell"><div class="board-topline"><span>ENEMY TERRITORY</span><span class="side-count enemy-count">敵軍 ${units.filter((u) => u.side === "enemy").length} 駒</span></div>
    <div class="chessboard" role="group" aria-label="8×8チェス盤">${cells.join("")}</div>
    <div class="board-bottomline"><span>YOUR TERRITORY</span><span class="side-count">自軍 ${units.filter((u) => u.side === "player").length} 駒</span></div>
  </div>`;
}

function renderInfo() {
  if (state.phase === "setup") {
    return `<section class="panel lineup-panel"><div class="panel-kicker">01 / 編成</div><h2>出陣する駒を選択</h2>
      <p class="muted">最大${MAX_LINEUP}駒。王将は必須です。盤面に表示された配置で出陣します。</p>
      <div class="lineup-count"><strong>${state.lineup.length}</strong> / ${MAX_LINEUP} 駒を編成中 <span>所持 ${state.collection.length} 駒</span></div>
      <div class="collection-grid">${state.collection.map((name) => pieceCard(name, {
        selected: state.lineup.includes(name), locked: name === "王将", action: "lineup", disabled: name === "王将" || (!state.lineup.includes(name) && state.lineup.length >= MAX_LINEUP),
      })).join("")}</div>
      <button type="button" class="primary-button wide" id="start-battle"><span>戦闘開始</span><span>→</span></button>
      <div class="note-box"><span class="note-spark">✦</span> ステージごとにHP・防御力は全回復。勝利で新しい駒を1体獲得できます。</div>
    </section>`;
  }
  const selected = state.units.find((p) => p.id === state.selected);
  const focus = selected || state.units.find((p) => p.side === "player" && p.name === "王将") || state.units[0];
  const p = focus && profile(focus.name);
  return `<section class="panel detail-panel"><div class="panel-kicker">02 / 戦況</div><h2>${state.turn === "player" ? "あなたの手番" : "敵の思考中"}<span class="turn-dot ${state.turn}"></span></h2>
    <p class="muted">${state.turn === "player" ? "味方の駒を選んで、移動先か敵駒を押してください。" : "敵が次の手を選んでいます。"}</p>
    ${p ? `<div class="focused-unit">
      <span class="focused-symbol ${p.rarity}">${p.glyph}</span>
      <div><span class="small-label">${focus.side === "player" ? "味方" : "敵"} / ${rarityName(focus.name)}</span>
        <h3 class="unit-name ${p.rarity}">${p.name}</h3><div class="focus-stats"><span>攻撃 ${p.attack}</span><span>HP ${focus.hp}/${p.hp}</span><span>防御 ${focus.defense}/${p.defense}</span></div></div>
    </div><p class="skill-text">${p.description}</p><div class="trait-strip"><span class="tag">${typeLabel(p)}</span>${p.trait === "immune" ? `<span class="tag protected">効果無効</span>` : ""}${focus.bomb ? `<span class="tag danger">爆弾 残り${focus.bomb.turns}</span>` : ""}</div>` : ""}
    <div class="panel-divider"></div><div class="panel-kicker">戦闘記録</div><div class="battle-log" aria-live="polite">${state.log.map((l, i) => `<p class="${i === 0 ? "new" : ""}"><span class="log-dash">—</span>${escapeHtml(l)}</p>`).join("")}</div>
  </section>`;
}

function renderProgress() {
  return `<div class="progress-track" aria-label="ステージ進捗">${Array.from({ length: 15 }, (_, i) => `<span class="progress-tick ${i + 1 < state.stage ? "done" : ""} ${i + 1 === state.stage ? "current" : ""}" title="第${i + 1}局"></span>`).join("")}</div>`;
}

function renderReward() {
  if (state.phase !== "reward") return "";
  return `<div class="overlay" role="dialog" aria-modal="true" aria-label="勝利報酬"><div class="reward-window">
    <div class="eyebrow">BATTLE CLEARED <span>✦</span> REWARD SELECTION</div>
    <div class="reward-emblem">♕</div><h2>勝利。新たな駒を選べ。</h2>
    <p>第${state.stage}局を突破しました。以下の3駒から、仲間にする1駒を選択してください。</p>
    <div class="reward-grid">${state.rewards.map((name) => {
      const p = profile(name);
      return `<button type="button" class="reward-card ${p.rarity}" data-reward="${name}">
        <span class="reward-rarity ${p.rarity}">${rarityName(name)}</span><span class="reward-glyph">${p.glyph}</span>
        <strong class="unit-name ${p.rarity}">${name}</strong><span class="reward-stats">攻撃 ${p.attack}　HP ${p.hp}　防御 ${p.defense}</span>
        <span class="reward-description">${p.description}</span><span class="reward-claim">この駒を獲得 →</span>
      </button>`;
    }).join("")}</div><span class="reward-footnote">所持済みの駒は候補に出ません。レア度が高いほど出現しにくくなります。</span>
  </div></div>`;
}

function renderEnding() {
  if (!(["defeat", "complete"].includes(state.phase))) return "";
  const victory = state.phase === "complete";
  return `<div class="overlay" role="dialog" aria-modal="true" aria-label="${victory ? "遠征達成" : "敗北"}"><div class="end-window">
    <div class="eyebrow">${victory ? "THE FINAL CHECKMATE" : "RUN ENDED"}</div>
    <div class="end-icon">${victory ? "♛" : "♟"}</div><h2>${victory ? "全15局、制覇。" : "王将、陥落。"}</h2>
    <p>${victory ? `すべてのステージを突破しました！獲得した駒は全${state.collection.length}種。` : `第${state.stage}局で遠征は終了。編成と戦術を変えて再挑戦しましょう。`}</p>
    <button type="button" class="primary-button" id="restart-run">${victory ? "新しい遠征を始める" : "第1局から再挑戦"} →</button>
  </div></div>`;
}

function renderHelp() {
  if (!showHelp) return "";
  return `<div class="overlay" role="dialog" aria-modal="true" aria-label="遊び方"><div class="modal-window"><button class="close-button" id="close-help" aria-label="閉じる">×</button>
    <div class="eyebrow">HOW TO PLAY</div><h2>遊び方</h2>
    <div class="help-list">
      <div><b>01. 盤面で1手ずつ行動</b><p>味方の駒を選び、光るマスへ移動。赤いマスの敵を押すと攻撃します。相手が生き残れば攻撃者は元の位置に残ります。</p></div>
      <div><b>02. 防御力 → HP の順に減少</b><p>攻撃力分のダメージを先に防御力が受け、余ったダメージがHPに入ります。王将が倒されると敗北です。</p></div>
      <div><b>03. 効果とダメージは別物</b><p>爆弾・寄生・処刑は効果です。「ほかの駒の効果を受けない」駒には効きませんが、通常ダメージは通ります。</p></div>
      <div><b>04. 爆弾魔・寄生虫・敵</b><p>爆弾は付着した駒の3手番以内に仕掛けた爆弾魔を攻撃すれば解除。寄生虫は撃破した駒を味方にし、「敵」は移動後、敵が隣へ通常移動してくるのを防ぎます（攻撃は可能）。</p></div>
      <div><b>05. 15局を勝ち抜く</b><p>勝利ごとに未所持の3駒から1体を獲得。ステージは固定配置、HP・防御は毎局全回復。敗北時は第1局からやり直しです。</p></div>
    </div><button type="button" class="secondary-button wide" id="close-help-bottom">盤面へ戻る</button>
  </div></div>`;
}

function render() {
  const stage = stages[state.stage - 1];
  if (!stage) return;
  const currentBattle = state.phase === "battle";
  app.innerHTML = `<div class="site-wrap">
    <header class="header"><div class="brand"><span class="brand-icon">♞</span><div><strong>CHESS<span>LIKE</span></strong><small>TACTICAL ROGUELIKE</small></div></div>
      <nav class="nav-actions"><button type="button" class="nav-button" id="open-help">遊び方 <span class="nav-question">?</span></button></nav>
    </header>
    <main><section class="game-heading"><div class="heading-copy"><div class="eyebrow"><span class="gold-line"></span> THE FIFTEEN CHAPTERS</div>
      <h1>盤上の、<em>生存戦略。</em></h1><p>駒を集め、戦術を築き、15局の戦いを生き残れ。</p></div>
      <div class="chapter-indicator"><span class="small-label">CURRENT CHAPTER</span><div class="chapter-number">${String(state.stage).padStart(2, "0")}<span>/15</span></div>${renderProgress()}</div>
    </section>
    <section class="stage-banner"><div class="stage-banner-title"><span class="stage-index">STAGE ${String(state.stage).padStart(2, "0")}</span><h2>${escapeHtml(stage.name)}</h2></div>
      <p>${escapeHtml(stage.description)}</p><div class="stage-mode">${currentBattle ? state.turn === "player" ? "● PLAYER TURN" : "● ENEMY TURN" : state.phase === "setup" ? "◆ FORMATION" : "◆ BATTLE RESULT"}</div></section>
    <div class="battle-layout"><div class="board-column">${renderBoard()}<div class="board-caption"><span><i class="legend-dot ally"></i> 自軍</span><span><i class="legend-dot hostile"></i> 敵軍</span><span><i class="legend-dot possibility"></i> 移動可能</span><span><i class="legend-dot attack"></i> 攻撃可能</span></div></div>
    <aside class="side-column">${renderInfo()}<div class="side-footer"><span>駒の所持数 <strong>${state.collection.length} / ${PIECES.length}</strong></span><span>総手数 <strong>${state.moves}</strong></span></div></aside></div>
    </main><footer class="footer"><span>CHESS LIKE / ROGUELIKE CHESS EXPEDITION</span><span>攻めるか、守るか。次の一手で未来は変わる。</span></footer>
  </div>${renderReward()}${renderEnding()}${renderHelp()}`;
  bindEvents();
}

function clickSquare(x, y) {
  if (state.phase !== "battle" || state.turn !== "player" || busy) return;
  const unit = state.units.find((p) => p.x === x && p.y === y);
  if (state.selected) {
    const action = legalActions(state, state.selected).find((a) => a.x === x && a.y === y);
    if (action) {
      busy = true;
      store(takeAction(state, state.selected, x, y));
      if (state.phase === "battle") window.setTimeout(enemyMove, 520);
      else busy = false;
      return;
    }
  }
  state.selected = unit?.side === "player" ? (state.selected === unit.id ? null : unit.id) : null;
  render();
}

function enemyMove() {
  if (state.phase !== "battle" || state.turn !== "enemy") { busy = false; render(); return; }
  const chosen = chooseEnemyAction(state);
  state = chosen ? takeAction(state, chosen.unitId, chosen.x, chosen.y) : skipEnemyTurn(state);
  busy = false;
  save(); render();
}

function resetRun() {
  if (state.phase === "battle" || state.phase === "setup") {
    if (!window.confirm("現在の遠征を削除して、第1局からやり直しますか？")) return;
  }
  busy = false;
  store(createRun());
}

function bindEvents() {
  app.querySelectorAll(".square").forEach((element) => element.addEventListener("click", () => clickSquare(Number(element.dataset.x), Number(element.dataset.y))));
  app.querySelectorAll("[data-lineup]").forEach((element) => element.addEventListener("click", () => store(toggleLineup(state, element.dataset.lineup))));
  app.querySelectorAll("[data-reward]").forEach((element) => element.addEventListener("click", () => store(claimReward(state, element.dataset.reward))));
  app.querySelector("#start-battle")?.addEventListener("click", () => store(startBattle(state, stages)));
  app.querySelector("#restart-run")?.addEventListener("click", resetRun);
  app.querySelector("#open-help")?.addEventListener("click", () => { showHelp = true; render(); });
  app.querySelector("#close-help")?.addEventListener("click", () => { showHelp = false; render(); });
  app.querySelector("#close-help-bottom")?.addEventListener("click", () => { showHelp = false; render(); });
}

async function init() {
  try {
    const [response, pieceResponse] = await Promise.all([
      fetch("./stages.txt", { cache: "no-store" }), fetch("./pieces.txt", { cache: "no-store" }),
    ]);
    if (!response.ok || !pieceResponse.ok) throw new Error(`TXTを取得できません (ステージ ${response.status} / 駒 ${pieceResponse.status})`);
    applyPieceText(await pieceResponse.text());
    stages = parseStages(await response.text());
    load();
    render();
    if (state.phase === "battle" && state.turn === "enemy") { busy = true; window.setTimeout(enemyMove, 550); }
  } catch (error) {
    app.innerHTML = `<div class="fatal"><h1>ステージデータを読み込めません</h1><p>${escapeHtml(error.message)}</p><p>ローカルではファイルを直接開かず、Webサーバーで実行してください。</p></div>`;
  }
}
init();
