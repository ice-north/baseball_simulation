import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID, createHash } from 'node:crypto';
import { requireOnline, OnlineError } from '../../src/online/shared.js';
import {
  projectLeague,
  projectGames,
  projectGameInfo,
  projectPlayerInfo,
  projectTeamInfo,
} from '../projection.mjs';
import { buildArchiveIndex, archiveReferences } from '../archiveIndex.mjs';
export class SupabaseStore {
  constructor({ url, serviceKey, members, adminId, fetchImpl = fetch }) {
    requireOnline(
      url?.startsWith('https://') && serviceKey,
      'Supabaseのサーバー設定が必要です',
      503,
    );
    this.url = url.replace(/\/$/, '');
    this.key = serviceKey;
    this.members = members;
    this.adminId = adminId;
    this.fetch = fetchImpl;
    this.archiveCache = new Map();
  }
  async request(path, { method = 'GET', body, raw = false } = {}) {
    const response = await this.fetch(`${this.url}${path}`, {
      method,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        ...(body
          ? { 'Content-Type': raw ? 'application/gzip' : 'application/json' }
          : {}),
      },
      body: body ? (raw ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const error = new OnlineError(
        '共有保存先との通信に失敗しました',
        503,
        'storage',
      );
      error.storageStatus = response.status;
      if (raw && method === 'GET' && response.status === 400) {
        // Storage RESTは不存在をHTTP 400と本文内404で返す形式もある。
        const detail = await response.json().catch(() => null);
        if (
          detail?.code === 'NoSuchKey' ||
          (String(detail?.statusCode) === '404' &&
            detail?.error === 'not_found')
        )
          error.storageStatus = 404;
      }
      throw error;
    }
    if (raw && method === 'GET')
      return Buffer.from(await response.arrayBuffer());
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  rpc(name, body) {
    return this.request(`/rest/v1/rpc/${name}`, { method: 'POST', body });
  }
  async control() {
    return (
      await this.request('/rest/v1/online_control?id=eq.pennant&select=*')
    )[0];
  }
  async load(row) {
    if (!row?.snapshot_path)
      return { league: null, sessions: {}, receipts: {} };
    return JSON.parse(
      gunzipSync(
        await this.request(
          `/storage/v1/object/online-world/${row.snapshot_path}`,
          { raw: true },
        ),
      ),
    );
  }
  async read() {
    const row = await this.control();
    try {
      return await this.load(row);
    } catch (error) {
      if (error.storageStatus !== 404) throw error;
      const current = await this.control();
      if (
        !current?.snapshot_path ||
        current.snapshot_path === row?.snapshot_path
      )
        throw error;
      // 読取り中に旧世代が整理された場合だけ、最新の一式を一度再取得する。
      return this.load(current);
    }
  }
  async isDue(now) {
    const row = await this.control();
    const view = row.views[this.adminId];
    return !!(
      view?.status === 'running' &&
      view.nextAdvanceAt &&
      view.nextAdvanceAt <= now
    );
  }
  async readView(userId, sessionId) {
    const row = await this.control();
    const view = row.views[userId];
    if (!view)
      return row.snapshot_path
        ? null
        : { setupRequired: true, isAdmin: userId === this.adminId };
    return {
      ...view,
      writable: !!sessionId && row.sessions[userId] === sessionId,
    };
  }
  async archive(row, kind, year) {
    const meta = row.views?._records;
    const descriptor =
      kind === 'players'
        ? meta?.players
        : kind === 'teams'
          ? meta?.teams
          : meta?.games?.[year];
    if (!descriptor) return null;
    if (this.archiveCache.has(descriptor.path))
      return this.archiveCache.get(descriptor.path);
    const value = JSON.parse(
      gunzipSync(
        await this.request(
          `/storage/v1/object/online-world/${descriptor.path}`,
          { raw: true },
        ),
      ),
    );
    this.archiveCache.set(descriptor.path, value);
    while (this.archiveCache.size > 3)
      this.archiveCache.delete(this.archiveCache.keys().next().value);
    return value;
  }
  async readRecord(userId, kind, query, project) {
    let row = await this.control();
    for (let attempt = 0; attempt < 2; attempt++) {
      requireOnline(row.views?.[userId], '参加者ではありません', 403);
      const year = Number(query.year || row.views[userId].year);
      if (kind === 'games')
        requireOnline(
          Number.isSafeInteger(year) && year > 0,
          '年度の指定が不正です',
        );
      try {
        const missingYear =
          kind === 'games' &&
          row.views?._records?.games &&
          !Object.hasOwn(row.views._records.games, year);
        const index = missingYear ? {} : await this.archive(row, kind, year);
        if (!index) return project(await this.read(), year);
        if (kind === 'teams') {
          requireOnline(
            Object.hasOwn(index, query.team),
            '球団が見つかりません',
            404,
          );
          return structuredClone(index[query.team]);
        }
        if (kind === 'players') {
          const own = index[userId];
          requireOnline(
            own && Object.hasOwn(own, query.id),
            '選手が見つかりません',
            404,
          );
          return structuredClone(own[query.id]);
        }
        // 共通の権限・ページ検証を使い、世界本体を展開しない。
        return project(
          {
            league: {
              members: [{ userId, teamName: row.views[userId].teamName }],
              season: { year: row.views[userId].year, results: [] },
              records: { seasons: { [year]: { games: index } } },
            },
          },
          year,
        );
      } catch (error) {
        if (error.storageStatus !== 404 || attempt === 1) throw error;
        row = await this.control();
      }
    }
  }
  readTeamInfo(userId, teamName) {
    return this.readRecord(userId, 'teams', { team: teamName }, (bundle) =>
      projectTeamInfo(bundle, userId, teamName),
    );
  }
  readPlayerInfo(userId, id) {
    return this.readRecord(userId, 'players', { id }, (bundle) =>
      projectPlayerInfo(bundle, userId, id),
    );
  }
  readGames(userId, query) {
    return this.readRecord(userId, 'games', query, (bundle) =>
      projectGames(bundle, userId, query),
    );
  }
  readGameInfo(userId, id, year) {
    return this.readRecord(userId, 'games', { id, year }, (bundle, resolved) =>
      projectGameInfo(bundle, userId, id, resolved),
    );
  }
  async publishArchive(data, previous) {
    const json = JSON.stringify(data),
      hash = createHash('sha256').update(json).digest('hex');
    if (previous?.hash === hash) return previous;
    const path = `archives/${randomUUID()}.json.gz`;
    await this.request(`/storage/v1/object/online-world/${path}`, {
      method: 'POST',
      raw: true,
      body: gzipSync(json),
    });
    return { path, hash };
  }
  async createArchive(bundle, previous) {
    const retainedYears = Object.keys(previous?.games || {}).filter(
      (year) =>
        previous?.version === 2 &&
        Number(year) < bundle.league?.season.year &&
        bundle.league.records?.seasons?.[year]?.archiveToken &&
        previous.games[year].finalizedToken ===
          bundle.league.records.seasons[year].archiveToken,
    );
    const data = buildArchiveIndex(bundle, retainedYears);
    if (!data) return null;
    const players = await this.publishArchive(data.players, previous?.players),
      teams = await this.publishArchive(data.teams, previous?.teams),
      games = Object.fromEntries(
        retainedYears.map((year) => [year, previous.games[year]]),
      );
    for (const [year, value] of Object.entries(data.games))
      games[year] = {
        ...(await this.publishArchive(value, previous?.games?.[year])),
        finalizedToken:
          bundle.league.records?.seasons?.[year]?.archiveToken || null,
      };
    return {
      version: 2,
      players,
      teams,
      games,
      previous: [
        previous
          ? {
              players: previous.players,
              teams: previous.teams,
              games: previous.games,
            }
          : null,
        ...(previous?.previous || []),
      ]
        .filter(Boolean)
        .slice(0, 2),
    };
  }
  async transaction(fn) {
    const token = randomUUID();
    const row = (await this.rpc('online_claim', { p_token: token }))[0];
    requireOnline(
      row,
      '他の処理が実行中です。少し待って再読込してください',
      409,
      'busy',
    );
    let published = false;
    try {
      const value = await this.load(row);
      const outcome = await fn(value);
      if (outcome?.unchanged) return outcome.value;
      const path = `snapshots/${randomUUID()}.json.gz`;
      await this.request(`/storage/v1/object/online-world/${path}`, {
        method: 'POST',
        raw: true,
        body: gzipSync(JSON.stringify(value)),
      });
      const views = Object.fromEntries(
        this.members.map((m) => [
          m.userId,
          projectLeague(
            value,
            m.userId,
            value.sessions[m.userId],
            this.adminId,
          ),
        ]),
      );
      const archives = await this.createArchive(value, row.views?._records);
      if (archives) views._records = archives;
      published = await this.rpc('online_publish', {
        p_token: token,
        p_generation: row.generation,
        p_path: path,
        p_views: views,
        p_sessions: value.sessions,
      });
      requireOnline(
        published,
        '処理の有効期限が切れたため更新しませんでした。再読込してください',
        409,
        'lease',
      );
      // current + 直前2世代を残す。削除失敗は公開済みの更新を失敗扱いにしない。
      const keep = [row.snapshot_path, ...(row.previous_paths || [])].filter(
        Boolean,
      );
      const retainedArchives = archiveReferences(archives);
      const obsolete = [
        ...keep.slice(2),
        ...[...archiveReferences(row.views?._records)].filter(
          (path) => !retainedArchives.has(path),
        ),
      ];
      if (obsolete.length)
        await this.request('/storage/v1/object/online-world', {
          method: 'DELETE',
          body: { prefixes: obsolete },
        }).catch(() =>
          console.error('online: 古いスナップショットの削除が必要です'),
        );
      return outcome?.value;
    } finally {
      // publishの応答喪失時にも新オブジェクトを削除しない（既に公開済みの可能性）。
      if (!published)
        await this.rpc('online_release', { p_token: token }).catch(() => {});
    }
  }
}
