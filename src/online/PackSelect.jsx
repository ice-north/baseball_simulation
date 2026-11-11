import React, { useEffect, useRef, useState } from 'react';
import { POS } from './api.js';
import { AbilityGrade, PlayerStatsButton } from './PlayerPerformance.jsx';
import { useMobile } from './useMobile.js';

// ============================================================
// 初期メンバーの選択。20セットから1つ選ぶ。
//
// ⚠ **同じセットは1球団だけ**。選手のidと名前が重複すると、記録が
//    どちらの選手のものか分からなくなる。取り合いになったら球団名の順で
//    決まる（サーバー側）。ここでは「他の人が決めた」ことまでは分からない
//    ——決定は同時に開くので、画面で早い者勝ちにはできない。
// ⚠ 合計点はセット同士の釣り合いを測る目安であって、試合の強さではない。
//    実測で20セットの開きは1%前後。どれを選んでも極端な差は出ない。
//
// ⚠ **名前を決めるのはここ**（セットの下）。始める手順は
//    「ログイン → セットを選ぶ → 球団名とプレイヤー名 → 決定」。
//    以前は参加するときに球団名だけを聞いており、**リーグを作った人は
//    名前を付ける機会が一度も無かった**（順位表に既定の球団名が出たまま）。
// ============================================================

/**
 * 球団名とプレイヤー名。`profile` 命令でその場で保存する。
 *
 * ⚠ **手続きの提出とは別の命令**。セットの選択は締め切りで標準案に
 *    上書きされうるが、名前は上書きされては困る（自分で付けたもの）。
 * ⚠ 入力中にビューが更新されても**打ちかけを消さないこと**。45分ごとの進行や
 *    他の参加者の操作でビューは何度も差し替わる。保存済みの値を取り込むのは
 *    「まだ触っていないとき」だけにする。
 */
export function TeamIdentity({ view, busy, run, command }) {
  const me = view.members?.find((m) => m.teamName === view.teamName);
  const savedTeam = me?.displayName || view.teamName || '';
  const savedPlayer = me?.label || '';
  const [team, setTeam] = useState(savedTeam);
  const [player, setPlayer] = useState(savedPlayer);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (touched) return;
    setTeam(savedTeam);
    setPlayer(savedPlayer);
  }, [touched, savedTeam, savedPlayer]);
  const changed = team.trim() !== savedTeam || player.trim() !== savedPlayer;
  return (
    <section className="online-identity">
      <h3>球団名とプレイヤー名</h3>
      <p className="online-muted">
        順位表や試合結果に出る名前です。あとから「名前を変える」（PCは左メニュー、スマホは下の「☰」）で変えられます。
      </p>
      <div className="online-identity-fields">
        <label>
          球団名
          <input
            value={team}
            maxLength={24}
            disabled={busy}
            onChange={(e) => {
              setTouched(true);
              setDone(false);
              setTeam(e.target.value);
            }}
          />
        </label>
        <label>
          プレイヤー名
          <input
            value={player}
            maxLength={24}
            disabled={busy}
            onChange={(e) => {
              setTouched(true);
              setDone(false);
              setPlayer(e.target.value);
            }}
          />
        </label>
        <button
          className="online-primary"
          disabled={busy || !changed || !team.trim()}
          onClick={() =>
            run(async () => {
              await command('profile', {
                teamName: team.trim(),
                playerName: player.trim(),
              });
              setTouched(false);
              setDone(true);
            })
          }
        >
          この名前にする
        </button>
      </div>
      {done && !changed && (
        <p className="online-muted" role="status">
          「{savedTeam}」（{savedPlayer || '名前なし'}）で登録しました。
        </p>
      )}
    </section>
  );
}
// ============================================================

const GROUPS = [
  ['pitcher', '投'],
  ['catcher', '捕'],
  ['infield', '内'],
  ['outfield', '外'],
];

/**
 * 名簿の表の列の見出し（PC・スマホ）。
 * ⚠ スマホ（320px〜）では1字にする（トレードの表と同じ書き方。押さえると title で全部）。
 *    「ミート」のままだと10列が幅に入らず、見出しが「ミ／ー／ト」と1字ずつ縦に割れていた
 */
const COLUMNS = [
  ['位置', '位'],
  ['ミート', 'ミ'],
  ['パワー', 'パ'],
  ['走力', '走'],
  ['守備', '守'],
  ['球速', '速'],
  ['制球', '制'],
];

