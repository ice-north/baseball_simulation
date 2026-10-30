import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { FileStore } from './storage/fileStore.mjs';
import { LeagueService } from './leagueService.mjs';
import { createHandler } from './http.mjs';
if (process.env.NODE_ENV === 'production' || process.env.VERCEL)
  throw new Error('開発用認証は本番環境で使用できません');
const store = new FileStore(
  resolve(process.env.ONLINE_DATA_FILE || '.online-data/league.json.gz'),
);
// ⚠ **種は管理者1人だけにする**。以前はプレイヤー2も入れていたが、
//    本番は招待コードで参加する流れなので、ここで2人揃えてしまうと
//    参加の経路（招待の発行 → コード入力）をローカルで一度も通らない。
//    プレイヤー2は本番と同じく招待されて入る。
const service = new LeagueService(store, {
  local: true,
  adminId: 'player1',
  members: [{ userId: 'player1', label: 'プレイヤー1' }],
});
const handler = createHandler(service, { local: true });
const server = createServer(handler);
server.listen(3002, '127.0.0.1', () =>
  console.log(
    '開発専用API http://127.0.0.1:3002 / 画面 http://localhost:3000/online',
  ),
);
const timer =
  process.env.ONLINE_DISABLE_TIMER === '1'
    ? null
    : setInterval(
        () =>
          service
            .tick()
            .catch((error) =>
              console.error('定期処理の保存に失敗:', error.message),
            ),
        60000,
      );
server.on('close', () => clearInterval(timer));
