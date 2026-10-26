// シーズン設定から大会・イベントの担当を決める。画面と日付進行で同じ判定を使う。
export const getModeCapabilities = (settings = {}) => {
  const university = !!settings.universityMode;
  const corporate = !!settings.corporateMode && !university;
  const independent = !university && !corporate;
  return {
    university,
    corporate,
    independent,
    leaguePlayoffs: independent,
    grandChampionship: independent,
    universityTournaments: university,
    corporateTournaments: corporate,
  };
};
