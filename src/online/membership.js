// ============================================================
// 多人数ペナントの参加者（ログインして参加・途中参加）
//
// 設計は docs/online/PYRAMID_LEAGUE.md。
//
// 【なぜ必要か】現行は参加者を環境変数（ONLINE_MEMBER_1 / 2）で固定しており、
// 1人増やすたびに設定の編集と再デプロイが要る。`createLeague` にも
// `members.length === 2` の強制があった。これでは2人以外で遊べない。
// **参加者はリーグのデータ側で持つ**形に変える。
//
// ⚠ **ここは純粋な計算だけを持つこと**。保存・通信・乱数の生成に触らない。
//    `Math.random()` を呼ばない（シードから決まる必要がある）。
//    配線（API・サーバー）は別のファイルで行う。
// ============================================================
import { requireOnline, findShortClash, shortClashMessage, shortNameOf } from './shared.js';
import { cleanText, OWNER_COMMENT_MAX } from './social.js';
import { PACK_STYLE } from './rosterPack.js';
import { PYRAMID_LEAGUES, PYRAMID_TEAM_COUNT } from './pyramidLeague.js';
import { REGION_OPTIONS } from './hometown.js';
import { cleanLogo, logoColorsProblem } from './look/logoData.js';

/** 参加できる上限。球団数と同じ（全球団が人間でも成立する） */
export const MAX_MEMBERS = PYRAMID_TEAM_COUNT; // 12（2部制）

/**
 * 途中参加が入れる階層。**最下層だけ**。
 * 上の階層から始められると、昇降格で積み上げた順位の意味が消える。
 *
 * ⚠ **構造から導くこと**。以前は `2` と直に書いており、
 *    7リーグ（最下層=2）から2部制（最下層=1）へ変えたときに
 *    「誰も参加できないリーグ」になるところだった。
 */
export const JOIN_TIER = Math.max(...PYRAMID_LEAGUES.map((l) => l.tier));

export const joinableLeagueIds = () =>
  PYRAMID_LEAGUES.filter((l) => l.tier === JOIN_TIER).map((l) => l.id);

/**
 * 参加者に割り当てる順の球団。**下の階層から**並べる。
 * ⚠ 上の階層から埋めると、昇降格で積み上げた順位の意味が消える。
 *    Cが埋まったらB、それも埋まったらA、という順で続ける。
 */
export function assignmentOrder(teams) {
  const tierOf = Object.fromEntries(PYRAMID_LEAGUES.map((l) => [l.id, l.tier]));
  return [...teams].sort(
    (a, b) =>
      (tierOf[b.league] ?? 0) - (tierOf[a.league] ?? 0) ||
      (a.league < b.league ? -1 : a.league > b.league ? 1 : 0) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

/** 人間が持っていない球団（＝CPU） */
export function cpuTeams(league) {
  const held = new Set((league.members || []).map((m) => m.teamName));
  return (league.teams || []).filter((t) => !held.has(t.name));
}

/**
 * 途中参加者が入る枠を決める。**最下層（2部）のCPUの中で一番弱い球団**。
 *
 * 弱さの順は 勝利数 → 勝率 → 球団の格付け → 名前 の順で比べる。
 * ⚠ **最後に名前まで見ること**。開幕前は全球団が 0勝0敗・同じ格付けになり得るので、
 *    そこで止めると「どれが最下位か」が実行のたびに変わる。
 */
export function weakestJoinableTeam(league, standings = {}) {
  const ids = joinableLeagueIds();
  const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  const candidates = cpuTeams(league).filter((t) => ids.includes(t.league));
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const sa = standings[a.name] || {};
    const sb = standings[b.name] || {};
    return (
      (sa.wins || 0) - (sb.wins || 0) ||
      (sa.winRate || 0) - (sb.winRate || 0) ||
      (RANK_ORDER[b.rank] ?? 9) - (RANK_ORDER[a.rank] ?? 9) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    );
  })[0];
}

