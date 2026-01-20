window.EditScreen = ({ generateOptimalLineup, generatePitchingRotation, generateAllTeamsLineup, allTeams }) => {
  const [editingTeam, setEditingTeam] = useState('チームA');
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editFormData, setEditFormData] = useState(null);

  // TEAMS_DATAからチーム情報を取得
  const getTeamData = (teamName) => {
    if (window.TEAMS_DATA && window.TEAMS_DATA[teamName]) {
      return window.TEAMS_DATA[teamName];
    }
    return { name: teamName, players: [] };
  };

  const team = getTeamData(editingTeam);
  const teamColors = {
    'チームA': 'bg-blue-600',
    'チームB': 'bg-red-600',
    'チームC': 'bg-green-600',
    'チームD': 'bg-yellow-600'
  };

  // 選手編集を開始
  const startEditPlayer = (player) => {
    console.log('選手編集を開始:', player.name);
    setEditingPlayer(player);
    setEditFormData(JSON.parse(JSON.stringify(player)));
  };

  // 編集をキャンセル
  const cancelEdit = () => {
    setEditingPlayer(null);
    setEditFormData(null);
  };

  // 能力値を更新
  const updateAbility = (category, field, value) => {
    const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
    setEditFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: numValue
      }
    }));
  };

  // 投球フォームを更新
  const updatePitchingForm = (value) => {
    setEditFormData(prev => ({
      ...prev,
      pitching: {
        ...prev.pitching,
        form: value
      }
    }));
  };

  // 利き手を更新
  const updateHand = (category, value) => {
    if (category === 'batting') {
      setEditFormData(prev => ({
        ...prev,
        batting: { ...prev.batting, bats: value }
      }));
    } else if (category === 'physical') {
      setEditFormData(prev => ({
        ...prev,
        physical: { ...prev.physical, throws: value }
      }));
    }
  };

  // 変更を保存
  const savePlayerEdit = () => {
    if (!editFormData || !editingPlayer) {
      console.error('編集データが見つかりません');
      return;
    }

    console.log('保存中:', editFormData.name, editFormData);

    // TEAMS_DATAを更新
    const playerIndex = window.TEAMS_DATA[editingTeam].players.findIndex(p => p.id === editingPlayer.id);
    if (playerIndex !== -1) {
      window.TEAMS_DATA[editingTeam].players[playerIndex] = editFormData;
      console.log(`✅ ${editFormData.name}の能力値を更新しました (インデックス: ${playerIndex})`);
      console.log('更新後のデータ:', window.TEAMS_DATA[editingTeam].players[playerIndex]);

      // 画面を更新するため、state を変更
      cancelEdit();

      // 強制的に再レンダリングをトリガー
      alert(`${editFormData.name}の能力値を保存しました！\n\n変更内容はTEAMS_DATAに反映されています。`);
    } else {
      console.error('選手が見つかりません:', editingPlayer.id);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-white">エディット画面（開発用）</h1>

      {/* チーム選択 */}
      <div className="mb-6 flex gap-4">
        {['チームA', 'チームB', 'チームC', 'チームD'].map((teamName) => (
          <button
            key={teamName}
            onClick={() => setEditingTeam(teamName)}
            className={`px-6 py-3 rounded font-bold transition ${
              editingTeam === teamName
                ? `${teamColors[teamName]} text-white`
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {teamName}
          </button>
        ))}
      </div>

      {/* チーム情報 */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-white">チーム情報</h2>
        <div className="text-white">
          <div className="mb-2">チーム名: <span className="font-bold">{team.name}</span></div>
          <div className="text-sm text-gray-400">選手数: {team.players.length}人</div>
        </div>

        {/* AIオーダー編成ボタン */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => {
              generateOptimalLineup(editingTeam);
              generatePitchingRotation(editingTeam);
              alert(`${editingTeam}のAIオーダー編成と投手ローテーションを設定しました！\n\nページをリロードすると反映されます。`);
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-bold transition"
          >
            🤖 AIオーダー編成
          </button>
          <button
            onClick={() => {
              generateAllTeamsLineup();
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold transition"
          >
            🤖 全チーム一括編成
          </button>
        </div>
      </div>

      {/* 選手一覧 */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-white">選手一覧（{team.players.length}人）</h2>
        <div className="text-sm text-blue-400 mb-4">💡 選手カードをクリックして能力値を編集できます</div>

        {team.players.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            選手データがありません。ページをリロードしてください。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {team.players.map((player) => (
              <div
                key={player.id}
                className="bg-gray-700 rounded p-4 cursor-pointer hover:bg-gray-600 transition"
                onClick={() => startEditPlayer(player)}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-white">{player.name}</span>
                  <span className="text-xs text-gray-400">#{player.number || player.id}</span>
                </div>
                <div className="text-sm text-gray-300">
                  <div>ポジション: {POSITION_NAMES[player.position] || player.position}</div>
                  <div>打: {player.batting?.meet || 0} / 力: {player.batting?.power || 0}</div>
                  {player.pitching && <div>球速: {player.pitching.velocity}km/h</div>}
                </div>
                <div className="text-xs text-blue-400 mt-2">クリックして編集</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 選手編集モーダル */}
      {editingPlayer && editFormData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">{editFormData.name} の能力値編集</h2>
              <button
                onClick={cancelEdit}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 打撃能力 */}
              <div className="bg-gray-700 rounded p-4">
                <h3 className="text-lg font-bold text-white mb-4">打撃能力</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">ミート (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.batting?.meet || 0}
                      onChange={(e) => updateAbility('batting', 'meet', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">パワー (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.batting?.power || 0}
                      onChange={(e) => updateAbility('batting', 'power', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">選球眼 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.batting?.eye || 0}
                      onChange={(e) => updateAbility('batting', 'eye', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">打席</label>
                    <select
                      value={editFormData.batting?.bats || 'right'}
                      onChange={(e) => updateHand('batting', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    >
                      <option value="right">右打ち</option>
                      <option value="left">左打ち</option>
                      <option value="switch">スイッチ</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">盗塁 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.batting?.steal || 0}
                      onChange={(e) => updateAbility('batting', 'steal', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* 身体能力 */}
              <div className="bg-gray-700 rounded p-4">
                <h3 className="text-lg font-bold text-white mb-4">身体能力</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">走力 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.physical?.speed || 0}
                      onChange={(e) => updateAbility('physical', 'speed', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">肩力 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.physical?.arm || 0}
                      onChange={(e) => updateAbility('physical', 'arm', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">投げ手</label>
                    <select
                      value={editFormData.physical?.throws || 'right'}
                      onChange={(e) => updateHand('physical', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    >
                      <option value="right">右投げ</option>
                      <option value="left">左投げ</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 守備能力 */}
              <div className="bg-gray-700 rounded p-4">
                <h3 className="text-lg font-bold text-white mb-4">守備能力</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">守備力 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.fielding?.defense || 0}
                      onChange={(e) => updateAbility('fielding', 'defense', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* 守備位置適正 */}
              <div className="bg-gray-700 rounded p-4 md:col-span-2">
                <h3 className="text-lg font-bold text-white mb-4">守備位置適正 (0-100)</h3>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  {[
                    { key: 'pitcher', label: '投手' },
                    { key: 'catcher', label: '捕手' },
                    { key: 'first', label: '一塁' },
                    { key: 'second', label: '二塁' },
                    { key: 'third', label: '三塁' },
                    { key: 'short', label: '遊撃' },
                    { key: 'left', label: '左翼' },
                    { key: 'center', label: '中堅' },
                    { key: 'right', label: '右翼' }
                  ].map(pos => (
                    <div key={pos.key}>
                      <label className="block text-xs text-gray-300 mb-1">{pos.label}</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editFormData.positionFitness?.[pos.key] || 0}
                        onChange={(e) => {
                          const numValue = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                          setEditFormData(prev => ({
                            ...prev,
                            positionFitness: {
                              ...prev.positionFitness,
                              [pos.key]: numValue
                            }
                          }));
                        }}
                        className="w-full bg-gray-600 text-white px-2 py-1 rounded text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 捕手能力 */}
              <div className="bg-gray-700 rounded p-4">
                <h3 className="text-lg font-bold text-white mb-4">捕手能力</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">リード (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.catching?.lead || 0}
                      onChange={(e) => updateAbility('catching', 'lead', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* 投手能力 */}
              <div className="bg-gray-700 rounded p-4 md:col-span-2">
                <h3 className="text-lg font-bold text-white mb-4">投手能力</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">球速 (km/h)</label>
                    <input
                      type="number"
                      min="80"
                      max="170"
                      value={editFormData.pitching?.velocity || 0}
                      onChange={(e) => {
                        const numValue = Math.max(80, Math.min(170, parseInt(e.target.value) || 0));
                        setEditFormData(prev => ({
                          ...prev,
                          pitching: { ...prev.pitching, velocity: numValue }
                        }));
                      }}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">制球力 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.pitching?.control || 0}
                      onChange={(e) => updateAbility('pitching', 'control', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">スタミナ (0-200)</label>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={editFormData.pitching?.stamina || 0}
                      onChange={(e) => {
                        const numValue = Math.max(0, Math.min(200, parseInt(e.target.value) || 0));
                        setEditFormData(prev => ({
                          ...prev,
                          pitching: { ...prev.pitching, stamina: numValue }
                        }));
                      }}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">投球フォーム</label>
                    <select
                      value={editFormData.pitching?.form || 'threeQuarter'}
                      onChange={(e) => updatePitchingForm(e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    >
                      <option value="overhand">オーバースロー</option>
                      <option value="threeQuarter">スリークォーター</option>
                      <option value="sidearm">サイドスロー</option>
                      <option value="submarine">アンダースロー</option>
                    </select>
                  </div>
                </div>

                {/* 変化球 */}
                <h4 className="text-md font-bold text-white mb-3 mt-4">変化球</h4>
                <div className="space-y-3">
                  {[1, 2, 3].map((num) => {
                    const ballKey = `breaking${num}`;
                    const ballData = editFormData.pitching?.[ballKey] || { type: 'slider', level: 0 };
                    return (
                      <div key={num} className="grid grid-cols-2 gap-3 bg-gray-600 p-3 rounded">
                        <div>
                          <label className="block text-xs text-gray-300 mb-1">変化球{num} タイプ</label>
                          <select
                            value={ballData.type || 'slider'}
                            onChange={(e) => {
                              setEditFormData(prev => ({
                                ...prev,
                                pitching: {
                                  ...prev.pitching,
                                  [ballKey]: { ...ballData, type: e.target.value }
                                }
                              }));
                            }}
                            className="w-full bg-gray-700 text-white px-2 py-1 rounded text-sm"
                          >
                            <option value="slider">スライダー</option>
                            <option value="curve">カーブ</option>
                            <option value="fork">フォーク</option>
                            <option value="sinker">シンカー</option>
                            <option value="cutter">カッター</option>
                            <option value="changeup">チェンジアップ</option>
                            <option value="shoot">シュート</option>
                            <option value="slurve">スラーブ</option>
                            <option value="screwball">スクリューボール</option>
                            <option value="sweeper">スイーパー</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-300 mb-1">変化量 (0-100)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={ballData.level || 0}
                            onChange={(e) => {
                              const numValue = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                              setEditFormData(prev => ({
                                ...prev,
                                pitching: {
                                  ...prev.pitching,
                                  [ballKey]: { ...ballData, level: numValue }
                                }
                              }));
                            }}
                            className="w-full bg-gray-700 text-white px-2 py-1 rounded text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 保存・キャンセルボタン */}
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={cancelEdit}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition"
              >
                キャンセル
              </button>
              <button
                onClick={savePlayerEdit}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
