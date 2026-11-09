import Chronicle from './Chronicle.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Results,
  Notices,
  PhasePanel,
  PendingPackPanel,
} from './LeaguePanels.jsx';
import DesktopTactics from './DesktopTactics.jsx';
import AbilityRanking from './AbilityRanking.jsx';
import CareerStats from './CareerStats.jsx';
import TeamRoster from './TeamRoster.jsx';
import LineupBoard from './LineupBoard.jsx';
import PitchingBoard from './PitchingBoard.jsx';
import { useDraftMemoryStore } from './Drafts.jsx';
import LeagueBoard from './LeagueBoard.jsx';
import TradeScreen from './TradeScreen.jsx';
import { CompletedCamp } from './CampPlanner.jsx';
import SeasonFlow, { stageLines } from './SeasonFlow.jsx';
import OffseasonGrowth from './OffseasonGrowth.jsx';
import { nextAdvanceText, STATUS } from './api.js';
import { formatTurn, TURN_MINUTES } from './shared.js';
import { teamLabel } from './gameText.js';
import { noticeCounts, packWaiting, pendingProcedure } from './notices.js';
import { formatDeadline, packStartText } from './LeaguePanels.jsx';
import { PYRAMID_LEAGUES, compareLeagueStanding } from './pyramidLeague.js';
import { CompactRoster } from './PlayerPerformance.jsx';
import { Page } from './Page.jsx';
import {
  rebaseLineupSave,
  LINEUP_BOARD_KEYS,
  PITCHING_BOARD_KEYS,
  restoreFromFullLineup,
  fullLineupFromBoards,
} from './lineupBridge.js';
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
//    スタメン設定・投手起用だけで決める。方針・采配に
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
      ['careers', '通算成績'],
      ['chronicle', '球団史・記録'],
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
      ['tactics', '方針・采配'],
    ],
  },
  {
    id: 'moves',
    label: '手続き',
    items: [
      ['decisions', '現在の手続き'],
      ['transfer', 'トレード'],
    ],
  },
];
/**
 * ロスター管理の編成ページ（PC専用の画面）と、それぞれが保存で受け持つ項目。
 * ⚠ 以前は一人用の編成画面を移植して使っていた。スタメン設定（`LineupBoard.jsx`）と
 *    投手起用（`PitchingBoard.jsx`）は、比べて決めるための1枚の表に作り直した。
 *    守備分析はスタメン設定の表に入れた（守備位置の入れ替え・位置ごとの候補と適性）。
 * ⚠ 2つのページは**別々に保存する**。受け持つ項目を分けてあるので、片方を保存しても
 *    もう片方の未保存の編集は保存できる（`rebaseLineupSave`）。
 */
const BOARD_KEYS = { lineup: LINEUP_BOARD_KEYS, rotation: PITCHING_BOARD_KEYS };
const TITLES = {
  today: 'ホーム',
  players: '選手成績',
  careers: '通算成績',
  chronicle: '球団史・記録',
  ranking: '能力ランキング',
  games: '試合結果',
  lineup: 'スタメン設定',
  rotation: '投手起用',
  tactics: '方針・采配',
  decisions: '現在の手続き',
  transfer: 'トレード',
  admin: 'リーグ管理',
};

/**
 * 自球団の部・順位・勝敗。
 * ⚠ 順位表（`Standings`）と**同じ並べ方**（`compareLeagueStanding`）で数えること。
 *    サーバーの並びのままだと、同率のとき（開幕前の0勝0敗など）左メニューの
 *    順位と表の順位が食い違っていた
 */
