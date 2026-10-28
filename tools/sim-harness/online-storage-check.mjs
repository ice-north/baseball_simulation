import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { buildArchiveIndex } from '../../server/archiveIndex.mjs';
import { SupabaseStore } from '../../server/storage/supabaseStore.mjs';
import { createHandler } from '../../server/http.mjs';
import { Readable } from 'node:stream';
let row = {
  generation: 0,
  snapshot_path: null,
  previous_paths: [],
  sessions: {},
  views: {},
};
const objects = new Map();
let lease = null;
let rejectPublish = false;
let loseResponse = false;
let gets = 0;
const downloads = [];
let beforeDownload = null;
let missingStatus = 404;
let missingDetail = null;
const fetchImpl = async (url, options) => {
  const path = new URL(url).pathname;
  const body =
    options.headers['Content-Type'] === 'application/json'
      ? JSON.parse(options.body)
      : options.body;
  let value;
  if (path.endsWith('/online_claim')) {
    if (lease) value = [];
    else {
      lease = body.p_token;
      value = [{ ...row }];
    }
  } else if (path.endsWith('/online_release')) {
    if (lease === body.p_token) lease = null;
    value = null;
  } else if (path.endsWith('/online_publish')) {
    if (rejectPublish) {
      value = false;
      lease = null;
    } else {
      assert.equal(lease, body.p_token);
      assert.equal(row.generation, body.p_generation);
      row = {
        generation: row.generation + 1,
        snapshot_path: body.p_path,
        previous_paths: [row.snapshot_path, ...row.previous_paths]
          .filter(Boolean)
          .slice(0, 2),
        views: body.p_views,
        sessions: body.p_sessions,
      };
      lease = null;
      value = true;
      if (loseResponse) {
        loseResponse = false;
        throw new Error('応答喪失');
      }
    }
  } else if (path.endsWith('/online_control')) value = [row];
  else if (path === '/storage/v1/object/online-world') {
    for (const p of body.prefixes) objects.delete(p);
    value = {};
  } else if (path.startsWith('/storage/v1/object/online-world/')) {
    const key = path.split('/online-world/')[1];
    if (options.method === 'POST') {
      assert.ok(!objects.has(key));
      objects.set(key, body);
      value = {};
    } else {
      if (beforeDownload) {
        const effect = beforeDownload;
        beforeDownload = null;
        await effect();
      }
      gets++;
      downloads.push(key);
      return objects.has(key)
        ? new Response(objects.get(key))
        : new Response(JSON.stringify(missingDetail), {
            status: missingStatus,
          });
    }
  } else throw new Error(path);
  return new Response(JSON.stringify(value));
};
const store = new SupabaseStore({
  url: 'https://fixture.test',
  serviceKey: 'test-only',
  members: [{ userId: 'a' }, { userId: 'b' }],
  adminId: 'a',
  fetchImpl,
});
await store.transaction((b) => {
  b.sessions.a = 'session';
  return { value: 1 };
});
assert.equal((await store.read()).sessions.a, 'session');
const count = gets;
assert.equal((await store.readView('a', 'session')).setupRequired, true);
assert.equal(gets, count, '閲覧で巨大スナップショットを読まない');
await assert.rejects(
  store.transaction((b) => {
    b.sessions.a = 'bad';
    throw new Error('failed');
  }),
);
assert.equal((await store.read()).sessions.a, 'session');
rejectPublish = true;
await assert.rejects(
  store.transaction((b) => {
    b.sessions.a = 'expired';
  }),
  (error) => error.code === 'lease',
);
assert.equal(
  (await store.read()).sessions.a,
  'session',
  '期限切れの処理は公開されない',
);
rejectPublish = false;
loseResponse = true;
await assert.rejects(
  store.transaction((b) => {
    b.sessions.a = 'committed';
  }),
);
assert.equal(
  (await store.read()).sessions.a,
  'committed',
  '公開応答を失っても公開済みオブジェクトを削除しない',
);
for (let i = 0; i < 5; i++)
  await store.transaction((b) => {
    b.sessions.a = String(i);
  });
assert.equal(row.previous_paths.length, 2);
// 失敗時に残す未参照オブジェクト以外は3世代だけ。公開済み世代はすべて存在する。
for (const p of [row.snapshot_path, ...row.previous_paths])
  assert.ok(objects.has(p));
