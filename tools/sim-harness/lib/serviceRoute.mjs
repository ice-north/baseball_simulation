// 画面の通信（`/api/online?action=…`）を、この検査の中で作った LeagueService へ
// つなぐ。サーバーを立てずに、エンジンで直に作った局面（年末のトライアウトなど）を
// 実画面で操作するために使う。振り分けは server/http.mjs と同じ。
//
// ⚠ 認証は見ない（ログイン済みの1人として扱う）。認証の検査は online-auth-ui-check。
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestStore } from './testStore.mjs';
import { TEAMS_DATA } from '../../../src/teams-data.js';
import { rosterGroup } from '../../../src/utils/constants.js';
import { captureWorld } from '../../../server/worldSnapshot.mjs';
import { LeagueService } from '../../../server/leagueService.mjs';
import { openPhase, loadLeagueWorld } from '../../../server/leagueEngine.mjs';

export const AUTH_KEY = 'baseball-online-auth-v1';

/**
 * 年末のトライアウトが開いているリーグ（参加者は管理者1人）。
 * 作り方は online-tryout-plan-check と同じ: セットを選んで名簿を作り、
 * 区分ごとに残す人数を決めて戦力外を出し（空き8人）、トライアウトを開く。
 */
export async function tryoutService() {
  const dir = await mkdtemp(join(tmpdir(), 'online-tryout-ui-'));
  const store = createTestStore(join(dir, 'league.json'));
  const clock = () => '2026-10-26T15:00:00.000Z';
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    clock,
  });
  const sessionId = (await service.login('admin')).sessionId;
  await service.command('admin', sessionId, {
    requestId: 'create-0',
    revision: 0,
    type: 'create',
  });
  const created = (await store.read()).league;
  await service.command('admin', sessionId, {
    requestId: 'packpick-0',
    revision: created.revision,
    type: 'submit',
    payload: {
      phaseId: created.phase.id,
      plan: { packId: created.packs[0].id },
      ready: true,
      baseSubmission: null,
    },
  });
  const KEEP = { pitcher: 8, catcher: 2, infielder: 4, outfielder: 2 };
  await store.transaction((bundle) => {
    const l = bundle.league;
    loadLeagueWorld(l);
    for (const name of l.season.settings.teamNames) {
      const team = TEAMS_DATA[name];
      const left = { ...KEEP };
      team.players = team.players.filter((p) => {
        const group = rosterGroup(p.position);
        if (left[group] <= 0) return false;
        left[group] -= 1;
        return true;
      });
    }
    openPhase(l, 'tryout', '2026-11-10T15:00:00.000Z');
    l.game = captureWorld();
    return { value: null };
  });
  return { service, store, userId: 'admin', sessionId };
}

/** ブラウザの文脈の通信を service へ流す。ログイン済みの保存も入れる */
export async function routeToService(context, { service, userId, sessionId }) {
  await context.addInitScript(
    ({ key, auth }) => localStorage.setItem(key, JSON.stringify(auth)),
    { key: AUTH_KEY, auth: { userId, sessionId, accessToken: 'fixture' } },
  );
  const commands = [];
  await context.route('**/api/online?*', async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    const query = Object.fromEntries(url.searchParams);
    try {
      let value;
      if (action === 'config') value = { local: true, allowStep: false };
      else if (action === 'view') value = await service.view(userId, sessionId);
      else if (action === 'defaults')
        value = await service.defaults(userId, sessionId);
      else if (action === 'team')
        value = await service.teamInfo(userId, query.team);
      else if (action === 'player')
        value = await service.playerInfo(userId, query.id);
      else if (action === 'games') value = await service.games(userId, query);
      else if (action === 'game')
        value = await service.gameInfo(userId, query.id, query.year);
      else if (action === 'command') {
        const body = route.request().postDataJSON();
        commands.push(body);
        value = await service.command(userId, sessionId, body);
      } else throw Object.assign(new Error(`unexpected action ${action}`), { status: 404 });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    } catch (error) {
      return route.fulfill({
        status: error.status || 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: error.message, code: error.code || 'server' }),
      });
    }
  });
  return { commands };
}
