// ============================================================
// 新しい見た目（試作）: 球団の色と「帽子のマーク」を球団名から決める。
//
// ⚠ **表示専用**。保存もサーバーも触らない。同じ球団はいつも同じ色・同じ字になるよう、
//    内部名（`team.name`。名前を付け替えても変わらない）から決める。
// ⚠ 字は**英字の頭文字**（土地の名前のローマ字）。同じリーグに同じ頭文字が2つあれば、
//    その球団どうしは「土地＋愛称」の2文字にする（三陸アトラス → SA）。
//    名前を付け替えて表にない土地になった球団は、その名前の頭の1字（漢字・かな）。
// ⚠ **実在の球団には付けない**。ビューの `teamLabels` に載った球団（リーグの12球団）だけ。
//    NPB や独立リーグの名前（経歴・ドラフトの行き先）にマークを描くと、実在の球団の
//    マークに見えてしまう。
// ⚠ アプリ（`mobile/`）にも同じ表と同じ決め方を写す。変えたら両方を直す。
// ============================================================
import { hash } from './rng.js';

/** 土地の名前 → ローマ字（`pyramidLeague.js` の `CITIES` と同じ並び） */
export const CITY_EN = {
  札幌: 'Sapporo', 千歳: 'Chitose', 苫小牧: 'Tomakomai', 旭川: 'Asahikawa', 函館: 'Hakodate',
  青森: 'Aomori', 八戸: 'Hachinohe', 盛岡: 'Morioka', 仙台: 'Sendai', 秋田: 'Akita',
  山形: 'Yamagata', 福島: 'Fukushima', 郡山: 'Koriyama', 水戸: 'Mito', 日立: 'Hitachi',
  宇都宮: 'Utsunomiya', 前橋: 'Maebashi', 高崎: 'Takasaki', 川越: 'Kawagoe', 大宮: 'Omiya',
  柏: 'Kashiwa', 船橋: 'Funabashi', 浦安: 'Urayasu', 八王子: 'Hachioji', 立川: 'Tachikawa',
  横浜: 'Yokohama', 川崎: 'Kawasaki', 相模原: 'Sagamihara', 藤沢: 'Fujisawa', 新潟: 'Niigata',
  長岡: 'Nagaoka', 富山: 'Toyama', 金沢: 'Kanazawa', 福井: 'Fukui', 甲府: 'Kofu',
  長野: 'Nagano', 松本: 'Matsumoto', 岐阜: 'Gifu', 静岡: 'Shizuoka', 沼津: 'Numazu',
  浜松: 'Hamamatsu', 豊田: 'Toyota', 岡崎: 'Okazaki', 豊橋: 'Toyohashi', 四日市: 'Yokkaichi',
  鈴鹿: 'Suzuka', 大津: 'Otsu', 堺: 'Sakai', 東大阪: 'Higashiosaka', 西宮: 'Nishinomiya',
  明石: 'Akashi', 姫路: 'Himeji', 奈良: 'Nara', 和歌山: 'Wakayama', 鳥取: 'Tottori',
  米子: 'Yonago', 松江: 'Matsue', 岡山: 'Okayama', 倉敷: 'Kurashiki', 福山: 'Fukuyama',
  呉: 'Kure', 下関: 'Shimonoseki', 宇部: 'Ube', 高松: 'Takamatsu', 松山: 'Matsuyama',
  高知: 'Kochi', 北九州: 'Kitakyushu', 久留米: 'Kurume', 佐賀: 'Saga', 長崎: 'Nagasaki',
  佐世保: 'Sasebo', 熊本: 'Kumamoto', 大分: 'Oita', 宮崎: 'Miyazaki', 延岡: 'Nobeoka',
  鹿児島: 'Kagoshima', 那覇: 'Naha', 名護: 'Nago', 石垣: 'Ishigaki',
  道南: 'Donan', 道東: 'Doto', 十勝: 'Tokachi', 津軽: 'Tsugaru', 三陸: 'Sanriku',
  庄内: 'Shonai', 会津: 'Aizu', 常総: 'Joso', 上州: 'Joshu', 武蔵: 'Musashi',
  多摩: 'Tama', 湘南: 'Shonan', 房総: 'Boso', 信州: 'Shinshu', 越前: 'Echizen',
  能登: 'Noto', 飛騨: 'Hida', 遠州: 'Enshu', 尾張: 'Owari', 三河: 'Mikawa',
  伊勢: 'Ise', 近江: 'Omi', 北摂: 'Hokusetsu', 河内: 'Kawachi', 丹波: 'Tamba',
  但馬: 'Tajima', 紀州: 'Kishu', 石見: 'Iwami', 瀬戸内: 'Setouchi', 安芸: 'Aki',
  周防: 'Suo', 阿波: 'Awa', 讃岐: 'Sanuki', 伊予: 'Iyo', 土佐: 'Tosa',
  筑豊: 'Chikuho', 島原: 'Shimabara', 天草: 'Amakusa', 阿蘇: 'Aso', 霧島: 'Kirishima',
};