/**
 * 参加できるかを検査する。できないときは理由付きで止める。
 *
 * ⚠ **招待コードは廃止した**。アカウントは管理者が Supabase で作らない限り
 *    増えない（公開サインアップは無効）ので、入口はそこで絞れている。
 *    その上にコードを重ねると、人を呼ぶたびに発行と受け渡しの手間が増えるだけだった。
 * ⚠ **理由を分けて返すこと**。「参加できません」だけだと、満員なのか
 *    既に参加済みなのかが分からず、受け取った人が詰む。
 */
export function assertCanJoin(league, userId) {
  requireOnline(league, 'リーグがまだありません', 409);
  requireOnline(
    !(league.members || []).some((m) => m.userId === userId),
    'すでに参加しています',
    409,
  );
  requireOnline(
    (league.members || []).length < MAX_MEMBERS,
    `参加できるのは${MAX_MEMBERS}人までです`,
    409,
  );
  // ⚠ **順位表を渡すこと**。渡さないと勝敗が見られず、常に「格付けが低い→名前順」で
  //    決まる（シーズン途中だと2部の首位のCPU球団を引き継ぐこともあった）。
  //    順位表は配列なので、球団名で引ける形にして渡す
  const standings = Object.fromEntries(
    (league.season?.standings || []).map((s) => [s.team, s]),
  );
  const team = weakestJoinableTeam(league, standings);
  requireOnline(team, '空いている球団がありません', 409);
  return { team };
}

/**
 * 参加を反映する。`league` を書き換えて返す。
 *
 * 弾かれたCPU球団の扱いは **A方式（引き継ぎ）**。
 * 新しい参加者がその枠と選手をそのまま受け取り、**表示名**を自分のものにする。
 *
 * ⚠ **内部の球団名（`name`）は変えないこと。** 名前は
 *    `TEAMS_DATA` のキー・日程の対戦相手・順位表・試合結果・
 *    記録の選手キー（`onlinePlayerId`）まで貫いており、
 *    参加のたびに付け替えると記録が迷子になる。
 *    見せる名前は `displayName` で持ち、内部の同一性は `name` が担う
 *    （一人用の社会人球団と同じ作り）。
 * ⚠ B方式（球団ごと消して新規に作る）へ変えるなら**ここだけ**を差し替える。
 *    選手の行き先（プール・分配・消滅）を決める必要がある。
 */
// ⚠ **この関数は `league` と、その中の球団オブジェクトを書き換える**（engine 側の流儀に合わせている）。
//    呼ぶ側が「参加前の球団名」を参照で持っていると、書き換えで一緒に変わる。
//    比べたいなら**文字列で控えてから**呼ぶこと（検査で実際に踏んだ）。
/**
 * 球団名が使えるか。⚠ 内部名と表示名の**両方**と見比べる。
 *    片方だけだと同じ名前が2つ並ぶ。
 */
export function assertTeamNameFree(league, team, shown) {
  requireOnline(shown.length <= 24, '球団名が長すぎます', 400);
  requireOnline(
    !(league.teams || []).some(
      (t) => t !== team && (t.name === shown || t.displayName === shown),
    ),
    'その球団名は使われています',
    409,
  );
}

/**
 * 球団の「地域名」と「チーム名」。
 *
 * ⚠ いしだ 2026-11-20「チーム名を決めるとき、地域名とチーム名を分けましょう。
 *    じゃないと略称名がダサくなってしまう」。付け替えた球団の略称は表示名の頭3文字に
 *    していたので、「美瑛ブルーレイクス」が「美瑛ブ」になっていた。
 * ⚠ 分けて持つのは**表示のため**だけ。内部名（`name`）は変えない。
 * ⚠ 付け替えていない球団は、既定の名前（`都市＋愛称`）を都市で切って分ける。
 */
