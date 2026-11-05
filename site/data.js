// 駒のデータはここにまとめています。名前はすべて漢字です。
// move: step / pawn / knight / rook / bishop / queen。range で射程を制限。
const piece = (name, rarity, glyph, hp, defense, attack, move, range, description, trait = "") => ({
  name, rarity, glyph, hp, defense, attack, move, range, description, trait,
});

export const PIECES = [
  piece("王将", "common", "王", 7, 3, 2, "step", 1, "全軍の要。倒されると敗北。効果攻撃を無効化する。", "immune"),
  piece("歩兵", "common", "歩", 4, 1, 2, "pawn", 1, "前に1マス進み、斜め前の敵を攻撃。"),
  piece("騎士", "common", "騎", 5, 1, 2, "knight", 1, "他の駒を飛び越えてＬ字に移動。"),
  piece("衛兵", "common", "衛", 5, 2, 2, "step", 1, "縦横斜めに1マス移動。"),
  piece("塔", "common", "塔", 5, 3, 2, "rook", 8, "縦横に一直線に移動。"),
  piece("僧正", "common", "僧", 4, 1, 3, "bishop", 8, "斜めに一直線に移動。"),
  piece("斥候", "common", "斥", 3, 0, 2, "queen", 2, "8方向に最大2マス移動。"),
  piece("盾兵", "common", "盾", 5, 5, 1, "step", 1, "強固な防御力を持つ。"),
  piece("弓兵", "common", "弓", 3, 1, 2, "bishop", 2, "斜めに最大2マス移動。"),
  piece("剣士", "common", "剣", 5, 1, 3, "step", 1, "接近戦の攻撃力が高い。"),
  piece("狩人", "common", "狩", 4, 1, 2, "rook", 2, "縦横に最大2マス移動。"),
  piece("刺客", "common", "刺", 3, 0, 4, "knight", 1, "軽装だが攻撃力が高い。"),
  piece("医師", "common", "医", 4, 1, 1, "bishop", 2, "斜めに移動する支援役。"),
  piece("巨人", "common", "巨", 9, 3, 3, "step", 1, "非常に高いHPを持つ。"),

  piece("爆弾魔", "rare", "爆", 5, 1, 2, "rook", 2, "攻撃した敵に爆弾を設置。3ターン後に近くの駒がランダムで破壊される。", "bomb"),
  piece("寄生虫", "rare", "寄", 4, 0, 2, "bishop", 2, "攻撃で倒した敵を味方に変える。効果無効の敵には無効。", "parasite"),
  piece("敵", "rare", "敵", 5, 2, 2, "step", 1, "移動後、敵は隣接マスへ通常移動できなくなる。攻撃は可能。", "repel"),
  piece("忍者", "rare", "忍", 4, 1, 3, "knight", 1, "飛び越え移動で敵陣へ潜り込む。"),
  piece("剣豪", "rare", "豪", 6, 2, 4, "step", 1, "高い攻撃力を持つ近接の達人。"),
  piece("砲兵", "rare", "砲", 5, 2, 4, "rook", 3, "縦横3マスまで進む強力な駒。"),
  piece("幽霊", "rare", "幽", 4, 0, 3, "bishop", 3, "ほかの駒の効果を受けない。", "immune"),
  piece("守護者", "rare", "護", 8, 5, 2, "step", 1, "厚い装甲で前線を支える。"),
  piece("魔女", "rare", "魔", 5, 1, 3, "queen", 2, "8方向に2マスまで移動。"),
  piece("火龍", "rare", "龍", 7, 2, 4, "bishop", 3, "斜めに3マスまで移動。"),
  piece("聖騎士", "rare", "聖", 7, 3, 3, "knight", 1, "ほかの駒の効果を受けない。", "immune"),
  piece("影武者", "rare", "影", 6, 2, 2, "queen", 2, "8方向に2マスまで移動。"),

  piece("女王", "legendary", "女", 7, 3, 4, "queen", 8, "縦横斜め、全方向へ進む。"),
  piece("死神", "legendary", "死", 6, 2, 5, "bishop", 8, "斜めに走る高火力の駒。"),
  piece("雷神", "legendary", "雷", 7, 3, 5, "knight", 1, "遠くの敵を一撃で捉える。"),
  piece("処刑人", "legendary", "処", 8, 2, 4, "rook", 2, "ダメージ後HPが2以下の敵を効果で破壊。", "execute"),
  piece("暴君", "legendary", "暴", 10, 4, 4, "step", 1, "巨大なHPと防御力を持つ。"),
  piece("破壊者", "legendary", "破", 8, 2, 6, "queen", 2, "近距離の全方向に高威力攻撃。"),
];

