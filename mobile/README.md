# オンライン対人版 スマホアプリ（Android）

オンライン対人モード専用のネイティブアプリ。試合やシーズンの計算はサーバー（`../server`、本番は Vercel の `../api/online.mjs`）が行い、アプリは「見る」「指示を送る」だけ。一人用モードは入れない。

## 構成

| モジュール | 中身 |
| --- | --- |
| `shared` | 通信（Ktor）、データの形、編成の編集（打順・投手起用・方針、元に戻す）、成績表の列、キャンプ・トライアウト・トレードの計算、指示の中身（`Commands`）。Kotlin Multiplatform（いまは jvm だけ。iOS に進むときに target を足す） |
| `androidApp` | Jetpack Compose の画面。下のタブ: ホーム／試合／選手（選手成績・通算・能力ランキング）／編成（スタメン・投手起用・方針采配）／手続き（初期メンバー・キャンプ・契約更改・トライアウト・年度更新・トレード） |

### PC版と同じにしてある決まり

- 成績は1つの表の形（名前の列は固定、数字の列は横に流す）。区分はタブで切り替え、見出しを押して並べ替え。
- 能力は数字をランクの色で出す（文字だけにしない）。調子は顔。
- 編成の保存は上の1か所。3つの面（スタメン・投手起用・方針）を1つの編集として持ち、元に戻す／やり直すもまとめて効く。
- 投手は長押しでつかんでローテ・救援の役割の見出しへ落とすと持ち場が変わる。打順・ローテも長押しでつかんで落とした相手と入れ替える（2人の入れ替え。間はずれない）。
- 保存・提出・練習・トレードの送信中は画面全体を塞ぐ（押し直し・画面移動で結果を見失わないため）。
- 「詳細はPCで」を作らない（キャンプの選手ごとの練習もスマホで選べる）。

### Web 版から写しているもの

- `shared/.../Tables.kt` は `tools/gen-tables.mjs` が Web 版の表から書き出す（手で直さない）。能力の説明（`ABILITY_HELP`）・
  成績の表の区分と列（`BATTING_GROUPS`・`PITCHING_GROUPS`）・組み合わせの注記・能力の絞り込み・控えの括り・段位・疲労の段・調子の顔もここ。
  列の値の引き方は Web 版の関数から読み、2つ以上の項目を組み合わせる列だけ `Stats.kt` の `StatComputed` に式を置く。
  値と文字は `tools/expect-stats.mjs` が書き出す期待値（`stats-expected.json`）と `StatsWebTest` で答え合わせする。
- キャンプの方針（`trainingPolicy.js`）とトライアウトの希望順（`tryoutPlan.js`）は Kotlin に写してあり、
  `tools/expect-logic.mjs` が書き出す期待値（`logic-expected.json`）と `LogicTest` で答え合わせする。
- トレードの探し方と値段（`tradeSearch.js`。持ち場の力・余り・補強・まとめて抜けた穴・出番の上乗せ `givingTradeValues`・
  CPUの見込み）は `TradeSearch.kt`、相手に与えるメリット（`tradeMerit.js`）は `TradeMerit.kt` に写してあり、
  同じ `expect-logic.mjs` の期待値（`logic-expected.json` の `tradeMerit`・`giving`）と `LogicTest` で答え合わせする
  （`TradeSearch.kt` のほかの関数は答え合わせが無い。直すときは Web 版と見比べる）。
- 得点経過・最終ログイン・留守中のまとめの文（`social.js`・`awaySummary.js`）は `Social.kt`・`AwaySummary.kt` に写してあり、
  `tools/expect-social.mjs` が書き出す期待値（`social-expected.json`）と `SocialTest` で答え合わせする。
