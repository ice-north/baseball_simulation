import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Results,
  Notices,
  PhasePanel,
  PendingPackPanel,
} from './LeaguePanels.jsx';
import DesktopTactics from './DesktopTactics.jsx';
import AbilityRanking from './AbilityRanking.jsx';
import TeamRoster from './TeamRoster.jsx';
import OnlineLineup from './OnlineLineup.jsx';
import LeagueBoard from './LeagueBoard.jsx';
import { dateTime, STATUS } from './api.js';
import { formatGameDate } from './shared.js';
import { teamLabel } from './gameText.js';
import { PYRAMID_LEAGUES } from './pyramidLeague.js';
import { CompactRoster } from './PlayerPerformance.jsx';
import { Page } from './Page.jsx';
import { rebaseLineupSave, LINEUP_EDITOR_KEYS } from './lineupBridge.js';
// ============================================================
// PC版の画面。**どのページも同じ形にする**:
//
//   左メニュー（固定）  球団・日付・次の進行 ＋ 各ページへの入口
//   本文               ページ見出し（名前＋右に操作）→ カード
//
// ⚠ **ページごとに外枠を変えないこと**。以前は
//    - 全ページの本文の上に、同じ「SEASON・日付・次の進行・進行時刻」の帯（約170px）
//    - 移植したスタメン設定だけ、アプリの見出しが消えて別の見出しバーと
//      左メニューと同じタブが出る
//    - 本文の幅が 740px／全幅／2段 とページごとに違う
//    で、ページを開くたびに見た目が変わるという指摘を受けた。
//    日付と進行は左メニューに1回だけ置き、本文は `Page` で揃える。
// ⚠ **同じものを2か所で編集させないこと**。打順・先発・投手の役割は
//    移植した画面（スタメン設定・投手起用）だけで決める。方針・采配に
//    コンボボックス版の打順と投手の役割があり、同じものが2通りの操作で
//    編集できていた（しかも名前しか出ず、判断に使える情報が無かった）。
// ⚠ 消した入口:
//    - 自チーム情報 … 所属・順位・成績は左メニューの球団名の下に出す。
//      名前の変更は頻繁ではないので、左メニューの「名前を変える」から開く
// ⚠ 能力ランキングは残す。**リーグ全球団**の中の並びで、選手成績の表
//    （1球団ずつ）では作れないため
// ============================================================
const NAV = [
  {
    id: 'info',
    label: '情報',
    items: [
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
const TITLES = {
  today: 'ホーム',
  players: '選手成績',
  ranking: '能力ランキング',
  games: '試合結果',
  lineup: 'スタメン設定',
  rotation: '投手起用',
  defense: '守備分析',
  tactics: '方針・采配',
  decisions: '現在の手続き',
  transfer: '移籍・解雇',
  admin: 'リーグ管理',
};

/** 自球団の部・順位・勝敗（順位表から引く。サーバーの並びが順位） */
function ownStanding(view) {
  const leagueId = view.teamLeagues?.[view.teamName];
  const league = PYRAMID_LEAGUES.find((l) => l.id === leagueId);
  const rows = (view.standings || []).filter(
    (s) => !view.teamLeagues || view.teamLeagues[s.team] === leagueId,
  );
  const index = rows.findIndex((s) => s.team === view.teamName);
  return index < 0
    ? null
    : { league: league?.name, rank: index + 1, row: rows[index] };
}

/**
 * 左メニューの上の「いまの状況」。⚠ **ここ1か所だけに出す**
 * （以前は全ページの本文の上に同じ帯があった）。
 */
function NavStatus({ view, busy, run, reload, showTimes, onRename }) {
  const own = ownStanding(view);
  return (
    <div className="online-nav-context">
      <strong>{teamLabel(view.teamName)}</strong>
      <small>
        {own
          ? `${own.league ? `${own.league} ` : ''}${own.rank}位 · ${own.row.wins}勝${own.row.losses}敗${own.row.draws ? `${own.row.draws}分` : ''}`
          : `独立リーグ · ${view.year}年目`}
      </small>
      <button className="online-nav-link" onClick={onRename}>
        名前を変える
      </button>
      <div className="online-nav-clock">
        <p>
          <b>{formatGameDate(view.currentDate)}</b>
          <span className="online-status">{STATUS[view.status]}</span>
        </p>
        <small>
          {view.year}年目 · 次の進行 {dateTime(view.nextAdvanceAt)}
        </small>
        {/* ⚠ 進行の刻みを変えたらここも直すこと。
            毎正時24ターンに変えたあと「1日7回・夜間は休止」が
            残っていた（画面だけ古い説明を出し続けていた）。 */}
        <small>毎正時・月〜金が試合／土日は手続き</small>
        <div className="online-nav-clock-actions">
          <button onClick={showTimes}>進行時刻</button>
          <button disabled={busy} onClick={() => run(reload)}>
            更新
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 球団名とプレイヤー名を変える（以前の「自チーム情報」の中身）。
 * ⚠ **参加のときしか名前を付けられなかった**。リーグを作った管理者には
 *    その機会すら無く、順位表に「湘南サンズ（湘南サンズ）」のように
 *    球団名が2回出ていた（参加時の呼び名の既定が球団名だったため）。
 * ⚠ 内部名（`teamName`）は変わらない。記録の選手キーまで貫いているので、
 *    見せる名前だけ差し替える。
 */
function RenameDialog({ view, busy, run, command, close }) {
  const dialog = useRef(null);
  const me = (view.members || []).find((m) => m.teamName === view.teamName);
  const [teamName, setTeamName] = useState(
    () => me?.displayName || teamLabel(view.teamName),
  );
  const [playerName, setPlayerName] = useState(() => me?.label || '');
  // ⚠ 失敗はダイアログの中に出す。画面上部の帯はダイアログ（最前面）の裏に隠れる
  const [error, setError] = useState('');
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.open && node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="online-player-dialog online-rename-dialog"
      aria-labelledby="online-rename-title"
      onClose={close}
    >
      <header>
        <h2 id="online-rename-title">球団名・名前を変える</h2>
        <button onClick={() => dialog.current.close()}>閉じる</button>
      </header>
      <p className="online-muted">
        順位表には「球団名（あなたの名前）」と出ます。いつでも変えられます。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          const result = await run(() =>
            command('profile', {
              teamName: teamName.trim(),
              playerName: playerName.trim(),
            }),
          );
          if (result?.ok) dialog.current?.close();
          else setError(result?.error || '保存できませんでした');
        }}
      >
        <label>
          球団名
          <input
            value={teamName}
            maxLength={24}
            disabled={busy}
            onChange={(e) => setTeamName(e.target.value)}
          />
        </label>
        <label>
          あなたの名前
          <input
            value={playerName}
            maxLength={24}
            disabled={busy}
            onChange={(e) => setPlayerName(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="online-error-text">
            保存できませんでした：{error}
          </p>
        )}
        <div className="online-actions">
          <button
            className="online-primary"
            type="submit"
            disabled={busy || !teamName.trim()}
          >
            保存
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function DesktopView(props) {
  const { view, tab, setTab, busy, run, command, reload, showTimes } = props;
  const [renaming, setRenaming] = useState(false);
  // ⚠ 消した入口（自チーム情報）で開いていたら、ホームへ戻す
  const current = TITLES[tab] ? tab : 'today';
  const lineupTab = LINEUP_TABS[current];
  // ⚠ 編成の画面は**ほかのページへ移っても外さない**（未保存の編集を残す）。
  //    隠している間は最後に開いていたタブのまま
  const lastLineupTab = useRef('lineup');
  if (lineupTab) lastLineupTab.current = lineupTab;
  // ⚠ 編成の画面（一人用の約2,900行）は**初めて開くまで作らない**。開いたあとは
  //    隠すだけで残す（未保存の編集のため）
  const [lineupOpened, setLineupOpened] = useState(!!lineupTab);
  if (lineupTab && !lineupOpened) setLineupOpened(true);
  const [lineupDirty, setLineupDirty] = useState(false);
  const onLineupDirty = useCallback((d) => setLineupDirty(d), []);
  return (
    <>
      <nav className="online-page-nav" aria-label="オンラインの画面">
        <NavStatus
          view={view}
          busy={busy}
          run={run}
          reload={reload}
          showTimes={showTimes}
          onRename={() => setRenaming(true)}
        />
        <button
          className="online-nav-home"
          aria-current={current === 'today' ? 'page' : undefined}
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
                aria-current={current === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
                {id === 'decisions' && (view.phase || view.pendingPack) && (
                  <span className="online-dot" aria-label="未完了の手続き" />
                )}
                {LINEUP_TABS[id] && lineupDirty && (
                  <span
                    className="online-dot is-unsaved"
                    aria-label="保存していない変更"
                    title="保存していない変更があります"
                  />
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
              aria-current={current === 'admin' ? 'page' : undefined}
              onClick={() => setTab('admin')}
            >
              リーグ管理
            </button>
          </div>
        )}
      </nav>
      {renaming && (
        <RenameDialog {...props} close={() => setRenaming(false)} />
      )}
      {current === 'today' && (
        <Page title="ホーム" sub={`SEASON ${view.year}`}>
          <LeagueBoard view={view} />
        </Page>
      )}
      {current === 'games' && (
        <Page title="試合結果">
          <div className="online-board">
            <div className="online-board-main">
              <Results view={view} />
            </div>
            <div className="online-board-side">
              <Notices view={view} />
            </div>
          </div>
        </Page>
      )}
      {current === 'ranking' && <AbilityRanking view={view} />}
      {current === 'players' && (
        <TeamRoster view={view}>
          {(shown, selector) => (
            <Page
              title="選手成績"
              sub="列の見出しを押すと並べ替えます。選手名を押すと詳しい成績と能力を開きます。"
              actions={<div className="online-team-selector">{selector}</div>}
            >
              <section className="online-card">
                <CompactRoster key={shown.teamName} view={shown} desktop />
              </section>
            </Page>
          )}
        </TeamRoster>
      )}
      {/* ⚠ **手続き中でも開けること**。打順や投手起用はいつ決めてもよく、
          止める理由が無い。
          ⚠ 左メニューの3項目は、移植画面の**中のタブ**へ直に入る。
          ⚠ **保存に失敗しても閉じない**。閉じると編集がまるごと消える。
             ここでは成否に関わらず開いたままにしてある（画面を離れるのは
             左メニューの操作だけ）。 */}
      {lineupOpened && (
        <OnlineLineup
          embedded
          hidden={!lineupTab}
          title={TITLES[lineupTab ? current : 'lineup']}
          view={view}
          busy={busy}
          tab={lineupTab || lastLineupTab.current}
          onDirty={onLineupDirty}
          onSave={(plan, baseLineup) =>
            // ⚠ 方針・采配で保存された方針を古い値で上書きしないよう、最新の編成に載せて送る
            run(() =>
              command(
                'lineup',
                rebaseLineupSave(plan, baseLineup, view.lineup, LINEUP_EDITOR_KEYS),
              ),
            )
          }
        />
      )}
      {current === 'tactics' && (
        <DesktopTactics key={`${view.year}:${view.teamName}`} {...props} />
      )}
      {/* ⚠ **途中参加の初期メンバー選択を先に出す**。リーグ全体の手続きより、
          自分の名簿が決まっていないことのほうが先に片付く */}
      {current === 'decisions' && view.pendingPack && (
        <PendingPackPanel {...props} />
      )}
      {current === 'decisions' &&
        !view.pendingPack &&
        (view.phase ? (
          <PhasePanel key={view.phase.id} {...props} />
        ) : (
          <Page title="現在の手続き">
            <section className="online-card">
              <p>
                現在、決定待ちの手続きはありません。土曜のストーブリーグと日曜のキャンプで出ます。
              </p>
            </section>
          </Page>
        ))}
      {current === 'transfer' && (
        <Page title="移籍・解雇">
          <section className="online-card">
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
            <div className="online-actions">
              <button onClick={() => setTab('decisions')}>現在の手続きへ</button>
            </div>
          </section>
        </Page>
      )}
      {current === 'admin' && (
        <Page title="リーグ管理">
          <Admin {...props} />
        </Page>
      )}
    </>
  );
}
function Admin({ view, busy, run, command, allowStep }) {
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  return (
    <div className="online-board is-even">
      <section className="online-card online-board-main">
        <h2>進行</h2>
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
        {restoreConfirm && (
          <div role="alert" className="online-confirm">
            <p>
              現在の進行を保存済みのバックアップへ戻します。復元後は停止したままです。
            </p>
            <div className="online-actions">
              <button
                className="online-primary"
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
          </div>
        )}
      </section>
      {/* ⚠ **検証モード**。ONの間だけ管理者が手で進められる。
          遊び始めたらOFFに戻すこと（好きな時に進められるのは公平ではない）。
          環境変数（`ONLINE_ALLOW_STEP`）でも立つが、そちらは再デプロイが要る。 */}
      <section className="online-card online-board-side">
        <h2>検証モード</h2>
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
      </section>
    </div>
  );
}