function Roster({ pack }) {
  const mobile = useMobile();
  const [side, setSide] = useState('all');
  const list = pack.players.filter((p) =>
    side === 'all'
      ? true
      : side === 'pitcher'
        ? p.position === 'pitcher'
        : p.position !== 'pitcher',
  );
  return (
    <>
      <div className="online-segments" aria-label="区分">
        {[
          ['all', `全員 ${pack.players.length}`],
          ['pitcher', '投手'],
          ['fielder', '野手'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={side === id} onClick={() => setSide(id)}>
            {label}
          </button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>選手</th>
            <th>格</th>
            <th>齢</th>
            {COLUMNS.map(([long, short]) => (
              <th key={long} title={long}>
                {mobile ? short : long}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <th>
                <PlayerStatsButton player={p} panel="abilities" />
                {/* ⚠ 二刀流は数が少ないので目印を出す。見落とすと編成を組み違える */}
                {p.isTwoWay && <small className="online-role-mark">二刀流</small>}
              </th>
              <td>{p.rank}</td>
              <td>{p.age}</td>
              <td>{POS[p.position]}</td>
              <td>
                <AbilityGrade value={p.batting?.meet} />
              </td>
              <td>
                <AbilityGrade value={p.batting?.power} />
              </td>
              <td>
                <AbilityGrade value={p.physical?.speed} />
              </td>
              <td>
                <AbilityGrade value={p.fielding?.defense} />
              </td>
              <td>
                <AbilityGrade value={p.pitching?.velocity} velocity />
              </td>
              <td>
                <AbilityGrade value={p.pitching?.control} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function PackSelect({ packs, plan, busy, onChange, view, run, command, onShow }) {
  const [open, setOpen] = useState(() => plan?.packId || packs[0]?.id);
  const shown = packs.find((p) => p.id === open) || packs[0];
  // いま中身を見ているセットを知らせる（スマホの下の帯に「決定するのは選択中の…」と添えるため。
  // `LeaguePanels.jsx` の `PhasePanel`）
  useEffect(() => {
    onShow?.(shown?.id ?? null);
  }, [shown?.id, onShow]);
  const mobile = useMobile();
  const detail = useRef(null);
  // ⚠ **スマホではカードを押したら中身へ送る**。中身は20枚のカード（2列で10段）の下にあり、
  //    押しても画面の外で切り替わるだけで、何が起きたのか分からなかった
  const [jump, setJump] = useState(0);
  useEffect(() => {
    if (jump) detail.current?.scrollIntoView({ block: 'start' });
  }, [jump]);
  return (
    <div className="online-packs">
      {/* ⚠ セットは**型ごとに構成と格の内訳が違う**（版2）。前から待っている人の
          セット（版1）は全部同じ構成なので、特徴が無ければ前の説明を出す */}
      {packs.some((p) => p.feature) ? (
        <p className="online-muted">
          20セットから1つ選びます。セットごとに<strong>構成</strong>
          （投手厚め・野手厚め・二刀流・捕手3人など）と<strong>格付けの配り方</strong>
          （少数精鋭・粒ぞろい・大黒柱など）が違います。年齢は19〜24歳です。
          格の総量（A=3・B=2・C=1点の合計）はどれも同じにしてあり、
          同じ枠の平均からの開きも1%前後に揃えてあるので、戦い方の好みで選んでください。
          選んだセットは1球団だけが受け取ります（重なったら球団名の順）。
        </p>
      ) : (
        <p className="online-muted">
          20セットから1つ選びます。どのセットも
          <strong>投12・捕2・内外10</strong>の24人（うち二刀流2人）で、格付けは
          <strong>A2・B10・C12</strong>、年齢は19〜24歳です。
          合計の力は揃えてあるので（開きは1%前後）、好みで選んで構いません。
          選んだセットは1球団だけが受け取ります（重なったら球団名の順）。
        </p>
      )}
      <div className="online-pack-list">
        {packs.map((pack) => (
          <button
            key={pack.id}
            className="online-pack-card"
            aria-pressed={plan?.packId === pack.id}
            aria-current={pack.id === open ? 'true' : undefined}
            disabled={busy}
            onClick={() => {
              setOpen(pack.id);
              if (mobile) setJump((n) => n + 1);
            }}
          >
            <strong>{pack.name}</strong>
            {pack.feature && (
              <span className="online-pack-feature">{pack.feature}</span>
            )}
            <small>
              {GROUPS.map(([key, label]) => `${label}${pack.counts[key]}`).join(' ')}
            </small>
            <small>
              {['A', 'B', 'C']
                .map((rank) => `${rank}${pack.ranks?.[rank] || 0}`)
                .join(' ')}{' '}
              · 平均{pack.averageAge}歳 · 二刀流{pack.twoWay}
            </small>
            {plan?.packId === pack.id && <span className="online-pack-chosen">選択中</span>}
          </button>
        ))}
      </div>
      {shown && (
        <section className="online-pack-detail" ref={detail}>
          <div className="online-card-heading">
            <h3>
              {shown.name}
              {shown.feature && <small>{shown.feature}</small>}
            </h3>
            <button
              className="online-primary"
              disabled={busy || plan?.packId === shown.id}
              onClick={() => onChange({ ...plan, packId: shown.id })}
            >
              {plan?.packId === shown.id ? '選択中' : 'このセットにする'}
            </button>
          </div>
          <Roster pack={shown} />
        </section>
      )}
      {/* ⚠ **名前はセットの下**。始める手順は「セットを選ぶ → 名前 → 決定」 */}
      {view && command && (
        <TeamIdentity view={view} busy={busy} run={run} command={command} />
      )}
    </div>
  );
}
