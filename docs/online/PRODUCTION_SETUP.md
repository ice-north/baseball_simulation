# 本番環境の構成と、構築でつまずいた点

`README.md` は**手順の一般形**を書いている。こちらは**実際に作った本番環境の固有情報**と、
**作業中に実際に詰まった箇所**を残す。次に環境を作り直すとき、または別の作品を同じ形で
公開するときに読み返すためのもの。

⚠ **秘密値・メールアドレス・UUID はここに書かない。** このリポジトリは公開されている。
値が必要なときは、下記の「どこを見れば分かるか」に従って管理画面から取る。

## 環境は2つある。取り違えないこと

| | URL | 所有者 | 役割 |
|---|---|---|---|
| **本番** | `https://baseball-simulation-neon.vercel.app` | 作者 | こちらを育てる |
| 試作 | `https://baseballsimulation.vercel.app` | 友人 | 先に作られたもの。触らない |

⚠ **名前がよく似ている。`neon` が付くほうが本番。**
実際に、試作環境へログインして「本番が動いた」と誤認し、
「ユーザーが0人なのにログインできる」という矛盾の追跡に時間を使った。
**ログイン前にアドレスバーを確認すること。**

⚠ Vercel が各デプロイに割り当てる長いURL（`...-ice-north.vercel.app`）は使い捨て。
**利用者に配るのは固定URLのほう**。デプロイのたびに変わるURLを配ると次回から届かなくなる。

## 構成

| 項目 | 値 | どこで確認するか |
|---|---|---|
| Supabase プロジェクト | `nextstage-online` | ダッシュボード左上 |
| リージョン | `ap-northeast-1`（東京） | Project Settings → General |
| Vercel プロジェクト | `baseball-simulation` | Vercel ダッシュボード |
| プラン | Hobby（無料） | Vercel 左上 |
| Production ブランチ | `main` | Vercel → Settings → Git |
| API キーの形式 | **Legacy**（`eyJ…`） | Project Settings → API Keys |

⚠ **Supabase のリージョンは後から変更できない。** 間違えたら作り直すしかない。
空のうちなら作り直しは3分で済む。データが入ってからだと退避と復元の手間がかかる。

## 参加者と球団

球団は `INDEPENDENT_LEAGUES.shikoku.teams` の**固定順**で割り当たる。選べない。

| 環境変数 | 球団 | 役割 |
|---|---|---|
| `ONLINE_MEMBER_1` | 徳島インディゴソックス | **管理者**（リーグ作成・停止・再開） |
| `ONLINE_MEMBER_2` | 香川オリーブガイナーズ | 参加者 |
| （固定） | 愛媛マンダリンパイレーツ | CPU |
| （固定） | 高知ファイティングドッグス | CPU |

この環境では **1人目が友人（管理者）、2人目が作者**。
⚠ **管理者と球団は現行コードで分離できない。** 1人目が必ず徳島かつ管理者になる。
分けたいなら `adminId` を環境変数で選べるようにする小さな改修が要る
（`adminId` は `userId === adminId` の比較にしか使われておらず、構造的な依存は無い）。

⚠ **参加者のUUIDはリーグ作成時にリーグ本体へ保存され、以後変更できない。**
作成前に、管理者側のアカウントで「リーグを作成」ボタンが出ることを必ず確認する。
ボタンが出れば 1人目の割当が正しい。出なければ環境変数を入れ替えて再デプロイすればよく、
**作成前なら何度でもやり直せる**。

## 環境変数（名前だけ。値は Vercel の管理画面にある）

