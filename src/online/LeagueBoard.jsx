import React, { useMemo, useState } from 'react';
import { formatGameDate } from './shared.js';
import { teamLabel, teamShort, formatRate } from './gameText.js';
import { Standings, Notices } from './LeaguePanels.jsx';

// ============================================================
// 「ホーム」に出すリーグ全体の眺め。並べ方は**一人用の日程画面に合わせる**。
//
//   左（広い） 1. 月間カレンダー（その月の全試合・結果）
//              2. その日の対戦（先発予定つき）
//              3. 個人成績ランキング（打撃部門・投手部門）
//   右（狭い） 4. リーグ順位（2部制）
//              5. リーグ便り
//              6. 今後の日程
//
// ⚠ 順位表と便りは**作り直さないこと**。昇格・降格の線まで入った実装が
//    `LeaguePanels` にある。ここで別に書くと同じものが2つになる。
// ⚠ 数字はサーバーが作る（`server/leagueBoard.mjs`）。ここでは並べるだけ。
// ⚠ 一人用には「1日進める」が見出しに並ぶが、**オンラインには置かない**。
//    進行は時間が決めるもので、押して進めるものではない（検証モードの
//    手動進行は管理画面にある）。カレンダーの◀▶は**見る月を変えるだけ**。
// ============================================================

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 日付キー（20240406）→ 月キー（202404） */
const monthOf = (key) => Math.floor(key / 100);
const keyOf = (date) => date.year * 10000 + date.month * 100 + date.day;

/**
 * 月間カレンダー。
 * ⚠ サーバーからは**添字の5つ組**で来る（`seasonCalendar` の説明を参照）。
 *    `[日付キー, ビジター添字, ホーム添字, ビジター得点, ホーム得点]`
 */
