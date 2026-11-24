// ============================================================
// 球団ロゴの絵（モチーフ）の名前と、愛称ごとの割り当て。
//
// 絵は game-icons.net（Lorc・Delapouite ほか。CC BY 3.0）から選んだもの。形（パス）は
// `public/look/logo-icons.json` にあり、`tools/logo-icons.mjs` で書き出す。ここにあるのは**名前だけ**
// （サーバーが保存の中身を確かめるのにも使うので、重い形のデータはここに置かない）。
//
// ⚠ 名前を足したら `tools/logo-icons.mjs` を回して形も足す（`online-logo-check` が両方の一致を見る）。
// ⚠ 愛称は `pyramidLeague.js` の `NICKNAMES` と同じ並び。1つ目が「おまかせ」で最初に出る絵。
//    カワウソの絵は無いので、オッターズはビーバーで代用している。
// ⚠ アプリに写すときは、この表をそのまま持っていく。
// ============================================================
import { hash } from './rng.js';

/** 愛称 → 絵の名前（1つ目が既定） */
export const NICK_MOTIFS = {
  ブレイブス: ['spartan-helmet', 'crossed-swords', 'mailed-fist'],
  ファルコンズ: ['eagle-head', 'hawk-emblem', 'falcon-moon'],
  ドルフィンズ: ['dolphin'],
  サンダーズ: ['power-lightning', 'lightning-helix', 'lightning-trio'],
  ウィングス: ['feathered-wing', 'liberty-wing', 'angel-wings'],
  レンジャーズ: ['pine-tree', 'archer'],
  クルセイダーズ: ['templar-shield', 'winged-sword'],
  フェニックス: ['flame', 'eagle-emblem', 'flaming-claw'],
  バイパーズ: ['cobra', 'snake', 'rattlesnake'],
  サンライズ: ['sunrise', 'sun'],
  ストライカーズ: ['fist', 'punch-blast', 'baseball-bat'],
  ナイツ: ['visored-helm', 'chess-knight', 'mounted-knight'],
  ハリケーンズ: ['entangled-typhoon', 'tornado'],
  シャークス: ['shark-fin', 'shark-jaws'],
  ウルブズ: ['wolf-head', 'wolf-howl'],
  コメッツ: ['comet-spark', 'falling-star'],
  ブリーズ: ['wind-slap', 'feather'],
  ジェッツ: ['jet-fighter', 'rocket-flight'],
  キングス: ['crown', 'chess-king', 'laurel-crown'],
  パンサーズ: ['feline', 'saber-toothed-cat-head', 'lynx-head'],
  ラビッツ: ['rabbit-head', 'rabbit'],
  シーホース: ['seahorse'],
  ガーディアンズ: ['guarded-tower', 'winged-shield', 'bordered-shield'],
  アローズ: ['arrow-cluster', 'target-arrows', 'arrowhead'],
  ブルズ: ['bull-horns', 'charging-bull', 'bull'],
  スターズ: ['allied-star', 'barbed-star', 'beveled-star'],
  オーシャンズ: ['big-wave', 'waves', 'trident'],
  ボルケーノズ: ['smoking-volcano', 'volcano'],
  クレインズ: ['heron', 'paper-crane'],
  ホエールズ: ['whale-tail', 'sperm-whale'],
  ロケッツ: ['rocket', 'firework-rocket'],
  タイフーンズ: ['vortex', 'entangled-typhoon'],
  サムライズ: ['samurai-helmet', 'katana', 'oni'],
  ミラージュ: ['palm-tree', 'oasis', 'egyptian-pyramids'],
  リバティーズ: ['torch', 'liberty-wing', 'ringing-bell'],
  アトラス: ['atlas', 'globe'],
  ヴァンガード: ['flying-flag', 'spears', 'knight-banner'],
  セイバーズ: ['crossed-sabres', 'cracked-saber'],
  ダイヤモンズ: ['cut-diamond', 'gems'],
  ノヴァ: ['polar-star', 'explosion-rays', 'bright-explosion'],
  オライオンズ: ['star-formation', 'archer', 'stars-stack'],
  ゼニス: ['mountaintop', 'sun', 'peaks'],
  タイタンズ: ['muscle-up', 'thor-hammer', 'giant'],
  ペガサス: ['pegasus'],
  グリフィンズ: ['griffin-symbol', 'griffin-shield'],
  ユニコーンズ: ['unicorn'],
  レイヴンズ: ['raven'],
  ホーネッツ: ['bee', 'wasp-sting'],
  バジャーズ: ['badger'],
  オッターズ: ['beaver', 'squirrel'],
  ペンギンズ: ['penguin'],
  シーガルズ: ['seagull'],
  アルバトロス: ['dove', 'seagull'],
  コンドルズ: ['condor-emblem', 'vulture'],
  オスプレイズ: ['hawk-emblem', 'eagle-head', 'bird-claw'],
  ゲイルズ: ['whirlwind', 'wind-hole'],
  ドラグーンズ: ['cavalry', 'horse-head', 'dragon-head'],
  ランサーズ: ['spears', 'barbed-spear', 'mounted-knight'],
  パイオニアズ: ['old-wagon', 'compass', 'battle-axe'],
  フロンティアズ: ['mountains', 'compass', 'mountain-road'],
  ヴォヤージャーズ: ['ship-wheel', 'sail', 'compass'],
  サミッツ: ['peaks', 'fuji', 'mountaintop'],
  キャニオンズ: ['desert', 'cactus', 'mountain-road'],
  グレイシャーズ: ['ice-cube', 'polar-bear', 'ice-spear'],
  オーロラズ: ['star-swirl', 'sparkles', 'moon'],
  エクリプス: ['eclipse', 'nested-eclipses', 'eclipse-flare'],
  メテオズ: ['burning-meteor', 'fragmented-meteor'],
  パルサーズ: ['ringed-planet', 'pulse'],
  クエーサーズ: ['galaxy', 'moon-orbit'],
  ソレイユ: ['heraldic-sun', 'barbed-sun'],
  センチネルズ: ['stone-tower', 'visored-helm', 'guards'],
  パラディンズ: ['winged-shield', 'flanged-mace', 'templar-shield'],
  ヴァルキリーズ: ['horned-helm', 'angel-wings', 'winged-emblem'],
  グラディエーターズ: ['crested-helmet', 'gladius', 'centurion-helmet'],
  マスケティアーズ: ['musket', 'crossed-swords'],
  ブリザーズ: ['snowflake-2', 'snowflake-1', 'snowing'],
  クエイクス: ['earth-crack', 'edge-crack'],
  トルネーダーズ: ['tornado', 'half-tornado'],
};

