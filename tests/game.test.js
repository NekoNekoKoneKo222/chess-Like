import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PIECES } from "../site/data.js";
import { createRun, parseStages, createUnit, legalActions, takeAction, skipEnemyTurn, rewardOptions, claimReward, startBattle, toggleLineup, chooseEnemyAction } from "../site/game.js";

const stageText = readFileSync(new URL("../site/stages.txt", import.meta.url), "utf8");
const stages = parseStages(stageText);
const battle = (...units) => ({ ...createRun(), phase: "battle", turn: "player", units, log: [], selected: null });
const unit = (name, side, x, y, id = `${side}-${name}`) => createUnit(name, side, x, y, id);

test("15ステージと敵配置はすべてTXTから読み込める", () => {
  assert.equal(stages.length, 15);
  assert.equal(stages[0].enemies.length, 2);
  assert.equal(stages[14].name, "終局");
  assert.equal(stages[14].enemies.length, 7);
  assert.throws(() => parseStages(stageText.replace("@15|", "@17|")), /ステージ番号/);
  assert.throws(() => parseStages(stageText.replace("歩兵,3,1", "歩兵,3,7")), /上半分/);
});

test("全駒名が漢字だけであり、3段階のレア度がある", () => {
  assert.ok(PIECES.length >= 25);
  assert.ok(PIECES.every((p) => /^[\p{Script=Han}]+$/u.test(p.name)));
  assert.deepEqual([...new Set(PIECES.map((p) => p.rarity))].sort(), ["common", "legendary", "rare"]);
});

test("防御力を先に削り、残りだけHPが減る", () => {
  const original = battle(unit("王将", "player", 4, 7), unit("衛兵", "player", 3, 4), unit("盾兵", "enemy", 3, 3));
  const result = takeAction(original, "player-衛兵", 3, 3);
  const defender = result.units.find((p) => p.name === "盾兵");
  assert.equal(defender.defense, 3);
  assert.equal(defender.hp, 5);
  assert.equal(result.units.find((p) => p.name === "衛兵").y, 4);
  assert.equal(original.units.find((p) => p.name === "盾兵").defense, 5);
});

test("寄生虫による撃破は駒を味方へ転向させる", () => {
  const enemy = unit("歩兵", "enemy", 3, 3);
  enemy.defense = 0; enemy.hp = 2;
  const state = battle(unit("王将", "player", 4, 7), unit("寄生虫", "player", 2, 4), enemy);
  const result = takeAction(state, "player-寄生虫", 3, 3);
  assert.equal(result.units.find((p) => p.id === "enemy-歩兵").side, "player");
  assert.equal(result.units.find((p) => p.id === "enemy-歩兵").hp, 2);
  assert.equal(result.units.find((p) => p.name === "寄生虫").x, 2);
  assert.equal(result.phase, "reward");
});

test("効果無効には寄生が効かず、通常の攻撃は通る", () => {
  const enemy = unit("幽霊", "enemy", 3, 3);
  enemy.defense = 0; enemy.hp = 1;
  const state = battle(unit("王将", "player", 4, 7), unit("寄生虫", "player", 2, 4), enemy);
  const result = takeAction(state, "player-寄生虫", 3, 3);
  assert.equal(result.units.some((p) => p.id === "enemy-幽霊"), false);
  assert.equal(result.units.find((p) => p.name === "寄生虫").x, 3);
});

test("爆弾は防御力と別の効果で、3手番後に近隣の駒を破壊", () => {
  const state = battle(unit("王将", "player", 4, 7), unit("爆弾魔", "player", 3, 5), unit("巨人", "enemy", 3, 3), unit("歩兵", "enemy", 4, 3));
  let result = takeAction(state, "player-爆弾魔", 3, 3);
  assert.equal(result.units.find((p) => p.name === "巨人").bomb.turns, 3);
  for (let remaining = 2; remaining >= 0; remaining--) {
    result = skipEnemyTurn({ ...result, turn: "enemy" }, () => 0.99);
    if (remaining) assert.equal(result.units.find((p) => p.name === "巨人").bomb.turns, remaining);
  }
  assert.equal(result.units.some((p) => p.name === "歩兵"), false);
  assert.equal(result.units.find((p) => p.name === "巨人").bomb, null);
});

test("爆弾を付けられた駒が設置元の爆弾魔を攻撃すると解除", () => {
  const defender = unit("塔", "enemy", 3, 3);
  defender.defense = 1;
  const state = battle(unit("王将", "player", 4, 7), unit("爆弾魔", "player", 3, 5), defender);
  const afterBomb = takeAction(state, "player-爆弾魔", 3, 3);
  assert.ok(afterBomb.units.find((p) => p.name === "塔").bomb);
  const afterCounterattack = takeAction(afterBomb, "enemy-塔", 3, 5);
  assert.equal(afterCounterattack.units.find((p) => p.name === "塔").bomb, null);
});

test("敵の接近阻止は通常移動だけ妨げて攻撃は通す", () => {
  const repeller = unit("敵", "player", 3, 3);
  repeller.repelActive = true;
  const enemy = unit("衛兵", "enemy", 3, 5);
  const state = { ...battle(unit("王将", "player", 4, 7), repeller, enemy), turn: "enemy" };
  const normal = legalActions(state, enemy.id);
  assert.equal(normal.some((a) => a.x === 3 && a.y === 4), false);
  enemy.y = 4;
  const attack = legalActions(state, enemy.id);
  assert.equal(attack.some((a) => a.x === 3 && a.y === 3 && a.kind === "attack"), true);
});

test("ステージ選択・戦闘・報酬・編成がつながる", () => {
  let state = createRun();
  state = toggleLineup(state, "騎士");
  assert.equal(state.lineup.includes("騎士"), false);
  state = startBattle(state, stages);
  assert.equal(state.units.filter((p) => p.side === "enemy").length, 2);
  assert.equal(state.units.filter((p) => p.side === "player").length, 3);
  assert.equal(state.phase, "battle");
  state.turn = "enemy";
  assert.ok(chooseEnemyAction(state));
  const rewardState = { ...state, phase: "reward", rewards: rewardOptions(state) };
  assert.equal(rewardState.rewards.length, 3);
  assert.ok(rewardState.rewards.every((name) => !rewardState.collection.includes(name)));
  const next = claimReward(rewardState, rewardState.rewards[0]);
  assert.equal(next.stage, 2);
  assert.equal(next.phase, "setup");
  assert.equal(next.collection.length, 5);
});