- 新しい見た目（試作。`src/online/look/` と打席の色分け `gamePlays.js` の `playTone`）は `Look*.kt`・`TodayGame.kt` に写してあり、
  `tools/expect-look.mjs` が書き出す期待値（`look-expected.json`）と `LookTest` で答え合わせする。
  新しい見た目がビューから読む項目はどれも、古いサーバーでは無くてよい（無ければ出さない）: `teamLabels` の `city`・`nickname`、
  `nextGames[]` の `homeStarter`・`awayStarter`（`age`・`condition`）、`teamStreaks`、`teamStats` の `obp`・`slg`、試合の版20の `plays` の行、
  `teamLabels` の `logo`（球団ロゴ。無ければ今までの帽子のマーク）。
- 球団ロゴは**描く側だけ**写してある（`LookLogo.kt`。作る画面は Web だけ）。絵の形は Web 版の `public/look/logo-icons.json` を
  そのまま assets に入れる（`androidApp/build.gradle.kts`）。絵は game-icons.net（CC BY 3.0）で、作者の表示はメニューの
  「新しい見た目（試作）」の下の1行（`LOGO_ICONS_CREDIT`）。**消さない**。
- CI はどれも `--check` で、Web 版だけ直して写しが古くなっていないかを見る（`npm run check:quick` の `app-*`。`tools/sim-harness/run-checks.mjs`）。

- 接続先の既定は本番（`https://baseball-simulation-neon.vercel.app/api/online`）。ログイン画面の「接続先を変える（開発用）」でローカルの開発サーバーにも繋げる（エミュレーターから PC へは `http://10.0.2.2:3002/`）。
- ログインは Web 版と同じアカウント。1アカウントで同時に操作できるのは**ブラウザ1台とアプリ1台**まで（`server/sessions.mjs`）。アプリはログインのときに `client: "app"` を送る。同じ種類の別の端末でログインすると、前の端末だけが閲覧のみになる。

- 試合結果の通知は端末の中で出す（サーバーからは送らない）。WorkManager がおよそ15分ごとに裏で `view` を `since` 付きで読み（`ResultWorker`）、ビューの `recentGames`（自球団の直近5試合）にアプリで見ていない試合があれば1つの通知にまとめて出す（`shared/.../ResultNotice.kt`）。同じ確認で、手続きの開始・締め切り3時間前でまだ決めていない・トレードの提案や逆提案・トライアウト／キャンプ／年度更新の結果・あなたへのお知らせ（ビューの `inbox`。トレードの成立や取り下げ・練習試合・予告先発の回避・おるすばん）も別の通知で出す（`shared/.../EventNotice.kt`。手続きの数え方は「手続き」の数字と同じ `pendingProcedure`）。アプリが前に出ている間は読まない。ホームのメニューの「通知（試合結果・手続き）」で切り替え、Android 13 以降はログインのあとに一度だけ許可を聞く。トークンの更新は画面と裏で同じ鍵（`AuthLock`）を使う（更新トークンを2か所で使うとログインごと無効になるため）。

## サーバーとの約束（壊さないために）

- アプリは `?action=login / refresh / view / defaults / team / player / games / game / transactions / command / presence` を使う。`presence` はアプリに戻るたび（10分に1回まで）送り、最終ログインとおるすばんの解除に使う。ビューの項目名を変えるとアプリが壊れる。
  - `presence` の返事は `{ ok: true }`。おるすばんを解いたときは `{ ok: true, returned: true }` で、アプリはそのときもう一度ビューを読む（一緒に走らせた読み直しが解ける前のビューを読んでいて、自分が「おるすばん」のまま見えるため）。`returned` が無ければ解いていない扱い（`shared/.../OnlineApi.kt` の `presence`）。
  - 版（`revision`）は、最終ログインを書いただけなら上がらない（ほかの人の画面を読み直させない）。おるすばんを解いたときは上がる。ただしビューの世代（`viewGeneration`）は、書き込みを保存するたび（`presence` が最終ログインを書いたときも）上がる（`server/storage/supabaseStore.mjs` の `online_publish`。公開は世代を必ず1つ上げる）。なので `since` を添えた次の `view` は中身をまるごと返す。
