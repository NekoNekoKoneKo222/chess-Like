import { MAX_LINEUP, PIECES, PIECE_MAP, RARITIES, STARTER_COLLECTION } from "./data.js";

const BOARD_SIZE = 8;
const FORMATION = [[4, 7], [3, 7], [5, 7], [2, 7], [4, 6], [3, 6], [5, 6], [2, 6]];
const inBounds = (x, y) => x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const makeId = (side, i) => `${side}-${i}`;
export const clone = (value) => JSON.parse(JSON.stringify(value));

export function parseStages(text) {
  const stages = [];
  let current = null;
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("@")) {
      const parts = line.substring(1).split("|").map((v) => v.trim());
      const number = Number(parts[0]);
      if (!Number.isInteger(number) || number !== stages.length + 1 || !parts[1]) {
        throw new Error(`${i + 1}行目：ステージ番号は1から順番に指定してください。`);
      }
      current = { number, name: parts[1], description: parts[2] || "", enemies: [] };
      stages.push(current);
      continue;
    }
    if (!current) throw new Error(`${i + 1}行目：最初に @1|名前 を記入してください。`);
    const [name, sx, sy, ...extra] = line.split(",").map((v) => v.trim());
    const x = Number(sx), y = Number(sy);
    if (extra.length || !PIECE_MAP[name] || sx === undefined || sy === undefined || !Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) {
      throw new Error(`${i + 1}行目：駒名,x,y の形式で指定してください。`);
    }
    if (y > 3) throw new Error(`${i + 1}行目：敵駒は上半分（y=0〜3）に置いてください。`);
    if (current.enemies.some((p) => p.x === x && p.y === y)) throw new Error(`${i + 1}行目：同じマスに駒を置けません。`);
    current.enemies.push({ name, x, y });
  }
  if (stages.length !== 15 || stages.some((s) => !s.enemies.length)) throw new Error("ステージは敵駒を1体以上含む15個を用意してください。");
  return stages;
}

export function createRun() {
  return {
    phase: "setup", stage: 1, collection: [...STARTER_COLLECTION],
    lineup: [...STARTER_COLLECTION], units: [], turn: "player", selected: null,
    rewards: [], log: ["遠征が始まります。駒を選んで出陣しましょう。"], moves: 0,
  };
}

export function createUnit(name, side, x, y, id) {
  const profile = PIECE_MAP[name];
  if (!profile) throw new Error(`未定義の駒: ${name}`);
  return { id, name, side, x, y, hp: profile.hp, defense: profile.defense, moved: false, repelActive: false, bomb: null };
}

export function toggleLineup(state, name) {
  if (state.phase !== "setup" || name === "王将" || !state.collection.includes(name)) return state;
  const next = clone(state);
  if (next.lineup.includes(name)) next.lineup = next.lineup.filter((v) => v !== name);
  else if (next.lineup.length < MAX_LINEUP) next.lineup.push(name);
  return next;
}

export function startBattle(state, stages) {
  if (state.phase !== "setup") return state;
  const next = clone(state);
  const stage = stages[next.stage - 1];
  if (!stage) throw new Error("ステージ設定が見つかりません。");
  const lineup = ["王将", ...next.lineup.filter((v) => v !== "王将" && next.collection.includes(v))].slice(0, MAX_LINEUP);
  next.lineup = lineup;
  next.units = [
    ...lineup.map((name, i) => createUnit(name, "player", ...FORMATION[i], makeId("player", i))),
    ...stage.enemies.map((enemy, i) => createUnit(enemy.name, "enemy", enemy.x, enemy.y, makeId("enemy", i))),
  ];
  next.phase = "battle";
  next.turn = "player";
  next.selected = null;
  next.log = [`第${next.stage}局「${stage.name}」開始。`, "あなたの手番です。駒を選択してください。"];
  next.moves = 0;
  return next;
}

const occupant = (units, x, y) => units.find((p) => p.x === x && p.y === y);

