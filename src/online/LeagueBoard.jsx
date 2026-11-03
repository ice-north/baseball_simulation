import React from 'react';
import { formatGameDate } from './shared.js';
import { teamLabel, teamShort } from './gameText.js';
import { Standings } from './LeaguePanels.jsx';

// ============================================================
// 「ホーム」に出すリーグ全体の眺め。
//
//   左（広い） 1. 今後の5試合（自球団・先発予定つき）
//              2. 個人成績ランキング（打撃部門・投手部門）
//   右（狭い） 3. リーグ順位（2部制・チーム打率とチーム防御率つき）
//
// ⚠ 順位表は**作り直さないこと**。昇格・降格の線まで入った実装が
//    `LeaguePanels` にある。ここで別に書くと同じものが2つになる。
// ⚠ 数字はサーバーが作る（`server/leagueBoard.mjs`）。ここでは並べるだけ。
// ⚠ 月間カレンダーは一度置いたが**外した**。12球団は全球団が毎試合日に試合を
//    するので1マスに6試合並び、自分に関係のある行を探すほうが手間だった。
//    見たいのは「次に誰とやるか」なので、自球団の5試合だけ出す。
// ============================================================

/**
 * 先発予定の1人ぶん。名前・投げる手・今季の勝敗と防御率。
 * ⚠ 防御率は投げていなければ `null`。0.00 と出すと「無失点の好投手」に見える。
 * ⚠ 先頭の0は省かない（0.34 を .34 にすると桁を読み違える）。
 */
function Starter({ info, fallback }) {
  if (!info) return <small>{fallback || '先発未定'}</small>;
  return (
    <>
      <small className="online-starter-name">
        {info.name}
        <b>{info.throws === 'left' ? '左' : '右'}</b>
      </small>
      <small className="online-starter-line">
        {info.wins}勝{info.losses}敗
        <span>{info.era === null ? '防—' : `防${info.era.toFixed(2)}`}</span>
      </small>
    </>
  );
}

/**
 * 自球団のこれからの6試合。
 * ⚠ 「今日」で絞らないこと。休養日や手続きの日に開くと空になる。
 *    サーバーが近い順に6つ渡す（`ownUpcomingGames`）。
 */
function NextGames({ view }) {
  const games = view.nextGames || [];
  return (
    <section className="online-card">
      <div className="online-card-heading">
        <h2>今後の6試合</h2>
        <small className="online-muted">{teamLabel(view.teamName)}</small>
      </div>
      {games.length ? (
        <>
          <div className="online-matchups">
            {games.map((game) => {
              const home = game.home === view.teamName;
              const opponent = home ? game.away : game.home;
              return (
                <div key={game.id} className="online-matchup">
                  <p className="online-matchup-date">
                    {formatGameDate(game.date)}
                    {/* ⚠ ホームかビジターかを書く。「@」だけだと、
                        自球団が左右どちらに出るかで読み違える */}
                    <span>{home ? 'ホーム' : 'ビジター'}</span>
                  </p>
                  <div className="online-matchup-teams">
                    <div className="is-own">
                      <strong>{teamShort(view.teamName)}</strong>
                      <Starter
                        info={
                          home ? game.homeStarterInfo : game.awayStarterInfo
                        }
                        fallback={home ? game.homeStarter : game.awayStarter}
                      />
                    </div>
                    <span className="online-matchup-vs">VS</span>
                    <div>
                      <strong>{teamShort(opponent)}</strong>
                      <Starter
                        info={
                          home ? game.awayStarterInfo : game.homeStarterInfo
                        }
                        fallback={home ? game.awayStarter : game.homeStarter}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* ⚠ 先発は**予定**。当日の疲労で入れ替わることがある */}
          <p className="online-muted">
            先発は予定です。当日の疲労で変わることがあります。
          </p>
        </>
      ) : (
        <p className="online-muted">予定されている試合はありません。</p>
      )}
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

function Leaders({ leaders, ownTeam }) {
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
                      <li
                        key={`${row.team}:${row.name}`}
                        /* ⚠ 自球団の選手は黄色で強調する */
                        className={row.team === ownTeam ? 'online-own-text' : ''}
                      >
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
  return (
    <div className="online-board">
      <div className="online-board-main">
        <NextGames view={view} />
        <Leaders leaders={view.leaders} ownTeam={view.teamName} />
      </div>
      <div className="online-board-side">
        <Standings view={view} />
      </div>
    </div>
  );
}
