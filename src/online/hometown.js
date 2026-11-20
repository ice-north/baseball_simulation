// ============================================================
// 同窓・地元の縁（C3）。球団の土地（`pyramidLeague.js` の CITIES）→ 都道府県と、
// 選手の出身（高校の県・高校・大学）から「地元出身」「同窓対決」を見つける。
//
// ⚠ 先方回答（2026-11-16）「余裕があれば」C3。**飾り**（能力・試合に効かない）。
// ⚠ 出身が分かるのは、高校・大学から入った選手だけ（最初の24人には出身が無い）。
// ⚠ 地域の名前（湘南・瀬戸内など）は県をまたぐことがあるので、県は配列で持つ。
// ============================================================

/** 球団の土地 → 都道府県（`pyramidLeague.js` の CITIES と同じ並び） */
export const CITY_PREFS = {
  札幌: ['北海道'], 千歳: ['北海道'], 苫小牧: ['北海道'], 旭川: ['北海道'], 函館: ['北海道'],
  青森: ['青森'], 八戸: ['青森'], 盛岡: ['岩手'], 仙台: ['宮城'], 秋田: ['秋田'],
  山形: ['山形'], 福島: ['福島'], 郡山: ['福島'], 水戸: ['茨城'], 日立: ['茨城'], 宇都宮: ['栃木'],
  前橋: ['群馬'], 高崎: ['群馬'], 川越: ['埼玉'], 大宮: ['埼玉'],
  柏: ['千葉'], 船橋: ['千葉'], 浦安: ['千葉'], 八王子: ['東京'], 立川: ['東京'], 横浜: ['神奈川'],
  川崎: ['神奈川'], 相模原: ['神奈川'], 藤沢: ['神奈川'], 新潟: ['新潟'],
  長岡: ['新潟'], 富山: ['富山'], 金沢: ['石川'], 福井: ['福井'], 甲府: ['山梨'], 長野: ['長野'],
  松本: ['長野'], 岐阜: ['岐阜'], 静岡: ['静岡'], 沼津: ['静岡'],
  浜松: ['静岡'], 豊田: ['愛知'], 岡崎: ['愛知'], 豊橋: ['愛知'], 四日市: ['三重'], 鈴鹿: ['三重'],
  大津: ['滋賀'], 堺: ['大阪'], 東大阪: ['大阪'], 西宮: ['兵庫'],
  明石: ['兵庫'], 姫路: ['兵庫'], 奈良: ['奈良'], 和歌山: ['和歌山'], 鳥取: ['鳥取'], 米子: ['鳥取'],
  松江: ['島根'], 岡山: ['岡山'], 倉敷: ['岡山'], 福山: ['広島'],
  呉: ['広島'], 下関: ['山口'], 宇部: ['山口'], 高松: ['香川'], 松山: ['愛媛'], 高知: ['高知'],
  北九州: ['福岡'], 久留米: ['福岡'], 佐賀: ['佐賀'], 長崎: ['長崎'],
  佐世保: ['長崎'], 熊本: ['熊本'], 大分: ['大分'], 宮崎: ['宮崎'], 延岡: ['宮崎'], 鹿児島: ['鹿児島'],
  那覇: ['沖縄'], 名護: ['沖縄'], 石垣: ['沖縄'],
  道南: ['北海道'], 道東: ['北海道'], 十勝: ['北海道'], 津軽: ['青森'], 三陸: ['岩手', '宮城'],
  庄内: ['山形'], 会津: ['福島'], 常総: ['茨城'], 上州: ['群馬'], 武蔵: ['埼玉', '東京'],
  多摩: ['東京'], 湘南: ['神奈川'], 房総: ['千葉'], 信州: ['長野'], 越前: ['福井'],
  能登: ['石川'], 飛騨: ['岐阜'], 遠州: ['静岡'], 尾張: ['愛知'], 三河: ['愛知'],
  伊勢: ['三重'], 近江: ['滋賀'], 北摂: ['大阪'], 河内: ['大阪'], 丹波: ['京都', '兵庫'],
  但馬: ['兵庫'], 紀州: ['和歌山'], 石見: ['島根'], 瀬戸内: ['岡山', '広島', '香川', '愛媛'], 安芸: ['広島'],
  周防: ['山口'], 阿波: ['徳島'], 讃岐: ['香川'], 伊予: ['愛媛'], 土佐: ['高知'],
  筑豊: ['福岡'], 島原: ['長崎'], 天草: ['熊本'], 阿蘇: ['熊本'], 霧島: ['鹿児島'],
};

