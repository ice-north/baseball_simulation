import React, { useState } from 'react';
import { Page, PageTabs, usePageTab } from './Page.jsx';
import { teamLabel, teamShort, formatRate as rate3 } from './gameText.js';
import { PYRAMID_LEAGUES, compareLeagueStanding, withWinRate } from './pyramidLeague.js';
import { gamesBehind, gapText } from './standingsGap.js';
import { Fold, Honors, Owners, ProDrafted, LeagueTopics, SeasonReview } from './Chronicle.jsx';
import { TransactionsPage } from './SocialPages.jsx';
import { CareerLeagueBoard } from './CareerStats.jsx';
import AbilityRanking from './AbilityRanking.jsx';
import { useRead } from './useRead.js';

// ============================================================
// リーグ史（PC の左メニュー「リーグ史」）。リーグ全体の記録を1か所にまとめる。
//
// ⚠ 先方要望（2026-11-20）「左サイドバーにリーグ史を。過去年度の順位・プロになった選手の履歴とその後の成績・
//    移籍の履歴・リーグの通算成績ランキング・能力ランキングなどをここに。能力ランキングと取引の記録は統合」。
//    左メニューから「能力ランキング」「取引の記録」を外し、ここの切り替えで開く。
//    球団史・記録にあったリーグ全体の欄（リーグの話題・オーナー名鑑・年間表彰・リーグからプロへ）もここへ移した
//    （球団史・記録は1球団の記録だけにする）。
// ⚠ 中の画面は**前の画面をそのまま使う**（`PageTabs` が見出しを「リーグ史」に替え、切り替えを並べる）。
//    取引の記録はトレード画面の「トレード履歴」と同じ部品なので、作り直すと片方だけ変わる。
// ⚠ 過去の順位は**ビューに載っている年度の記録**（`view.history`。年度更新で1年ずつ増える）から作る。
//    新しく保存する項目は無い。
// ============================================================

const TABS = [
  ['standings', '過去の順位'],
  ['pro', 'プロ入りとその後'],
  ['moves', '移籍・取引の記録'],
  ['careers', '通算成績ランキング'],
  ['ability', '能力ランキング'],
  ['honors', '表彰・話題・オーナー'],
];

const leagueOf = (id) => PYRAMID_LEAGUES.find((l) => l.id === id) || null;

/** 年度の記録1年ぶんを部ごとに並べる（順位表と同じ並べ方） */
export function yearTables(entry) {
  if (!entry?.standings?.length) return [];
  if (!entry.leagues) return [{ league: null, rows: [...entry.standings].map(withWinRate).sort(compareLeagueStanding) }];
  return PYRAMID_LEAGUES.map((league) => ({
    league,
    rows: entry.standings
      .filter((s) => entry.leagues[s.team] === league.id)
      .map(withWinRate)
      .sort(compareLeagueStanding),
  })).filter((g) => g.rows.length);
}

/** その年の昇格・降格（球団 → '昇格' / '降格'） */
const movesOf = (entry) =>
  Object.fromEntries(
    (entry?.moves || []).map((m) => [
      m.teamId,
      (leagueOf(m.to)?.tier ?? 0) < (leagueOf(m.from)?.tier ?? 0) ? '昇格' : '降格',
    ]),
  );