- ⚠ `tools/view-contract.mjs`（ビューの約束）は、下の「名前を変えると黙って出なくなる」項目のうち**主なもの**（約70項目。
  画面の主な表・通知・ウィジェット・チーム分析・年代記・指導者の入口の項目）を載せた一覧で、下の文の項目を全部は載せていない
  （例: `trades[]` の中の項目・`chronicle.face` の中身・`seasonReview`・`transactions` の `items[]` の中身）。
  載っている項目は、本物のサーバーの答えにあるかを `online-view-contract-check`（`check`。開幕直後の `live`）と
  `--year`（`check:full`。1年通して `when`）が確かめる（どちらも無い項目は検査が落とす）。サーバーで項目を足す・変えるときは、
  載っていればそこも直し、載っていなければ下の文を正として読むところを確かめる。
- 画面が読む項目のうち、名前を変えると黙って空になるもの（どれも無ければ出さないだけなので、画面の検査では気づきにくい）:
  - ビュー: `careerLeaders`（通算成績ランキング）、`chronicle.proDrafted`（プロ入りした選手。指名順位は `round`（数）と `ikusei`（育成指名なら true）で「4位」「育成2位」と出す）、`lastCamp`（キャンプの結果）、`stage.key`（`season` かどうかでキャンプ直後の案内を出す）、`trades[]` の `fromCpu`・`expires`（CPU球団からの提案とその期限）、`rosterLimit`・`rosterStandard`（選手枠。下の項目）、`yearSummary`（その年のまとめ。`year`・`league`・`rank`・`record`・`standings[]`（`rank`・`label`・`wins`・`losses`・`draws`・`mine`）・`joined[]`/`left[]`（`side`・`how`・`name`・`position`・`other`）・`topics[]`。`server/yearSummary.mjs`。年度更新から開幕した月の間だけ載る）、`roster[].naturalGrowth`（自球団の選手の自然成長。次の年度替わりに主な能力が1つあたり何点動くかの見込みで、選手情報の「自然成長」に `+1.20/年` の形で出す。`server/projection.mjs` の `playerViewWithGrowth`。他球団の名簿（`team`）には載らない）。
  - `team`: `formerCareers`（引退・退団した選手の通算）、`chronicle.moves`（入退団履歴）、`roster[].years`（他球団の選手の年ごとの推移）。
  - `player`: `years`（自球団の選手の年ごとの推移。年・年齢・所属・能力）。
  - `transactions`（`year` と `team`（球団で絞る）を受ける）: `years`、`items[]` の `kind`・`teams`・`cpu`・`cpuOnly`・`date`・`moves[]`（`name`・`position`・`from`・`to`）。トレード画面の履歴は `kind` が `trade` の行だけ、試合タブの「リーグ史」の移籍・取引は退団（`release`。`to` が無い）・入団（`signing`。`from` が無い）も出す（`LeagueHistoryScreen.kt` の `TransactionsPane`）。
