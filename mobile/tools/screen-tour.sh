#!/usr/bin/env bash
# エミュレーターの中で、場面ごとに開発サーバーを立て直して ScreenTour を回し、スクショを取り出す。
#   mobile/tools/screen-tour.sh <seed-league.mjs の出力フォルダ> <スクショの出力フォルダ>
# リポジトリの一番上から呼ぶ。
set -u
SEED="$1"
OUT="$2"
APP=jp.icenorth.baseball.online
mkdir -p "$OUT"
adb install -r mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk
adb install -r mobile/androidApp/build/outputs/apk/androidTest/debug/androidApp-debug-androidTest.apk
# アニメーションを止める（撮るたびに途中の絵にならないように）
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
for stage in pack camp running contract tryout; do
  [ -f "$SEED/$stage.json.gz" ] || continue
  cp "$SEED/$stage.json.gz" "/tmp/league-$stage.json.gz"
  ONLINE_DATA_FILE="/tmp/league-$stage.json.gz" ONLINE_DISABLE_TIMER=1 node server/dev.mjs > "$OUT/server-$stage.log" 2>&1 &
  SERVER=$!
  for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3002/ && break; sleep 1; done
  echo "== $stage"
  adb logcat -c
  timeout 900 adb shell am instrument -w -e stage "$stage" -e class jp.icenorth.baseball.app.ScreenTour \
    "$APP.test/androidx.test.runner.AndroidJUnitRunner" | tee "$OUT/instrument-$stage.log"
  adb logcat -d -s ScreenTour:* > "$OUT/tour-$stage.log"
  kill "$SERVER"; wait "$SERVER" 2>/dev/null
done
adb exec-out run-as "$APP" tar c -C files shots > "$OUT/shots.tar"
tar xf "$OUT/shots.tar" -C "$OUT" && rm "$OUT/shots.tar"
ls -la "$OUT/shots" | head -100
