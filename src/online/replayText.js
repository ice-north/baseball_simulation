const RESULTS = {
  ball: 'ボール',
  called_strike: '見逃し',
  swinging_strike: '空振り',
  strikeout: '三振',
  foul: 'ファウル',
  foul_2strike: 'ファウル',
  single: '単打',
  double: '二塁打',
  triple: '三塁打',
  homerun: '本塁打',
  out: 'アウト',
  double_play: '併殺',
  hit_by_pitch: '死球',
  walk: '四球',
  error: '失策',
  bunt_fair: 'バント・フェア',
  bunt_popup: 'バント・飛球',
  bunt_foul: 'バント・ファウル',
};
export const replayLabel = (frame) =>
  frame.kind === 'matchup'
    ? frame.pinchHit
      ? '代打'
      : '打席開始'
    : frame.kind === 'steal'
      ? frame.success
        ? '盗塁成功'
        : '盗塁死'
      : frame.kind === 'wild_pitch'
        ? '暴投・捕逸で進塁'
        : RESULTS[frame.result] || frame.result || 'プレー';

// 打席の結末（四球・三振）と、投球図のボール/見逃し/空振りを分ける。
export const replayPitchResult = (frame) =>
  frame.pitchResult || (frame.result === 'walk' ? 'ball' : frame.result);
