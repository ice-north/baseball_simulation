@echo off
rem ============================================================
rem  野球シミュレーター 起動スクリプト（Windows）
rem
rem  このファイルをダブルクリックすると
rem    1. Node.js があるか確認
rem    2. 初回だけ npm install
rem    3. 開発サーバーを起動（vite.config.js の server.open で
rem       ブラウザが自動で開きます。アドレスは必ず localhost:3000）
rem  まで一気に行います。
rem
rem  終了するときはこのウィンドウで Ctrl+C、またはウィンドウを閉じてください。
rem ============================================================
chcp 65001 >nul
setlocal
title 野球シミュレーター

rem エクスプローラから叩くとカレントが別の場所になるので、このファイルの場所へ移動する
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [エラー] Node.js が見つかりません。
  echo   https://nodejs.org/ から LTS 版をインストールしてから、もう一度実行してください。
  echo.
  pause
  exit /b 1
)

rem node_modules フォルダの有無ではなく vite の実体で判定する。
rem 途中で失敗した npm install はフォルダだけ残すため。
if not exist "node_modules\vite" (
  echo.
  echo   初回起動です。必要なパッケージを取得します（数分かかります）...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [エラー] npm install に失敗しました。ネットワーク接続を確認してください。
    echo.
    pause
    exit /b 1
  )
)

echo.
echo   開発サーバーを起動します。準備ができるとブラウザが自動で開きます。
echo   アドレスは必ず http://localhost:3000 です。
echo.
call npm run dev
set RC=%errorlevel%

rem ============================================================
rem  ポート3000が空いていないと起動できない（vite.config.js の strictPort）。
rem  ⚠ ここを「自動で別のポートへ」にしてはいけない。ブラウザのセーブは
rem     オリジン（ポート込み）ごとに分かれているので、3001 で開くと
rem     3000 で作ったセーブが1件も見えず「セーブが消えた」ことになる。
rem ============================================================
if not "%RC%"=="0" (
  echo.
  echo   ------------------------------------------------------------
  echo   [起動できませんでした]
  echo.
  echo   ポート3000が別のプログラムに使われている可能性が高いです。
  echo   ほとんどの場合、このゲームの起動ウィンドウがもう1つ開いたままです。
  echo.
  echo    1. 他の「野球シミュレーター」の黒いウィンドウを全部閉じる
  echo    2. それでも直らなければ、タスクマネージャーで node.exe を終了する
  echo    3. もう一度このファイルをダブルクリックする
  echo.
  echo   [重要] 別のポートで開かないでください。セーブが見えなくなります。
  echo      （消えたわけではなく、http://localhost:3000 に残っています）
  echo   ------------------------------------------------------------
)

rem サーバーが落ちた／起動できなかった場合に、原因が読めるようウィンドウを残す
echo.
echo   サーバーが終了しました。
pause