/** 愛称 → 英語（`pyramidLeague.js` の `NICKNAMES` と同じ並び） */
export const NICK_EN = {
  ブレイブス: 'Braves', ファルコンズ: 'Falcons', ドルフィンズ: 'Dolphins', サンダーズ: 'Thunders',
  ウィングス: 'Wings', レンジャーズ: 'Rangers', クルセイダーズ: 'Crusaders', フェニックス: 'Phoenix',
  バイパーズ: 'Vipers', サンライズ: 'Sunrise', ストライカーズ: 'Strikers', ナイツ: 'Knights',
  ハリケーンズ: 'Hurricanes', シャークス: 'Sharks', ウルブズ: 'Wolves', コメッツ: 'Comets',
  ブリーズ: 'Breeze', ジェッツ: 'Jets', キングス: 'Kings', パンサーズ: 'Panthers',
  ラビッツ: 'Rabbits', シーホース: 'Seahorse', ガーディアンズ: 'Guardians', アローズ: 'Arrows',
  ブルズ: 'Bulls', スターズ: 'Stars', オーシャンズ: 'Oceans', ボルケーノズ: 'Volcanoes',
  クレインズ: 'Cranes', ホエールズ: 'Whales', ロケッツ: 'Rockets', タイフーンズ: 'Typhoons',
  サムライズ: 'Samurais', ミラージュ: 'Mirage', リバティーズ: 'Liberties', アトラス: 'Atlas',
  ヴァンガード: 'Vanguard', セイバーズ: 'Sabers', ダイヤモンズ: 'Diamonds', ノヴァ: 'Nova',
  オライオンズ: 'Orions', ゼニス: 'Zenith', タイタンズ: 'Titans', ペガサス: 'Pegasus',
  グリフィンズ: 'Griffins', ユニコーンズ: 'Unicorns', レイヴンズ: 'Ravens', ホーネッツ: 'Hornets',
  バジャーズ: 'Badgers', オッターズ: 'Otters', ペンギンズ: 'Penguins', シーガルズ: 'Seagulls',
  アルバトロス: 'Albatross', コンドルズ: 'Condors', オスプレイズ: 'Ospreys', ゲイルズ: 'Gales',
  ドラグーンズ: 'Dragoons', ランサーズ: 'Lancers', パイオニアズ: 'Pioneers', フロンティアズ: 'Frontiers',
  ヴォヤージャーズ: 'Voyagers', サミッツ: 'Summits', キャニオンズ: 'Canyons', グレイシャーズ: 'Glaciers',
  オーロラズ: 'Auroras', エクリプス: 'Eclipse', メテオズ: 'Meteors', パルサーズ: 'Pulsars',
  クエーサーズ: 'Quasars', ソレイユ: 'Soleil', センチネルズ: 'Sentinels', パラディンズ: 'Paladins',
  ヴァルキリーズ: 'Valkyries', グラディエーターズ: 'Gladiators', マスケティアーズ: 'Musketeers',
  ブリザーズ: 'Blizzards', クエイクス: 'Quakes', トルネーダーズ: 'Tornadoes',
};

