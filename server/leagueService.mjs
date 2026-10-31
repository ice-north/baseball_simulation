import { createHash, randomUUID } from 'node:crypto';
import { issueInvite } from './invites.mjs';
import { applyJoin } from '../src/online/membership.js';
import { isDeepStrictEqual } from 'node:util';
import {
  requireOnline,
  nextProgressionAt,
  assertLeagueVersion,
  ONLINE_SCHEMA,
} from '../src/online/shared.js';
import { isCurrent, migrateLeague } from '../src/online/leagueMigration.js';
import {
  projectLeague,
  projectLineup,
  projectPlayerInfo,
  projectTeamInfo,
  projectGames,
  projectGameInfo,
} from './projection.mjs';
import { saveLineup } from './lineupCommand.mjs';
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = (value) => structuredClone(value);
// エンジンはグローバル世界を使うため、同一Nodeプロセス内でも全storeをまたいで直列化する。
let engineQueue = Promise.resolve();
export class LeagueService {
  constructor(
    store,
    {
      members,
      adminId,
      clock = () => new Date().toISOString(),
      local = false,
      // ⚠ `local` とは別に持つこと。`local` は CORS をローカルへ開く印でもあるので、
      //    検証用の進行を本番で使いたいからといって `local` を立ててはいけない。
      allowStep = false,
      // ⚠ **ハーネス専用**。保存の移行の手順表を差し替える。段がまだ0本なので、
      //    これが無いと「古いリーグを直して保存する」経路を一度も試せない。
      //    本番は渡さない（既定の表と `ONLINE_SCHEMA` を使う）。
      migrations = undefined,
    } = {},
  ) {
    this.store = store;
    // ⚠ **参加者の正本はリーグのデータ側**（`bundle.league.members`）。
    //    ここに渡すのはリーグがまだ無いときの種（管理者1人）と、
    //    リーグを作らずに動かす検査・開発サーバー向けの控え。
    //    環境変数で参加者を固定していた頃の名残なので、増やさないこと。
    this.members = members || [];
    this.adminId = adminId;
    this.clock = clock;
    this.local = local;
    this.migrations = migrations;
    this.allowStep = allowStep || local;
  }
  async view(userId, sessionId) {
    const view = this.store.readView
      ? await this.store.readView(userId, sessionId)
      : projectLeague(await this.store.read(), userId, sessionId, this.adminId);
    requireOnline(view, 'このリーグの参加者ではありません', 403);
    // ⚠ **ここが版の門番の抜け道だった**。`assertLeagueVersion` は命令のときしか
    //    走らず、最初の画面は**保存済みのビュー**をそのまま出す経路がある
    //    （`SupabaseStore.readView`）。その経路はリーグ本体を読まないので、
    //    固定4球団の頃のリーグが2部制のコードで表示され、どこも壊れていないように
    //    見えてしまった。保存済みのビューには版の印が要る。
    // ⚠ リーグ本体から作ったビュー（`projectLeague`）は、もう自分で版を見て
    //    `versionMismatch` を返している。二重に潰すと `canMigrate` が消える
    if (
      !view.setupRequired &&
      !view.joinRequired &&
      !view.versionMismatch &&
      view.schema !== ONLINE_SCHEMA
    )
      return {
        versionMismatch: true,
        isAdmin: userId === this.adminId,
        // ⚠ 保存済みのビューからはリーグの中身を見られないので、直せるかは
        //    判定できない。画面は管理者に押させ、理由は命令の側が返す
        writable: !!view.writable,
      };
    return view;
  }
  /** 参加者の一覧。リーグがあればそちらを正本にする */
  memberIds(bundle) {
    const inLeague = (bundle?.league?.members || []).map((m) => m.userId);
    return inLeague.length ? inLeague : this.members.map((m) => m.userId);
  }

  /**
   * ⚠ **管理者は常に通すこと**。リーグを作る前は誰も参加者ではないので、
   *    参加者だけに絞ると管理者がログインできず、リーグを作れなくなる。
   */
  isMember(bundle, userId) {
    return userId === this.adminId || this.memberIds(bundle).includes(userId);
  }