- チーム分析（選手タブの「能力」「スタメン」「守備」）とリーグ史・指導者で読む項目（先方5項目 2026-11-20）。どれも古いサーバーには無く、無ければ出さない。名前を変えると黙って出なくなる:
  - ビュー: `teamRatings`（球団 → `starters`・`relief`・`offense`・`defense`・`speed`・`bench`。`src/online/teamRatings.js`。`TeamAnalysis.kt` の `RATING_AXES`）、`teamStats`（球団 → `average`・`era`。チーム成績と紙面の部の中の順位）、`teamNames`（全球団の名前。部の球団・球団の選択・トレードの相手。無ければ `standings` の球団）。
  - ビューの `history[]`（終わった年。`year`・`standings[]`（`team`・`wins`・`losses`・`draws`・`winRate`）・`leagues`（球団 → 部の id）・`moves[]`（`teamId`・`from`・`to`。昇格・降格）・`playoffChampion`）。リーグ史の過去の順位・歴代の優勝（`TeamAnalysis.kt` の `pastTables`・`pastMoves`）。
  - ビューの `leagueStaff.teams[]` の `manager`・`pitching`・`batting` の `id`（押すと人物の小窓。その球団の `team` の窓口の `staff` から同じ id の人を探す。`id` の無い古いサーバーは名前で探す。`StaffPanel.kt` の `LeagueCoachName`）。
  - `team`: `lineup`（他球団のスタメン・投手陣と守備分析。無ければ「まだ読めません」）、`staff.seats[].coach` の指導者カードの `abilities`（`COACH_ABILITY_ITEMS` の鍵 → 1〜99）・`stints[]`（これまでの指導チーム）・`pupils[]`（主な指導選手）。`stints`・`pupils` は1行ずつの文 `text` を出す（`StaffPanel.kt` の `CoachDialog`。自球団の指導者はビューの `staff` の同じカード）。
- 通知（`ResultWorker`）が読むビューの項目。名前を変えると通知が黙って出なくなる（画面の検査では気づきにくい）:
  - 試合結果（`shared/.../ResultNotice.kt`）: `teamName`・`teamLabels`、`recentGames`（`server/projection.mjs` の `ownRecentGames`）の `id`・`date`・`number`・`home`・`away`・`homeScore`・`awayScore`（見分けと「新しい試合か」に使う）。本文には `decisions`（勝敗投手）・`homeruns`、順位の `teamLeagues`・`standings` も使う。
  - 手続き・トレード・手続きの結果（`shared/.../EventNotice.kt`・`Notices.kt` の `pendingProcedure`）:
    - `year`・`phaseDeadline`、`phase` の `id`・`kind`・`label`・`deadline`・`delegated`・`submission.ready`・`camp.rounds`・`camp.total`、`pendingPack.chosen`。
    - `trades[]` の `id`・`myTurn`・`countered`・`mine`・`fromTeam`・`toTeam`・`offer[].name`・`want[].name`・`note`・`replyNote`。
    - `inbox[]` の `id`・`type`・`text`。通知する `type` は `tradeAccepted`・`tradeRejected`・`tradeWithdrawn`・`challenge`・`challengePlayed`・`challengeDeclined`・`challengeWithdrawn`・`starterAvoided`・`awayStarted`（`INBOX_TITLES`。ほかの種類は通知しない。名前を変えると黙って出なくなる）。
    - `lastTryout` の `year`・`picks[].name`・`lost`、`lastCamp.year`、`lastOffseason` の `year`・`departed`。
  - 知らせ終えた印は端末に残し、ログインし直すまで消さない。ビューにはリーグを見分ける値（作り直したリーグかどうか）が無いので、同じ接続先でリーグを作り直すと、前のリーグの印と同じ鍵（手続きの `phase.id`・トレードやお知らせの `id`・結果の年）の知らせが出ないことがある。
- ホーム画面のウィジェット（`SummaryWidget.kt`。文は `shared/.../Widget.kt` の `widgetSummary`）が読むビューの項目。自分では読みに行かず、アプリが受け取って端末に残したビューを描き直すだけ（ビューを受け取ったとき・速報を見たとき・ログアウトしたとき）。名前を変えると黙って出なくなる:
  - `teamName`・`teamLabels`・`currentDate`（`month`・`day`）・`recentGames`（`home`・`away`・`homeScore`・`awayScore`・`lineScore`）・`nextGames`（`home`・`away`）・`teamLeagues`・`standings`・`phase.label`。
