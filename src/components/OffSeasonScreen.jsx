import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { advanceToNextYear } from '../season/yearProgressionSystem.js';

const OffSeasonScreen = ({ seasonData, setSeasonData, onSave, onStartNextSeason }) => {
  const [processing, setProcessing] = useState(false);
  const [seasonResults, setSeasonResults] = useState(null);

  const handleAdvanceYear = () => {
    if (!advanceToNextYear) {
      alert('年間進行システムが読み込まれていません');
      return;
    }

    setProcessing(true);

    try {
      const allTeams = TEAMS_DATA || {};
      const result = advanceToNextYear(seasonData, allTeams);
      setSeasonResults(result);
      setSeasonData(result.newSeasonData);
      Object.keys(result.updatedTeams).forEach(teamName => {
        TEAMS_DATA[teamName] = result.updatedTeams[teamName];
      });
    } catch (error) {
      console.error('年度進行エラー:', error);
      alert('年度進行中にエラーが発生しました');
    } finally {
      setProcessing(false);
    }
  };

  if (!seasonResults) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-6">🏆 オフシーズン</h1>
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              {seasonData.year}年目のシーズンを終了しますか？
            </h2>
            <p className="text-gray-300 mb-8">
              シーズン終了処理を実行すると、以下の処理が行われます：<br/>
              1. 表彰（首位打者・本塁打王など）<br/>
              2. 選手の年齢+1<br/>
              3. 引退処理（40歳以上、成績不振など）<br/>
              4. シーズン成績を通算成績に加算<br/>
              5. 次年度（{seasonData.year + 1}年目）へ移行
            </p>
            <div className="flex gap-4 justify-center">
              {onSave && (
                <button
                  onClick={() => { onSave(); alert('セーブしました'); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-bold text-xl transition"
                >
                  💾 セーブ
                </button>
              )}
              <button
                onClick={handleAdvanceYear}
                disabled={processing}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-bold text-xl transition disabled:bg-gray-600"
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
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">🏆 {seasonData.year - 1}年目 シーズン結果</h1>

        {seasonResults.awards.champion && (
          <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-lg p-8 mb-6 text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-3xl font-bold text-white mb-2">優勝</h2>
            <div className="text-5xl font-bold text-white">{seasonResults.awards.champion}</div>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-white mb-4">📊 個人タイトル</h2>
          <div className="grid grid-cols-2 gap-4">
            {seasonResults.awards.battingChampion && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">首位打者</div>
                <div className="text-white text-lg">{seasonResults.awards.battingChampion.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.battingChampion.team} | {seasonResults.awards.battingChampion.avg}</div>
              </div>
            )}
            {seasonResults.awards.homeRunKing && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">本塁打王</div>
                <div className="text-white text-lg">{seasonResults.awards.homeRunKing.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.homeRunKing.team} | {seasonResults.awards.homeRunKing.homeruns}本</div>
              </div>
            )}
            {seasonResults.awards.rbiKing && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">打点王</div>
                <div className="text-white text-lg">{seasonResults.awards.rbiKing.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.rbiKing.team} | {seasonResults.awards.rbiKing.rbis}打点</div>
              </div>
            )}
            {seasonResults.awards.stolenBaseKing && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">盗塁王</div>
                <div className="text-white text-lg">{seasonResults.awards.stolenBaseKing.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.stolenBaseKing.team} | {seasonResults.awards.stolenBaseKing.stolenBases}盗塁</div>
              </div>
            )}
            {seasonResults.awards.eraChampion && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">最優秀防御率</div>
                <div className="text-white text-lg">{seasonResults.awards.eraChampion.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.eraChampion.team} | {seasonResults.awards.eraChampion.era}</div>
              </div>
            )}
            {seasonResults.awards.winsLeader && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">最多勝</div>
                <div className="text-white text-lg">{seasonResults.awards.winsLeader.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.winsLeader.team} | {seasonResults.awards.winsLeader.wins}勝</div>
              </div>
            )}
            {seasonResults.awards.savesLeader && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">最多セーブ</div>
                <div className="text-white text-lg">{seasonResults.awards.savesLeader.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.savesLeader.team} | {seasonResults.awards.savesLeader.saves}S</div>
              </div>
            )}
            {seasonResults.awards.strikeoutKing && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">最多奪三振</div>
                <div className="text-white text-lg">{seasonResults.awards.strikeoutKing.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.strikeoutKing.team} | {seasonResults.awards.strikeoutKing.strikeouts}K</div>
              </div>
            )}
          </div>
        </div>

        {seasonResults.retirements.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">👋 引退選手</h2>
            <div className="space-y-2">
              {seasonResults.retirements.map((retirement, idx) => (
                <div key={idx} className={`rounded p-4 ${retirement.hallOfFame ? 'bg-yellow-900 border border-yellow-600' : 'bg-gray-700'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold">
                        {retirement.hallOfFame && '🏛️ '}
                        {retirement.name} ({retirement.age}歳)
                      </div>
                      <div className="text-sm text-gray-400">
                        {retirement.team} | {POSITION_NAMES[retirement.position]} | {retirement.reason}
                      </div>
                    </div>
                    {retirement.hallOfFame && (
                      <div className="text-yellow-400 font-bold">殿堂入り</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center flex gap-4 justify-center">
          {onSave && (
            <button
              onClick={() => { onSave(); alert('セーブしました'); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-bold text-xl transition"
            >
              💾 セーブ
            </button>
          )}
          <button
            onClick={() => {
              setSeasonResults(null);
              if (onStartNextSeason) onStartNextSeason();
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-bold text-xl transition"
          >
            次のシーズンへ →
          </button>
        </div>
      </div>
    </div>
  );
};

export default OffSeasonScreen;