export function teamCityOf(team) {
  if (team?.displayCity) return team.displayCity;
  const base = team?.abbreviation || team?.city || '';
  // ⚠ 分けずに付け替えた古い球団（`displayCity` が無く、表示名が既定の都市で始まらない。
  //    例「新潟」の枠を「美瑛ブルーレイクス」にした）は**地域名を空**にする。既定の都市を
  //    入れると小窓が「新潟」「美瑛ブルーレイクス」で開き、地方だけ選んで保存すると
  //    「新潟美瑛ブルーレイクス」になっていた（2026-11-20 監査）
  const shown = team?.displayName;
  if (shown && shown !== team?.name && base && !shown.startsWith(base)) return '';
  return base;
}
/**
 * 球団の地方（12地区のid）。⚠ **選んだものだけ**を返す（選んでいなければ null）。
 * ⚠ 地名から地方を引いて埋めないこと。地方は地元を地方の県ぜんぶへ広げるので、
 *    既定の球団まで地元が変わっていた（新潟→北信越6県、筑豊→九州8県。119か所のうち
 *    103か所。2026-11-20 監査）。選んでいなければ地元は今までどおり地名から引く
 *    （`teamHomeOf` → `hometown.js` の `prefsOfTeam`）。小窓の初めの値もこれ
 */
export const teamRegionOf = (team) => team?.displayRegion || null;
/**
 * 地元の判定に渡すもの（`hometown.js` の `prefsOfTeam` の引数）。
 * ⚠ 地域名を分けて付けた球団はその地域名、付けていない球団は**球団の土地**（`city`）。
 *    分けずに付け替えた古い球団も土地のまま（分ける前と同じ。表示の地域名
 *    `teamCityOf` は空になることがあるので使わない）
 */
export const teamHomeOf = (team) => ({
  city: team?.displayCity || team?.city || team?.abbreviation || '',
  region: teamRegionOf(team),
});
/**
 * 分けた名前（地域名・チーム名・地方）を消す。CPUに戻す・別の人が入る・古い送り方で
 * 名前だけ付け替えるときに使う。⚠ 残すと正式名と略称・地元がずれ、CPUに戻した球団の
 * 「美瑛」が次に入った人に引き継がれていた（2026-11-20 監査）
 */
export function clearTeamSplitName(team) {
  if (!team) return;
  delete team.displayCity;
  delete team.displayNickname;
  delete team.displayRegion;
}
/**
 * 球団ロゴ（人が作ったもの）を消して、自動のロゴに戻す。CPUに戻す・別の人が入るときに使う。
 * ⚠ 名前を付け替えただけでは消さない（ロゴは名前と別に作るもの）
 */
export function clearTeamLogo(team) {
  if (team) delete team.logo;
}
export function teamNicknameOf(team) {
  if (team?.displayNickname) return team.displayNickname;
  const shown = team?.displayName || team?.name || '';
  const city = teamCityOf(team);
  return city && shown.startsWith(city) ? shown.slice(city.length) : shown;
}

/** 画面に出す球団名（参加者が付けた名前。無ければ内部名） */
export function teamLabelIn(league, name) {
  const team = (league.teams || []).find((t) => t.name === name);
  return team?.displayName || name;
}

/**
 * 画面に出す名前ひとそろい（`label` 正式名・`short` 略称・`city` 地域名・`nickname` チーム名）。
 *
 * ⚠ **略称は地域名**（いしだ 2026-11-20）。分けずに付け替えた古い球団だけ、今までどおり
 *    表示名の頭3文字（「美瑛ブ」）。付けずに入った球団は既定の略称（都市）。
 * ⚠ 投影（`server/projection.mjs` の `teamLabels`）はこれを使う。2か所に書かない。
 */
export const teamDisplayOf = (team) => ({
  label: team?.displayName || team?.name,
  // ⚠ 作り方は `shared.js` の `shortNameOf`（Web の小窓と同じもの）
  short: shortNameOf({ city: team?.displayCity, shown: team?.displayName, name: team?.name, base: team?.abbreviation }),
  // 枠の既定の略称（都市）。ほかの人がこの略称を取れないようにする（`findShortClash`）
  base: team?.abbreviation || team?.name,
  city: teamCityOf(team),
  nickname: teamNicknameOf(team),
  region: teamRegionOf(team),
});

