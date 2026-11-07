import React, { useMemo } from 'react';
import TeamRoster from './TeamRoster.jsx';
import { CompactRoster } from './PlayerPerformance.jsx';
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
    }));

export default function CareerStats({ view }) {
  return (
    <TeamRoster view={view} always>
      {(shown, selector) => <Board shown={shown} selector={selector} />}
    </TeamRoster>
  );
}

function Board({ shown, selector }) {
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
      actions={<div className="online-team-selector">{selector}</div>}
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
    </Page>
  );
}
