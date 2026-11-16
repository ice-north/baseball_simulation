import React, { useMemo, useState } from 'react';
import TeamRoster from './TeamRoster.jsx';
import { CompactRoster, TeamPlayerButton } from './PlayerPerformance.jsx';
import { formatStat } from './statsView.js';
import { teamShort } from './gameText.js';
import { Page } from './Page.jsx';

// ============================================================
// 通算成績（**このリーグを始めてからの積み上げ**）。
//
// 【意図】1年で終わるゲームではないので、「この選手がこのリーグで何をしたか」が
//   残っていないと、育てた意味が見えない。今季の成績とは別に、記録を始めてから
//   の合計を球団ごとに出す。
//
// ⚠ **選手成績と同じ表を使う**（`CompactRoster`）。列・並べ替え・区分の
//    切り替え・選手名を押して詳細、の操作が同じになる。別の表を作ると、
//    片方に列を足したときにもう片方が置いていかれる。
// ⚠ 合計はサーバーが出す（`playerPeriods` の「対人通算」）。**画面で足さない
//    こと**——打率・防御率は率なので合計の足し算では作れず、年ごとの率を
//    平均しても正しくない。サーバーが合計から出し直した値を受け取る。
//    ⚠ 選手の詳細が出す期間と**同じものを読む**（同じ数字を2通り持たない）。
// ⚠ 自球団も**サーバーから読み直す**（`TeamRoster` の `always`）。通算は
//    ビューに載せていないので、読み直さないと自分の選手だけ空欄になる。
// ⚠ 記録が1年も無い選手（今季の新人など）は**出さない**。0が並ぶと
//    「記録が無い」のか「打てていない」のか分からない。
// ============================================================

/** その選手の「対人通算」の期間。⚠ 1年も記録が無ければ undefined */
const careerOf = (player) =>
  (player.periods || []).find((x) => x.id === 'career');

/** 通算の数字を、選手成績の表が読む形（`seasonStats` / `performance`）に移す */
const careerRoster = (roster = []) =>
  roster
    .map((p) => ({ player: p, career: careerOf(p) }))
    .filter(({ career }) => career)
    .map(({ player, career }) => ({
      ...player,
      career,
      seasonStats: career.seasonStats,
      performance: career.performance,
      // ⚠ 今季の捕手の成績を通算の表に残さない（通算の期間に無ければ出さない）
      catcherStats: career.catcherStats,
    }));

export default function CareerStats({ view }) {
  // ⚠ 先方指摘「各チームごとの通算成績しか見られない。全チームの選手をランキング化した通算成績も」。
  //    球団ごとの表（いままで）と、リーグ全体の上位（サーバーの `careerLeaders`）を切り替える
  const [mode, setMode] = useState('team');
  const modes = (
    <div className="online-segments" role="group" aria-label="通算成績の見方">
      {[
        ['team', '球団ごと'],
        ['league', 'リーグ全体ランキング'],
      ].map(([id, label]) => (
        <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
          {label}
        </button>
      ))}
    </div>
  );
  if (mode === 'league') return <CareerLeagueBoard view={view} modes={modes} />;
  return (
    <TeamRoster view={view} always>
      {(shown, selector) => <Board shown={shown} selector={selector} modes={modes} />}
    </TeamRoster>
  );
}

