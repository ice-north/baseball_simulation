import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { advanceToNextYear } from '../season/yearProgressionSystem.js';

const OffSeasonScreen = ({ seasonData, setSeasonData, onSave, onStartNextSeason, onAddHallOfFamePlayers, saveSlots }) => {
  const [processing, setProcessing] = useState(false);
  const [seasonResults, setSeasonResults] = useState(null);
  const [selectedSaveSlot, setSelectedSaveSlot] = useState(0);
  const [saveStatus, setSaveStatus] = useState(null);

  const handleSaveToSlot = () => {
    if (onSave) {
      onSave(selectedSaveSlot);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleAdvanceYear = () => {
    if (!advanceToNextYear) {
      alert('年間進行システムが読み込まれていません');
      return;
    }
    setProcessing(true);
    try {
      const allTeams = TEAMS_DATA || {};
      const result = advanceToNextYear(seasonData, allTeams);
      setSeasonData(result.newSeasonData);
      Object.keys(result.updatedTeams).forEach(teamName => {
        TEAMS_DATA[teamName] = result.updatedTeams[teamName];
      });
      if (onAddHallOfFamePlayers && result.retirements && result.retirements.length > 0) {
        const retiredPlayers = result.retirements.map(r => ({
          ...r, departureType: 'retired', year: seasonData.year
        }));
        onAddHallOfFamePlayers(retiredPlayers);
      }
      if (onStartNextSeason) onStartNextSeason();
    } catch (error) {
      console.error('年度進行エラー:', error);
      alert('年度進行中にエラーが発生しました');
      setProcessing(false);
    }
  };

  const slotNames = ['スロット1', 'スロット2', 'スロット3'];

  const SaveSlotSelector = () => (
    <div className="bg-gray-700/50 rounded-lg p-3 mb-4">
      <h3 className="text-sm font-bold text-white mb-2">セーブ</h3>
      <div className="flex gap-2 mb-2">
        {slotNames.map((name, idx) => {
          const info = saveSlots?.[idx];
          return (
            <button
              key={idx}
              onClick={() => setSelectedSaveSlot(idx)}
              className={`flex-1 p-2 rounded-lg text-left transition text-xs ${
                selectedSaveSlot === idx
                  ? 'bg-blue-600 text-white ring-1 ring-blue-400'
                  : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
              }`}
            >
              <div className="font-bold">{name}</div>
              <div className="text-[10px] opacity-70 mt-0.5">
                {info ? `${info.year}年目 ${info.date?.month}/${info.date?.day}` : '空き'}
              </div>
            </button>
          );
        })}
      </div>
      <button
        onClick={handleSaveToSlot}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition"
      >
        {slotNames[selectedSaveSlot]}に保存
      </button>
      {saveStatus === 'saved' && (
        <div className="mt-1.5 text-green-400 text-center text-xs font-bold">セーブしました</div>
      )}
    </div>
  );

  if (!seasonResults) {
    return (
      <div className="p-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-white mb-4">オフシーズン</h1>
          <div className="bg-gray-800 rounded-lg p-5">
            <h2 className="text-lg font-bold text-white mb-3 text-center">
              {seasonData.year}年目のシーズンを終了しますか？
            </h2>
            <div className="text-gray-400 text-sm mb-4 text-center space-y-0.5">
              <p>1. 表彰（首位打者・本塁打王など）</p>
              <p>2. 選手の年齢+1 / 引退処理</p>
              <p>3. シーズン成績を通算成績に加算</p>
              <p>4. 次年度（{seasonData.year + 1}年目）へ移行</p>
            </div>
            <SaveSlotSelector />
            <div className="text-center">
              <button
                onClick={handleAdvanceYear}
                disabled={processing}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold text-base transition disabled:bg-gray-600 shadow"
              >
                {processing ? '処理中...' : `${seasonData.year + 1}年目へ進む`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-3">{seasonData.year - 1}年目 シーズン結果</h1>

        {seasonResults.awards.champion && (
          <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-lg p-5 mb-3 text-center">
            <h2 className="text-2xl font-bold text-white mb-1">🏆 優勝</h2>
            <div className="text-3xl font-bold text-white">{seasonResults.awards.champion}</div>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-base font-bold text-white mb-3">個人タイトル</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { key: 'battingChampion', title: '首位打者', stat: (a) => a.avg },
              { key: 'homeRunKing', title: '本塁打王', stat: (a) => `${a.homeruns}本` },
              { key: 'rbiKing', title: '打点王', stat: (a) => `${a.rbis}打点` },
              { key: 'stolenBaseKing', title: '盗塁王', stat: (a) => `${a.stolenBases}盗塁` },
              { key: 'eraChampion', title: '最優秀防御率', stat: (a) => a.era },
              { key: 'winsLeader', title: '最多勝', stat: (a) => `${a.wins}勝` },
              { key: 'savesLeader', title: '最多セーブ', stat: (a) => `${a.saves}S` },
              { key: 'strikeoutKing', title: '最多奪三振', stat: (a) => `${a.strikeouts}K` },
            ].filter(({ key }) => seasonResults.awards[key]).map(({ key, title, stat }) => {
              const award = seasonResults.awards[key];
              return (
                <div key={key} className="bg-gray-700/60 rounded p-2.5">
                  <div className="text-yellow-400 text-[10px] font-bold mb-0.5">{title}</div>
                  <div className="text-white text-sm font-bold">{award.name}</div>
                  <div className="text-gray-400 text-[10px]">{award.team} | {stat(award)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {seasonResults.retirements.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 mb-3">
            <h2 className="text-base font-bold text-white mb-2">引退選手</h2>
            <div className="space-y-1">
              {seasonResults.retirements.map((retirement, idx) => (
                <div key={idx} className={`rounded p-2.5 flex items-center justify-between ${retirement.hallOfFame ? 'bg-yellow-900/30 border border-yellow-700/50' : 'bg-gray-700/50'}`}>
                  <div>
                    <span className="text-white font-bold text-sm">
                      {retirement.hallOfFame && '🏛️ '}{retirement.name}
                    </span>
                    <span className="text-gray-500 text-xs ml-2">{retirement.age}歳 | {POSITION_NAMES[retirement.position]} | {retirement.team}</span>
                  </div>
                  <span className="text-gray-500 text-xs">{retirement.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <SaveSlotSelector />
        <div className="text-center">
          <button
            onClick={() => { if (onStartNextSeason) onStartNextSeason(); }}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold text-base transition shadow"
          >
            次のシーズンへ →
          </button>
        </div>
      </div>
    </div>
  );
};

export default OffSeasonScreen;