- 今季総括号・作戦別成績・縁・球団の顔で読むビューの項目。どれも古いサーバーには無く、無ければ出さない（版は上げていない）。名前を変えると黙って出なくなる:
  - `seasonReview`（`server/seasonReview.mjs`）の `year`・`headline`・`lead`・`articles[]`（`kicker`・`title`・`body`）。
  - `strategyStats`（`src/online/strategyStats.js`）の `games`・`fields[]`（`key`・`label`・`side`・`columns`・`rows[]` の `value`・`label`・`games`・`cells`）。
  - `ties[]`（地元・同窓の縁の記事。`kicker`・`title`・`body`）。
  - 球団の窓口（`team`）の `chronicle.face`（`server/teamFace.mjs`）の `captain`・`captains[]`（`id`・`name`・`number`・`year`）・`retiredNumbers[]`（`number`・`name`・`year`・`position`）・`tenure[]`（`id`・`name`・`number`・`years`・`homegrown`）。主将・永久欠番を決める命令 `teamFace`（`{ captain }`・`{ retire: { name, year } }`・`{ unretire }`）は PC の球団史からだけ送り、アプリは表示だけ。
- 裏の確認でトークンの更新を断られた（400 / 401）ら、ログアウトはせず、アプリでログインし直す（または画面が更新できる）まで裏の確認を休む（`SessionStore.authBroken`）。更新は画面と同じ鍵を持って行い、裏の確認が待つのは20秒まで（`ResultWorker.REFRESH_TIMEOUT_MS`）。待つのをやめても更新の通信は取り消さず、答えが遅れて届いたらそれも残す（サーバーはもう更新トークンを入れ替えているため）。その間も鍵は持ったままで、画面は期限が近いときだけ鍵を待つ。更新したログイン情報は書き終わるまで待って残す（`SessionStore.commitAuth`。更新トークンは1回きり）。端末の設定で通知を切られている間も読まない。
- `view` には手元のビューの世代 `since`（ビューの `viewGeneration`）を添える。世代が同じ（かつ保存の版が今のサーバーと同じ）なら、サーバーはビューを送らず `{ unchanged: true, viewGeneration, writable }` だけ返す（`server/leagueService.mjs` の `view`）。アプリはこのとき `writable`（書き込めるか）だけを合わせる。世代を持たない保存先（開発サーバーの `FileStore`）は `since` を無視して毎回全部返す。
- `command` の返事の `view` は最新のビューで、`view.viewGeneration` に公開した世代が入る（`server/storage/supabaseStore.mjs`）。アプリは読み直さずにこれを使い、次の `since` にする。返事に `view` が無ければ読み直す。
- `games` は `year`・`page`・`scope`（`own` / `league`）・`size`（1〜200。既定は6）を受ける。紙面は `size=200` で自球団の1シーズンを1回で読む（`OWN_HISTORY_PAGE`）。
- 試合の勝敗投手（ビューの `results`・`games`・`game` の `decisions` の `winningPitcher` / `losingPitcher` / `savePitcher` / `holdPitchers`）は `{ id, name }` だけ（`server/recordedViews.mjs` の `decisionRefs`）。能力や成績は載らないので、自球団の投手は名簿（ビューの `roster`）から `id` で引く。
- タイトル争い（ビューの `leaders` の `rows`）の行は `{ id, name, team, label, value }`（プロへ進んだ選手の行は `pro: true` も付き、名簿に居ないので押せない）（`server/leagueBoard.mjs` の `leagueLeaders`）。アプリは行を押すと球団の名簿から `id` で選手を探し、名前では探し直さない（同じ球団の同名の別人を開かないため。`shared/.../PlayerLookup.kt`）。`id` の無い古いサーバーの行だけ名前で探す。
- 選手枠の上限と標準の人数は、ビューの `rosterLimit`・`rosterStandard`（`server/projection.mjs`。中身は `src/online/shared.js` の `ROSTER_LIMIT`・`ROSTER_STANDARD`）を読む。トレードの人数の確かめ（`shared/.../Tryout.kt` の `rosterShortfall`・`dealProblems`）・トライアウトの空き枠（`rosterRoom`・`rosterFill`）・契約更改の説明はこの数を使い、無い古いサーバーのときだけアプリの表の数（`Tables.kt`）を使う（`rosterLimitOf`・`rosterStandardOf`）。アプリの表の数は作ったときのままなので、枠を変えたら古いアプリでもサーバーの数で確かめられるようにするため（以前のアプリは26人のままで、28人にしたサーバーとずれた）。
- 編成の保存（`command` の `lineup`）は、ビューの `lineup` を**丸ごと**送り返し、`baseLineup` に編集前の塊を添える。アプリが知らない項目もそのまま返すので、編成に項目を足すのは構わない。
- 年間表彰・プロのその後・年齢構成・はじめての1週間で読むビューの項目（`docs/online/PYRAMID_LEAGUE.md` の同じ名前の節）。どれも古いサーバーには無く、無ければ出さない（版は上げていない）。名前を変えると黙って出なくなる:
  - `chronicle.honors`（`server/seasonAwards.mjs` の `honorsView`）の `year`・`titles[]` の `label`・`name`・`team`・`line`、`leagues[]` の `league`・`mvp` / `rookie`（`name`・`team`・`line`）・`bestNine[]`（`label`・`name`・`team`）・`battery`（`team`・`pitcher`・`catcher`・`line`）。文は `Chronicle.kt` の `honorRows`（Web 版 `chronicleText.js` と同じ）。全国紙は `year` がビューの `year` と同じときだけ載せる。
  - `chronicle.proNews[]`（`server/proCareer.mjs`）の `name`・`team`・`npbTeam`・`text`・`highlight`（`ended` は引退・戦力外）。`chronicle.proDrafted[].after`・`player`（指名した時点の能力の写し。その年の指名だけ。NPBドラフトの発表で名前を押すと開く）と、球団の窓口（`team`）の `chronicle.proDrafted[].career`（`proDraftedAfter`）。
  - `ageOutlook`（`src/online/ageOutlook.js`）の `years`・`bands[]`（`label`・`pitchers`・`fielders`）・`grid[]`（`id`・`name`・`position`・`group`・`age`・`later`・`core`・`warn`。年齢 × 守備位置の図。無ければ帯の図）・`core[]`・`lines[]`・`advice`。`null` のとき（名簿が空・途中参加で初期メンバー待ち）は出さない（`AgeOutlook.kt` の `ageOutlookOf`）。
  - `joinedAt`（ISO の時刻。リーグを作ったときの人には無い）と `teamName`。はじめての1週間の期間と、端末に残す鍵（`FirstWeek.kt`）。鍵が変わったら済みの印を捨てるのは、ビューを受け取ったところ（`AppViewModel.applyView`）。