// 略称の判定は `shared.js` の `findShortClash`（Web の小窓と同じもの）
function shortClashOf(league, team, patch) {
  const next = teamDisplayOf({ ...team, ...patch }).short;
  const entries = (league.teams || []).map((t) => ({ name: t.name, ...teamDisplayOf(t) }));
  const clash = findShortClash(entries, team.name, next);
  return clash ? shortClashMessage(next, clash) : null;
}
function assertShortFree(league, team, patch) {
  const message = shortClashOf(league, team, patch);
  if (message) requireOnline(false, message, 409);
}

/**
 * 球団名とプレイヤー名を後から変える。
 *
 * ⚠ **参加のときしか名前を付けられなかった**。リーグを作った管理者には
 *    その機会すら無く、順位表に「湘南サンズ（湘南サンズ）」のように
 *    球団名が2回出ていた（参加時の呼び名が既定で球団名だったため）。
 * ⚠ 内部名（`name`）は変えない。記録の選手キーまで貫いている。
 */
export function applyProfile(league, { userId, teamName, cityName, nickname, region, playerName, comment, logo, now = null }) {
  requireOnline(league, 'リーグがまだありません', 409);
  const member = (league.members || []).find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  const team = (league.teams || []).find((t) => t.name === member.teamName);
  requireOnline(team, '球団が見つかりません', 409);
  // ⚠ **地域名とチーム名は分けて受け取る**（いしだ 2026-11-20）。略称は地域名をそのまま
  //    使うので、「美瑛ブルーレイクス」の略称が「美瑛ブ」にならない。
  //    地域名は地元（`hometown.js` の県の表）も引くので、変えれば地元も変わる。
  // ⚠ 古い画面・アプリは `teamName` だけを送ってくる。そのときは表示名を差し替え、
  //    名前が変わったときだけ分けた名前（地域名・チーム名・地方）も合わせて直す（下の `else if` の注）
  if (cityName !== undefined || nickname !== undefined || region !== undefined) {
    const city = String(cityName ?? teamCityOf(team) ?? '').trim();
    const nick = String(nickname ?? teamNicknameOf(team) ?? '').trim();
    requireOnline(city.length <= 8, '地域名は8字までです', 400);
    requireOnline(nick.length <= 16, 'チーム名は16字までです', 400);
    const shown = `${city}${nick}`.trim() || team.name;
    // ⚠ 断るかどうかは**書き換える前に**決める（地方だけ先に書いてから断っていた）
    assertTeamNameFree(league, team, shown);
    // ⚠ **正式名が変わらないなら断らない**。分けずに付け替えた古い球団（例「旭川」の枠を
    //    「旭川ホワイトベアーズ」にした。略称「旭川ホ」）は小窓の地域名が「旭川」で埋まって
    //    開くので、ほかの球団が「旭川」だと何も打たないうちから断られ、ひとことすら直せ
    //    なかった（2026-11-20 監査）。そのときは名前を今の形のまま残し、ぶつかる略称にはしない
    const sameName = shown === (team.displayName || team.name);
    const splitClash = shortClashOf(league, team, { displayCity: city || undefined, displayName: shown });
    if (!sameName && splitClash) requireOnline(false, splitClash, 409);
    const keepName = sameName && splitClash;
    // ⚠ **地方は先に選ぶ**（いしだ 2026-11-20）。選べば地域名は自由に書けて、地元も付く。
    //    知らないidは断る（画面の一覧＝`REGION_OPTIONS` 以外は入れない）
    if (region !== undefined) {
      const picked = String(region || '').trim();
      requireOnline(
        !picked || REGION_OPTIONS.some((r) => r.id === picked),
        'その地方は選べません',
        400,
      );
      team.displayRegion = picked || undefined;
    }
    if (!keepName) {
      team.displayCity = city || undefined;
      team.displayNickname = nick || undefined;
      team.displayName = shown;
      member.displayName = shown;
    }
  } else if (teamName !== undefined) {
    const shown = String(teamName || '').trim() || team.name;
    assertTeamNameFree(league, team, shown);
    // ⚠ 古い送り方（アプリ・初めのセット選びの `TeamIdentity`）は名前を変えなくても
    //    毎回 `teamName` を送ってくるので、**名前が変わったときだけ**分けた名前を直す。
    //    残すと正式名だけ変わって略称・地域名・地元が前の名前のままになっていた
    //    （2026-11-20 監査）。新しい名前がいまの地域名で始まるなら地域名と地方は残し、
    //    チーム名だけ差し替える。始まらなければ3つとも消す（分けていない球団と同じ扱い）
    if (shown !== (team.displayName || team.name)) {
      const city = team.displayCity;
      const keepCity = city && shown.startsWith(city) && shown.length > city.length;
      // ⚠ 古い送り方でも略称がぶつかるなら断る（判断1。地域名を消すと略称は頭3文字になる）
      assertShortFree(league, team, { displayCity: keepCity ? city : undefined, displayName: shown });
      if (keepCity) {
        team.displayNickname = shown.slice(city.length);
      } else {
        clearTeamSplitName(team);
      }
    }
    team.displayName = shown;
    member.displayName = shown;
  }
  if (playerName !== undefined) {
    const who = String(playerName || '').trim();
    requireOnline(who.length <= 24, '名前が長すぎます', 400);
    member.label = who || member.displayName || team.name;
  }
  // 球団ロゴと球団の色（`look/logoData.js` の保存の形）。null なら自動のロゴに戻す。
  // ⚠ 送られてきたものはそのまま保存しない（知らない部品・桁外れの数・長い字を `cleanLogo` で落とす）。
  //    ロゴはほかの人の画面にも出る
  if (logo !== undefined) {
    if (logo === null) {
      clearTeamLogo(team);
    } else {
      const cleaned = cleanLogo(logo);
      requireOnline(cleaned, 'このロゴは保存できません（部品が無いか、大きすぎます）', 400);
      // 地の色と差し色が近すぎると、ロゴも帽子の字もほかの人の画面で読めない（作る小窓も同じ決まりで止める）
      const colorProblem = logoColorsProblem(cleaned.colors);
      requireOnline(!colorProblem, colorProblem, 400);
      team.logo = cleaned;
    }
  }
  // オーナーのひとこと（改善案 C1）。順位表・球団の画面・紙面に出す。空なら消す。
  // ⚠ 書いた日も残す（紙面で「開幕前の宣言」と結果を並べられるように）
  if (comment !== undefined) {
    const { text, tooLong } = cleanText(comment, OWNER_COMMENT_MAX);
    requireOnline(!tooLong, `ひとことは${OWNER_COMMENT_MAX}字までです`, 400);
    // ⚠ **文が同じなら書いた日を変えない**。画面は球団名と一緒にひとことも送ってくるので、
    //    球団名を変えただけで「開幕前の宣言」が今日書いたことになっていた
    if (!text) delete member.comment;
    else if (member.comment?.text !== text)
      member.comment = { text, at: now, year: league.season?.year ?? null };
  }
  return {
    teamName: team.name,
    displayName: team.displayName,
    city: teamCityOf(team),
    nickname: teamNicknameOf(team),
    region: teamRegionOf(team),
    label: member.label,
    comment: member.comment?.text || '',
    logo: team.logo || null,
  };
}