/**
 * 地元として**判定できる地名**（`CITY_PREFS` の鍵。`pyramidLeague.js` の CITIES と同じ119か所）。
 * ⚠ いしだ 2026-11-20「地域名は、どこでも地元にできるのですか？判定できるの？」。
 *    できない。表に無い地名（自分で付けた「美瑛」など）は県が引けないので、
 *    地元出身の記事は出ない。名前を変える小窓はこの一覧を候補に出し、
 *    引けるかどうかをその場で知らせる（`DesktopView.jsx` の `RenameDialog`）。
 */
export const KNOWN_CITIES = Object.keys(CITY_PREFS);

/** その地名の都道府県（複数のことがある）。判定できなければ空の配列 */
export const prefsOfCity = (city) => CITY_PREFS[String(city || '').trim()] || [];

/** 選手の出身（世界の選手。高校 `{ name, pref }`・大学の名前） */
const schoolOf = (p) => p?.highSchool?.name || null;
const universityOf = (p) => p?.universityTeamName || p?.universityName || null;
const prefOf = (p) => p?.highSchool?.pref || null;

/** 球団の地元出身（高校の県が球団の土地の県）。`{ id, name, pref, school }` */
export function localPlayers(city, players) {
  const prefs = CITY_PREFS[city] || [];
  if (!prefs.length) return [];
  return (players || [])
    .filter((p) => p.isActive !== false && prefs.includes(prefOf(p)))
    .map((p) => ({ id: p.id, name: p.name, pref: prefOf(p), school: schoolOf(p) }));
}

/**
 * 同窓（同じ高校・同じ大学）。`ours` と `theirs` の組。高校を先に、名前の順。
 * @returns {{ kind: '高校' | '大学', school: string, ours: string[], theirs: string[] }[]}
 */
export function alumniPairs(ours, theirs) {
  const out = [];
  for (const [kind, of] of [['高校', schoolOf], ['大学', universityOf]]) {
    const mine = new Map();
    for (const p of ours || []) if (of(p)) (mine.get(of(p)) || mine.set(of(p), []).get(of(p))).push(p.name);
    const seen = new Map();
    for (const p of theirs || []) if (of(p) && mine.has(of(p))) (seen.get(of(p)) || seen.set(of(p), []).get(of(p))).push(p.name);
    for (const [school, names] of seen) out.push({ kind, school, ours: mine.get(school), theirs: names });
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.school.localeCompare(b.school, 'ja') : a.kind === '高校' ? -1 : 1));
}

/**
 * 地元紙に載せる「縁」の記事（自球団と次の相手）。文はサーバーで作り、アプリはそのまま載せる。
 * @returns {{ kicker: string, title: string, body: string }[]}
 */
export function tiesArticles({ city, short, players, opponent }) {
  const out = [];
  const local = localPlayers(city, players);
  if (local.length) {
    const top = local.slice(0, 3);
    out.push({
      kicker: '地元の星',
      title: `地元${local[0].pref}出身の${local[0].name}に声援`,
      body:
        `${short}には地元${[...new Set(local.map((x) => x.pref))].join('・')}の高校出身が${local.length}人いる。` +
        top.map((x) => `${x.name}${x.school ? `（${x.school}出身）` : ''}`).join('、') +
        '。スタンドからは「おかえり」の声が飛ぶ。',
    });
  }
  if (opponent?.players?.length) {
    const pairs = alumniPairs(players, opponent.players);
    if (pairs.length) {
      const p = pairs[0];
      out.push({
        kicker: '同窓対決',
        title: `${p.school}の${p.kind === '高校' ? '先輩後輩' : '同窓'}、${opponent.short}戦で相まみえる`,
        body:
          `次の相手${opponent.short}には、${p.ours.join('・')}と同じ${p.school}出身の${p.theirs.join('・')}がいる。` +
          (pairs.length > 1 ? `ほかにも${pairs.slice(1).map((x) => x.school).join('・')}の縁がある。` : '') +
          '母校の名をかけた勝負になる。',
      });
    }
  }
  return out;
}
