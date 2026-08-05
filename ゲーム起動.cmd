@echo off
rem ============================================================
rem  野球シミュレーター 起動スクリプト（Windows）
rem
rem  このファイルをダブルクリックすると
rem    1. Node.js があるか確認
rem    2. 初回だけ npm install
rem    3. 開発サーバーを起動（vite.config.js の server.open で
rem       ブラウザが自動で開きます）
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
echo   ポート3000が使用中の場合は、自動で別のポート（3001など）になります。
echo.
call npm run dev

rem サーバーが落ちた／起動できなかった場合に、原因が読めるようウィンドウを残す
echo.
echo   サーバーが終了しました。
pause
