import React, { useMemo, useState } from 'react';
import {
  TRAINING_MENUS,
  SUB_TRAINING_MENUS,
  menuFitsPlayer,
  subMenuFitsPlayer,
} from '../season/campTraining.js';
import {
  DIRECTIONS,
  PHASES,
  playerWish,
  describeMood,
  resolveTraining,
} from '../season/trainingPolicy.js';
import { POS } from './api.js';
import { getPitchTypeName, FORM_SHORT } from '../utils/constants.js';
import {
  CAMP_MENUS,
  CAMP_SUB_MENUS,
  CAMP_DIRECTIONS,
  CAMP_PHASES,
} from './shared.js';
import { PlayerStatsButton } from './PlayerPerformance.jsx';
import { useDraftState, phaseDraftName } from './Drafts.jsx';
import { Choice } from './Choice.jsx';

// ============================================================
// キャンプ。一人用のキャンプ画面と同じ作りにする。
//
//   育成方針（長所／全体／短所 × 基礎体力／技術）→ 全員に一括
//   選手ごとに**メイン練習とサブ練習**を選ぶ
//   「第Nクール練習を実行」→ 伸びた能力を見て、次のクールを決める（全4回）
//
// ⚠ **1クールずつサーバーで実行する**（`campRound` 命令）。画面で計算して
//    まとめて送る形にはしないこと——成長の計算は保存の正本に当てるもので、
//    画面で回すと手元の数字と保存がずれる。
// ⚠ **同じクールを2回走らせない**。押し直しや再送で成長が二重に積まれるので、
//    クール番号を送って、サーバーが次の1つだけを受け付ける。
// ⚠ 一人用の画面（`CampScreen`）をそのまま持ち込まないこと。あちらは派遣・
//    大学リーグの昇降格・スタッフ退職まで抱えていて、オンラインのエンジンは
//    それらを動かさない。出すと「できるように見えて何も起きない」ものが並ぶ。
// ⚠ メニューの表は一人用と**同じものを読む**（`TRAINING_MENUS` /
//    `SUB_TRAINING_MENUS`）。写すと、調整したときに片方だけ古くなる。
//    出すのは `CAMP_MENUS` / `CAMP_SUB_MENUS` に載っているものだけ
//    ——`TRAINING_MENUS` にはオンラインで動かないもの（新球種習得）がある。
// ============================================================

/** 投手に出すメイン練習／野手に出すメイン練習 */
export const menusFor = (isPitcher) =>
  Object.entries(TRAINING_MENUS).filter(
    ([key]) =>
      CAMP_MENUS.includes(key) &&
      menuFitsPlayer(key, { position: isPitcher ? 'pitcher' : 'catcher' }),
  );

/**
 * その選手に出すサブ練習。
 * ⚠ **効かないものを出さない**。変化球練習・新球種習得・スピン解析は投手だけ、
 *    Cリード学習は捕手だけ。出すと、選べるのにそのクールが丸ごと無駄になる。
 */
export const subMenusFor = (player) =>
  Object.entries(SUB_TRAINING_MENUS).filter(
    ([key]) => CAMP_SUB_MENUS.includes(key) && subMenuFitsPlayer(key, player),
  );

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
export const clampSub = (key, player) =>
  CAMP_SUB_MENUS.includes(key) && subMenuFitsPlayer(key, player)
    ? key
    : 'physique';

const MOOD_TONE = { good: '意欲的', mid: '納得', bad: '身が入らない' };
const grade = (v) => (typeof v === 'number' ? Math.round(v) : '—');
// ⚠ 成長は**倍率**（0.70〜1.30）。四捨五入すると全員「1」になって読めない
const ratio = (v) => (typeof v === 'number' ? v.toFixed(2) : '—');

/**
 * 変化球は「名前＋キレ」。投手の行にだけ出す。
 * ⚠ 置き場は `pitching.arsenal`（`pitchTypes` ではない）。直球は外す
 *    （全員が持っていて、並べても見分けがつかない）。
 */
function pitchTypes(player) {
  return (player.pitching?.arsenal || [])
    .filter((pitch) => pitch?.type && pitch.type !== 'straight')
    .map((pitch) => `${getPitchTypeName(pitch.type)}${pitch.level ?? ''}`)
    .join(' ');
}