lease = 'other';
await assert.rejects(
  store.transaction(() => {}),
  (error) => error.code === 'busy',
);
lease = null;
// メタデータ取得後に3世代進み、読もうとした旧オブジェクトが削除される競合。
for (const [status, detail] of [
  [404, null],
  [400, { statusCode: '404', code: 'NoSuchKey', error: 'not_found' }],
  [400, { statusCode: '404', error: 'not_found' }],
]) {
  missingStatus = status;
  missingDetail = detail;
  const oldPath = row.snapshot_path;
  beforeDownload = async () => {
    for (let i = 0; i < 3; i++)
      await store.transaction((b) => {
        b.sessions.a = `concurrent:${i}`;
      });
  };
  assert.equal(
    (await store.read()).sessions.a,
    'concurrent:2',
    `不存在応答 ${status} から最新の一式へ再取得する`,
  );
  assert.equal(objects.has(oldPath), false);
  const currentObject = objects.get(row.snapshot_path);
  objects.delete(row.snapshot_path);
  await assert.rejects(
    store.read(),
    (error) => error.code === 'storage',
    '現行の保存自体が欠けた場合は空のリーグとして初期化しない',
  );
  objects.set(row.snapshot_path, currentObject);
}
// 本文が404以外のエラーは、ポインタが変わっていても再取得しない。
for (const detail of [
  { statusCode: '403', code: 'AccessDenied' },
  { statusCode: '400', code: 'InvalidRequest' },
]) {
  missingStatus = 400;
  missingDetail = detail;
  beforeDownload = async () => {
    for (let i = 0; i < 3; i++)
      await store.transaction((b) => {
        b.sessions.a = `blocked:${i}`;
      });
  };
  await assert.rejects(store.read(), (error) => error.storageStatus === 400);
}
// 詳細閲覧用の小さい派生記録も同じ公開世代で切り替え、世界一式を読み出さない。
beforeDownload = null;
missingStatus = 404;
missingDetail = null;
await store.transaction((bundle) => {
  const player = (id) => ({
    id,
    name: `参照選手${id}`,
    position: 'center',
    seasonStats: { batting: {}, pitching: {} },
  });
  bundle.league = {
    schema: 1,
    engineVersion: 'online-1',
    revision: 1,
    status: 'running',
    members: [
      { userId: 'a', teamName: 'A' },
      { userId: 'b', teamName: 'B' },
    ],
    history: [],
    notices: [],
    game: {
      teams: { A: { players: [player(1)] }, B: { players: [player(2)] } },
    },
    season: {
      year: 1,
      currentDate: { year: 2024, month: 4, day: 2 },
      settings: { teamNames: ['A', 'B'] },
      standings: [],
      schedule: [],
      results: [
        {
          gameId: 1,
          date: { year: 2024, month: 4, day: 1 },
          home: 'A',
          away: 'B',
          result: { homeScore: 1, awayScore: 0 },
        },
      ],
    },
  };
});
downloads.length = 0;
assert.equal((await store.readPlayerInfo('a', 1)).name, '参照選手1');
assert.equal((await store.readGames('a', {})).count, 1);
assert.equal((await store.readGameInfo('a', 1, 1)).homeScore, 1);
assert.ok(
  downloads.length > 0 &&
    downloads.every((path) => path.startsWith('archives/')),
  '閲覧は派生記録だけを読む',
);
assert.equal(
  (await store.readView('a', 'session'))._records,
  undefined,
  '内部Storageパスを画面へ渡さない',
);
await assert.rejects(
  store.readPlayerInfo('a', 2),
  (error) => error.status === 404,
  '相手の選手詳細を返さない',
);
await assert.rejects(
  store.readPlayerInfo('stranger', 1),
  (error) => error.status === 403,
);
await assert.rejects(
  store.readGameInfo('a', 'constructor', 1),
  (error) => error.status === 400,
);
await assert.rejects(
  store.readGames('a', { year: 'bad' }),
  (error) => error.status === 400,
);
downloads.length = 0;
assert.equal((await store.readGames('a', { year: 9999 })).count, 0);
await assert.rejects(store.readGameInfo('a', 1, 9999), (e) => e.status === 404);
assert.deepEqual(downloads, [], '存在しない年度で世界本体を取得しない');
// 保持対象年度の試合本文へ触れず、確定済み識別子が一致する場合のみ参照を再利用する。
const skipBundle = {
  league: {
    members: [],
    game: { teams: {} },
    season: { year: 2, results: [] },
    records: { seasons: { 1: {} } },
  },
};
Object.defineProperty(skipBundle.league.records.seasons[1], 'games', {
  get() {
    throw new Error('確定年度本文を再生成した');
  },
});
assert.deepEqual(buildArchiveIndex(skipBundle, ['1']).games, { 2: {} });
downloads.length = 0;
assert.equal((await store.readTeamInfo('a', 'B')).roster[0].id, 2);
assert.ok(
  downloads.every((p) => p.startsWith('archives/')),
  '相手球団も世界本体を展開しない',
);
await assert.rejects(
  store.readTeamInfo('stranger', 'B'),
  (e) => e.status === 403,
);
await assert.rejects(
  store.readTeamInfo('a', '__proto__'),
  (e) => e.status === 404,
);
const archived = row.views._records;
await store.transaction((bundle) => {
  bundle.sessions.a = 'archive-session';
});
assert.equal(
  row.views._records.players.path,
  archived.players.path,
  'ログインだけで不変の詳細記録を再転送しない',
);
assert.equal(row.views._records.games[1].path, archived.games[1].path);
const oldArchivePath = row.views._records.players.path;
store.archiveCache.clear();
beforeDownload = async () => {
  for (let i = 0; i < 3; i++)
    await store.transaction((bundle) => {
      bundle.league.game.teams.A.players[0].name = `更新${i}`;
    });
};
assert.equal(
  (await store.readPlayerInfo('a', 1)).name,
  '更新2',
  '読取り中に旧派生記録が整理されたら最新世代へ再取得',
);
assert.equal(objects.has(oldArchivePath), false, '派生記録も3世代で整理する');
beforeDownload = null;
await store.transaction((bundle) => {
  bundle.league.records = {
    seasons: {
      1: {
        year: 1,
        players: {},
        games: {},
        comparison: {
          stats: { batting: {}, pitching: {} },
          splits: { batting: {}, pitching: {} },
        },
        archiveToken: 'finalized-year-1',
      },
    },
  };
});
const finalized = row.views._records.games[1];
await store.transaction((bundle) => {
  bundle.league.season.year = 2;
  bundle.league.season.results = [];
});
assert.deepEqual(
  row.views._records.games[1],
  finalized,
  '年度更新後は確定年度の参照をそのまま保持',
);
await store.transaction((bundle) => {
  bundle.league.records.seasons[1].archiveToken = 'restored-another-year-1';
});
assert.equal(
  row.views._records.games[1].finalizedToken,
  'restored-another-year-1',
  '異なるバックアップの確定年度を以前の参照で上書きしない',
);
// HTTP認証、メソッド、JSON/CORS、ユーザーID偽装の入口を確認する。
const handler = createHandler(
  {
    members: [{ userId: 'a' }],
    view: async () => ({ ok: true }),
    login: async () => ({ sessionId: 'fixture' }),
  },
  {
    local: false,
    authenticate: async (header) => {
      assert.equal(header, 'Bearer valid');
      return 'a';
    },
    cronSecret: 'secret',
    signIn: async (body) => {
      assert.equal(body.password, '検証用の日本語');
      return { userId: 'a' };
    },
  },
);
async function http(action, method, body, headers = {}) {
  const req = Readable.from(Array.isArray(body) ? body : body ? [body] : []);
  Object.assign(req, {
    url: `/?action=${action}`,
    method,
    headers: { host: 'site.test', authorization: 'Bearer valid', ...headers },
  });
  const res = {
    statusCode: 200,
    setHeader() {},
    end(v) {
      this.body = JSON.parse(v);
    },
  };
  await handler(req, res);
  return res;
}
assert.equal((await http('view', 'GET')).statusCode, 200);
assert.equal(
  (await http('view', 'GET', null, { origin: 'https://other.test' }))
    .statusCode,
  403,
);
assert.equal((await http('command', 'POST', '{')).statusCode, 400);
assert.equal((await http('tick', 'POST', '{}')).statusCode, 401);
assert.equal((await http('view', 'DELETE')).statusCode, 405);
const encoded = Buffer.from(JSON.stringify({ password: '検証用の日本語' }));
const split = encoded.indexOf(Buffer.from('検')) + 1;
assert.equal(
  (
    await http('login', 'POST', [
      encoded.subarray(0, split),
      encoded.subarray(split),
    ])
  ).statusCode,
  200,
  'UTF-8の途中で分割されたHTTPチャンクを壊さない',
);
console.log(
  'online-storage-check PASS（Storage公開境界・リース失効・応答喪失・小さい閲覧・HTTP入口 / 外部サービスはfixture）',
);
