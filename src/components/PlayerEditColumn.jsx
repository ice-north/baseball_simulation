import React from 'react';
import { BALL_EFFECTS, PITCHING_FORM_EFFECTS } from '../utils/constants.js';

/**
 * デバッグ用エディット画面の1チーム分の列。
 * ⚠ かつて App.jsx の RENDER にアウェイ用とホーム用が **264行ずつ** 書かれており、
 *    正規化して比べると 262行が同一（違うのはヘッダーの絵文字と色だけ）だった。
 * ⚠ その状態で本物の不具合が1つ潜んでいた。両方の列が
 *      const teamSetter = awayTeam.players.find(p => p.id === player.id) ? setAwayTeam : setHomeTeam;
 *    と **アウェイ側から setter を引いて** おり、`id` はチーム内でしか一意でない
 *    （`generateExpansionRoster` をチームごとに呼ぶので同じ id 列が再生成される。
 *     自リーグ4チーム間で実測157件の衝突がある）ため、
 *    **ホーム選手の名前・フォームを編集するとアウェイの同じ id の選手が書き換わる**
 *    ことがあった。列ごとに `setTeam` を受け取る形にして解消してある。
 *    **id で選手を引き当てる書き方をここに戻さないこと。**
 */
export const PlayerEditColumn = ({ team, setTeam, icon, titleColor }) => (

  <div>
  <h3 className={`text-xl font-bold ${titleColor} mb-4`}>{icon} {team.name}</h3>
  <div className="space-y-6">
    {team.players.map(player => (
      <div key={player.id} className="bg-surface-2 p-3 rounded-lg border border-gray-700/50">
        <div className="mb-3">
          <label className="block text-xs text-gray-300 mb-1">選手名</label>
          <input
            type="text"
            value={player.name}
            onChange={(e) => {
              const newValue = e.target.value;
              const teamSetter = setTeam;
              teamSetter(prev => ({
                ...prev,
                players: prev.players.map(p =>
                  p.id === player.id ? { ...p, name: newValue } : p
                )
              }));
            }}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm"
          />
        </div>
        <div className="space-y-2">
          {/* 打撃能力 */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">ミート: <span className="font-bold text-blue-400">{player.batting.meet}</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={player.batting.meet}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setTeam(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, batting: { ...p.batting, meet: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">パワー: <span className="font-bold text-blue-400">{player.batting.power}</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={player.batting.power}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setTeam(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, batting: { ...p.batting, power: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">選球眼: <span className="font-bold text-blue-400">{player.batting.eye}</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={player.batting.eye}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setTeam(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, batting: { ...p.batting, eye: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">走力: <span className="font-bold text-blue-400">{player.physical.speed}</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={player.physical.speed}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setTeam(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, physical: { ...p.physical, speed: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full"
            />
          </div>
          {/* 守備能力 */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">守備: <span className="font-bold text-green-400">{player.fielding.defense}</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={player.fielding.defense}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setTeam(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, fielding: { ...p.fielding, defense: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">肩: <span className="font-bold text-green-400">{player.physical.arm}</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={player.physical.arm}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setTeam(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, physical: { ...p.physical, arm: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full"
            />
          </div>
          {/* 投手能力（全選手） */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">球速: <span className="font-bold text-red-400">{player.pitching.velocity}km/h</span></label>
            <input
              type="range"
              min="100"
              max="170"
              value={player.pitching.velocity}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setTeam(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, pitching: { ...p.pitching, velocity: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full h-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">制球: <span className="font-bold text-red-400">{player.pitching.control}</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={player.pitching.control}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setTeam(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, pitching: { ...p.pitching, control: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full h-2"
            />
          </div>
          {/* 投球フォーム */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">投球フォーム: <span className="font-bold text-orange-400">{PITCHING_FORM_EFFECTS[player.pitching.form]?.name || player.pitching.form}</span></label>
            <select
              value={player.pitching.form}
              onChange={(e) => {
                const newValue = e.target.value;
                const teamSetter = setTeam;
                teamSetter(prev => ({
                  ...prev,
                  players: prev.players.map(p =>
                    p.id === player.id
                      ? { ...p, pitching: { ...p.pitching, form: newValue } }
                      : p
                  )
                }));
              }}
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm"
            >
              <option value="overhand">オーバースロー</option>
              <option value="threeQuarter">スリークォーター</option>
              <option value="sidearm">サイドスロー</option>
              <option value="submarine">アンダースロー</option>
            </select>
          </div>
          {/* 変化球 */}
          <div className="mt-2 pt-2 border-t border-gray-300">
            <label className="block text-sm font-semibold text-gray-700 mb-2">変化球</label>
            {player.pitching.arsenal.map((ball) => (
              <div key={ball.id} className="mb-2">
                <label className="block text-xs text-gray-300 mb-1">
                  {BALL_EFFECTS[ball.type]?.name || ball.type}: <span className="font-bold text-purple-600">{ball.level}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={ball.level}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value);
                    setTeam(prev => ({
                      ...prev,
                      players: prev.players.map(p =>
                        p.id === player.id
                          ? {
                              ...p,
                              pitching: {
                                ...p.pitching,
                                arsenal: p.pitching.arsenal.map(b =>
                                  b.id === ball.id ? { ...b, level: newValue } : b
                                )
                              }
                            }
                          : p
                      )
                    }));
                  }}
                  className="w-full h-2"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    ))}
  </div>
  </div>
);