- 先方5項目（2026-11-21。ドラフトの気配・プロ指名選手の成績・トライアウトの札・休養の目安・コーチ打診）で読む・送る項目。どれも古いサーバーには無く、無ければ出さない（版は上げていない）。名前を変えると黙って出なくなる:
  - 読む: ビューの `proWatch[]`（`id`・`name`・`team`・`npb`・`level`（`hot` で「接触」、ほかは「注目」）。`server/proDraft.mjs` の `proWatchList`）、`roster[].proWatch`・`team` の窓口の `roster[].proWatch`（名簿の黄色い札）、`phase.candidates[].listedBy[]`（`team`・`wish`・`cpu`（CPU の見込みなら true）・`first`（自分より先に指名する球団なら true））、`chronicle.titles[]`（歴代タイトル。`year`・`titles[]` の `label`・`name`・`team`・`line`・`pro`）。タイトル争いの行（`leaders` の `rows`）にも `pro`（プロへ進んだ選手。名簿に居ないので押せない）が付く。
  - 送る: 契約更改の `coachOffers`（`{ pitching, batting }` → 選手 id。打診が無ければ送らない）、自動采配の `restLine`（`standard`・`early`・`late`）。
  - ⚠ **古いサーバーは自動采配の知らない項目を「未対応の采配項目です」で弾く**（`server/lineupTactics.mjs`）。だからアプリは、既定のままで元の自動采配に無い項目は送らない（`Plan.kt` の `toPayload`）。新しい項目を足すときも同じにする。
  - ⚠ 古いサーバーは `coachOffers` を黙って捨てる（`validatePhasePlan` が `releaseIds` しか返さない）。打診はサーバーを先に出してからアプリで使えるようにする。
