import React, { useMemo, useState } from 'react';
import { TRAINING_MENUS, menuFitsPlayer } from '../season/campTraining.js';
import {
  DIRECTIONS,
  PHASES,
  playerWish,
  describeMood,
  resolveTraining,
} from '../season/trainingPolicy.js';
import { POS } from './api.js';
import { CAMP_MENUS } from './shared.js';
import { Choice } from './Choice.jsx';
import { AbilityGrade, PlayerStatsButton, ConditionMark } from './PlayerPerformance.jsx';

// ============================================================
// キャンプの割り当て。一人用のキャンプ画面と同じ作りにする。
//
// ⚠ **選手ごとにメニューを決める**。以前は球団で1つ選ぶだけで、
//    一人用（1人ずつ割り当てる）とは別物だった。
// ⚠ **クールごとの出し入れはできない**。一人用は4クールを1つずつ見ながら
//    進めるが、オンラインは締め切りでまとめて処理するので、途中の結果を見て
//    次を決めることができない。**同じ割り当てで4クール**と画面に書くこと。
// ⚠ **一人用の画面（`CampScreen`）をそのまま持ち込まないこと**。あちらは
//    派遣・サブ練習・大学リーグの昇降格・スタッフ退職まで抱えていて、
//    オンラインのエンジンはそれらを動かさない。出すと「できるように見えて
//    何も起きない」ものが並ぶ。
// ⚠ メニューの表（`TRAINING_MENUS`）と方針の表（`trainingPolicy`）は
//    一人用と**同じものを読む**。写すと、調整したときに片方だけ古くなる。
// ============================================================

/**
 * 投手に出すメニュー／野手に出すメニュー。
 *
 * ⚠ **サーバーが受け取れるものだけ出すこと**（`CAMP_MENUS`）。
 *    `TRAINING_MENUS` には「新球種習得」のようにオンラインのエンジンが
 *    動かさないものがあり、出すと選べるのに提出で弾かれる（実測で出ていた）。
 */
export const menusFor = (isPitcher) =>
  Object.entries(TRAINING_MENUS).filter(
    ([key]) =>
      CAMP_MENUS.includes(key) &&
      menuFitsPlayer(key, { position: isPitcher ? 'pitcher' : 'catcher' }),
  );

const MOOD_TONE = { good: '意欲的', mid: '納得', bad: '身が入らない' };

/**
 * ⚠ 受け取れないメニュー・守備位置に合わないメニューに落ちたら既定へ戻す。
 *    方針から引いた結果は、野手に投球系が出ることがある（選択肢に無いので
 *    一覧には「打撃練習」と出るのに、サーバーは球速練習で処理していた）
 */
export const clampMenu = (key, player) =>
  CAMP_MENUS.includes(key) && menuFitsPlayer(key, player)
    ? key
    : player.position === 'pitcher'
      ? 'control'
      : 'batting';

function PlayerRow({ player, value, onChange, busy }) {
  const isPitcher = player.position === 'pitcher';
  const wish = useMemo(() => playerWish(player), [player]);
  // ⚠ 噛み合いは**いまの割り当てから逆算する**。方針を持たせていないので、
  //    メニューがどの方針・段階に当たるかを総当たりで探す
  const mood = useMemo(() => {
    for (const direction of Object.keys(DIRECTIONS))
      for (const phase of ['physique', 'skill'])
        if (resolveTraining(player, direction, phase).main === value)
          return describeMood(player, direction, phase);
    return null;
  }, [player, value]);
  return (
    <tr>
      <th>
        <PlayerStatsButton player={player} panel="abilities" />
        <small>
          {player.age}歳·{POS[player.position]}
        </small>
      </th>
      <td>
        <ConditionMark player={player} />
      </td>
      {isPitcher ? (
        <>
          <td>
            <AbilityGrade value={player.pitching?.velocity} velocity />
          </td>
          <td>
            <AbilityGrade value={player.pitching?.control} />
          </td>
          <td>
            <AbilityGrade value={player.pitching?.stamina} stamina />
          </td>
        </>
      ) : (
        <>
          <td>
            <AbilityGrade value={player.batting?.meet} />
          </td>
          <td>
            <AbilityGrade value={player.batting?.power} />
          </td>
          <td>
            <AbilityGrade value={player.fielding?.defense} />
          </td>
        </>
      )}
      <td>
        <select
          aria-label={`${player.name}の練習`}
          value={value}
          disabled={busy}
          onChange={(e) => onChange(player.id, e.target.value)}
        >
          {menusFor(isPitcher).map(([key, menu]) => (
            <option key={key} value={key}>
              {menu.icon} {menu.name}
            </option>
          ))}
        </select>
      </td>
      <td className="online-camp-wish">
        {/* ⚠ 本人の希望は**正解ではない**。噛み合うとやる気が上がるだけで、
            何を伸ばすべきかは別の判断 */}
        <small>
          {DIRECTIONS[wish.direction]?.name}·{PHASES[wish.phase]?.name}
        </small>
        {mood && (
          <small className={`online-mood is-${mood.tone}`}>
            {MOOD_TONE[mood.tone] || mood.label}
          </small>
        )}
      </td>
    </tr>
  );
}