function directions(profile, side) {
  if (profile.move === "rook") return [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (profile.move === "bishop") return [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  if (profile.move === "queen" || profile.move === "step") return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  if (profile.move === "pawn") return [[0, side === "player" ? -1 : 1]];
  return [];
}

export function legalActions(state, unitId) {
  const unit = state.units.find((p) => p.id === unitId);
  if (!unit || state.phase !== "battle" || unit.side !== state.turn) return [];
  const profile = PIECE_MAP[unit.name];
  const moves = [];
  const tryAdd = (x, y, onlyAttack = false) => {
    if (!inBounds(x, y)) return false;
    const target = occupant(state.units, x, y);
    if (target?.side === unit.side) return false;
    if (onlyAttack && !target) return false;
    if (!onlyAttack && profile.move === "pawn" && target) return false;
    if (!target && state.units.some((p) => p.side !== unit.side && p.name === "敵" && p.repelActive &&
        distance({ x, y }, p) <= 1 && distance(unit, p) > distance({ x, y }, p))) return false;
    moves.push({ x, y, kind: target ? "attack" : "move", targetId: target?.id || null });
    return !target;
  };
  if (profile.move === "knight") {
    for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
      tryAdd(unit.x + dx, unit.y + dy);
    }
  } else if (profile.move === "pawn") {
    const forward = unit.side === "player" ? -1 : 1;
    tryAdd(unit.x, unit.y + forward);
    for (const dx of [-1, 1]) tryAdd(unit.x + dx, unit.y + forward, true);
  } else {
    for (const [dx, dy] of directions(profile, unit.side)) {
      for (let dist = 1; dist <= profile.range; dist++) {
        if (!inBounds(unit.x + dx * dist, unit.y + dy * dist)) break;
        const continueRay = tryAdd(unit.x + dx * dist, unit.y + dy * dist);
        if (!continueRay) break;
      }
    }
  }
  return moves;
}

function note(state, message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 9);
}

function destroy(state, victim, reason) {
  state.units = state.units.filter((p) => p.id !== victim.id);
  note(state, `${victim.side === "player" ? "味方" : "敵"}の「${victim.name}」${reason}。`);
}

function applyCombat(state, attacker, defender) {
  const attackerProfile = PIECE_MAP[attacker.name];
  const defenderProfile = PIECE_MAP[defender.name];
  // 爆弾持ちが設置元の爆弾魔を攻撃できれば、その時点で解除。
  if (attacker.bomb?.sourceId === defender.id && defender.name === "爆弾魔") {
    attacker.bomb = null;
    note(state, `「${attacker.name}」が爆弾魔を攻撃し、爆弾を解除！`);
  }
  const defended = Math.min(defender.defense, attackerProfile.attack);
  const hpDamage = attackerProfile.attack - defended;
  defender.defense -= defended;
  defender.hp -= hpDamage;
  note(state, `「${attacker.name}」が「${defender.name}」を攻撃。防御 -${defended} / HP -${hpDamage}`);

  if (attackerProfile.trait === "execute" && defender.hp > 0 && defender.hp <= 2) {
    if (defenderProfile.trait !== "immune") {
      destroy(state, defender, "は処刑の効果で破壊された");
    } else note(state, `「${defender.name}」は処刑効果を無効化した。`);
  }
  if (defender.hp <= 0 && state.units.some((p) => p.id === defender.id)) {
    if (attackerProfile.trait === "parasite" && defenderProfile.trait !== "immune" && defender.name !== "王将") {
      defender.side = attacker.side;
      defender.hp = Math.max(1, Math.ceil(defenderProfile.hp / 2));
      defender.defense = 0;
      defender.bomb = null;
      defender.repelActive = false;
      note(state, `寄生成功！「${defender.name}」が味方に転向した。`);
    } else {
      if (attackerProfile.trait === "parasite" && defenderProfile.trait === "immune") note(state, "寄生効果は無効化された。通常撃破として扱います。");
      destroy(state, defender, "は撃破された");
    }
  }
  if (attackerProfile.trait === "bomb" && state.units.some((p) => p.id === defender.id)) {
    if (defenderProfile.trait === "immune") note(state, `「${defender.name}」は爆弾の効果を無効化した。`);
    else {
      defender.bomb = { sourceId: attacker.id, turns: 3 };
      note(state, `「${defender.name}」に爆弾を設置！残り3ターン。`);
    }
  }
  // 相手を通常撃破したときだけ、攻撃者は相手のマスに進む。
  if (!state.units.some((p) => p.x === defender.x && p.y === defender.y)) {
    attacker.x = defender.x;
    attacker.y = defender.y;
    attacker.moved = true;
    if (attackerProfile.trait === "repel") attacker.repelActive = true;
  }
}

function tickBombs(state, actingSide, random = Math.random) {
  const carriers = [...state.units].filter((p) => p.side === actingSide && p.bomb);
  for (const carrier of carriers) {
    if (!state.units.some((p) => p.id === carrier.id) || !carrier.bomb) continue;
    carrier.bomb.turns -= 1;
    if (carrier.bomb.turns > 0) continue;
    carrier.bomb = null;
    const targets = state.units.filter((p) => p.id !== carrier.id && distance(p, carrier) <= 1);
    if (!targets.length) { note(state, `「${carrier.name}」の爆弾が爆発したが、近くに駒はいなかった。`); continue; }
    const target = targets[Math.min(targets.length - 1, Math.floor(Math.max(0, random()) * targets.length))];
    if (PIECE_MAP[target.name].trait === "immune") note(state, `爆弾が「${target.name}」に直撃したが、効果を無効化！`);
    else destroy(state, target, "は爆発の効果で破壊された");
  }
}

