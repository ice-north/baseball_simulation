import React from 'react';
import { formatGameDate } from './shared.js';
import { teamLabel } from './gameText.js';

// ============================================================
// 「ホーム」に出すリーグ全体の眺め。
//   1. 2部制の順位表（人が持っている球団は名前を添える）
//   2. 今後の日程（対戦相手と先発予定）
//   3. 各項目のベスト5
//
// ⚠ 数字はすべてサーバーが作る（`server/leagueBoard.mjs`）。ここでは並べるだけ。
//    画面で計算し直すと、同じ数字の出どころが2つになる。
// ============================================================

function Standings({ divisions, ownTeam }) {
  if (!divisions?.length) return null;
  return (
    <section className="online-card">
      <h2>順位表</h2>
      {divisions.map((division) => (
        <div key={division.id} className="online-division">
          <h3>{division.name}</h3>
          <table>
            <thead>
              <tr>
                <th>球団</th>
                <th>勝</th>
                <th>敗</th>
                <th>分</th>
                <th>勝率</th>
              </tr>
            </thead>
            <tbody>
              {division.rows.map((row) => (
                <tr
                  key={row.team}
                  className={row.team === ownTeam ? 'online-own' : ''}
                >
                  <th>
                    {row.rank}. {row.label}
                    {/* ⚠ CPUには括弧を出さない。人が持っている球団だけ */}
                    {row.human && (
                      <small className="online-owner">
                        （{row.player || 'プレイヤー'}）
                      </small>
                    )}
                  </th>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.draws}</td>
                  <td>
                    {row.gamesPlayed
                      ? row.winRate.toFixed(3).replace(/^0\./, '.')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function Upcoming({ upcoming, ownTeam }) {
  if (!upcoming?.length) return null;
  return (
    <section className="online-card">
      <h2>今後の日程</h2>
      {/* ⚠ 先発は**予定**。当日の疲労で入れ替わることがある */}
      <p className="online-muted">先発は予定です。当日の疲労で変わることがあります。</p>
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
                {teamLabel(game.away)} @ {teamLabel(game.home)}
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

function Leaders({ leaders }) {
  const shown = (leaders || []).filter((c) => c.rows.length);
  if (!shown.length) return null;
  return (
    <section className="online-card">
      <h2>リーグ上位</h2>
      <div className="online-leaders">
        {shown.map((category) => (
          <div key={category.id}>
            <h3>{category.label}</h3>
            <ol>
              {category.rows.map((row, i) => (
                <li key={`${row.team}:${row.name}`}>
                  <span className="online-leader-rank">{i + 1}</span>
                  <span className="online-leader-name">
                    {row.name}
                    <small>{row.label}</small>
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
    </section>
  );
}

export default function LeagueBoard({ view }) {
  return (
    <div className="online-board">
      <Standings divisions={view.divisions} ownTeam={view.teamName} />
      <div className="online-board-side">
        <Upcoming upcoming={view.upcoming} ownTeam={view.teamName} />
        <Leaders leaders={view.leaders} />
      </div>
    </div>
  );
}
