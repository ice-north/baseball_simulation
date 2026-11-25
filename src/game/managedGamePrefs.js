// 采配の試合の「おまかせ采配」の入／切を、試合前の窓と采配の試合のあいだで受け渡す。
// 保存はしない（セーブの形を変えない）。アプリを開き直すと既定の「入」に戻る。
// 試合前の窓（PreGameModal）が初期値を読み、選んだ値は setupManagedGame（useManagedGame.jsx）が書く。
let autoManager = true;
export const getAutoManagerPref = () => autoManager;
export const setAutoManagerPref = (v) => { autoManager = !!v; };
