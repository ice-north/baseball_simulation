// ============================================================
// useGameStrategy - 試合中の采配（strategy）state を1箇所に集約するカスタムフック
//
// これまで App.jsx トップに散らばっていた 5 個の ref と 2 個の state を統合し、
// 「宣言し忘れ」「別関数からローカル変数を参照して ReferenceError」といった
// スコープ由来のバグを構造的に防ぐためのモジュール。
//
// 采配は 2 種類ある:
//   - 継続する設定  : battingApproach (打撃方針), pitchAim/pitchTypeIndex (配球),
//                    batGuessType/batGuessZone (打者の狙い球)
//     → UI 表示用の state と、投球ロジックが読む ref を同期。
//   - ワンショット指示: forceSteal / forceSwing / intentionalWalk
//     → ref のみ。次の 1 球で「消費」して自動で false に戻る。
//
// 使い方 (App.jsx):
//   const strategy = useGameStrategy();
//   const { battingApproachRef, forceSwingRef, ... } = strategy;
//   // UI
//   <button onClick={() => strategy.setBattingApproach('take')}>待て</button>
//   <button onClick={() => strategy.triggerSteal(throwPitch)}>盗塁</button>
//   // 投球ロジック（throwPitch内）
//   const snap = strategy.snapshot();
//   let result = simulatePitch();       // simulateSinglePitch が forceSwingRef.current を直接読む
//   strategy.consumeOneShot();          // ここでワンショットフラグを消費
//   if (snap.intentionalWalk) { result = { type: 'ball', ... }; }
// ============================================================

import { useState, useRef, useCallback } from 'react';

export function useGameStrategy() {
  // 継続する設定（画面にも状態を反映するので state ＋ ref のペア）
  const [battingApproach, _setBattingApproach] = useState('normal'); // 'take' | 'normal' | 'aggressive'
  // 配球: 投球の狙い。'auto' は捕手AIに任せる（従来動作）
  const [pitchAim,       _setPitchAim]         = useState('auto');    // 'auto' | 'zone' | 'edge' | 'chase'
  // 球種指定: 'auto' は捕手のリードに任せる（従来動作）。それ以外は arsenal の index
  const [pitchTypeIndex, _setPitchTypeIndex]   = useState('auto');
  // 打者の狙い球（攻撃時）。'auto' は従来どおり捕手との読み合いをAIに任せる。
  // 張った場合は賭けになる: 当たれば準備完了、外せば体が動いて対応が遅れる。
  const [batGuessType, _setBatGuessType]       = useState('auto');    // 'auto' | 'straight' | 'breaking'
  const [batGuessZone, _setBatGuessZone]       = useState('auto');    // 'auto' | 'in' | 'out' | 'high' | 'low'
  const battingApproachRef = useRef('normal');
  const pitchAimRef        = useRef('auto');
  const pitchTypeIndexRef  = useRef('auto');
  const batGuessTypeRef    = useRef('auto');
  const batGuessZoneRef    = useRef('auto');

  // ワンショット指示（次の1球で消費）— stateにする必要はなく ref のみ
  const forceStealRef      = useRef(false); // 盗塁指示
  const forceSwingRef      = useRef(false); // エンドラン: 打者を必ず打ちにいかせる
  const intentionalWalkRef = useRef(false); // 敬遠: 次球を強制的にボール4扱いにする

  // 継続設定の setter は state と ref を同時に更新する
  const setBattingApproach = useCallback((v) => {
    _setBattingApproach(v);
    battingApproachRef.current = v;
  }, []);
  const setPitchAim = useCallback((v) => {
    _setPitchAim(v);
    pitchAimRef.current = v;
  }, []);
  const setPitchTypeIndex = useCallback((v) => {
    _setPitchTypeIndex(v);
    pitchTypeIndexRef.current = v;
  }, []);
  const setBatGuessType = useCallback((v) => {
    _setBatGuessType(v);
    batGuessTypeRef.current = v;
  }, []);
  const setBatGuessZone = useCallback((v) => {
    _setBatGuessZone(v);
    batGuessZoneRef.current = v;
  }, []);

  // 攻撃側ワンショット指示: 呼び出し側から throwPitch を渡してもらい、
  // フラグを立てて即座に投球を走らせる（UIボタンの共通パターン）。
  const triggerSteal = useCallback((throwPitch) => {
    forceStealRef.current = true;
    throwPitch && throwPitch();
  }, []);
  const triggerHitAndRun = useCallback((throwPitch) => {
    forceStealRef.current = true;
    forceSwingRef.current = true;
    throwPitch && throwPitch();
  }, []);
  const triggerIntentionalWalk = useCallback((throwPitch) => {
    intentionalWalkRef.current = true;
    throwPitch && throwPitch();
  }, []);

  // 1球分の采配スナップショット。throwPitch が simulatePitch を呼ぶ前に取得する。
  // ref を直接参照させたくない箇所（例: 敬遠のresult上書き）はこの返り値を使う。
  const snapshot = useCallback(() => ({
    battingApproach: battingApproachRef.current,
    pitchAim:        pitchAimRef.current,
    pitchTypeIndex:  pitchTypeIndexRef.current,
    batGuessType:    batGuessTypeRef.current,
    batGuessZone:    batGuessZoneRef.current,
    forceSteal:      forceStealRef.current,
    forceSwing:      forceSwingRef.current,
    intentionalWalk: intentionalWalkRef.current,
  }), []);

  // ワンショットフラグを全て false に戻す。simulatePitch の呼び出し後に叩く。
  const consumeOneShot = useCallback(() => {
    forceStealRef.current = false;
    forceSwingRef.current = false;
    intentionalWalkRef.current = false;
  }, []);

  // 打席・イニング・試合の切れ目でリセットしたい時に使う（現状は未使用でも公開）。
  const resetPersistent = useCallback(() => {
    setBattingApproach('normal');
    setPitchAim('auto');
    setPitchTypeIndex('auto');
    setBatGuessType('auto');
    setBatGuessZone('auto');
  }, [setBattingApproach, setPitchAim, setPitchTypeIndex,
      setBatGuessType, setBatGuessZone]);

  return {
    // UI 表示用の state
    battingApproach, pitchAim, pitchTypeIndex,
    batGuessType, batGuessZone,
    // UI からの設定変更
    setBattingApproach, setPitchAim, setPitchTypeIndex,
    setBatGuessType, setBatGuessZone,
    // ワンショット指示（ボタンから呼ぶ）
    triggerSteal, triggerHitAndRun, triggerIntentionalWalk,
    // 投球ロジック用の ref（simulateSinglePitch などが直接参照）
    battingApproachRef, pitchAimRef, pitchTypeIndexRef,
    batGuessTypeRef, batGuessZoneRef,
    forceStealRef, forceSwingRef, intentionalWalkRef,
    // 1球ライフサイクル
    snapshot, consumeOneShot,
    // その他
    resetPersistent,
  };
}
