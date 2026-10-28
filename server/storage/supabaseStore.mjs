import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { requireOnline } from '../../src/online/shared.js';
import { projectLeague } from '../projection.mjs';
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
    requireOnline(
      response.ok,
      '共有保存先との通信に失敗しました',
      503,
      'storage',
    );
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
    return this.load(await this.control());
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
    return { ...view, writable: !!sessionId && row.sessions[userId] === sessionId };
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
      const obsolete = keep.slice(2);
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