/** 愛称に合う絵が無い球団（名前を付け替えた球団）と、絵を自分で選ぶ人のための絵 */
export const GENERIC_MOTIFS = [
  'baseball-bat', 'baseball-glove', 'billed-cap', 'trophy', 'laurels', 'anchor',
  'dragon-head', 'tiger-head', 'lion', 'bear-head', 'fox-head', 'horse-head',
  'deer-head', 'stag-head', 'elephant-head', 'gorilla', 'octopus', 'crab',
  'sea-turtle', 'rooster', 'swan', 'owl', 'maple-leaf', 'lotus',
  'cherry', 'oak-leaf', 'bamboo', 'pagoda', 'key', 'rose',
  'boar', 'ram', 'hound', 'paw-print', 'claw-slashes', 'crossed-axes',
  'shuriken', 'ninja-head', 'gears', 'castle', 'lighthouse', 'windmill',
  'fishing-boat', 'squid', 'frog', 'parrot-head', 'flamingo', 'horseshoe',
  'clover', 'fleur-de-lys', 'acorn', 'wheat', 'grapes', 'double-fish',
  'salmon', 'dinosaur-rex', 'triceratops-head', 'mammoth', 'robot-golem', 'ufo',
  'steam-locomotive', 'anvil', 'lantern', 'oak', 'bonsai-tree',
];

/** 使える絵の名前ぜんぶ（愛称の絵が先、重複なし） */
export const LOGO_ICON_NAMES = [...new Set([...Object.values(NICK_MOTIFS).flat(), ...GENERIC_MOTIFS])];
const ICON_SET = new Set(LOGO_ICON_NAMES);
export const isLogoIcon = (name) => typeof name === 'string' && ICON_SET.has(name);

// ⚠ 表は名前で引くので、`constructor` のような Object の持ち物の名前に当たらないよう自分の項目だけを見る
const own = (table, key) => (Object.hasOwn(table, key) ? table[key] : undefined);

/**
 * その球団の「おまかせ」に出す絵（愛称に合うもの）。
 * 表に無い愛称は、球団の内部名から決めた3つ（同じ球団はいつも同じ絵）
 */
export function motifsFor(nickname, seedName) {
  const mine = own(NICK_MOTIFS, nickname);
  if (mine) return mine;
  const at = hash(`${seedName}:motif`) % GENERIC_MOTIFS.length;
  return [0, 7, 19].map((step) => GENERIC_MOTIFS[(at + step) % GENERIC_MOTIFS.length]);
}
