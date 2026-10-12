// ============================================================
// セカンドキャリア判定 - src/season/secondCareer.js
//
// 引退した選手が、その後「監督・コーチ・スカウト」として球界に残るかを、
// 現役時代の実力・知名度・プロ意識から判定する。全ゲームモード共通の
// ナラティブ層（選手ストーリー・資料室に "引退後○○コーチ就任" を刻む）。
//
// ・監督   : 実力＋知名度が突出したフランチャイズ・レジェンド
// ・コーチ : 指導者適性が高い（ポジションで打撃/投手/バッテリー/守備走塁）
// ・スカウト: プロ意識が高く選手を見る目がある玄人肌
// ・なし   : 上記に満たない、または適性ロールに外れた選手（完全引退）
//
// convertPlayerToStaff（社会人モードのスタッフ変換）と役割マッピングは揃えつつ、
// こちらは「世界共通の記録」を作る軽量な純粋ロジックに徹する。
// ============================================================

// 現役時代の総合力（0〜100目安）。convertPlayerToStaff と同じ観点で算出。
function calcPlayingOverall(player) {
  const isPitcher = player.position === 'pitcher';
  if (isPitcher) {
    const v = player.pitching?.velocity || 130;
    const c = player.pitching?.control || 40;
    const s = player.pitching?.stamina || 60;
    const arm = player.physical?.arm || 40;
    const arsenal = player.pitching?.arsenal || [];
    const breaking = arsenal.filter(a => a.type !== 'straight');
    const bestBreaking = breaking.reduce((mx, a) => Math.max(mx, a.level || 0), 0);
    const count = breaking.filter(a => (a.level || 0) >= 20).length;
    const arsenalBonus = count >= 3 ? 8 : count >= 2 ? 4 : 0;
    return ((v - 120) * 1.2 + c * 0.8 + s * 0.3 + bestBreaking * 0.4 + arsenalBonus + arm * 0.2) / 3;
  }
  const m = player.batting?.meet || 30;
  const p = player.batting?.power || 30;
  const e = player.batting?.eye || 20;
  const sp = player.physical?.speed || 30;
  const arm = player.physical?.arm || 30;
  const def = player.fielding?.defense || 30;
  const stl = player.physical?.steal || 20;
  return (m + p + e * 0.7 + sp * 0.6 + arm * 0.5 + def * 0.8 + stl * 0.4) / 4;
}

// 野手のコーチ専門を、打撃寄りか守備走塁寄りかで決める。
function fielderCoachTitle(player) {
  const batting = (player.batting?.meet || 0) + (player.batting?.power || 0);
  const defense = (player.fielding?.defense || 0) * 1.4 + (player.physical?.speed || 0) * 0.6;
  return defense > batting ? { title: '守備走塁コーチ', focus: 'fieldRunCoach' }
                           : { title: '打撃コーチ', focus: 'battingCoach' };
}

// 純粋な適性評価（乱数なし）。ロール別のスコアと、就任時の肩書きを返す。
// テスト・表示の両方から使える。
export function evaluateSecondCareerAptitude(player) {
  const overall = calcPlayingOverall(player);
  const fame = player.fame || 0;
  const discipline = player.personality?.discipline ?? 50;
  const mental = player.personality?.mental ?? 50;
  const isPitcher = player.position === 'pitcher';
  const isCatcher = player.position === 'catcher';

  // 指導者適性: 実力を土台に、プロ意識・メンタルを加味
  const leadership = overall * 0.5 + discipline * 0.35 + mental * 0.15;

  // ポジション別のコーチ肩書き
  let coach;
  if (isPitcher) coach = { title: '投手コーチ', focus: 'pitchingCoach' };
  else if (isCatcher) coach = { title: 'バッテリーコーチ', focus: 'batteryCoach' };
  else coach = fielderCoachTitle(player);

  return { overall, fame, discipline, mental, leadership, coach };
}

// セカンドキャリアを確定する（乱数ゲートあり）。
// 該当しなければ null（完全引退）。
// @returns {{ role, title, focus, year, team }|null}
export function assignSecondCareer(player, currentYear, teamName = null) {
  const apt = evaluateSecondCareerAptitude(player);
  const { leadership, fame, discipline } = apt;

  // 就任確率つきのロール判定。上位ほど希少。
  // rand() は app 実行時のみ（sim harness でも advanceYear 経由で許可）。
  const roll = Math.random();

  // 監督: 実力＋知名度が突出したレジェンド
  if (fame >= 58 && leadership >= 60 && discipline >= 58) {
    if (roll < 0.55) return { role: 'manager', title: '監督', focus: 'managing', year: currentYear, team: teamName };
    // 監督に届かなくてもヘッドコーチには残りやすい
    if (roll < 0.85) return { role: 'coach', title: `ヘッド${apt.coach.title}`, focus: apt.coach.focus, year: currentYear, team: teamName };
  }

  // コーチ: 指導者適性が高い
  if (leadership >= 46) {
    // 適性が高いほど就任確率が上がる（46→0.30, 66→0.70）
    const chance = Math.min(0.75, 0.30 + (leadership - 46) * 0.02);
    if (roll < chance) return { role: 'coach', title: apt.coach.title, focus: apt.coach.focus, year: currentYear, team: teamName };
  }

  // スカウト: プロ意識が高く、選手を見る目のある玄人
  if (discipline >= 60 && leadership >= 34) {
    if (roll < 0.30) return { role: 'scout', title: 'スカウト', focus: 'scoutingEye', year: currentYear, team: teamName };
  }

  return null; // 完全引退
}

// ストーリー/バッジ表示用のロール見た目。
export const SECOND_CAREER_META = {
  manager: { icon: '🎽', color: 'text-amber-300', label: '監督' },
  coach:   { icon: '👔', color: 'text-teal-300',  label: 'コーチ' },
  scout:   { icon: '🔍', color: 'text-sky-300',   label: 'スカウト' },
};