/** リーグ全体の通算ランキング（項目ごとの上位50人。退団した選手も残す） */
function CareerLeagueBoard({ view, modes }) {
  const [side, setSide] = useState('batting');
  const shown = (view.careerLeaders || []).filter((f) => f.side === side);
  return (
    <Page
      title="通算成績"
      sub="リーグ全球団の選手の、このリーグを始めてからの合計の上位です（今季を含む・退団した選手も残します）。自球団の選手は黄色で出します。"
      actions={modes}
    >
      <section className="online-card">
        <div className="online-segments" role="group" aria-label="区分">
          {[
            ['batting', '打撃'],
            ['pitching', '投手'],
          ].map(([id, label]) => (
            <button key={id} aria-pressed={side === id} onClick={() => setSide(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="online-leaders">
          {shown.map((field) => (
            <div key={field.id} className="online-leader-box">
              <h4>
                {field.label}
                {field.qualified && <small> {field.qualified}</small>}
              </h4>
              <ol>
                {field.rows.map((row, i) => (
                  <li key={row.key} className={row.team === view.teamName && row.active ? 'online-own-text' : ''}>
                    <span className="online-leader-rank" data-rank={i + 1}>
                      {i + 1}
                    </span>
                    <span className="online-leader-name">
                      {row.active ? (
                        <TeamPlayerButton view={view} team={row.team} id={row.id} name={row.name} />
                      ) : (
                        <span>{row.name}</span>
                      )}
                    </span>
                    <span className="online-leader-team">
                      {row.team ? teamShort(row.team) : '—'}
                      {row.active ? '' : '（退団）'}
                    </span>
                    <span className="online-leader-value">{formatStat({ format: field.format }, row.value)}</span>
                  </li>
                ))}
                {!field.rows.length && <li className="online-muted">該当なし</li>}
              </ol>
            </div>
          ))}
          {!shown.length && <p className="online-muted">まだ集計がありません。</p>}
        </div>
      </section>
    </Page>
  );
}

function Board({ shown, selector, modes }) {
  const roster = useMemo(() => careerRoster(shown.roster), [shown.roster]);
  // ⚠ 1年でも欠けている年があれば**そう書く**。記録を始める前の成績は
  //    入っていないので、黙って出すと「少ない」と誤解される
  const partial = roster.some((p) => p.career.partial);
  const years = Math.max(0, ...roster.map((p) => p.career.years));
  return (
    <Page
      title="通算成績"
      sub={
        roster.length
          ? `このリーグを始めてからの合計です（${years}シーズン・今季を含む）。列の見出しを押すと並べ替えます。${partial ? '記録の無い試合があった年は、その分が入っていません。' : ''}`
          : 'このリーグでの記録がまだありません。1シーズン目が進むと出ます。'
      }
      actions={
        <>
          {modes}
          <div className="online-team-selector">{selector}</div>
        </>
      }
    >
      <section className="online-card">
        {roster.length ? (
          <CompactRoster
            key={shown.teamName}
            view={{ ...shown, roster }}
            desktop
            periodLabel="通算"
            title="通算成績"
            /* ⚠ **起用の順では並べない**。打順や投手の役割は「いまの起用」で、
               何年ぶんの合計を並べる順にはならない（1試合の投手が先頭に来る） */
            volumeOrder
          />
        ) : (
          <p className="online-muted">
            まだ通算成績のある選手が居ません。試合を消化すると、ここに積み上がって
            いきます。
          </p>
        )}
      </section>
      <FormerCareers list={shown.formerCareers} />
    </Page>
  );
}

const rate3 = (v) => (v == null ? '—' : v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, ''));

/**
 * 引退・解雇・退団した選手の通算（その球団で最後に記録を残した人）。
 * ⚠ 先方要望（2026-11-16）「引退・解雇後も成績が残るように」。いまの名簿から作る上の表からは
 *    居なくなった選手が消えるので、記録（サーバーの `formerCareers`）から別に出す。
 *    選手の詳細はもう開けない（名簿に居ない）ので、押せる行にしない
 */
function FormerCareers({ list }) {
  const batting = (list || []).filter((r) => r.batting);
  const pitching = (list || []).filter((r) => r.pitching);
  if (!batting.length && !pitching.length) return null;
  return (
    <section className="online-card">
      <h2>退団・引退した選手の通算</h2>
      <p className="online-muted">この球団で最後にプレーした選手です（新しく去った順）。</p>
      {batting.length > 0 && (
        <table className="online-former-table">
          <caption>打撃</caption>
          <thead>
            <tr>
              <th>選手</th>
              <th>最終年</th>
              <th>年数</th>
              <th>試合</th>
              <th>打率</th>
              <th>安打</th>
              <th>本塁打</th>
              <th>打点</th>
              <th>盗塁</th>
            </tr>
          </thead>
          <tbody>
            {batting.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.name}</th>
                <td>{r.lastYear}</td>
                <td>{r.years}</td>
                <td>{r.batting.games}</td>
                <td>{rate3(r.batting.avg)}</td>
                <td>{r.batting.hits}</td>
                <td>{r.batting.homeruns}</td>
                <td>{r.batting.rbis}</td>
                <td>{r.batting.stolenBases}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pitching.length > 0 && (
        <table className="online-former-table">
          <caption>投手</caption>
          <thead>
            <tr>
              <th>選手</th>
              <th>最終年</th>
              <th>年数</th>
              <th>登板</th>
              <th>勝</th>
              <th>敗</th>
              <th>S</th>
              <th>H</th>
              <th>投球回</th>
              <th>防御率</th>
              <th>奪三振</th>
            </tr>
          </thead>
          <tbody>
            {pitching.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.name}</th>
                <td>{r.lastYear}</td>
                <td>{r.years}</td>
                <td>{r.pitching.games}</td>
                <td>{r.pitching.wins}</td>
                <td>{r.pitching.losses}</td>
                <td>{r.pitching.saves}</td>
                <td>{r.pitching.holds}</td>
                <td>{r.pitching.innings.toFixed(1)}</td>
                <td>{r.pitching.era.toFixed(2)}</td>
                <td>{r.pitching.strikeouts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