/**
 * 球団の色の組（地・差し色・縁）。12球団に同じ組が出ないよう、ここから重ならずに配る。
 * ⚠ 地（c1）は暗い画面でも縁（c2）で形が見えること。差し色が地に沈む組を足さない。
 */
export const PALETTES = [
  ['#13294b', '#4aa3df', '#ffffff'],
  ['#c8102e', '#ffcc33', '#ffffff'],
  ['#0f3d6e', '#f2c14e', '#ffffff'],
  ['#14213d', '#e76f2e', '#ffffff'],
  ['#3b2a7a', '#e9c46a', '#ffffff'],
  ['#1b1b1b', '#d9d9d9', '#c8102e'],
  ['#0e7c86', '#f8fafc', '#0b2233'],
  ['#1f5f3a', '#f0e2b6', '#b5462b'],
  ['#5a3a22', '#f4a259', '#fff4e0'],
  ['#7a1f2b', '#e9b949', '#ffffff'],
  ['#5b6b2f', '#f3e6c8', '#2b2b2b'],
  ['#e4572e', '#1d1d1f', '#ffd166'],
  ['#0b6e4f', '#f4d35e', '#ffffff'],
  ['#1d4ed8', '#ffffff', '#dc2626'],
  ['#0284c7', '#0b1f3a', '#ffffff'],
  ['#111111', '#f97316', '#ffffff'],
  ['#15803d', '#ffffff', '#facc15'],
  ['#1e3a8a', '#ef4444', '#ffffff'],
  ['#0f766e', '#fb923c', '#ffffff'],
  ['#312e81', '#5eead4', '#ffffff'],
  ['#b91c1c', '#111827', '#ffffff'],
  ['#1f2937', '#a3e635', '#ffffff'],
  ['#075985', '#fb7185', '#ffffff'],
  ['#581c87', '#e5e7eb', '#fbbf24'],
];

/** マークの形。script は筆記体の1字だけ（2字の筆記体は読めない） */
export const STYLES = ['circle', 'shield', 'diamond', 'script', 'block', 'slab'];
const LATIN_ONLY = new Set(['script', 'block', 'slab']);
/** 漢字・かなの字に替える形（筆記体・縫い字は英字のための形） */
const JP_STYLE = { script: 'circle', block: 'shield', slab: 'diamond' };

/** 帽子のマークの書体（`Art.jsx` が CSS の書体名へ直す） */
export const fontOf = (style, latin) =>
  !latin ? 'jp' : style === 'script' ? 'yellowtail' : style === 'slab' ? 'alfa' : 'graduate';

// 長い名前から先に当てる（「東大阪」を「大阪」より先に。いまは無いが足したとき用）
const CITY_KEYS = Object.keys(CITY_EN).sort((a, b) => b.length - a.length);

/**
 * 字の元になる「土地」と「愛称」。表示名（付け替えた名前）を先に見る。
 * 返り値の `latin` が false なら、表に無い名前（漢字・かなの1字を使う）。
 */
export function nameSource(name, labels = {}) {
  const label = labels.label || name || '';
  // ⚠ 分けずに付け替えた古い球団は `city` が空（`membership.js` の `teamCityOf`）。
  //    そのときは表示名の頭が表の土地かを見る（「新潟ブルーレイクス」なら新潟）
  const city = labels.city || CITY_KEYS.find((k) => label.startsWith(k)) || '';
  const nickname =
    labels.nickname || (city && label.startsWith(city) ? label.slice(city.length) : '');
  const latinWord = (s) => (/^[A-Za-z]/.test(s) ? s.replace(/[^A-Za-z]/g, '') : '');
  const cityEn = CITY_EN[city] || latinWord(city);
  const nickEn = NICK_EN[nickname] || latinWord(nickname);
  if (cityEn) return { latin: true, city: cityEn.toUpperCase(), nick: nickEn.toUpperCase() };
  return { latin: false, city: (city || label).replace(/\s/g, ''), nick: nickname.replace(/\s/g, '') };
}