function PlayerRow({ player, main, sub, onMain, onSub, busy, policy }) {
  const isPitcher = player.position === 'pitcher';
  const wish = useMemo(() => playerWish(player), [player]);
  const mood = describeMood(player, policy.direction, policy.phase);
  return (
    <tr>
      <th>
        <PlayerStatsButton player={player} panel="abilities" />
      </th>
      {/* ⚠ 投手の表に守備位置は出さない（全員「投」で、1列ぶん無駄になる） */}
      {!isPitcher && <td>{POS[player.position]}</td>}
      <td>{player.age}</td>
      <td>{ratio(player.growthPotential)}</td>
      <td>{grade(player.personality?.discipline)}</td>
      <td>{grade(player.personality?.mental)}</td>
      <td className={`online-mood is-${mood.tone}`}>
        {MOOD_TONE[mood.tone] || mood.label}
      </td>
      <td>
        {player.physical?.throws === 'left' ? '左' : '右'}/
        {player.batting?.bats === 'left'
          ? '左'
          : player.batting?.bats === 'switch'
            ? '両'
            : '右'}
      </td>
      <td>{isPitcher ? FORM_SHORT[player.pitching?.form] || '—' : '—'}</td>
      <td>{grade(player.physical?.arm)}</td>
      {isPitcher ? (
        <>
          <td>{grade(player.pitching?.velocity)}</td>
          <td>{grade(player.pitching?.control)}</td>
          <td>{grade(player.pitching?.spinRate)}</td>
          <td>{grade(player.pitching?.stamina)}</td>
        </>
      ) : (
        <>
          <td>{grade(player.batting?.meet)}</td>
          <td>{grade(player.batting?.power)}</td>
          <td>{grade(player.batting?.eye)}</td>
          <td>{grade(player.batting?.bunt)}</td>
        </>
      )}
      <td>{grade(player.physical?.speed)}</td>
      <td>{grade(player.fielding?.defense)}</td>
      <td>{grade(player.physical?.bodyStamina)}</td>
      <td>{grade(player.physical?.recovery)}</td>
      <td>{grade(player.physical?.muscle)}</td>
      <td>
        <select
          aria-label={`${player.name}のメイン練習`}
          value={main}
          disabled={busy}
          onChange={(e) => onMain(player.id, e.target.value)}
        >
          {menusFor(isPitcher).map(([key, menu]) => (
            <option key={key} value={key}>
              {menu.icon} {menu.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          aria-label={`${player.name}のサブ練習`}
          value={sub}
          disabled={busy}
          onChange={(e) => onSub(player.id, e.target.value)}
        >
          {subMenusFor(player).map(([key, menu]) => (
            <option key={key} value={key}>
              {menu.icon} {menu.name}
            </option>
          ))}
        </select>
      </td>
      {/* ⚠ 希望は**印だけ**にして、全文は title で出す。名前で出すと
          「長所を伸ばす·基礎体力」で90pxを取り、右端の列が隠れる */}
      <td
        className="online-camp-wish"
        title={`${DIRECTIONS[wish.direction]?.name}·${PHASES[wish.phase]?.name}`}
      >
        {DIRECTIONS[wish.direction]?.icon}
        {PHASES[wish.phase]?.icon}
      </td>
      {/* ⚠ 変化球は**いちばん右**。23列あって1500pxの画面には収まりきらないので、
          切れてよい列（見るだけのもの）を端に置き、メイン・サブの選択欄は必ず
          見えるようにする。全文は title で出す。
          ⚠ 投手の表だけ。野手の表に空の列を作らない */}
      {isPitcher && (
        <td className="online-camp-pitches" title={pitchTypes(player)}>
          {pitchTypes(player)}
        </td>
      )}
    </tr>
  );
}

// 守備位置のまとまり。⚠ 一人用のキャンプ画面と同じ分け方にする
const CAMP_GROUPS = [
  { id: 'pitcher', label: '投手', has: (p) => p.position === 'pitcher' },
  { id: 'catcher', label: '捕手', has: (p) => p.position === 'catcher' },
  {
    id: 'infield',
    label: '内野手',
    has: (p) => ['first', 'second', 'third', 'short'].includes(p.position),
  },
  {
    id: 'outfield',
    label: '外野手',
    has: (p) => ['left', 'center', 'right'].includes(p.position),
  },
];

export default function CampPlanner({
  view,
  busy,
  run,
  command,
  compact = false,
}) {
  const [group, setGroup] = useState('pitcher');
  const camp = view.phase?.camp;
  const done = camp?.rounds || 0;
  const total = camp?.total || 4;
  const roster = view.roster || [];
  // ⚠ **未保存の割り当ては、再読込や表示の切り替えで消さないこと**
  //    （ほかの手続きと同じ `useDraftState`）。26人ぶん選んだあとに画面を
  //    読み直して全部消えると、やり直す気が失せる。
  //    実行済みのクールの指示（`camp.plan`）を初期値にする。
  const phaseId = view.phase?.id;
  const [policy, setPolicy] = useDraftState(
    phaseDraftName(phaseId, 'camp.policy'),
    () => camp?.plan?.policy || { direction: 'balanced', phase: 'skill' },
  );
  const [main, setMain] = useDraftState(
    phaseDraftName(phaseId, 'camp.main'),
    () => camp?.plan?.main || {},
  );
  const [sub, setSub] = useDraftState(
    phaseDraftName(phaseId, 'camp.sub'),
    () => camp?.plan?.sub || {},
  );
  const mainOf = (p) =>
    clampMenu(
      main[p.id] || resolveTraining(p, policy.direction, policy.phase).main,
      p,
    );
  const subOf = (p) =>
    clampSub(
      sub[p.id] || resolveTraining(p, policy.direction, policy.phase).sub,
      p,
    );
  // ⚠ 方針を変えたら**割り当ても引き直す**。方針はやる気にも効くので、
  //    方針だけ変わって練習が前のままだと噛み合いが読めない
  const applyPolicy = (next) => {
    setPolicy(next);
    const nextMain = {};
    const nextSub = {};
    for (const p of roster) {
      const r = resolveTraining(p, next.direction, next.phase);
      nextMain[p.id] = clampMenu(r.main, p);
      nextSub[p.id] = clampSub(r.sub, p);
    }
    setMain(nextMain);
    setSub(nextSub);
  };
  const applyAll = (key, isPitcherOnly) => {
    const next = { ...main };
    for (const p of roster)
      if (
        isPitcherOnly === null ||
        (p.position === 'pitcher') === isPitcherOnly
      )
        next[p.id] = clampMenu(key, p);
    setMain(next);
  };
  const execute = () =>
    run(() =>
      command('campRound', {
        round: done + 1,
        policy,
        main: Object.fromEntries(roster.map((p) => [p.id, mainOf(p)])),
        sub: Object.fromEntries(roster.map((p) => [p.id, subOf(p)])),
      }),
    );
  // ⚠ **守備位置で1グループずつ出す**（一人用と同じ）。24人を全部並べると
  //    1行31pxでも画面が1300px超になり、下の実行ボタンまで何度もスクロール
  //    することになる（実測で全部出すと1326px、1グループなら700px前後）。
  const groups = CAMP_GROUPS.map(({ id, label, has }) => ({
    id,
    label,
    list: roster.filter(has),
  })).filter((g) => g.list.length);
  const shownGroup = groups.find((g) => g.id === group) || groups[0];
  const finished = done >= total;
  return (
    <div className="online-camp">
      <div className="online-camp-head">
        <h3>春季キャンプ</h3>
        <div className="online-camp-rounds" aria-label="クールの進み">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={i < done ? 'is-done' : i === done ? 'is-now' : ''}
            >
              {i + 1}
            </span>
          ))}
          <small>
            {done}/{total}
          </small>
        </div>
      </div>
      {finished ? (
        <p className="online-muted" role="status">
          全{total}クールが終わりました。伸びた能力で
          <strong>スタメン設定・投手起用</strong>
          を整えて、月曜の開幕を待ちます。
        </p>
      ) : (
        <p className="online-muted">
          メイン練習とサブ練習を選んで実行します。1クールごとに結果が反映されるので、
          伸びた能力を見て次のクールを決められます。
          締め切りまでに終わらなかったぶんは、最後に指示した内容で自動で行われます。
        </p>
      )}
      <section className="online-camp-bulk">
        <div className="online-camp-bulk-fields">
          {/* ⚠ 選択肢が数個のものは**ボタンを並べる**（PC版の共通のルール。
              コンボボックスは開かないと何があるか分からない） */}
          <Choice
            label="育成方針"
            options={Object.fromEntries(
              CAMP_DIRECTIONS.map((key) => [
                key,
                `${DIRECTIONS[key].icon} ${DIRECTIONS[key].name}`,
              ]),
            )}
            value={policy.direction}
            disabled={busy || finished}
            onChange={(direction) => applyPolicy({ ...policy, direction })}
          />
          <Choice
            label="段階"
            options={Object.fromEntries(
              CAMP_PHASES.map((key) => [
                key,
                `${PHASES[key].icon} ${PHASES[key].name}`,
              ]),
            )}
            value={policy.phase}
            disabled={busy || finished}
            onChange={(phase) => applyPolicy({ ...policy, phase })}
          />
          <span className="online-camp-bulk-all">全員に一括:</span>
          {menusFor(false)
            .filter(([key]) => !key.startsWith('intensive_'))
            .map(([key, menu]) => (
              <button
                key={key}
                disabled={busy || finished}
                onClick={() => applyAll(key, false)}
              >
                {menu.icon} {menu.name}
              </button>
            ))}
          {menusFor(true)
            .filter(
              ([key]) => !key.startsWith('intensive_') && key !== 'fielding',
            )
            .map(([key, menu]) => (
              <button
                key={key}
                disabled={busy || finished}
                onClick={() => applyAll(key, true)}
              >
                {menu.icon} {menu.name}
              </button>
            ))}
        </div>
        <p className="online-muted">
          {DIRECTIONS[policy.direction]?.description}／
          {PHASES[policy.phase]?.description}
          {/* ⚠ 希望どおりが正解ではない。噛み合うとやる気が上がるだけ */}
          　本人の希望と噛み合うほど練習が身につきます（正解とは限りません）。
        </p>
      </section>
      {/* ⚠ 携帯は表を出さない。23列は入らない。方針と実行だけで4クール回せる */}
      {compact && !finished && (
        <p className="online-muted">
          選手ごとの練習はPCで選べます。ここでは育成方針だけで進みます。
        </p>
      )}
      {!compact && (
        <div
          className="online-segments online-camp-tabs"
          role="group"
          aria-label="守備位置"
        >
          {groups.map((g) => (
            <button
              key={g.id}
              aria-pressed={g.id === shownGroup?.id}
              onClick={() => setGroup(g.id)}
            >
              {g.label} {g.list.length}
            </button>
          ))}
        </div>
      )}
      {!compact && shownGroup && (
        <section key={shownGroup.id} className="online-camp-group">
          <div className="online-camp-scroll">
            <table>
              <thead>
                <tr>
                  <th>氏名</th>
                  {shownGroup.id !== 'pitcher' && <th>ポジ</th>}
                  <th>年齢</th>
                  <th>成長</th>
                  <th>プロ意識</th>
                  <th>精神</th>
                  <th>意欲</th>
                  <th>投/打</th>
                  <th>フォーム</th>
                  <th>肩</th>
                  {shownGroup.id === 'pitcher' ? (
                    <>
                      <th>球速</th>
                      <th>制球</th>
                      <th>スピン</th>
                      <th>スタミナ</th>
                    </>
                  ) : (
                    <>
                      <th>ミート</th>
                      <th>パワー</th>
                      <th>選球眼</th>
                      <th>バント</th>
                    </>
                  )}
                  <th>走力</th>
                  <th>守備</th>
                  <th>体力</th>
                  <th>回復</th>
                  <th>体幹</th>
                  <th>メイン</th>
                  <th>サブ</th>
                  <th title="本人が伸ばしたいと思っている方向">希望</th>
                  {shownGroup.id === 'pitcher' && <th>変化球</th>}
                </tr>
              </thead>
              <tbody>
                {shownGroup.list.map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    main={mainOf(p)}
                    sub={subOf(p)}
                    busy={busy || finished}
                    policy={policy}
                    onMain={(id2, key) => setMain({ ...main, [id2]: key })}
                    onSub={(id2, key) => setSub({ ...sub, [id2]: key })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!finished && (
        <div className="online-actions online-camp-run">
          <button className="online-primary" disabled={busy} onClick={execute}>
            第{done + 1}クール練習を実行
          </button>
        </div>
      )}
    </div>
  );
}