export default function CampPlanner({ view, plan, busy, onChange }) {
  const [bulk, setBulk] = useState({ direction: 'balanced', phase: 'skill' });
  const roster = view.roster || [];
  const assignments = plan.assignments || {};
  const defaultFor = (player) =>
    player.position === 'pitcher' ? 'control' : 'batting';
  // ⚠ 保存済みの割り当てが守備位置に合わないとき（以前の一括設定の残り）は、
  //    サーバーと同じく既定で見せる（サーバーは合わないものを落とす）
  const valueOf = (player) =>
    clampMenu(assignments[player.id] || defaultFor(player), player);
  const setOne = (id, key) =>
    onChange({ ...plan, assignments: { ...assignments, [id]: key } });
  // ⚠ 一括設定は**方針から引く**（`resolveTraining`）。選手ごとに長所・短所が
  //    違うので、同じメニューを全員に当てるより噛み合う
  const applyBulk = (only) =>
    onChange({
      ...plan,
      assignments: Object.fromEntries(
        roster.map((p) => [
          p.id,
          only && (p.position === 'pitcher') !== (only === 'pitcher')
            ? valueOf(p)
            : // ⚠ サーバーが受け取れないメニューに落ちたら既定へ戻す。
              //    方針から引いた結果をそのまま入れると提出で弾かれる
              clampMenu(resolveTraining(p, bulk.direction, bulk.phase).main, p),
        ]),
      ),
    });
  const groups = [
    ['pitcher', '投手', roster.filter((p) => p.position === 'pitcher')],
    ['fielder', '野手', roster.filter((p) => p.position !== 'pitcher')],
  ];
  return (
    <div className="online-camp">
      <p className="online-muted">
        選手ごとに練習を割り当てます。
        <strong>全4クールを同じ割り当てで行います</strong>
        （締め切りでまとめて処理するので、途中の結果を見て次を決めることはできません）。
      </p>
      <section className="online-camp-bulk">
        <h3>まとめて割り当てる</h3>
        <div className="online-camp-bulk-fields">
          {/* ⚠ 選択肢が数個のものは**ボタンを並べる**（PC版の共通のルール。
              コンボボックスは開かないと何があるか分からない） */}
          <Choice
            label="方針"
            options={Object.fromEntries(
              Object.values(DIRECTIONS).map((d) => [d.key, `${d.icon} ${d.name}`]),
            )}
            value={bulk.direction}
            disabled={busy}
            onChange={(direction) => setBulk({ ...bulk, direction })}
          />
          <Choice
            label="段階"
            options={Object.fromEntries(
              ['physique', 'skill'].map((key) => [
                key,
                `${PHASES[key].icon} ${PHASES[key].name}`,
              ]),
            )}
            value={bulk.phase}
            disabled={busy}
            onChange={(phase) => setBulk({ ...bulk, phase })}
          />
          <button disabled={busy} onClick={() => applyBulk(null)}>
            全員に当てる
          </button>
          <button disabled={busy} onClick={() => applyBulk('pitcher')}>
            投手だけ
          </button>
          <button disabled={busy} onClick={() => applyBulk('fielder')}>
            野手だけ
          </button>
        </div>
        <p className="online-muted">
          {DIRECTIONS[bulk.direction]?.description}／{PHASES[bulk.phase]?.description}
        </p>
      </section>
      {groups.map(([id, label, list]) =>
        list.length ? (
          <section key={id} className="online-camp-group">
            <h3>
              {label} · {list.length}人
            </h3>
            <table>
              <thead>
                <tr>
                  <th>選手</th>
                  <th>調子</th>
                  {id === 'pitcher' ? (
                    <>
                      <th>球速</th>
                      <th>制球</th>
                      <th>スタミナ</th>
                    </>
                  ) : (
                    <>
                      <th>ミート</th>
                      <th>パワー</th>
                      <th>守備</th>
                    </>
                  )}
                  <th>練習</th>
                  <th>本人の希望</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    value={valueOf(p)}
                    busy={busy}
                    onChange={setOne}
                  />
                ))}
              </tbody>
            </table>
          </section>
        ) : null,
      )}
    </div>
  );
}