/**
 * 字の候補（短い順）。重なったら次の候補へ進む。
 * 頭文字 → 土地＋愛称の頭文字（SA）→ 土地の頭と終わり（SU）→ 土地の頭2字（SA）→ 土地の頭＋ほかの字 → 頭＋愛称の字
 */
export function monoCandidates(source) {
  const list = [];
  const add = (m) => m && !list.includes(m) && list.push(m);
  if (source.latin) {
    const { city, nick } = source;
    add(city[0]);
    add(nick ? city[0] + nick[0] : '');
    add(city[0] + city[city.length - 1]);
    for (const c of city.slice(1)) add(city[0] + c);
    for (const c of nick.slice(1)) add(city[0] + c);
    return list;
  }
  const chars = [...source.city];
  add(chars[0] || '？');
  add(chars.slice(0, 2).join(''));
  for (const c of [...chars.slice(2), ...source.nick]) add(chars[0] + c);
  return list;
}

/**
 * ビューの `teamLabels`（`{ [内部名]: { label, short, city, nickname } }`）から、全球団の見た目を決める。
 * ⚠ 色は12球団で重ならないよう、内部名の値で決めた順に配る（同じ顔ぶれならいつも同じ結果）。
 */
export function buildTeamLooks(teamLabels = {}) {
  const names = Object.keys(teamLabels).sort((a, b) => hash(a) - hash(b) || (a < b ? -1 : 1));
  const usedPalette = new Set();
  const out = {};
  for (const name of names) {
    let p = hash(`${name}:palette`) % PALETTES.length;
    // ⚠ 球団が色の組より多いときは重なってよい（無限に回らない）
    for (let i = 0; i < PALETTES.length && usedPalette.has(p); i++) p = (p + 1) % PALETTES.length;
    usedPalette.add(p);
    const source = nameSource(name, teamLabels[name]);
    let style = STYLES[hash(`${name}:style`) % STYLES.length];
    if (!source.latin && JP_STYLE[style]) style = JP_STYLE[style];
    const [c1, c2, c3] = PALETTES[p];
    out[name] = { name, c1, c2, c3, style, latin: source.latin, candidates: monoCandidates(source), level: 0 };
  }
  // 字: 同じ字の球団があれば、その球団どうしを次の候補へ（全部が別の字になるまで）
  const list = Object.values(out);
  const monoOf = (t) => t.candidates[Math.min(t.level, t.candidates.length - 1)];
  for (let round = 0; round < 40; round++) {
    const count = new Map();
    for (const t of list) count.set(monoOf(t), (count.get(monoOf(t)) || 0) + 1);
    let moved = false;
    for (const t of list) {
      if (count.get(monoOf(t)) > 1 && t.level < t.candidates.length - 1) {
        t.level++;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const t of list) {
    t.mono = monoOf(t);
    // 筆記体は1字だけ。2字になった球団は丸に替える
    if (t.style === 'script' && t.mono.length > 1) t.style = 'circle';
    if (!t.latin && LATIN_ONLY.has(t.style)) t.style = JP_STYLE[t.style];
    t.font = fontOf(t.style, t.latin);
    delete t.candidates;
    delete t.level;
  }
  return out;
}

// ⚠ `gameText.js` の `setTeamLabels` と同じく、モジュールの変数に置く。
//    画面は一度に1つのリーグしか出さない。`OnlineApp` がビューを受け取るたびに差し替える
let LOOKS = {};
let LOOKS_KEY = '';
export function setTeamLooks(teamLabels) {
  const key = JSON.stringify(teamLabels || {});
  if (key === LOOKS_KEY) return;
  LOOKS_KEY = key;
  LOOKS = buildTeamLooks(teamLabels || {});
}
/** 球団の見た目。リーグの球団でなければ null（マークを描かない） */
export const teamLook = (name) => (name && LOOKS[name]) || null;

/** 所属の分からない人（候補・指導者の市場）の帽子。字は入れない */
export const NEUTRAL_LOOK = Object.freeze({
  name: '',
  c1: '#475569',
  c2: '#cbd5e1',
  c3: '#ffffff',
  style: 'circle',
  latin: true,
  mono: '',
  font: 'graduate',
});
