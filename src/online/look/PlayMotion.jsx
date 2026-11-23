// ============================================================
// 新しい見た目（試作）: 「動きで見る」の絵。夜の球場で、選手と球を `playMotion.js` の軌跡どおりに動かす。
//
// ここは canvas と時計だけ。中身は別の所が決める:
//   どこへ・いつ = `playMotion.js`、カメラ = `motionCamera.js`、姿勢 = `motionPose.js`、
//   1コマの絵 = `motionPaint.js`（人 `motionFigure.js`・球場 `motionStadium.js`）
//
// ⚠ 入のときだけ出す（呼ぶ側の `LivePlays` が見る）。動きを減らす設定の端末では結果の絵を1枚だけ出す。
// ⚠ 速さ・窓の幅が変わっても、場面は頭に戻さない（時計を `clock` に持つ）。頭に戻すのは `replayKey` だけ。
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { teamLook, NEUTRAL_LOOK } from './teamLook.js';
import { stadiumScene } from './sceneArt.js';
import { makeStage, stadiumOf, paintFrame } from './motionPaint.js';
import { VIEW_W, VIEW_H } from './motionCamera.js';
import { teamCity, teamShort } from '../gameText.js';

/** 絵の中で使う字（`look.css` の @font-face。canvas は使うだけでは読みにいかないので先に読む） */
const FONTS = ['900 24px LookHead', '700 12px LookJP', '700 12px LookNum', '400 12px LookGraduate'];
/** 字を待つ長さ。過ぎたら端末の字で描きはじめ、読めたら描き直す */
const FONT_WAIT_MS = 1200;
// 0 待っている・1 待ちきれず端末の字・2 読めた
let fontState = 0;

function useMotionFonts() {
  const [state, setState] = useState(fontState);
  useEffect(() => {
    if (fontState === 2) return undefined;
    let live = true;
    const set = (v) => {
      fontState = Math.max(fontState, v);
      if (live) setState(fontState);
    };
    const timer = setTimeout(() => set(1), FONT_WAIT_MS);
    const loads = document.fonts?.load ? Promise.all(FONTS.map((f) => document.fonts.load(f, 'ホームラン0'))) : Promise.resolve();
    loads.then(
      () => set(2),
      () => set(1),
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);
  return state;
}

/**
 * 「動きで見る」の絵。
 * @param game 試合（本拠地・相手の球団）
 * @param scene `liveScenes` の1つ
 * @param before その場面の前の塁
 * @param speed 1 か 2
 * @param replayKey 変えると頭から
 * @param onDone 動きが終わったとき
 */
export default function PlayMotion({ game, scene, before, speed = 1, replayKey = 0, onDone }) {
  const canvasRef = useRef(null);
  const fonts = useMotionFonts();
  const home = teamLook(game.home) || NEUTRAL_LOOK;
  const away = teamLook(game.away) || NEUTRAL_LOOK;
  const homeName = teamShort(game.home);
  const awayName = teamShort(game.away);
  // ⚠ 景色（海・山）は略称でなく土地の名前で決める（今日の一戦の札と同じ景色にする。名前を付け替えた球団は略称が土地と違う）
  const homeCity = teamCity(game.home);
  const stage = useMemo(
    () => makeStage({ scene, before, home, away, names: { home: homeName, away: awayName } }),
    [scene, before, home, away, homeName, awayName],
  );
  // 絵の幅（画素）。窓の幅に合わせる
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const measure = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      setWidth(Math.max(320, Math.round(canvas.clientWidth * dpr)));
    };
    measure();
    if (!window.ResizeObserver) return undefined;
    const observer = new window.ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const clock = useRef({ stage: null, replay: -1, t: 0, done: false });
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !width || !fonts) return undefined;
    // 球場の絵は、いちばん寄った時（2.8倍）でもぼけない細かさで1度だけ描く
    const scale = Math.min(4, Math.max(2, Math.ceil((width / VIEW_W) * 2.2)));
    const stadium = stadiumOf({ home, away, scene: stadiumScene(homeCity), scale, tag: fonts });
    if (!stadium) return undefined;
    const height = Math.round((width * VIEW_H) / VIEW_W);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (clock.current.stage !== stage || clock.current.replay !== replayKey) clock.current = { stage, replay: replayKey, t: 0, done: false };
    const c = clock.current;
    const { motion } = stage;
    const finish = () => {
      if (c.done) return;
      c.done = true;
      doneRef.current?.();
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // 動かさない: 結果の文字が出ている所を1枚
      const last = motion.marks[motion.marks.length - 1];
      paintFrame(ctx, stage, stadium, last ? Math.min(motion.duration, last.t + 0.6) : motion.duration, width);
      finish();
      return undefined;
    }
    let frame = 0;
    let prev = null;
    const tick = (now) => {
      // 1コマで進むのは最大0.1秒（タブを離れていた間のぶんを飛ばさない）
      if (prev != null) c.t = Math.min(motion.duration, c.t + Math.min(0.1, (now - prev) / 1000) * speedRef.current);
      prev = now;
      paintFrame(ctx, stage, stadium, c.t, width);
      if (c.t >= motion.duration) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stage, home, away, homeCity, width, fonts, replayKey]);
  return (
    <canvas
      ref={canvasRef}
      className="online-motion-canvas"
      width={VIEW_W}
      height={VIEW_H}
      role="img"
      aria-label={`動きで見る: ${scene.batter?.name || ''} ${scene.phrase || ''}`}
    />
  );
}
