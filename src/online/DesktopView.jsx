import React, { useState } from 'react';
import {
  Standings,
  Results,
  Notices,
  PhasePanel,
  LineupPanel,
  PageNav,
} from './LeaguePanels.jsx';
import TeamRoster from './TeamRoster.jsx';
import OnlineLineup from './OnlineLineup.jsx';
import LeagueBoard from './LeagueBoard.jsx';
import TeamProfile from './TeamProfile.jsx';
import AbilityRanking from './AbilityRanking.jsx';
import { POS } from './api.js';
import { teamLabel } from './gameText.js';
import {
  CompactRoster,
  AbilityGrade,
  TeamBrief,
  ConditionMark,
  PlayerStatsButton,
  StatLabels,
  RoleMark,
  rosterByRole,
} from './PlayerPerformance.jsx';
// ⚠ **左メニューは3つのまとまりに分ける**。以前は「今日/試合/選手/編成/手続き」が
//    並ぶだけで、どこに何があるか辿れないという指摘を受けた。
//    見る（情報）・決める（ロスター管理）・動かす（手続き）で分ける。
// ⚠ ロスター管理の3つは、移植した一人用画面の**中のタブ**へ直に入る。
//    `OnlineLineup` に開く位置を渡す。
const NAV = [
  {
    id: 'info',
    label: '情報',
    items: [
      ['profile', '自チーム情報'],
      ['players', '選手成績'],
      ['ranking', '能力ランキング'],
      ['games', '試合結果'],
    ],
  },
  {
    id: 'roster',
    label: 'ロスター管理',
    items: [
      ['lineup', 'スタメン設定'],
      ['rotation', '投手起用'],
      ['defense', '守備分析'],
      ['tactics', '方針・采配'],
    ],
  },
  {
    id: 'moves',
    label: '手続き',
    items: [
      ['decisions', '現在の手続き'],
      ['transfer', '移籍・解雇'],
    ],
  },
];
/** ロスター管理のどの項目が、移植画面のどのタブに当たるか */
const LINEUP_TABS = { lineup: 'lineup', rotation: 'rotation', defense: 'defense' };

