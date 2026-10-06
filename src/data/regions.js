// ============================================================
// 地元判定（出身県 → 地区ブロック）
//
// 「地元の高校生は地元のチームへ行きやすい」を表すための対応表。
// 高校は47都道府県、社会人・独立は12地区、大学は27リーグと**粒度が違う**ので、
// 一番粗い **12地区** に揃えて突き合わせる。
//
// ⚠ **新しい地区の区分を作らないこと**。12地区は `corporateTeamsData.js` の
//    `REGIONS`（社会人チームが実際に持っている `region`）そのもの。
//    ここで別の区切りを発明すると、社会人チームの地区と突き合わなくなる。
//
// ⚠ **県単位にはできない**。大学は `region` にリーグIDしか持たず県が無い
//    （沖縄大学・沖縄国際大学は名前で分かるが、234校ぶんの県は持っていない）。
//    社会人は `city` を持つので市→県の表を作れば県単位にできるが、
//    300件ぶんの新しいデータが要る。まずは地区で寄せる。
// ============================================================

/** 都道府県 → 12地区（社会人チームの region と同じ区分） */
export const PREF_BLOCK = {
  北海道: 'hokkaido',
  青森: 'tohoku', 岩手: 'tohoku', 宮城: 'tohoku', 秋田: 'tohoku', 山形: 'tohoku', 福島: 'tohoku',
  茨城: 'kitakanto', 栃木: 'kitakanto', 群馬: 'kitakanto',
  埼玉: 'minamikanto', 千葉: 'minamikanto',
  東京: 'tokyo',
  神奈川: 'kanagawa',
  新潟: 'hokushinetsu', 富山: 'hokushinetsu', 石川: 'hokushinetsu',
  福井: 'hokushinetsu', 山梨: 'hokushinetsu', 長野: 'hokushinetsu',
  岐阜: 'tokai', 静岡: 'tokai', 愛知: 'tokai', 三重: 'tokai',
  滋賀: 'kinki', 京都: 'kinki', 大阪: 'kinki', 兵庫: 'kinki', 奈良: 'kinki', 和歌山: 'kinki',
  鳥取: 'chugoku', 島根: 'chugoku', 岡山: 'chugoku', 広島: 'chugoku', 山口: 'chugoku',
  徳島: 'shikoku', 香川: 'shikoku', 愛媛: 'shikoku', 高知: 'shikoku',
  福岡: 'kyushu', 佐賀: 'kyushu', 長崎: 'kyushu', 熊本: 'kyushu',
  大分: 'kyushu', 宮崎: 'kyushu', 鹿児島: 'kyushu', 沖縄: 'kyushu',
};

/** 大学リーグ(27) → 12地区 */
export const UNIV_LEAGUE_BLOCK = {
  hokkaido: 'hokkaido', sapporo: 'hokkaido',
  tohoku_n: 'tohoku', tohoku: 'tohoku', tohoku_s: 'tohoku',
  kankoshin: 'kitakanto',
  chiba_ken: 'minamikanto',
  tokyo_big6: 'tokyo', tokyoto: 'tokyo', shuto: 'tokyo', tokyo_new: 'tokyo',
  kanagawa: 'kanagawa',
  hokuriku: 'hokushinetsu',
  tokai: 'tokai', aichi: 'tokai',
  keiji: 'kinki', kansai: 'kinki', kansai_rk: 'kinki', hanshin: 'kinki', kinki: 'kinki',
  hiroshima_rk: 'chugoku', chugoku: 'chugoku',
  shikoku: 'shikoku',
  fukuoka_rk: 'kyushu', kyushu_rk: 'kyushu', kyushu_area: 'kyushu', nanbu_kyushu: 'kyushu',
};

/** 独立リーグ(5) → 12地区。リーグIDが既に地区名になっている
 *  ⚠ BCリーグは 群馬〜福井と広いが、単一の地区に寄せるなら北信越が最も近い */
export const INDEP_LEAGUE_BLOCK = {
  hokkaido: 'hokkaido', bc: 'hokushinetsu', kansai: 'kinki',
  shikoku: 'shikoku', kyushu: 'kyushu',
};

/** 出身県の地区。高校を持たない選手は null */
export const blockOfPref = (pref) => (pref ? PREF_BLOCK[pref] || null : null);

/** 選手の出身地区（高校の県から引く） */
export const homeBlockOf = (player) => blockOfPref(player?.highSchool?.pref);

/** 大学の地区 */
export const blockOfUniversity = (team) => (team?.region ? UNIV_LEAGUE_BLOCK[team.region] || null : null);

/** 社会人・独立チームの地区。独立はリーグIDから、社会人は region から引く */
export const blockOfCorporate = (team) => {
  if (team?.independentLeagueId) return INDEP_LEAGUE_BLOCK[team.independentLeagueId] || null;
  return team?.corporateData?.region || team?.region || null;
};

// 社会人の選択スコアへの加点。
// ⚠ **能力スコアの幅で決めること**。「30点満点のポジション補正より小さいから安全」と
//    見積もって 10 にしたら **同じ地区が85.2%** になった。高卒の能力スコアは
//    31前後に密集していて幅が狭く、+10 は分布そのものより大きい。
//    実測: 1→25.6% / **2→42.9%** / 3→54.3% / 5→68.6% / 10→85.2%（無作為 8.5%）
export const HOME_BONUS = 2;

// 大学は枠が均等割り（least-filled）なので加点ではなく**同点のときの選び方**で表す。
// 1.0 にすると地元の大学が満杯になるまで他地区の選手が入れない。
export const HOME_UNIV_PREF = 0.70;

// 独立リーグはプールから能力順のラウンドロビンで取るので、加点ではなく
// **どこまで先を見るか**で表す。⚠ プール全体から地元を探すと、地元というだけで
// 下位の選手まで拾いに行き、チーム戦力が地区の人口で決まってしまう。
// 実測: 4→29.2% / 6→37.9% / **8→40%前後** / 12→42.0%
export const HOME_WINDOW = 8;