function Calendar({ view }) {
  const calendar = view.calendar;
  const today = calendar?.today;
  const months = useMemo(() => {
    if (!calendar) return [];
    const set = new Set(calendar.games.map((g) => monthOf(g[0])));
    // ⚠ 試合の無い月でも**今日の月は出す**。開幕前（1月）に開くと
    //    カレンダーが空になって、現在地がどこにも出なくなる
    if (today) set.add(today.year * 100 + today.month);
    return [...set].sort((a, b) => a - b);
  }, [calendar, today]);
  const todayMonth = today ? today.year * 100 + today.month : months[0];
  const [shown, setShown] = useState(todayMonth);
  if (!calendar || !months.length) return null;
  // ⚠ 見ている月が一覧から外れたら今月へ戻す（年が変わったとき）
  const current = months.includes(shown) ? shown : todayMonth;
  const at = months.indexOf(current);
  const year = Math.floor(current / 100);
  const month = current % 100;

  const byDay = new Map();
  for (const game of calendar.games) {
    if (monthOf(game[0]) !== current) continue;
    const day = game[0] % 100;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(game);
  }
  const lead = new Date(year, month - 1, 1).getDay();
  const length = new Date(year, month, 0).getDate();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, i) => i + 1),
  ];
  const todayKey = today ? keyOf(today) : null;
  const record = view.standings?.find((s) => s.team === view.teamName);

  return (
    <section className="online-card online-calendar">
      <div className="online-calendar-head">
        <h2>
          {year}年{month}月
          {today && today.year * 100 + today.month === current && (
            <small>{today.day}日が現在地</small>
          )}
        </h2>
        {record && (
          <p className="online-calendar-record">
            <strong>{record.wins}</strong>勝
            <strong>{record.losses}</strong>敗
            {record.draws ? (
              <>
                <strong>{record.draws}</strong>分
              </>
            ) : null}
            <span>{formatRate(record.winRate)}</span>
          </p>
        )}
        <div className="online-calendar-nav">
          <button
            aria-label="前の月を見る"
            disabled={at <= 0}
            onClick={() => setShown(months[at - 1])}
          >
            ◀
          </button>
          <button
            aria-label="次の月を見る"
            disabled={at >= months.length - 1}
            onClick={() => setShown(months[at + 1])}
          >
            ▶
          </button>
        </div>
      </div>
      <div className="online-calendar-weekdays">
        {WEEKDAYS.map((name, i) => (
          <span key={name} data-weekday={i}>
            {name}
          </span>
        ))}
      </div>
      <div className="online-calendar-grid">
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;
          const games = byDay.get(day) || [];
          const key = year * 10000 + month * 100 + day;
          // ⚠ **マスごと塗らないこと**。12球団は全球団が毎試合日に試合をするので、
          //    「自球団の試合がある日」は試合日の**全部**になる（実測で31日中26日）。
          //    塗ると情報にならず、現在地の枠と競合するだけ。自球団の試合は
          //    その行だけ色を変える（`.online-calendar-game.is-mine`）。
          return (
            <div
              key={day}
              className={[
                'online-calendar-day',
                key === todayKey ? 'is-today' : '',
                !games.length ? 'is-empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-weekday={(lead + day - 1) % 7}
            >
              <span className="online-calendar-date">{day}</span>
              {games.map((g, gi) => {
                const away = calendar.teams[g[1]];
                const home = calendar.teams[g[2]];
                const mine = away === view.teamName || home === view.teamName;
                // ⚠ 得点が数でないときは**対戦だけ**出す（未消化・中止）
                const played = g[3] !== null && g[4] !== null;
                return (
                  <span
                    key={gi}
                    className={`online-calendar-game${mine ? ' is-mine' : ''}`}
                  >
                    {played ? (
                      <>
                        {teamShort(away)}
                        <b>{g[3]}</b>-<b>{g[4]}</b>
                        {teamShort(home)}
                      </>
                    ) : (
                      <>
                        {teamShort(away)}-{teamShort(home)}
                      </>
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * いちばん近い試合日の対戦。先発予定を添える。
 * ⚠ 「今日」で絞らないこと。休養日に開くと空になる。`upcoming` の先頭の
 *    日付に揃える（＝次に試合がある日）。
 */
function DayGames({ view, date }) {
  const upcoming = view.upcoming || [];
  if (!upcoming.length || !date) return null;
  const games = upcoming.filter((g) => keyOf(g.date) === keyOf(date));
  return (
    <section className="online-card">
      <div className="online-card-heading">
        <h2>{formatGameDate(date)} の対戦</h2>
        <small className="online-muted">{games.length}試合</small>
      </div>
      <div className="online-matchups">
        {games.map((game) => {
          const mine =
            game.home === view.teamName || game.away === view.teamName;
          return (
            <div
              key={game.id}
              className={`online-matchup${mine ? ' is-mine' : ''}`}
            >
              <div>
                <strong>{teamShort(game.away)}</strong>
                <small>{game.awayStarter || '先発未定'}</small>
              </div>
              <span className="online-matchup-vs">VS</span>
              <div>
                <strong>{teamShort(game.home)}</strong>
                <small>{game.homeStarter || '先発未定'}</small>
              </div>
            </div>
          );
        })}
      </div>
      {/* ⚠ 先発は**予定**。当日の疲労で入れ替わることがある */}
      <p className="online-muted">
        先発は予定です。当日の疲労で変わることがあります。
      </p>
    </section>
  );
}

function Upcoming({ upcoming, ownTeam }) {
  if (!upcoming?.length) return null;
  return (
    <section className="online-card">
      <h2>今後の日程</h2>
      <table>
        <thead>
          <tr>
            <th>日付</th>
            <th>対戦</th>
            <th>先発予定</th>
          </tr>
        </thead>
        <tbody>
          {upcoming.map((game) => (
            <tr
              key={game.id}
              className={
                game.home === ownTeam || game.away === ownTeam
                  ? 'online-own'
                  : ''
              }
            >
              <td>{formatGameDate(game.date)}</td>
              <th>
                {teamShort(game.away)} @ {teamShort(game.home)}
              </th>
              <td>
                {game.awayStarter || '—'} / {game.homeStarter || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** ⚠ 先頭の0を省くのは3桁の率（打率・勝率）だけ。防御率は 0.34 のまま出す */
const formatLeaderValue = (category, value) =>
  category.digits === 3
    ? value.toFixed(3).replace(/^0\./, '.')
    : category.digits
      ? value.toFixed(category.digits)
      : value;

// ⚠ 部門の分け方は**サーバーの項目idで決める**。並び順で切ると、項目を
//    足したときに打撃と投球が入れ替わる
const PITCHING_IDS = new Set(['era', 'wins', 'strikeouts', 'saves']);
const SECTIONS = [
  { id: 'batting', label: '打撃部門', has: (c) => !PITCHING_IDS.has(c.id) },
  { id: 'pitching', label: '投手部門', has: (c) => PITCHING_IDS.has(c.id) },
];

function Leaders({ leaders }) {
  const shown = (leaders || []).filter((c) => c.rows.length);
  if (!shown.length) return null;
  return (
    <section className="online-card">
      <h2>個人成績ランキング</h2>
      {SECTIONS.map((section) => {
        const categories = shown.filter(section.has);
        if (!categories.length) return null;
        return (
          <div key={section.id} className="online-leader-section">
            <h3>{section.label}</h3>
            <div className="online-leaders">
              {categories.map((category) => (
                <div key={category.id} className="online-leader-box">
                  <h4>{category.label}</h4>
                  <ol>
                    {category.rows.map((row, i) => (
                      <li key={`${row.team}:${row.name}`}>
                        <span className="online-leader-rank" data-rank={i + 1}>
                          {i + 1}
                        </span>
                        <span className="online-leader-name">
                          {row.name}
                          <small>{teamShort(row.team)}</small>
                        </span>
                        <span className="online-leader-value">
                          {/* ⚠ 先頭の0を省くのは**率の項目だけ**（打率 .525）。
                              防御率に掛けると 0.34 が .34 になって桁を読み違える */}
                          {formatLeaderValue(category, row.value)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default function LeagueBoard({ view }) {
  // いちばん近い試合日。この日は「その日の対戦」に出すので、
  // ⚠ **右の「今後の日程」からは外す**。同じ6試合が2か所に並んで読みにくい
  const next = view.upcoming?.[0]?.date || null;
  const later = next
    ? (view.upcoming || []).filter((g) => keyOf(g.date) > keyOf(next))
    : view.upcoming;
  return (
    <div className="online-board">
      <div className="online-board-main">
        <Calendar view={view} />
        <DayGames view={view} date={next} />
        <Leaders leaders={view.leaders} />
      </div>
      <div className="online-board-side">
        <Standings view={view} />
        <Notices view={view} compact />
        <Upcoming upcoming={later} ownTeam={view.teamName} />
      </div>
    </div>
  );
}