- 先方3項目（2026-11-23。指導者の異動・守備位置の色・トライアウトの能力で絞り込み）で読む・送る項目。古いサーバーには無く、無ければ出さない（版は上げていない）:
  - 読む: ビューの `staff.seats`（契約更改の「指導者の異動」の席）、`staff.scheduled[]`（年度更新で動く人事の文）、`staff.events[].stepDown`（契約更改で決めた退任）。
  - 送る: 契約更改の `staffMoves`（`{ manager: leave|pitching|batting, pitching: leave, batting: leave }`。続投は送らない。`Commands.withStaffMove`）。
  - ⚠ 古いサーバーは `staffMoves` を黙って捨てる（`coachOffers` と同じ）。サーバーを先に出してからアプリで使う。
  - トライアウトの能力の絞り込み（`Tables.kt` の `ABILITY_FILTERS`）は画面の中だけ。サーバーには送らない。
- 手続きの任せ方は、ビューの `phase.delegated`（自分がその手続きを指導者に任せているか）と `members` の `ready`・`cpu`・`delegated` を読む。任せた手続きは決定の帯を出さず、`defaults` の案（指導者の案）を読むだけで見せる。待たれている最後の1人が手続きの分野を「任せる」にして保存すると、サーバーはその場で手続きを決めるので、アプリは送る前に確かめる（`shared/.../Staff.kt` の `delegationSettles`。`server/leagueEngine.mjs` の `waitsFor` と同じ見方）。

### 検査に使う実際の窓口の答え（`shared/src/jvmTest/resources/`）

ビュー・窓口の形（`server/projection.mjs` など）を変えたら、使っている物を取り直して `./gradlew -PsharedOnly :shared:jvmTest` が通ることを確かめる。どれもリポジトリの根から動かす。

| ファイル | 中身 | 作り方 | 使う検査 |
| --- | --- | --- | --- |
| `view-running.json` | 開幕3日目（4月4日）のビュー | `node mobile/tools/view-fixture.mjs` のあと、必ず `node mobile/tools/expect-logic.mjs > mobile/shared/src/jvmTest/resources/logic-expected.json` と下の `expect-social.mjs`・`expect-stats.mjs` | `ViewTest`・`LogicTest`・`TipsTest`・`TwoWayTest`・`SocialTest`・`StatsWebTest` |
| `front/view.json`・`game.json`・`games.json`・`team.json` | 同じリーグの6月12日のビュー、自球団の最新の試合の詳細、今季の自球団の試合、次の相手の名簿 | 同じ `view-fixture.mjs` が一緒に書き出す | `FrontPageTest`（紙面） |
| `chronicle/view-late.json`・`view-offseason.json`・`team.json`・`view-pro.json` | 1年目の終盤（マジックが出る頃）のビュー、2年目のキャンプのビュー（引退・裏の大会・前の年の表彰）、球団史、プロのその後と便りの出る頃のビュー（年代記・年齢構成・参加の時刻だけ。写しの年を進めて作る） | `node mobile/tools/chronicle-fixtures.mjs`（引退・プロ入りが出ない年は1人分を作って載せる）。そのあと必ず下の `expect-chronicle.mjs` | `ChronicleTest`（年代記の紙面）・`HonorsTest` |
| `chronicle-expected.json` | Web 版の表彰の行・プロのその後の行・年齢構成の読み・はじめての1週間の時刻の答え（上の年代記のビューから） | `node mobile/tools/expect-chronicle.mjs > mobile/shared/src/jvmTest/resources/chronicle-expected.json`。CI は `--check` | `HonorsTest` |
| `staff-view.json` | 指導者（監督・コーチ）の入ったビュー（2年目のキャンプ） | `WRITE_APP_FIXTURE=1 node tools/sim-harness/online-coach-check.mjs` | `StaffTest` |
| `logic-expected.json` | Web 版の計算の答え（`view-running.json` の名簿から） | 上の `expect-logic.mjs`。CI は `--check` | `LogicTest` |
| `social-expected.json` | Web 版の得点経過・時刻・最終ログイン・留守中のまとめの答え（`view-running.json` の要点から） | `node mobile/tools/expect-social.mjs > mobile/shared/src/jvmTest/resources/social-expected.json`。CI は `--check` | `SocialTest` |
| `stats-expected.json` | Web 版の成績の列・能力の絞り込みの値と文字、段位・疲労の段・調子の顔の答え（`view-running.json` の名簿と、名簿に出てこない形の選手から） | `node mobile/tools/expect-stats.mjs > mobile/shared/src/jvmTest/resources/stats-expected.json`。CI は `--check` | `StatsWebTest` |

