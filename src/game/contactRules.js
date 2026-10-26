// 手動試合と自動試合で共通のコンタクト後判定。
export const contactFoulProbability = (meetQuality, strikes) =>
  Math.min(0.95, 0.60 - Math.max(0, Math.min(1, meetQuality)) * 0.25 + (strikes >= 2 ? 0.10 : 0));

export const isDirectionalFoul = (direction, random = Math.random) =>
  Math.abs(direction) > 30 && random() < 0.25;