function ownStanding(view) {
  const leagueId = view.teamLeagues?.[view.teamName];
  const league = PYRAMID_LEAGUES.find((l) => l.id === leagueId);
  const rows = (view.standings || []).filter(
    (s) => !view.teamLeagues || view.teamLeagues[s.team] === leagueId,
  );
  if (view.teamLeagues) rows.sort(compareLeagueStanding);
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
  const waiting = packWaiting(view);
  return (
    <div className="online-nav-context">
      <strong>{teamLabel(view.teamName)}</strong>
      <small>
        {own
          ? `${own.league ? `${own.league} ` : ''}${own.rank}位 · ${own.row.wins}勝${own.row.losses}敗${own.row.draws ? `${own.row.draws}分` : ''}`
          : `独立リーグ · ${view.year}年目`}
      </small>
      {/* 途中参加でセットを選び終えた人は、いつ自分の球団になるかを出し続ける */}
      {waiting && (
        <small className="online-nav-waiting">
          開幕待ち
          {waiting.joinsAt &&
            ` · ${formatDeadline(waiting.joinsAt)}から${waiting.estimated ? '（予定）' : ''}`}
        </small>
      )}
      <button className="online-nav-link" onClick={onRename}>
        名前を変える
      </button>
      <div className="online-nav-clock">
        <p>
          {/* ⚠ オンラインは**ターンで進む**。ゲーム内の日付は出さない
              （「4/18って何試合目？」と数え直すことになる） */}
          {/* ⚠ 総数は**ビューの値**で出す。`SEASON_TURNS` を直に読むと、
              進行中のリーグ（120ターンの日程）に新しい総数が当たる */}
          {/* ⚠ シーズン後は「シーズン終了」のままにしない。いまの段階を出す */}
          <b>
            {view.stage && !['season', 'pack_select'].includes(view.stage.key)
              ? `オフ · ${stageLines(view)?.step.label || ''}${view.stage.open ? '' : '待ち'}`
              : formatTurn(view.currentDate, view.seasonTurns)}
          </b>
          <span className="online-status">{STATUS[view.status]}</span>
        </p>
        <small>
          {view.year}年目 · 次の進行 {nextAdvanceText(view)}
        </small>
        {/* ⚠ 進行の刻みを変えたらここも直すこと。文面に数を書かず
            `TURN_MINUTES` から作る。毎正時24ターンに変えたあと
            「1日7回・夜間は休止」が残っていた（画面だけ古い説明を
            出し続けていた）ので、二度と手で書かない。 */}
        <small>{TURN_MINUTES}分ごと・月〜金が試合／土日は手続き</small>
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
  // ⚠ 閉じるのは**自分で呼ぶ**（`close` イベントに頼らない。ほかのダイアログと同じ）。
  //    開発時の StrictMode は effect を「付ける→外す→付ける」と2回走らせるので、
  //    外したときの `node.close()` が遅れて `close` イベントを出し、開き直した
  //    ダイアログがすぐ閉じていた（`npm run dev` で名前を変えられなかった）
  return (
    <dialog
      ref={dialog}
      className="online-player-dialog online-rename-dialog"
      aria-labelledby="online-rename-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="online-rename-title">球団名・名前を変える</h2>
        <button onClick={close}>閉じる</button>
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
          if (result?.ok) close();
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
  // ⚠ 編成のページは**初めて開くまで作らず、開いたあとは隠して残す**
  //    （ほかのページへ移っても、保存していない編集を残す）
  // ⚠ スマホの全画面編成で保存していない編集があれば受け取る（`restoreFromFullLineup`）。
  //    スマホを横にするとこの画面に切り替わる。受け取ったら両方のページを作っておき、
  //    未保存の印をすぐに出す
  const memory = useDraftMemoryStore();
  const [restore] = useState(() =>
    restoreFromFullLineup(memory?.get('lineup.full')),
  );
  const [opened, setOpened] = useState(() => ({
    lineup: !!restore || current === 'lineup',
    rotation: !!restore || current === 'rotation',
  }));
  if (BOARD_KEYS[current] && !opened[current])
    setOpened({ ...opened, [current]: true });
  const [dirty, setDirty] = useState({});
  const unsaved = (id) => !!dirty[id];
  // 保存していない編集を、スマホの全画面編成の形で残す（縦に戻したときに引き継ぐ）。
  // ⚠ 保存したら消す。残すと、縦に戻したときに古い編集が開き直されて
  //    「編成が更新されています」で保存できない
  const viewRef = useRef(view);
  viewRef.current = view;
  const drafts = useRef({});
  const syncFull = useCallback(() => {
    if (!memory) return;
    const full = fullLineupFromBoards(
      viewRef.current,
      Object.values(drafts.current).filter(Boolean),
    );
    if (full) memory.set('lineup.full', full);
    else memory.delete('lineup.full');
  }, [memory]);
  const boardHandlers = useRef(null);
  if (!boardHandlers.current) {
    boardHandlers.current = Object.fromEntries(
      Object.keys(BOARD_KEYS).map((id) => [
        id,
        {
          onDirty: (d) =>
            setDirty((x) => (x[id] === d ? x : { ...x, [id]: d })),
          onDraft: (draft) => {
            drafts.current[id] = draft.dirty
              ? {
                  keys: BOARD_KEYS[id],
                  plan: draft.plan,
                  baseLineup: draft.baseLineup,
                }
              : null;
            syncFull();
          },
        },
      ]),
    );
  }
  // 最新の編成が届いたら載せ直す（保存していない編集の起点を最新にする）
  useEffect(() => syncFull(), [view.revision, syncFull]);
  const boardProps = (id) => ({
    hidden: current !== id,
    view,
    busy,
    restore,
    ...boardHandlers.current[id],
    onSave: (plan, baseLineup) =>
      // ⚠ ほかのページ（方針・采配・もう一方の編成ページ）で保存された項目を
      //    古い値で上書きしないよう、最新の編成に載せて送る
      run(() =>
        command(
          'lineup',
          rebaseLineupSave(plan, baseLineup, view.lineup, BOARD_KEYS[id]),
        ),
      ),
  });
  const notice = noticeCounts(view);
  const counts = { decisions: notice.procedure, transfer: notice.trades };
  const procedure = pendingProcedure(view);
  const waiting = packWaiting(view);
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
                {/* ⚠ 印は**数で出す**（LINEの通知のように）。以前は色の●だけで、
                    手続きとトレードの返事待ちが何件あるのか分からなかった */}
                {counts[id] > 0 && (
                  <span
                    className="online-count"
                    aria-label={id === 'decisions' ? '未完了の手続き' : '返事が必要な提案'}
                  >
                    {counts[id]}
                  </span>
                )}
                {unsaved(id) && (
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
      {renaming && <RenameDialog {...props} close={() => setRenaming(false)} />}
      {/* ⚠ **自分が決める手続きは、どのページにいても上に帯で出す**（いしだ指摘:
          初期メンバー選び・人員整理・キャンプが左メニューの「手続き」の中にあり、
          うっかり見逃して飛ばす危険があった）。決めるまで消さない */}
      {procedure && current !== 'decisions' && (
        <div className="online-procedure-banner" role="alert">
          <div>
            <strong>{procedure.label}を決めてください</strong>
            <span>
              {[
                procedure.progress,
                procedure.deadline && `締め切り ${formatDeadline(procedure.deadline)}`,
                procedure.deadline && '過ぎると標準の内容で自動で進みます',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <button className="online-primary" onClick={() => setTab('decisions')}>
            {procedure.label}を開く
          </button>
        </div>
      )}
      {/* 途中参加でセットを選び終えたら、手続きの帯の代わりにホームで
          「いつ自分の球団になるか」を出す（選んだだけでは画面が何も変わらず、
          済んだのか分からなかった） */}
      {waiting && current === 'today' && (
        <div className="online-procedure-banner is-waiting" role="status">
          <div>
            <strong>開幕待ち: 「{waiting.packName}」の24人で始まります</strong>
            <span>
              {packStartText(waiting)}あなたの球団になります。それまでは引き継いだ選手でCPUが戦います。
            </span>
          </div>
          <button onClick={() => setTab('decisions')}>確かめる</button>
        </div>
      )}
      {/* ⚠ ホームは**見出しを出さない**。左メニューで「ホーム」を押した先に
          もう一度「ホーム / SEASON 1」と出ていて、場所を取るだけだった。
          年は左メニューの「○年目」に出ている */}
      {current === 'today' && (
        <Page>
          {/* ⚠ シーズン中は出さない（毎日同じ帯が場所を取るだけ）。
              シーズン後から開幕までは、いまの段階とやることを先頭に出す */}
          {view.stage?.key !== 'season' && <SeasonFlow view={view} />}
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
      {current === 'careers' && <CareerStats view={view} />}
      {current === 'chronicle' && <Chronicle view={view} />}
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
          ⚠ **保存に失敗しても閉じない**。閉じると編集がまるごと消える。
             画面を離れるのは左メニューの操作だけ（隠すだけで残す）。 */}
      {opened.lineup && <LineupBoard {...boardProps('lineup')} />}
      {opened.rotation && <PitchingBoard {...boardProps('rotation')} />}
      {current === 'tactics' && (
        <DesktopTactics key={`${view.year}:${view.teamName}`} {...props} />
      )}
      {/* ⚠ **途中参加の初期メンバー選択を先に出す**。リーグ全体の手続きより、
          自分の名簿が決まっていないことのほうが先に片付く
          ⚠ セットを待っている間の手続き（ストーブリーグ・キャンプ）は出さない。
          その球団はキャンプで名簿が丸ごと入れ替わるのでCPUが決め、サーバーも
          この人の決定を待たない（`leagueEngine` の `waitsFor`） */}
      {current === 'decisions' && view.pendingPack && (
        <PendingPackPanel {...props} />
      )}
      {current === 'decisions' &&
        !view.pendingPack &&
        (view.phase ? (
          <PhasePanel key={view.phase.id} {...props} />
        ) : (
          <Page title="現在の手続き">
            <SeasonFlow view={view} />
            {/* ⚠ 「無い」だけで終わらせない。合間なら次に何が開くかを帯が書く */}
            <section className="online-card">
              <p>
                {stageLines(view)?.head && view.stage?.key !== 'season'
                  ? `いま決めることはありません。${stageLines(view).head}。`
                  : '現在、決定待ちの手続きはありません。土曜のストーブリーグと日曜のキャンプで出ます。'}
              </p>
            </section>
            <CompletedCamp key={view.lastCamp?.year} view={view} />
            <OffseasonGrowth key={view.lastOffseason?.year} view={view} />
          </Page>
        ))}
      {current === 'transfer' && <TradeScreen {...props} />}
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