  async login(userId) {
    return this.store.transaction((bundle) => {
      // ⚠ **参加者でなくてもログインは通すこと**。招待された人は
      //    ログインしてからコードを入れるので、ここで締め出すと参加できない
      //    （鶏と卵になる）。公開サインアップは無いので、ここに来られるのは
      //    管理者が作ったアカウントだけ。できることは `command` 側で絞る。
      const sessionId = randomUUID();
      bundle.sessions[userId] = sessionId;
      return { value: { sessionId } };
    });
  }
  async teamInfo(userId, teamName) {
    if (this.store.readTeamInfo)
      return this.store.readTeamInfo(userId, teamName);
    return projectTeamInfo(await this.store.read(), userId, teamName);
  }
  async playerInfo(userId, id) {
    if (this.store.readPlayerInfo) return this.store.readPlayerInfo(userId, id);
    return projectPlayerInfo(await this.store.read(), userId, id);
  }
  async games(userId, query) {
    if (this.store.readGames) return this.store.readGames(userId, query);
    return projectGames(await this.store.read(), userId, query);
  }
  async gameInfo(userId, id, year) {
    if (this.store.readGameInfo)
      return this.store.readGameInfo(userId, id, year);
    return projectGameInfo(await this.store.read(), userId, id, year);
  }
  async logout(userId, sessionId) {
    return this.store.transaction((bundle) => {
      requireOnline(
        this.isMember(bundle, userId),
        '参加者ではありません',
        403,
      );
      if (!sessionId || bundle.sessions[userId] !== sessionId)
        return { unchanged: true, value: { ok: true } };
      delete bundle.sessions[userId];
      return { value: { ok: true } };
    });
  }
  /**
   * 保存されたリーグを、いまのコードが読める形へ直す。
   * ⚠ **複製に当ててから差し替える**こと。途中で例外が出たリーグを保存すると、
   *    半分だけ新しい形になって次の移行も通らなくなる。
   * ⚠ **revision は上げない**。中身の形が変わっただけで、誰かの操作ではない。
   *    上げると、送信中だった提出が「他の操作で更新されました」で弾かれる。
   */
  ensureMigrated(bundle) {
    const l = bundle.league;
    // ⚠ `migrations` はハーネス専用の差し替え口。段がまだ0本なので、
    //    これが無いと「本物のリーグを直して保存する」経路を一度も通せない
    if (!l || isCurrent(l, this.migrations?.target))
      return { applied: [], changed: false };
    const working = clone(l);
    const result = migrateLeague(working, this.migrations);
    bundle.league = working;
    bundle.league.updatedAt = this.clock();
    return result;
  }
  async command(userId, sessionId, command) {
    requireOnline(
      command && typeof command === 'object' && !Array.isArray(command),
      '操作内容が不正です',
    );
    return this.store.transaction(async (bundle) => {
      requireOnline(
        bundle.sessions[userId] && bundle.sessions[userId] === sessionId,
        '別の端末でログインしました。この端末からの操作はできません',
        409,
        'session',
      );
      requireOnline(
        typeof command.requestId === 'string' &&
          /^[a-zA-Z0-9:-]{8,100}$/.test(command.requestId),
        '操作IDが不正です',
      );
      const key = `${userId}:${command.requestId}`;
      const hash = digest(command);
      if (bundle.receipts[key]) {
        requireOnline(
          bundle.receipts[key].hash === hash,
          '操作IDの使い回しはできません',
          409,
        );
        return { unchanged: true, value: bundle.receipts[key].value };
      }
      // ⚠ **版の照合より先に移行する**。古い形のままでは他の命令が通らず、
      //    「更新したらリーグが読めなくなった」が起きる。どの命令で入っても
      //    ここを通るので、誰かが何か操作すれば自然に直る。
      const migrated = this.ensureMigrated(bundle);
      const l = bundle.league;
      // ⚠ 取り込みだけは**版の照合を飛ばす**。古い形の画面は revision を
      //    持っていないので、照合すると取り込みボタンが押せない
      if (command.type === 'migrate') {
        requireOnline(l, 'リーグがまだありません', 409);
        return {
          ...(migrated.changed ? {} : { unchanged: true }),
          value: { ok: true, applied: migrated.applied },
        };
      }
      requireOnline(
        l ? command.revision === l.revision : command.revision === 0,
        '他の操作で更新されました。最新状態を読み直してください',
        409,
        'revision',
      );
      const now = this.clock();
      const previousStatus = l?.status;
      if (command.type === 'create') {
        requireOnline(
          userId === this.adminId && !l,
          'リーグを作成できません',
          403,
        );
        bundle.league = await this.engine((engine) =>
          // ⚠ 作成時の参加者は**管理者1人**。以降は招待で増える
          engine.createLeague({
            members: this.members.length
              ? this.members
              : [{ userId: this.adminId, label: '管理者' }],
            now,
          }),
        );
      } else if (command.type === 'invite') {
        // ⚠ 招待コードを作れるのは管理者だけ
        requireOnline(l, 'リーグがまだありません', 409);
        requireOnline(
          userId === this.adminId,
          '招待コードを作れるのは管理者だけです',
          403,
        );
        assertLeagueVersion(l);
        l.invites = [...(l.invites || []), issueInvite(l, now)];
        // ⚠ **revision を進めること**。これは楽観ロックの要で、
        //    進め忘れると2人が同時に操作したとき片方が黙って消える。
        //    既存の `revision++` は非作成コマンドの else の中にあり、
        //    ここ（create と並ぶ階層）には掛からない。
        l.revision++;
      } else if (command.type === 'join') {
        // ⚠ **参加者チェックより前に置くこと**。参加する人はまだ参加者ではない
        requireOnline(l, 'リーグがまだありません', 409);
        assertLeagueVersion(l);
        applyJoin(l, {
          userId,
          teamName: command.payload?.teamName,
          code: command.payload?.code,
          now,
        });
        l.revision++; // ⚠ 上と同じ理由
      } else {
        requireOnline(
          l?.members.some((m) => m.userId === userId),
          '参加者ではありません',
          403,
        );
        if (['submit', 'lineup', 'step', 'resume'].includes(command.type))
          assertLeagueVersion(l);
        if (['submit', 'lineup'].includes(command.type))
          requireOnline(
            command.payload &&
              typeof command.payload === 'object' &&
              !Array.isArray(command.payload),
            '提出内容が不正です',
          );
        if (command.type === 'submit') {
          requireOnline(
            Object.hasOwn(command.payload, 'baseSubmission'),
            '画面を再読み込みしてから提出してください',
            400,
            'edit_base',
          );
          const submitted = l.phase?.submissions?.[userId] || null;
          requireOnline(
            isDeepStrictEqual(
              JSON.parse(JSON.stringify(submitted)),
              command.payload.baseSubmission,
            ),
            '保存済みの提出が更新されています。最新の提出を読み直してください',
            409,
            'edit_conflict',
          );
          await this.engine((engine) =>
            engine.submitPhase(l, userId, command.payload, now),
          );
        } else if (command.type === 'lineup') {
          requireOnline(
            command.payload.baseLineup &&
              typeof command.payload.baseLineup === 'object',
            '画面を再読み込みしてから編成を保存してください',
            400,
            'edit_base',
          );
          const member = l.members.find((m) => m.userId === userId);
          const currentLineup = JSON.parse(
            JSON.stringify(projectLineup(l.game.teams[member.teamName])),
          );
          requireOnline(
            isDeepStrictEqual(currentLineup, command.payload.baseLineup),
            '編成が更新されています。「編集を戻す」で最新の編成を読み直してください',
            409,
            'edit_conflict',
          );
          saveLineup(l, userId, command.payload);
        } else if (command.type === 'pause') {
          requireOnline(
            userId === this.adminId && l.status === 'running',
            '進行中に管理者が停止してください',
            403,
          );
          l.status = 'paused';
          l.nextAdvanceAt = null;
        } else if (command.type === 'resume') {
          requireOnline(
            userId === this.adminId && ['paused', 'error'].includes(l.status),
            '再開できません',
            403,
          );
          l.status = l.phase ? 'waiting' : 'running';
          l.nextAdvanceAt = l.phase ? null : nextProgressionAt(now);
          delete l.error;
        } else if (command.type === 'backup') {
          requireOnline(
            userId === this.adminId && l.status !== 'running',
            '進行を停止してからバックアップしてください',
            403,
          );
          bundle.backup = clone({
            league: l,
            sessions: bundle.sessions,
            receipts: bundle.receipts,
          });
        } else if (command.type === 'restore') {
          requireOnline(
            userId === this.adminId &&
              ['paused', 'error'].includes(l.status) &&
              bundle.backup,
            '停止中に保存済みバックアップを復元できます',
            409,
          );
          const revision = l.revision;
          assertLeagueVersion(bundle.backup.league);
          bundle.league = clone(bundle.backup.league);
          bundle.league.revision = revision;
          bundle.league.status = bundle.league.phase ? 'waiting' : 'paused';
          bundle.league.nextAdvanceAt = null;
          // 復元前の操作を再実行させない。過去のログイン権限を復活させない。
        } else if (command.type === 'step' && this.allowStep) {
          requireOnline(
            userId === this.adminId,
            '検証用の進行操作は管理者専用です',
            403,
          );
          await this.engine((engine) =>
            engine.advanceLeagueDay(l, `step:${command.requestId}`, now),
          );
        } else requireOnline(false, '未対応の操作です');
        bundle.league.revision++;
      }
      const completedAt = this.clock();
      if (
        bundle.league.status === 'running' &&
        (previousStatus !== 'running' || command.type === 'step')
      )
        bundle.league.nextAdvanceAt = nextProgressionAt(completedAt);
      bundle.league.updatedAt = completedAt;
      const value = { ok: true, revision: bundle.league.revision };
      bundle.receipts[key] = { hash, value };
      const keys = Object.keys(bundle.receipts);
      for (const old of keys.slice(0, Math.max(0, keys.length - 256)))
        delete bundle.receipts[old];
      return { value };
    });
  }
  engine(fn) {
    const result = engineQueue.then(async () =>
      fn(await import('./leagueEngine.mjs')),
    );
    engineQueue = result.catch(() => {});
    return result;
  }
  async defaults(userId, sessionId) {
    // 候補一覧に対する純粋な提案。エンジンの共有世界には書き込まない。
    const bundle = await this.store.read();
    const member = bundle.league?.members.find((m) => m.userId === userId);
    requireOnline(
      member && bundle.league.phase,
      '決定待ちイベントがありません',
      409,
    );
    requireOnline(
      bundle.sessions[userId] === sessionId,
      'ログインし直してください',
      409,
      'session',
    );
    assertLeagueVersion(bundle.league);
    return this.engine((engine) => ({
      phaseId: bundle.league.phase.id,
      revision: bundle.league.revision,
      plan: engine.defaultPhasePlan(bundle.league, member.teamName),
    }));
  }
  async tick() {
    if (this.store.isDue && !(await this.store.isDue(this.clock())))
      return { advanced: false };
    return this.store.transaction(async (bundle) => {
      // ⚠ **定期処理でも移行する**。誰も操作しなくても、次の正時に自然に直る。
      //    直せない形（作り直すしかない版）なら止めるだけにして、
      //    定期処理そのものを例外で落とさない
      let migrated = { applied: [], changed: false };
      try {
        migrated = this.ensureMigrated(bundle);
      } catch (error) {
        console.error('online migrate failed:', error.message);
        return { unchanged: true, value: { advanced: false } };
      }
      const l = bundle.league;
      const now = this.clock();
      // ⚠ **締め切り超過の手続きを先に片付ける**。手続き中は status が
      //    running でないので、下の判定だけだと永遠に動かない。
      if (l?.phase?.deadline && l.phase.deadline <= now) {
        const working = clone(l);
        try {
          const resolved = await this.engine((engine) =>
            engine.autoResolvePhase(working, now),
          );
          bundle.league = working;
          bundle.league.revision++;
          bundle.league.updatedAt = this.clock();
          if (bundle.league.status === 'running' && !bundle.league.nextAdvanceAt)
            bundle.league.nextAdvanceAt = nextProgressionAt(bundle.league.updatedAt);
          return { value: { advanced: true, autoResolved: resolved } };
        } catch (error) {
          console.error('online auto resolve failed:', error.stack);
          return { unchanged: true, value: { advanced: false } };
        }
      }
      if (
        !l ||
        l.status !== 'running' ||
        !l.nextAdvanceAt ||
        l.nextAdvanceAt > now
      )
        // ⚠ 移行したのに `unchanged` で返すと、直した形が保存されず
        //    毎回やり直しになる（画面は古いままに見える）
        return migrated.changed
          ? { value: { advanced: false, migrated: migrated.applied } }
          : { unchanged: true, value: { advanced: false } };
      const due = l.nextAdvanceAt;
      // 15分以上遅れた通知を巻き戻し実行しない。停止して明示的な再開を待つ。
      if (Date.parse(now) - Date.parse(due) > 15 * 60000) {
        l.status = 'error';
        l.nextAdvanceAt = null;
        l.error =
          '定期進行が遅れました。状態を確認して管理者が再開してください';
      } else {
        const working = clone(l);
        try {
          await this.engine((engine) =>
            engine.advanceLeagueDay(working, due, now),
          );
          bundle.league = working;
        } catch (error) {
          l.status = 'error';
          l.nextAdvanceAt = null;
          l.error = '日次処理に失敗しました。管理者が状態を確認してください';
          console.error('online tick failed:', error.stack);
        }
      }
      bundle.league.revision++;
      const completedAt = this.clock();
      if (bundle.league.status === 'running')
        bundle.league.nextAdvanceAt = nextProgressionAt(completedAt);
      bundle.league.updatedAt = completedAt;
      return {
        value: {
          advanced:
            bundle.league.status === 'running' ||
            bundle.league.status === 'waiting',
          revision: bundle.league.revision,
        },
      };
    });
  }
}
