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
- 投手は長押しでつかんでローテ・救援の役割の見出しへ落とすと持ち場が変わる。打順も長押しで並べ替え。
- 保存・提出・練習・トレードの送信中は画面全体を塞ぐ（押し直し・画面移動で結果を見失わないため）。
- 「詳細はPCで」を作らない（キャンプの選手ごとの練習もスマホで選べる）。

### Web 版から写しているもの

- `shared/.../Tables.kt` は `tools/gen-tables.mjs` が Web 版の表から書き出す（手で直さない）。
- キャンプの方針（`trainingPolicy.js`）とトライアウトの希望順（`tryoutPlan.js`）は Kotlin に写してあり、
  `tools/expect-logic.mjs` が書き出す期待値（`logic-expected.json`）と `LogicTest` で答え合わせする。
- CI はどちらも `--check` で、Web 版だけ直して写しが古くなっていないかを見る。

- 接続先の既定は本番（`https://baseball-simulation-neon.vercel.app/api/online`）。ログイン画面の「接続先を変える（開発用）」でローカルの開発サーバーにも繋げる（エミュレーターから PC へは `http://10.0.2.2:3002/`）。
- ログインは Web 版と同じアカウント。**ログインすると、ほかの端末からは操作できなくなる**（サーバーが1人1端末で session を見ているため）。

## サーバーとの約束（壊さないために）

- アプリは `?action=login / refresh / view / defaults / team / player / games / game / command` を使う。ビューの項目名を変えるとアプリが壊れる。
- 編成の保存（`command` の `lineup`）は、ビューの `lineup` を**丸ごと**送り返し、`baseLineup` に編集前の塊を添える。アプリが知らない項目もそのまま返すので、編成に項目を足すのは構わない。
- `shared/src/jvmTest/resources/view-running.json` は開発サーバーの実際のビュー。ビューの形を変えたら、これを取り直して `ViewTest` が通ることを確かめる。

## ビルド

- GitHub Actions（`.github/workflows/android.yml`）が `mobile/` の変更ごとに検査と APK のビルドをする。APK は実行結果の Artifacts から落とす。
- 手元: Android Studio で `mobile/` を開く。または `./gradlew :androidApp:assembleDebug`。
- Android SDK の無い環境では `./gradlew -PsharedOnly :shared:jvmTest` で共通部分だけ検査できる。
- `ONLINE_TEST_ENDPOINT=http://127.0.0.1:3002/` を付けると、開発サーバー（開幕済みのリーグ）に繋いで打順の保存まで通す検査も動く。
- `ONLINE_FLOW_ENDPOINT=http://127.0.0.1:3002/` を付けると、**空のデータで起動した**開発サーバーで、リーグ作成 → 初期メンバー選択 → キャンプ4クール → 開幕 → 編成の保存 → 試合 → 読むだけの窓口 → トレード → 名前の変更 を、アプリと同じ指示の中身で通す（`LocalFlowTest`）。`ONLINE_FLOW_FULL=1` も付けると、契約更改・トライアウト・年度更新・翌年のキャンプまで進める（5分ほど）。

## 署名

`androidApp/debug.keystore` は試作配布用（パスワードは Android 標準の `android`）。CI のたびに鍵が変わると上書きインストールできなくなるので固定してある。ストアに出すときは本番用の鍵を別に作り、リポジトリには置かない。
