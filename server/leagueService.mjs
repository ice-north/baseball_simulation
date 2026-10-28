import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  requireOnline,
  nextProgressionAt,
  assertLeagueVersion,
} from '../src/online/shared.js';
import { projectLeague, projectLineup } from './projection.mjs';
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
    } = {},
  ) {
    this.store = store;
    this.members = members;
    this.adminId = adminId;
    this.clock = clock;
    this.local = local;
  }
  async view(userId, sessionId) {
    const view = this.store.readView
      ? await this.store.readView(userId, sessionId)
      : projectLeague(await this.store.read(), userId, sessionId, this.adminId);
    requireOnline(view, 'このリーグの参加者ではありません', 403);
    return view;
  }
  async login(userId) {
    requireOnline(
      this.members.some((m) => m.userId === userId),
      'このリーグの参加者ではありません',
      403,
    );
    return this.store.transaction((bundle) => {
      const sessionId = randomUUID();
      bundle.sessions[userId] = sessionId;
      return { value: { sessionId } };
    });
  }
  async logout(userId, sessionId) {
    requireOnline(
      this.members.some((m) => m.userId === userId),
      '参加者ではありません',
      403,
    );
    return this.store.transaction((bundle) => {
      if (!sessionId || bundle.sessions[userId] !== sessionId)
        return { unchanged: true, value: { ok: true } };
      delete bundle.sessions[userId];
      return { value: { ok: true } };
    });
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
      const l = bundle.league;
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
          engine.createLeague({ members: this.members, now }),
        );
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
        } else if (command.type === 'step' && this.local) {
          requireOnline(
            userId === this.adminId,
            '検証用の進行操作は管理者専用です',
            403,
          );
          await this.engine((engine) =>
            engine.advanceLeagueDay(l, `local:${command.requestId}`, now),
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
      const l = bundle.league;
      const now = this.clock();
      if (
        !l ||
        l.status !== 'running' ||
        !l.nextAdvanceAt ||
        l.nextAdvanceAt > now
      )
        return { unchanged: true, value: { advanced: false } };
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