export const PIECE_MAP = Object.fromEntries(PIECES.map((p) => [p.name, p]));
export const RARITIES = {
  common: { name: "コモン", weight: 70 },
  rare: { name: "レア", weight: 25 },
  legendary: { name: "レジェンダリー", weight: 5 },
};
export const STARTER_COLLECTION = ["王将", "歩兵", "騎士", "衛兵"];
export const MAX_LINEUP = 8;

// ゲーム中に使用する性能は site/pieces.txt から読み込みます。
// 既存の駒は必須にして、ステージとセーブデータが壊れないようにします。
const REQUIRED_NAMES = PIECES.map((p) => p.name);
const rarityFromText = { "コモン": "common", "レア": "rare", "レジェンダリー": "legendary" };
const moveFromText = { "隣接": "step", "歩兵": "pawn", "跳躍": "knight", "縦横": "rook", "斜め": "bishop", "全方向": "queen" };
const traitFromText = { "なし": "", "爆弾": "bomb", "寄生": "parasite", "接近阻止": "repel", "効果無効": "immune", "処刑": "execute" };

export function parsePieces(text) {
  const result = [];
  const used = new Set();
  for (const [index, raw] of String(text).split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line.split(",").map((value) => value.trim());
    if (fields.length !== 10) throw new Error(`${index + 1}行目：10項目を半角カンマで区切ってください。`);
    const [name, rarityName, hpValue, defenseValue, attackValue, moveName, rangeValue, traitName, glyph, description] = fields;
    if (!/^[\p{Script=Han}]{1,8}$/u.test(name)) throw new Error(`${index + 1}行目：駒名は漢字1〜8文字にしてください。`);
    if (used.has(name)) throw new Error(`${index + 1}行目：「${name}」が重複しています。`);
    if (!Object.hasOwn(rarityFromText, rarityName)) throw new Error(`${index + 1}行目：レア度はコモン・レア・レジェンダリーから選択。`);
    if (!Object.hasOwn(moveFromText, moveName)) throw new Error(`${index + 1}行目：移動方法が不明です。`);
    if (!Object.hasOwn(traitFromText, traitName)) throw new Error(`${index + 1}行目：特殊効果が不明です。`);
    if (!/^[\p{Script=Han}]$/u.test(glyph)) throw new Error(`${index + 1}行目：表示文字は漢字1文字にしてください。`);
    if (!description) throw new Error(`${index + 1}行目：説明が空です。`);
    if (![hpValue, defenseValue, attackValue, rangeValue].every((value) => /^\d+$/.test(value))) {
      throw new Error(`${index + 1}行目：ステータスと距離は0以上の整数を記入してください。`);
    }
    const values = [hpValue, defenseValue, attackValue, rangeValue].map(Number);
    if (values.some((number) => !Number.isSafeInteger(number))) throw new Error(`${index + 1}行目：ステータスと距離は整数にしてください。`);
    const [hp, defense, attack, range] = values;
    if (hp < 1 || hp > 9999 || defense < 0 || defense > 9999 || attack < 0 || attack > 9999 || range < 1 || range > 8) {
      throw new Error(`${index + 1}行目：HPは1〜9999、防御力と攻撃力は0〜9999、距離は1〜8です。`);
    }
    if ((moveName === "跳躍" || moveName === "隣接") && range !== 1) {
      throw new Error(`${index + 1}行目：跳躍と隣接の移動距離は1にしてください。`);
    }
    used.add(name);
    result.push({ name, rarity: rarityFromText[rarityName], glyph, hp, defense, attack, move: moveFromText[moveName], range, description, trait: traitFromText[traitName] });
  }
  const missing = REQUIRED_NAMES.filter((name) => !used.has(name));
  if (missing.length) throw new Error(`必須の駒が不足しています：${missing.join("、")}`);
  return result;
}

export function applyPieceText(text) {
  const parsed = parsePieces(text);
  // PIECES と PIECE_MAP は参照を保ったまま更新し、game.js に反映します。
  PIECES.splice(0, PIECES.length, ...parsed);
  for (const name of Object.keys(PIECE_MAP)) delete PIECE_MAP[name];
  for (const profile of parsed) PIECE_MAP[profile.name] = profile;
  return parsed;
}
