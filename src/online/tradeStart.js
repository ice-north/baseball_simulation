import { createContext, useContext } from 'react';

/**
 * 「この選手でトレードを考える」の窓口（PC）。選手の詳細から、トレードの画面へ
 * 相手と欲しい選手を入れた状態で移る（アプリの選手シートと同じ入口）。
 * ⚠ 置くのはPCの画面（`DesktopView`）だけ。無いところ（スマホWeb）ではボタンを出さない。
 * ⚠ 選手には球団名が載っていないので、他球団の名簿を出すときに `tradeTeam` を付けて渡す。
 */
export const TradeStartContext = createContext(null);
export const useTradeStart = () => useContext(TradeStartContext);