- ⚠ 試合の結果は命令の `requestId` で決まる（同じコードなら同じ答え）。`ViewTest` の紙面の検査は「4月4日の自球団の最新の試合が負け」を前提にしているので、`view-fixture.mjs` はその形になる回まで `requestId` を変えて作り直す。試合の計算を変えて30回で合わなくなったら、検査の期待値をビューの中身から作る形に直すかを決める（`docs/audit/2026-11-08.md` の判断待ち 2）。

## ビルド

- GitHub Actions（`.github/workflows/android.yml`）が `mobile/` の変更ごとに検査と APK のビルドをする。APK は実行結果の Artifacts から落とす。
- 手元: Android Studio で `mobile/` を開く。または `./gradlew :androidApp:assembleDebug`。
- Android SDK の無い環境では `./gradlew -PsharedOnly :shared:jvmTest` で共通部分だけ検査できる。
- `ONLINE_TEST_ENDPOINT=http://127.0.0.1:3002/` を付けると、開発サーバー（開幕済みのリーグ）に繋いで打順の保存まで通す検査も動く。
- `ONLINE_FLOW_ENDPOINT=http://127.0.0.1:3002/` を付けると、**空のデータで起動した**開発サーバーで、リーグ作成 → 初期メンバー選択 → キャンプ4クール → 開幕 → 編成の保存 → 試合 → 読むだけの窓口 → トレード → 名前の変更 を、アプリと同じ指示の中身で通す（`LocalFlowTest`）。`ONLINE_FLOW_FULL=1` も付けると、契約更改・トライアウト・年度更新・翌年のキャンプまで進める（5分ほど）。

## アプリの版（最新かどうか）

- アプリは作ったときに「最後に `mobile/` を変えたコミット」とその時刻を持つ（`androidApp/build.gradle.kts` の `APP_COMMIT`）。CI は履歴を全部取って作る（`fetch-depth: 0`）。
- 起動時と引っ張って更新したとき（30分に1回まで）、GitHub の公開 API で ice-north の main の同じもの（`commits?path=mobile`）を読み、ホームの紙面に記事で出す（`shared/.../AppUpdate.kt`）。同じ（最新版）なら何も書かない。main の方が新しければ紙面の先頭に「新しいアプリが出ています」（押すと配布ページ）、ブランチで作った先の版なら「試作版」。
- ⚠ `mobile/` の中なら README や tools だけの変更でも「新しい版」になる。

## 署名

`androidApp/debug.keystore` は試作配布用（パスワードは Android 標準の `android`）。CI のたびに鍵が変わると上書きインストールできなくなるので固定してある。ストアに出すときは本番用の鍵を別に作り、リポジトリには置かない。
