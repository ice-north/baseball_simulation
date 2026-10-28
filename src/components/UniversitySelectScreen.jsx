import React, { useState } from 'react';
import { RANK_COLORS, RANK_LABELS, RANK_ORDER, RANK_HEX } from '../utils/constants.js';
import { UNIVERSITY_TEAMS, UNIVERSITY_REGIONS, SPECIALTY_LABELS } from '../university/universityTeamsData.js';
import SelectShell from './select/SelectShell.jsx';
import TeamSelectCard from './select/TeamSelectCard.jsx';

const RANK_BG = {
  S: 'bg-yellow-500/20 border-yellow-500/40',
  A: 'bg-red-500/20 border-red-500/40',
  B: 'bg-blue-500/20 border-blue-500/40',
  C: 'bg-green-500/20 border-green-500/40',
  D: 'bg-gray-500/20 border-gray-500/40',
};

const getBestRank = (teams) => teams.reduce((best, t) => RANK_ORDER[t.rank] < RANK_ORDER[best] ? t.rank : best, 'D');

const UniversityTeamSelectScreen = ({ onSelect, onBack }) => {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  if (!selectedRegion) {
    return (
      <SelectShell kicker="UNIVERSITY" title="リーグ選択" sub="所属するリーグを選んでください" fitHeight={false}
        footer={(
          <div className="text-center">
            <button onClick={onBack} className="text-gray-300 hover:text-white text-sm transition">← 戻る</button>
          </div>
        )}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {UNIVERSITY_REGIONS.map(region => {
              const teams = UNIVERSITY_TEAMS.filter(t => t.region === region.id);
              const numDivisions = region.divisions || 1;
              const perDiv = numDivisions >= 2 ? Math.floor(teams.length / numDivisions) : 0;
              const leagueRank = getBestRank(teams);
              return (
                // ⚠ **`flex flex-col` を付けること**。カードは `<button>` で、グリッドの
                //    行の高さに引き伸ばされると**中身が上下中央に寄る**（button の既定）。
                //    校数の少ないリーグだけリーグ名が下がって見出しの高さが揃わなかった。
                //    見出しは上端・内訳は `mt-auto` で下端に固定する。
                <button key={region.id}
                  onClick={() => setSelectedRegion(region)}
                  className="lift-card bg-surface-2/80 border border-gray-700/70 hover:border-gray-500 rounded-xl p-4 text-left group flex flex-col"
                >
                  {/* 見出し行。名前が長くても崩れないよう、伸縮するのは名前だけにする */}
                  <div className="flex items-center gap-2 w-full">
                    <div className="text-base font-bold text-white truncate min-w-0 flex-1">{region.name}</div>
                    <span className={`text-xs font-bold w-6 text-center py-0.5 rounded border shrink-0 ${RANK_BG[leagueRank]} ${RANK_COLORS[leagueRank]}`}>{leagueRank}</span>
                    <span className="text-xs text-gray-300 tabular-nums whitespace-nowrap shrink-0 w-9 text-right">{teams.length}校</span>
                  </div>
                  <div className="border-t border-gray-700/60 my-2.5" />
                  <div className="flex flex-wrap gap-1 text-xs">
                    {teams.map(t => (
                      <span key={t.id} className="bg-gray-700/50 px-1.5 py-0.5 rounded text-gray-300 whitespace-nowrap">
                        {t.name}<span className={`ml-1 ${RANK_COLORS[t.rank]}`}>{t.rank}</span>
                      </span>
                    ))}
                  </div>
                  {/* 内訳は下端に固定する。1部制のリーグにも出して、
                      どのカードも「見出し / 校名 / 内訳」の3段で揃える */}
                  <div className="text-xs text-gray-400 mt-auto pt-2.5">
                    {numDivisions >= 2
                      ? `${Array.from({ length: numDivisions }, (_, d) => `${d + 1}部${perDiv}校`).join(' + ')}（入替制）`
                      : `1部制 ${teams.length}校`}
                  </div>
                </button>
              );
            })}
          </div>
      </SelectShell>
    );
  }

  // チーム選択画面
  const teams = UNIVERSITY_TEAMS.filter(t => t.region === selectedRegion.id);
  const numDivisions = selectedRegion.divisions || 1;
  const perDiv = numDivisions >= 2 ? Math.floor(teams.length / numDivisions) : 0;
  const hasDivisions = numDivisions >= 2;

  // ⚠ 校名とランク文字だけのカードだった。`budget` と `specialties` は
  //    データにあるのにどこにも出ておらず、6校が見た目でも中身でも区別できなかった
  const renderTeamButton = (team) => (
    <TeamSelectCard
      key={team.id}
      name={team.name}
      accent={RANK_HEX[team.rank]}
      rank={team.rank}
      rankLabel={RANK_LABELS[team.rank]}
      meter={{ label: '強化予算', value: team.budget, max: 100 }}
      chips={(team.specialties || []).map(k => SPECIALTY_LABELS[k] || k)}
      selected={selectedTeam?.id === team.id}
      onClick={() => setSelectedTeam(team)}
    />
  );

  return (
    <SelectShell
      kicker="TEAM SELECT"
      title={selectedRegion.name}
      sub="監督を務めるチームを選んでください"
      footer={(
        <div className="flex justify-between items-center">
          <button onClick={() => { setSelectedRegion(null); setSelectedTeam(null); }}
            className="text-gray-300 hover:text-white text-sm transition">← リーグ選択に戻る</button>
          {/* ⚠ 選ぶまで出さないこと。空の場所取りを置くと「押せないボタン」に見える */}
          {selectedTeam && (
            <button onClick={() => onSelect(selectedTeam)}
              className="btn-primary px-7 py-2.5 rounded-xl text-base transition active:scale-[0.99]">
              {selectedTeam.name}で始める
            </button>
          )}
        </div>
      )}
    >
        {hasDivisions ? (
          <>
            {Array.from({ length: numDivisions }, (_, d) => {
              const divTeams = teams.slice(d * perDiv, (d + 1) * perDiv);
              const divColor = d === 0 ? 'text-amber-400' : 'text-gray-300';
              return (
                <div key={d}>
                  <h3 className={`text-sm font-bold ${divColor} mb-2`}>{d + 1}部</h3>
                  <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${d < numDivisions - 1 ? 'mb-4' : 'mb-6'}`}>
                    {divTeams.map(renderTeamButton)}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {teams.map(renderTeamButton)}
          </div>
        )}

    </SelectShell>
  );
};

export default UniversityTeamSelectScreen;