/**
 * 次に参加する人の通し番号（セットの種は `seed + 7 + 番号`。0 は開幕前のセット）。
 * ⚠ `memberSeq` だけを信じないこと。版13へ上げた段で入れていなかったので、版13のリーグには
 *    無いものがある。人数・残っている人の種・名簿に居るセットの選手のid（`種×1000＋n`。
 *    セットが名簿に入ると種は消える）からも数え、いちばん大きいものの次にする。
 *    同じ種を2度使うと、別の人の名簿に同じidの選手ができる
 */
export function nextMemberIndex(league) {
  const base = (league.seed || 0) + 7;
  let next = Math.max(league.memberSeq ?? 0, (league.members || []).length);
  for (const m of league.members || [])
    if (Number.isInteger(m.packSeed) && m.packSeed > base) next = Math.max(next, m.packSeed - base + 1);
  for (const team of Object.values(league.game?.teams || {}))
    for (const p of team?.players || []) {
      const at = Math.floor((Number(p?.id) || 0) / 1000) - base;
      // セットの選手のidだけを見る（ほかの選手のidは小さな通し番号）
      if (at >= 1 && at <= 10000) next = Math.max(next, at + 1);
    }
  return next;
}

export function applyJoin(league, { userId, label, teamName, now }) {
  const { team } = assertCanJoin(league, userId);
  const shown = String(teamName || '').trim() || team.name;
  assertTeamNameFree(league, team, shown);
  // ⚠ 参加で付ける名前は分けない（略称は頭3文字）。それでもほかの球団の略称とぶつかるなら断る（判断1）
  assertShortFree(league, team, { displayCity: undefined, displayNickname: undefined, displayName: shown });
  // ⚠ 前のオーナーが分けて付けた名前（地域名・チーム名・地方）を引き継がない（2026-11-20 監査）
  clearTeamSplitName(team);
  // 前のオーナーが作ったロゴも引き継がない
  clearTeamLogo(team);
  team.displayName = shown;
  // ⚠ **種の番号は参加の通し番号**（人数ではない）。球団をCPUに戻すと人数が減るので、
  //    人数で数えると次に入った人が残っている人と同じ種になり、同じidの選手ができる
  const index = nextMemberIndex(league);
  league.memberSeq = index + 1;
  league.members = [
    ...(league.members || []),
    {
      userId,
      label: label || shown,
      // ⚠ `teamName` は**内部名**。参加後の照合はすべてこれで行う
      teamName: team.name,
      displayName: shown,
      joinedAt: now,
      // 参加した年（オーナーの通算はこの年から数える。`server/ownerRecords.mjs`）
      ...(Number.isFinite(league.season?.year) ? { joinedYear: league.season.year } : {}),
      // ⚠ 来た時刻も入れる。無いと `isAwayAt` が留守にせず、来なくなってもおるすばんにならない
      lastSeenAt: now,
      // ⚠ **開幕後に参加した人には、自分のセットを選ばせる**。引き継いだCPUの
      //    名簿のままだと、自分で選んだ24人で始められない。
      //    選んだセットは**次のキャンプ**で名簿に入る（シーズン途中で入れ替えると
      //    順位表と成績が合わなくなる）。
      // ⚠ セットそのものは保存しない。20セット×24人＝480人を抱えることになる。
      //    **種だけ**持ち、見るたびに作り直す（`generateRosterPacks` はシードから
      //    決まるので、何度作っても同じ選手になる）。
      // ⚠ 種は人ごとにずらすこと。選手のidは `種×1000＋1〜480` なので、
      //    同じ種を使うと**別の人の名簿に同じidの選手**ができる。
      ...(league.phase?.kind === 'pack_select'
        ? // 開幕前の手続きの最中なら、その手続きで一緒に選ぶ
          null
        : {
            packSeed: (league.seed || 0) + 7 + index,
            // ⚠ **作り方の版も残す**。種から作り直すので、版が変わると
            //    選んだあとでセットの中身が入れ替わってしまう
            packStyle: PACK_STYLE,
            pendingPackId: null,
          }),
    },
  ];
  return {
    league,
    teamName: team.name,
    displayName: shown,
    leagueId: team.league,
  };
}

/**
 * 参加者の人数が成立しているか。1人でも成立する。
 * ⚠ **0人を許さないこと**。誰も居ないリーグは進める意味が無く、
 *    管理者が不在なので停止も再開もできなくなる。
 */
export function assertMemberCount(members) {
  requireOnline(Array.isArray(members), '参加者の設定が必要です');
  requireOnline(members.length >= 1, '参加者が1人も居ません');
  requireOnline(
    members.length <= MAX_MEMBERS,
    `参加できるのは${MAX_MEMBERS}人までです`,
  );
  requireOnline(
    members.every((m) => typeof m.userId === 'string' && m.userId),
    '参加者の識別子が不正です',
  );
  requireOnline(
    new Set(members.map((m) => m.userId)).size === members.length,
    '同じ参加者が重複しています',
  );
}
