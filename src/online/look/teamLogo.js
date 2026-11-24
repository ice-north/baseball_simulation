// ============================================================
// 球団ごとのロゴを決めて、ビューの `teamLabels` に載せる。
//
//   人が作ったロゴ（`team.logo`）があればそれ、無ければ「おまかせ」の1番目（`autoLogo`）。
//   どちらも `colors`（球団の色 [地, 差し色, 縁]）を必ず持たせて送る。画面は載ってきた重ねを描くだけで、
//   作る側の表（型・絵の割り当て）を持たなくてよい（アプリは描く側だけを写す）。
//
// ⚠ サーバー（`server/projection.mjs`）が呼ぶ。DOM も React も読まないこと。
// ⚠ 自動のロゴは**保存しない**（毎回ここで作る）。型や絵の表を直せば、作っていない球団のロゴも直る。
// ============================================================
import { buildTeamLooks, nameSource } from './teamLook.js';
import { autoLogo, logoTeam } from './logoBuild.js';
import { cleanLogo, cleanLogoColors } from './logoData.js';

/**
 * ロゴを作る材料（`logoBuild.js` の「球団」）を、ビューの名前ひとそろいと見た目から作る。
 * @param colors 球団の色を選び直しているとき（ロゴを作る画面）だけ渡す
 */
export function logoTeamOf(name, labels, look, colors = null) {
  const team = logoTeam(look, nameSource(name, labels), labels?.nickname);
  if (colors) team.colors = colors;
  return team;
}

/**
 * `teamLabels` の各球団に `logo` を足す（引数を書き換える）。
 * @param teamLabels `{ [内部名]: { label, short, city, nickname, … } }`
 * @param savedOf 内部名 → 保存してあるロゴ（無ければ undefined）
 */
export function attachTeamLogos(teamLabels, savedOf) {
  // ⚠ 字（頭文字）と自動の色は、ロゴを載せる前の名前だけから決める（`buildTeamLooks`）
  const looks = buildTeamLooks(teamLabels);
  for (const [name, labels] of Object.entries(teamLabels)) {
    const look = looks[name];
    const saved = savedOf(name);
    const colors = cleanLogoColors(saved?.colors) || [look.c1, look.c2, look.c3];
    // ⚠ 自動のロゴも保存するものと同じ形（既定の値は書かない・数は小数2桁）に整えて送る。
    //    描く側（Web とアプリ）が受け取る形を1つにするため。約4分の1軽くもなる
    labels.logo = saved?.layers?.length
      ? { ...saved, colors }
      : { ...cleanLogo(autoLogo(logoTeamOf(name, labels, look, colors))), colors, auto: 1 };
  }
  return teamLabels;
}
