import React, { useState, useEffect } from 'react';

/**
 * 殿堂入り選手表示画面
 * 殿堂入り条件:
 * - 投手: 通算100勝、または通算30セーブ、または通算600奪三振
 * - 野手: 通算打率.300以上、または通算150本塁打、または通算1000安打
 */
const HallOfFameScreen = ({ hallOfFamePlayers = [], onClose }) => {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // ポジション名の日本語表示
  const getPositionName = (pos) => {
    const names = {
      pitcher: '投手', catcher: '捕手', first: '一塁手', second: '二塁手',
      third: '三塁手', short: '遊撃手', left: '左翼手', center: '中堅手', right: '右翼手'
    };
    return names[pos] || pos;
  };

  // 選手がいない場合
  if (!hallOfFamePlayers || hallOfFamePlayers.length === 0) {
    return (
      <div className="p-8 bg-gray-900 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-yellow-400 mb-8 text-center">
            🏆 殿堂入り選手
          </h1>
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400 text-xl">まだ殿堂入り選手はいません</p>
            <p className="text-gray-500 mt-4">
              殿堂入り条件を満たした選手が引退すると、ここに表示されます
            </p>
            <div className="mt-6 text-left bg-gray-700 rounded-lg p-4 max-w-md mx-auto">
              <h3 className="text-yellow-400 font-bold mb-2">殿堂入り条件</h3>
              <div className="text-sm text-gray-300 space-y-2">
                <p><span className="text-blue-400">【投手】</span> 通算100勝 / 通算30セーブ / 通算600奪三振</p>
                <p><span className="text-green-400">【野手】</span> 通算打率.300 / 通算150本塁打 / 通算1000安打</p>
              </div>
            </div>
          </div>
          {onClose && (
            <div className="text-center mt-6">
              <button
                onClick={onClose}
                className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-3 rounded-lg"
              >
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-yellow-400 mb-2 text-center">
          🏆 殿堂入り選手
        </h1>
        <p className="text-gray-400 text-center mb-8">
          独立リーグの歴史に名を刻んだ偉大な選手たち
        </p>

        {/* 選手リスト */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hallOfFamePlayers.map((player, index) => {
            const isPitcher = player.position === 'pitcher';
            const stats = player.careerStats || { batting: {}, pitching: {} };

            return (
              <div
                key={index}
                onClick={() => setSelectedPlayer(player)}
                className="bg-gradient-to-br from-yellow-900 to-gray-800 border-2 border-yellow-600 rounded-lg p-4 cursor-pointer hover:border-yellow-400 transition"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🥇</span>
                  <div>
                    <h3 className="text-xl font-bold text-yellow-300">{player.name}</h3>
                    <p className="text-gray-400 text-sm">
                      {getPositionName(player.position)} | {player.team}
                    </p>
                  </div>
                </div>

                <p className="text-yellow-400 text-sm font-medium mb-2">{player.reason}</p>

                {isPitcher ? (
                  <div className="text-sm text-gray-300 grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{stats.pitching?.wins || 0}</div>
                      <div className="text-xs text-gray-500">勝</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{stats.pitching?.saves || 0}</div>
                      <div className="text-xs text-gray-500">S</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{stats.pitching?.strikeouts || 0}</div>
                      <div className="text-xs text-gray-500">K</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-300 grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">
                        {stats.batting?.atBats > 0
                          ? (stats.batting.hits / stats.batting.atBats).toFixed(3)
                          : '.000'}
                      </div>
                      <div className="text-xs text-gray-500">打率</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{stats.batting?.homeruns || 0}</div>
                      <div className="text-xs text-gray-500">HR</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{stats.batting?.hits || 0}</div>
                      <div className="text-xs text-gray-500">安打</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 選手詳細モーダル */}
        {selectedPlayer && (
          <div
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
            onClick={() => setSelectedPlayer(null)}
          >
            <div
              className="bg-gray-800 border-2 border-yellow-500 rounded-xl p-6 max-w-lg w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 mb-4">
                <span className="text-5xl">🏆</span>
                <div>
                  <h2 className="text-2xl font-bold text-yellow-300">{selectedPlayer.name}</h2>
                  <p className="text-gray-400">
                    {getPositionName(selectedPlayer.position)} | {selectedPlayer.team}
                  </p>
                  <p className="text-yellow-400 font-medium">{selectedPlayer.reason}</p>
                </div>
              </div>

              <div className="bg-gray-700 rounded-lg p-4 mb-4">
                <h3 className="text-white font-bold mb-2">通算成績</h3>
                {selectedPlayer.position === 'pitcher' ? (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className="text-xl font-bold text-white">
                        {selectedPlayer.careerStats?.pitching?.wins || 0}
                      </div>
                      <div className="text-xs text-gray-400">勝利</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">
                        {selectedPlayer.careerStats?.pitching?.losses || 0}
                      </div>
                      <div className="text-xs text-gray-400">敗戦</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">
                        {selectedPlayer.careerStats?.pitching?.saves || 0}
                      </div>
                      <div className="text-xs text-gray-400">セーブ</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">
                        {selectedPlayer.careerStats?.pitching?.strikeouts || 0}
                      </div>
                      <div className="text-xs text-gray-400">奪三振</div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className="text-xl font-bold text-white">
                        {selectedPlayer.careerStats?.batting?.atBats > 0
                          ? (selectedPlayer.careerStats.batting.hits / selectedPlayer.careerStats.batting.atBats).toFixed(3)
                          : '.000'}
                      </div>
                      <div className="text-xs text-gray-400">打率</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">
                        {selectedPlayer.careerStats?.batting?.hits || 0}
                      </div>
                      <div className="text-xs text-gray-400">安打</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">
                        {selectedPlayer.careerStats?.batting?.homeruns || 0}
                      </div>
                      <div className="text-xs text-gray-400">本塁打</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">
                        {selectedPlayer.careerStats?.batting?.rbis || 0}
                      </div>
                      <div className="text-xs text-gray-400">打点</div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedPlayer(null)}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-lg"
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {onClose && (
          <div className="text-center mt-8">
            <button
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-500 text-white px-8 py-3 rounded-lg text-lg"
            >
              戻る
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HallOfFameScreen;