Vercel → Settings → Environment Variables に6つ。`.env.example` と対応する。

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ONLINE_MEMBER_1
ONLINE_MEMBER_2
ONLINE_CRON_SECRET
```

- ⚠ **`VITE_` を付けない。** 付けるとブラウザに配られるコードへ埋め込まれ、全員に見える。
- `ONLINE_MEMBER_1` / `2` は **Config** 型にしておくと後から読み返せる。
  取り違えが致命的な箇所なので、確認できるほうがよい。UUIDは鍵ではない。
- 残り4つは **Secret** 型。保存すると二度と読めない。
- ⚠ **`ONLINE_CRON_SECRET` は Supabase Vault にも同じ値を入れる。**
  Secret で保存すると読み返せないので、**Vault への登録を済ませるまで手元に控えておく**。

## Vault（Supabase → Project Settings → Vault → Secrets）

```
online_tick_url      本番の固定URL + /api/online?action=tick
online_cron_secret   Vercel の ONLINE_CRON_SECRET と同じ値
```

⚠ 名前は一字一句この通り。Cron の SQL がこの名前で値を引く。

## 自動進行（Cron）

`supabase/cron.example.sql` を適用する。前提として `pg_cron` と `pg_net` を
Database → Extensions で有効にしておく。

⚠ **cron の時刻は UTC。** 日本時間との対応はこうなる。

| 登録名 | UTC | 日本時間 |
|---|---|---|
| `online-day-hour` | 04:00 / 09:00 / 14:00 / 23:00 | 13:00 / 18:00 / 23:00 / 08:00 |
| `online-day-half` | 01:30 / 06:30 / 11:30 | 10:30 / 15:30 / 20:30 |

分の指定が `0,5,10` / `30,35,40` となっているのは、**通知の取りこぼしに備えた再送**。
3回届いても進行は1回に限定される（`nextAdvanceAt` で制御）。

登録の確認:

```sql
select jobname, schedule, active from cron.job;
```

⚠ `cron.job_run_details` の成功は **SQLが走ったこと**しか示さない。
HTTP が通ったか、ゲームが実際に進んだかは `net._http_response` と
ゲーム画面の日付・revision で確かめる。

## ⚠ 構築で実際に詰まった点（ここが本題）

### 1. 環境変数は「保存しただけ」では反映されない

登録後に**新しいデプロイを作らないと、サーバーからは見えない**。
Deployments → 最新行の「⋯」→ Redeploy。
これを知らずに、設定済みなのに「未設定」と言われ続けて時間を使った。

**6つまとめて登録してから、最後に1回再デプロイすればよい。**

### 2. UUID はプロジェクトごとに違う

友人の環境で使っていたUUIDは、新しいプロジェクトでは通用しない。
**Auth ユーザーを作った瞬間にUUIDが発行される**ので、
「先にユーザーを作る → UUIDを控える → 環境変数に入れる」の順でないと進めない。

### 3. 「Auto Confirm User」を忘れるとログインできない

Authentication → Users → Add user のときのトグル。
オフだとメール未確認扱いになり、ログインが弾かれる。
確認メールは送られない作りなので、自分でオンにするしかない。

### 4. ログイン失敗の理由は画面に出ない

サーバーは `認証に失敗しました` で固定して返す（攻撃者に情報を与えないため）。
原因の切り分けは **Supabase の Authentication → Users** を見て行う。
メールアドレスの誤り・未確認・ユーザー不在のどれかを目視で判断する。

### 5. 設定不備の切り分けは `?action=config` で行う

```
https://＜本番URL＞/api/online?action=config
```

- `{"local":false}` … 6つとも読めている
- `{"error":"…","code":"config","missing":[…]}` … 足りない変数の**名前**が返る

⚠ この `missing` は後から足した仕組み（PR #6）。
以前はどの変数が欠けても同じ503文面だったため、原因を切り分けられなかった。
**値は返さない**ので、結果をそのまま人に見せても安全。

### 6. Supabase ダッシュボードの「ユーザー0人」を信じる前に

プロジェクトを取り違えている可能性を先に疑う。アドレスバーの
`/dashboard/project/＜ref＞/` を確認する。UIを信じずSQLで数えるのも早い。

```sql
select
  (select count(*) from auth.users)                                 as 認証ユーザー数,
  (select generation from public.online_control where id='pennant') as 世代;
```

## 適用済みのデータベース設定の確認

```sql
select
  (select count(*) from public.online_control where id = 'pennant')            as 制御行,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('online_claim','online_publish','online_release'))    as 関数の数,
  (select b.public from storage.buckets b where b.id = 'online-world')         as バケットが公開,
  (select relrowsecurity from pg_class where oid = 'public.online_control'::regclass) as RLS有効;
```

期待値: `1` / `3` / `false` / `true`。
**`バケットが公開 = false` と `RLS有効 = true` が安全性の要**。
ブラウザに配られる鍵でデータを直接読まれないことを、この2つで担保している。

この構成では `src/` 配下に Supabase への参照が**1件も無い**。
ブラウザは `/api/online` としか話さず、鍵はサーバー（Vercel の関数）の中だけで使われる。

## 停止・再開・バックアップ・復元

停止と再開は**管理者がゲーム内の「管理」画面から**行う。

手元への退避と復元は、作者のPCで実行する。`.env` に本番の値を書いて使う。

```sh
node --env-file=.env tools/online-backup.mjs export  /安全な保存先/world.json.gz
node --env-file=.env tools/online-backup.mjs restore /安全な保存先/world.json.gz
```

- ⚠ **退避も復元も、先に進行を停止する必要がある**（動作中は拒否される）。
- ⚠ 退避ファイルには参加者情報が入る。**Gitや公開先に置かない。**
- ⚠ **復元は参加者UUIDが一致しないと拒否される**（`バックアップの参加者が異なります`）。
  別環境のデータを持ち込むには、ファイル内のUUIDを書き換える必要がある。
- ⚠ `.env` には `service_role` キーが入る。作業後は扱いに注意する。

## この形は他の作品にも使い回せる

骨格は作品に依存しない。

| 毎回同じ | 毎回考え直す |
|---|---|
| GitHub → Vercel の自動公開 | テーブル設計 |
| Supabase の Auth / DB / Storage | 誰が何を読めるかの権限（RLS） |
| pg_cron + pg_net + Vault での定期実行 | 無料枠に収まるかの見積もり |
| 秘密値を Vercel の環境変数に置く形 | |

「定期実行で外部から値を取り、DBに貯め、画面で見せる」種類のものは、
Cron の呼び先が変わるだけで**同じ骨格にそのまま乗る**。