/** 歴代の優勝（年・各部の1位・プレーオフ優勝）。新しい順 */
function Champions({ history, own }) {
  const rows = [...history].reverse();
  return (
    <table className="online-standings online-league-champions">
      <thead>
        <tr>
          <th>年</th>
          {PYRAMID_LEAGUES.map((l) => (
            <th key={l.id}>{l.name}1位</th>
          ))}
          <th>プレーオフ優勝</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => {
          const tables = yearTables(h);
          const cell = (team) =>
            team ? <span className={team === own ? 'online-own-text' : undefined}>{teamShort(team)}</span> : '—';
          return (
            <tr key={h.year}>
              <th>{h.year}年目</th>
              {PYRAMID_LEAGUES.map((l) => (
                <td key={l.id}>{cell(tables.find((t) => t.league?.id === l.id)?.rows[0]?.team)}</td>
              ))}
              <td>{cell(h.playoffChampion)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PastStandings({ view }) {
  const history = view.history || [];
  const [year, setYear] = useState(history.at(-1)?.year ?? null);
  const entry = history.find((h) => h.year === year) || history.at(-1);
  return (
    <Page
      title="過去の順位"
      sub="終わった年の最終順位です（年度更新で1年ずつ増えます）。差はすぐ上の順位の球団とのゲーム差です。"
      actions={
        history.length > 0 && (
          <select aria-label="順位を見る年度" value={entry?.year ?? ''} onChange={(e) => setYear(Number(e.target.value))}>
            {[...history].reverse().map((h) => (
              <option key={h.year} value={h.year}>
                {h.year}年目
              </option>
            ))}
          </select>
        )
      }
    >
      {!entry ? (
        <section className="online-card">
          <p>まだ終わったシーズンがありません。1年目の年度更新が済むと、ここに年ごとの最終順位が並びます。</p>
        </section>
      ) : (
        <>
          <section className="online-card">
            <h2>{entry.year}年目の最終順位</h2>
            {yearTables(entry).map(({ league, rows }) => {
              const gaps = gamesBehind(rows);
              const moves = movesOf(entry);
              return (
                <table key={league?.id || 'all'} className="online-standings online-past-standings">
                  {league && <caption>{league.name}</caption>}
                  <thead>
                    <tr>
                      <th>球団</th>
                      <th>勝</th>
                      <th>敗</th>
                      <th>分</th>
                      <th>勝率</th>
                      {/* ⚠ 列と同じ印を見出しにも付ける。狭いスマホ（370px 以下）では列ごと隠すので
                          （`online.css`）、見出しだけ残ると「この年」の見出しが「差」の列の上にずれる */}
                      <th className="online-standings-gap" title="すぐ上の順位の球団とのゲーム差">
                        差
                      </th>
                      <th>この年</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => (
                      <tr key={s.team} className={s.team === view.teamName ? 'online-own online-own-text' : undefined}>
                        <th>
                          <span className={`online-rank${i < 3 ? ` is-podium is-podium-${i + 1}` : ''}`}>{i + 1}</span>
                          {teamLabel(s.team)}
                        </th>
                        <td className="is-win">{s.wins}</td>
                        <td className="is-loss">{s.losses}</td>
                        <td className="online-muted">{s.draws || 0}</td>
                        <td>{rate3(s.winRate)}</td>
                        <td className="online-standings-gap">{gapText(gaps[i])}</td>
                        <td>
                          {[entry.playoffChampion === s.team && 'プレーオフ優勝', moves[s.team]].filter(Boolean).join('・')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })}
          </section>
          <section className="online-card">
            <h2>歴代の優勝</h2>
            <Champions history={history} own={view.teamName} />
          </section>
        </>
      )}
    </Page>
  );
}

/**
 * プロでの成績を全部（リーグ全体の一覧は、ビューを小さく保つため、いちばん新しい年の1行だけ）。
 * ⚠ 押したときに元の球団の球団史を読む（`action=team` の `chronicle.proDrafted` は全部の年を持つ）。
 *    同じ球団の読み込みは球団史・記録のページと同じ問い合わせなので、読んだものを使い回す
 */
function ProCareerMore({ view, row }) {
  const [open, setOpen] = useState(false);
  const result = useRead(open ? 'team' : null, { team: row.team, revision: view.revision }, { keep: true });
  if (!row.team || !row.after) return null;
  const found = (result.data?.chronicle?.proDrafted || []).find((r) => r.name === row.name && r.year === row.year);
  const lines = found?.career || [];
  return (
    <>
      <button type="button" className="online-player-name online-pro-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'プロでの成績を閉じる' : 'プロでの成績を全部見る'}
      </button>
      {open && result.loading && <small className="online-muted">読み込み中…</small>}
      {open && result.error && <small role="alert">{result.error}</small>}
      {open &&
        lines.map((t, j) => (
          <small key={j} className="online-pro-after">
            {t}
          </small>
        ))}
    </>
  );
}

function ProPage({ view }) {
  return (
    <Page
      title="プロ入りとその後"
      sub="このリーグからNPBのドラフトで指名された選手と、プロに入ってからの成績です（新しい順。プロでの成績は飾りで、リーグには効きません）。今年の指名は、名前を押すと指名した時点の能力が開きます。"
    >
      <section className="online-card">
        <ProDrafted
          list={view.chronicle?.proDrafted}
          showTeam
          more={(r) => <ProCareerMore view={view} row={r} />}
          empty="まだこのリーグからプロ入りした選手はいません（指名は10月下旬、リーグ全体で年0〜5人。0人の年もあります）。"
        />
      </section>
    </Page>
  );
}

/**
 * 歴代タイトル（年ごと・新しい順）。⚠ 先方要望（2026-11-21）「プロ指名された選手もリーグの過去のタイトルとして残して」。
 * 文はサーバーが作る（`seasonAwards.js` の `titleHistory`）。その年にプロへ進んだ人には「→西武」と添える。アプリと同じ並び
 */
function TitleHistory({ list, own }) {
  if (!list?.length)
    return <p>まだありません。10月下旬に成績が確定すると、その年のタイトルがここに残ります。</p>;
  return (
    <div className="online-title-history">
      {list.map((y) => (
        <table key={y.year} className="online-standings">
          <caption>{y.year}年目</caption>
          <tbody>
            {y.titles.map((t) => (
              <tr key={t.label} className={t.team === own ? 'online-own-text' : undefined}>
                <th>{t.label}</th>
                <td>
                  {t.name}
                  {t.pro && <small className="online-leader-pro">→{t.pro}</small>}
                </td>
                <td>{teamShort(t.team)}</td>
                <td>{t.line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function HonorsPage({ view }) {
  return (
    <Page title="表彰・話題・オーナー" sub="リーグ全体の年間表彰・話題・参加者ごとの通算です。">
      <SeasonReview review={view.seasonReview} />
      <Fold
        id="honors"
        title={`年間表彰${view.chronicle?.honors?.year ? `（${view.chronicle.honors.year}年目）` : ''}`}
      >
        <Honors honors={view.chronicle?.honors} />
      </Fold>
      <Fold id="titles" title="歴代タイトル" count={view.chronicle?.titles?.length || 0}>
        <TitleHistory list={view.chronicle?.titles} own={view.teamName} />
      </Fold>
      <Fold id="topics" title="リーグの話題">
        <LeagueTopics view={view} full bare />
      </Fold>
      <Fold id="owners" title="オーナー名鑑" count={view.owners?.length || 0}>
        <Owners list={view.owners} />
      </Fold>
    </Page>
  );
}

/**
 * @param initial 最初に開く切り替え（古い入口「能力ランキング」「取引の記録」から来たとき）
 */
export default function LeagueHistory({ view, initial = null }) {
  const [tab, setTab] = usePageTab('league', TABS.map(([id]) => id), initial);
  return (
    <PageTabs title="リーグ史" tabs={TABS} current={tab} onChange={setTab}>
      {tab === 'standings' && <PastStandings view={view} />}
      {tab === 'pro' && <ProPage view={view} />}
      {tab === 'moves' && <TransactionsPage view={view} />}
      {tab === 'careers' && <CareerLeagueBoard view={view} />}
      {tab === 'ability' && <AbilityRanking view={view} />}
      {tab === 'honors' && <HonorsPage view={view} />}
    </PageTabs>
  );
}