export default function DesktopView(props) {
  const { view, tab, setTab, busy, run, command } = props;
  const lineupTab = LINEUP_TABS[tab];
  return (
    <>
      <nav className="online-page-nav" aria-label="オンラインの画面">
        <div className="online-nav-context">
          <strong>{teamLabel(view.teamName)}</strong>
          <small>独立リーグ · {view.year}年目</small>
        </div>
        <button
          className="online-nav-home"
          aria-current={tab === 'today' ? 'page' : undefined}
          onClick={() => setTab('today')}
        >
          ホーム
        </button>
        {NAV.map((group) => (
          <div key={group.id} className="online-nav-group">
            <p>{group.label}</p>
            {group.items.map(([id, label]) => (
              <button
                key={id}
                aria-label={label}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
                {id === 'decisions' && view.phase && (
                  <span className="online-dot" aria-label="未完了の手続き" />
                )}
              </button>
            ))}
          </div>
        ))}
        {view.isAdmin && (
          <div className="online-nav-group">
            <p>管理</p>
            <button
              aria-label="リーグ管理"
              aria-current={tab === 'admin' ? 'page' : undefined}
              onClick={() => setTab('admin')}
            >
              リーグ管理
            </button>
          </div>
        )}
      </nav>
      {tab === 'today' && <LeagueBoard view={view} />}
      {tab === 'profile' && <TeamProfile {...props} />}
      {tab === 'games' && (
        <div className="online-dashboard">
          <Results view={view} />
          <Notices view={view} />
        </div>
      )}
      {tab === 'players' && (
        <TeamRoster view={view}>
          {(shown, selector) => (
            <Roster key={shown.teamName} view={shown} teamSelector={selector} />
          )}
        </TeamRoster>
      )}
      {tab === 'ranking' && <AbilityRanking view={view} />}
      {/* ⚠ **手続き中でも開けること**。打順や投手起用はいつ決めてもよく、
          止める理由が無い。
          ⚠ 左メニューの3項目は、移植画面の**中のタブ**へ直に入る。
          ⚠ **保存に失敗しても閉じない**。閉じると編集がまるごと消える。
             ここでは成否に関わらず開いたままにしてある（画面を離れるのは
             左メニューの操作だけ）。 */}
      {lineupTab && (
        <OnlineLineup
          view={view}
          busy={busy}
          tab={lineupTab}
          onClose={() => setTab('tactics')}
          onSave={(plan, baseLineup) =>
            run(() => command('lineup', { ...plan, baseLineup }))
          }
        />
      )}
      {tab === 'tactics' && (
        <div className="online-form-width">
          <LineupPanel key={`${view.year}:${view.teamName}`} {...props} />
        </div>
      )}
      {tab === 'decisions' &&
        (view.phase ? (
          /* ⚠ 初期編成・トライアウトだけ横に広げる。希望リストと候補を
             左右に並べるので、740pxだと能力の表示が折り返して読めない */
          <div
            className={
              view.phase.candidates ? 'online-wide-width' : 'online-form-width'
            }
          >
            <PhasePanel key={view.phase.id} {...props} />
          </div>
        ) : (
          <section className="online-card">
            <h2>手続き</h2>
            <p>現在、決定待ちの手続きはありません。土曜のストーブリーグと日曜のキャンプで出ます。</p>
          </section>
        ))}
      {tab === 'transfer' && (
        <section className="online-card online-form-width">
          <h2>移籍・解雇</h2>
          {/* ⚠ **まだ作っていない**。できないことを、できるように見せない */}
          <p>この画面はまだありません。いまできるのは次の2つです。</p>
          <ul>
            <li>
              <strong>解雇</strong> — 土曜の「契約更改」で、退団させる選手を選べます
            </li>
            <li>
              <strong>選手の獲得</strong> — 土曜の「トライアウト」で、希望リストを出せます
            </li>
          </ul>
          <p className="online-muted">
            球団間のトレードとオークションは、これから作るところです。
          </p>
          <button onClick={() => setTab('decisions')}>現在の手続きへ</button>
        </section>
      )}
      {tab === 'admin' && (
        <div className="online-form-width">
          <Admin {...props} />
        </div>
      )}
    </>
  );
}
function Roster({ view, teamSelector }) {
  const [page, setPage] = useState(0);
  // ⚠ 名簿の順のままだと1ページ目が投手だけになり、スタメンが出てこない
  const [category, setCategory] = useState('batting');
  const order = rosterByRole(view.roster, view.lineup, category);
  const [stats, setStats] = useState(false);
  return (
    <section className="online-card">
      <div className="online-team-selector">{teamSelector}</div>
      <div className="online-segments">
        <button onClick={() => setStats(false)} aria-pressed={!stats}>
          能力一覧
        </button>
        <button onClick={() => setStats(true)} aria-pressed={stats}>
          成績一覧
        </button>
      </div>
      {stats ? (
        <CompactRoster view={view} desktop />
      ) : (
        <>
          <h2>所属選手 · {view.roster.length}人</h2>
          <div className="online-segments" aria-label="成績区分">
            {['batting', 'pitching'].map((id) => (
              <button
                key={id}
                aria-pressed={category === id}
                onClick={() => {
                  setCategory(id);
                  setPage(0);
                }}
              >
                {id === 'batting' ? '打撃' : '投球'}
              </button>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                <th>選手</th>
                <th>年齢</th>
                <th>位置</th>
                <th>ミート</th>
                <th>パワー</th>
                <th>球速</th>
                <th>制球</th>
                <th>調子</th>
                <th>疲労</th>
              </tr>
            </thead>
            <tbody>
              {order.slice(page * 10, page * 10 + 10).map((p) => (
                <tr key={p.id}>
                  <th>
                    <PlayerStatsButton player={p} category={category} />
                    <RoleMark player={p} lineup={view.lineup} />
                    <StatLabels player={p} category={category} />
                  </th>
                  <td>{p.age}</td>
                  <td>{POS[p.position]}</td>
                  <td>
                    <AbilityGrade value={p.batting?.meet} />
                  </td>
                  <td>
                    <AbilityGrade value={p.batting?.power} />
                  </td>
                  <td>
                    <AbilityGrade value={p.pitching?.velocity} velocity />
                  </td>
                  <td>
                    <AbilityGrade value={p.pitching?.control} />
                  </td>
                  <td>
                    <ConditionMark player={p} />
                  </td>
                  <td>{p.fatigue}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PageNav
            page={page}
            count={view.roster.length}
            size={10}
            setPage={setPage}
          />
        </>
      )}
    </section>
  );
}
function Admin({ view, busy, run, command, allowStep }) {
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  return (
    <section className="online-card">
      <h2>リーグ管理</h2>
      <div className="online-actions">
        {view.status === 'running' && (
          <button disabled={busy} onClick={() => run(() => command('pause'))}>
            進行を停止
          </button>
        )}
        {['paused', 'error'].includes(view.status) && (
          <button disabled={busy} onClick={() => run(() => command('resume'))}>
            次の時刻から再開
          </button>
        )}
        {view.status !== 'running' && (
          <button disabled={busy} onClick={() => run(() => command('backup'))}>
            現在の状態をバックアップ
          </button>
        )}
        {view.hasBackup && ['paused', 'error'].includes(view.status) && (
          <button disabled={busy} onClick={() => setRestoreConfirm(true)}>
            バックアップから復元
          </button>
        )}
      </div>
      {/* ⚠ **検証モード**。ONの間だけ管理者が手で進められる。
          遊び始めたらOFFに戻すこと（好きな時に進められるのは公平ではない）。
          環境変数（`ONLINE_ALLOW_STEP`）でも立つが、そちらは再デプロイが要る。 */}
      <div className="online-testmode">
        <label className="online-check">
          <input
            type="checkbox"
            checked={!!view.testMode}
            disabled={busy}
            onChange={(e) =>
              run(() => command('testmode', { on: e.target.checked }))
            }
          />
          検証モード（手で進められるようにする）
        </label>
        <p className="online-muted">
          時間を待たずに試すための設定です。遊び始めたら外してください。
          1ターン＝実時間1時間＝ゲーム内1日（＝1試合）です。
        </p>
        {(view.testMode || allowStep) && (
          <div className="online-actions">
            {view.phase && (
              <button disabled={busy} onClick={() => run(() => command('resolve'))}>
                手続きをいま締め切る
              </button>
            )}
            {view.status === 'running' && (
              <>
                {/* ⚠ **1ターン＝実時間1時間＝ゲーム内1日**。「1日進める」と書くと
                    どちらの1日か分からない（24ターンでゲーム内は24日進む）。
                    ターン数とゲーム内の日数を両方書く */}
                <button disabled={busy} onClick={() => run(() => command('step'))}>
                  1ターン進める（ゲーム内1日）
                </button>
                <button
                  disabled={busy}
                  onClick={() => run(() => command('step', { turns: 24 }))}
                >
                  24ターン進める（ゲーム内24日）
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {restoreConfirm && (
        <div role="alert">
          <p>
            現在の進行を保存済みのバックアップへ戻します。復元後は停止したままです。
          </p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await command('restore');
                setRestoreConfirm(false);
              })
            }
          >
            復元を実行
          </button>
          <button disabled={busy} onClick={() => setRestoreConfirm(false)}>
            キャンセル
          </button>
        </div>
      )}
    </section>
  );
}