function resolveBattle(state) {
  if (!state.units.some((p) => p.side === "player" && p.name === "王将")) {
    state.phase = "defeat";
    note(state, "王将が倒れた。遠征失敗……。");
  } else if (!state.units.some((p) => p.side === "enemy")) {
    state.phase = "reward";
    state.rewards = rewardOptions(state);
    note(state, `第${state.stage}局に勝利！新しい駒を1つ獲得できます。`);
  } else if (!state.units.some((p) => p.side === "player")) {
    state.phase = "defeat";
  }
}

export function takeAction(state, unitId, x, y, random = Math.random) {
  const valid = legalActions(state, unitId).find((a) => a.x === x && a.y === y);
  if (!valid) return state;
  const next = clone(state);
  const unit = next.units.find((p) => p.id === unitId);
  if (valid.kind === "attack") {
    const target = next.units.find((p) => p.id === valid.targetId);
    applyCombat(next, unit, target);
  } else {
    unit.x = x; unit.y = y; unit.moved = true;
    if (PIECE_MAP[unit.name].trait === "repel") unit.repelActive = true;
    note(next, `「${unit.name}」が移動した。`);
  }
  tickBombs(next, unit.side, random);
  next.moves++;
  next.selected = null;
  resolveBattle(next);
  if (next.phase === "battle") next.turn = unit.side === "player" ? "enemy" : "player";
  return next;
}

export function skipEnemyTurn(state, random = Math.random) {
  if (state.phase !== "battle" || state.turn !== "enemy") return state;
  const next = clone(state);
  note(next, "敵は動けず待機した。");
  tickBombs(next, "enemy", random);
  resolveBattle(next);
  if (next.phase === "battle") next.turn = "player";
  return next;
}

export function chooseEnemyAction(state) {
  if (state.phase !== "battle" || state.turn !== "enemy") return null;
  const playerUnits = state.units.filter((p) => p.side === "player");
  const king = playerUnits.find((p) => p.name === "王将");
  const candidates = [];
  for (const unit of state.units.filter((p) => p.side === "enemy")) {
    for (const action of legalActions(state, unit.id)) {
      const profile = PIECE_MAP[unit.name];
      let score;
      if (action.kind === "attack") {
        const target = state.units.find((p) => p.id === action.targetId);
        const total = target.hp + target.defense;
        score = 45 + Math.min(total, profile.attack) * 4 + (profile.attack >= total ? 23 : 0) +
          (target.name === "王将" ? 26 : 0) + (unit.bomb?.sourceId === target.id ? 35 : 0);
      } else {
        const before = Math.min(...playerUnits.map((p) => distance(unit, p)));
        const after = Math.min(...playerUnits.map((p) => distance(action, p)));
        score = 10 + (before - after) * 6 + (king ? (distance(unit, king) - distance(action, king)) * 1.4 : 0);
        score -= Math.abs(action.x - 3.5) * 0.05;
      }
      candidates.push({ unitId: unit.id, ...action, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.unitId.localeCompare(b.unitId) || a.y - b.y || a.x - b.x);
  return candidates[0] || null;
}

// 報酬抽選だけはステージと手持ちに基づくシードで再現可能にする。
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function rewardOptions(state) {
  const owned = new Set(state.collection);
  const pool = PIECES.filter((p) => !owned.has(p.name));
  const seed = (state.stage * 279470273 + state.collection.reduce((acc, p) => acc + p.charCodeAt(0), 0)) >>> 0;
  const rng = seededRandom(seed);
  const rewards = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const availableRarities = [...new Set(pool.map((p) => p.rarity))];
    const totalWeight = availableRarities.reduce((sum, rarity) => sum + RARITIES[rarity].weight, 0);
    let roll = rng() * totalWeight;
    const chosenRarity = availableRarities.find((rarity) => (roll -= RARITIES[rarity].weight) < 0) || availableRarities[0];
    const options = pool.filter((p) => p.rarity === chosenRarity);
    const chosen = options[Math.floor(rng() * options.length)];
    rewards.push(chosen.name);
    pool.splice(pool.findIndex((p) => p.name === chosen.name), 1);
  }
  return rewards;
}

export function claimReward(state, name) {
  if (state.phase !== "reward" || !state.rewards.includes(name) || state.collection.includes(name)) return state;
  const next = clone(state);
  next.collection.push(name);
  if (next.lineup.length < MAX_LINEUP) next.lineup.push(name);
  next.rewards = [];
  next.selected = null;
  if (next.stage === 15) {
    next.phase = "complete";
  } else {
    next.stage++;
    next.phase = "setup";
    next.units = [];
    next.log = [`「${name}」が仲間になった！次の局へ進もう。`];
  }
  return next;
}
