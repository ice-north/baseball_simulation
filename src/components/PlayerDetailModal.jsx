import { useState } from 'react';
import { POSITION_NAMES, BALL_EFFECTS, PITCHING_FORM_EFFECTS, getAbilityColor } from '../utils/constants.js';
import { formatInnings } from '../utils/physics.js';

export default function PlayerDetailModal({ player, onClose }) {
  const [detailTab, setDetailTab] = useState('ability');

  if (!player) return null;

  const isPitcher = player.position === 'pitcher';
  const batting = player.seasonStats?.batting || {};
  const pitching = player.seasonStats?.pitching || {};
  const careerBase = isPitcher ? player.careerStats?.pitching : player.careerStats?.batting;
  const seasonCurrent = isPitcher ? pitching : batting;
  const career = careerBase ? Object.fromEntries(
    Object.keys(careerBase).map(key => [key, (careerBase[key] || 0) + (seasonCurrent[key] || 0)])
  ) : null;
  const arsenal = player.pitching?.arsenal || [];
  const formName = PITCHING_FORM_EFFECTS[player.pitching?.form]?.name || player.pitching?.form || '-';
  const catcherLead = player.catching?.lead;
  const positionFit = player.positionFitness || {};

  const StatBar = ({ label, value, max = 99 }) => (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs text-gray-400 w-12">{label}</span>
      <div className="flex-1 bg-gray-700 rounded h-3">
        <div className={`h-3 rounded ${value >= 80 ? 'bg-red-500' : value >= 60 ? 'bg-yellow-500' : value >= 40 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      <span className={`text-sm font-bold w-8 text-right ${getAbilityColor(value)}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 max-w-5xl w-full mx-4 h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold text-white">{player.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-sm text-gray-300 mb-4 flex-shrink-0">
          <div>守備: <span className="text-white">{POSITION_NAMES[player.position] || player.position}</span></div>
          <div>年齢: <span className="text-white">{player.age || '?'}歳</span></div>
          <div>投: <span className="text-white">{player.physical?.throws === 'left' ? '左' : '右'}</span></div>
          <div>打: <span className="text-white">{player.batting?.bats === 'left' ? '左' : player.batting?.bats === 'switch' ? '両' : '右'}</span></div>
          {(player.universityTeamName || player.universityName) && (
            <div className="col-span-2">出身: <span className="text-blue-300">{player.universityTeamName || player.universityName}</span></div>
          )}
        </div>

        {/* 経歴 */}
        {(() => {
          const history = player.careerHistory || [];
          const steps = [];
          if (history.length > 0) {
            history.forEach(h => steps.push({ label: h.label, type: h.type }));
          } else {
            const uniName = player.universityTeamName || player.universityName;
            if (uniName) {
              steps.push({ label: player.highSchool?.name || '高校卒', type: 'highschool' });
              steps.push({ label: uniName, type: 'university' });
            }
            if (player.previousTeam) steps.push({ label: player.previousTeam, type: 'corporate' });
          }
          // highschoolステップのラベルをplayer.highSchool.nameで上書き（古いデータ対応）
          const hsName = player.highSchool?.name;
          if (hsName) {
            steps.forEach(s => { if (s.type === 'highschool') s.label = hsName; });
          }
          // careerHistoryに大学ステップがなくても、player.universityTeamNameがあれば挿入
          const uniName = player.universityTeamName || player.universityName;
          if (uniName && !steps.some(s => s.type === 'university')) {
            let insertIdx = 0;
            for (let i = steps.length - 1; i >= 0; i--) {
              if (steps[i].type === 'highschool') { insertIdx = i + 1; break; }
            }
            steps.splice(insertIdx, 0, { label: uniName, type: 'university' });
          }
          if (player.draftInfo) {
            steps.push({ label: `${player.draftInfo.year}年目 ${player.draftInfo.round}巡目入団`, type: 'draft' });
          }
          if (steps.length === 0) return null;
          const typeColor = { highschool: 'bg-gray-600', university: 'bg-blue-900/60 text-blue-300', corporate: 'bg-green-900/60 text-green-300', independent: 'bg-orange-900/60 text-orange-300', released: 'bg-red-900/60 text-red-300', draft: 'bg-yellow-900/60 text-yellow-300' };
          return (
            <div className="flex items-center gap-1 text-sm mb-4 flex-wrap flex-shrink-0">
              {steps.map((s, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-600 mx-0.5">&rarr;</span>}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[s.type] || 'bg-gray-700 text-gray-200'}`}>{s.label}</span>
                </span>
              ))}
            </div>
          );
        })()}

        {/* タブ切り替え */}
        <div className="flex gap-1 mb-4 border-b border-gray-600 flex-shrink-0">
          {['ability', 'stats', 'abilityHistory'].map(tab => (
            <button key={tab}
              className={`px-4 py-2 text-sm font-bold rounded-t transition ${detailTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              onClick={() => setDetailTab(tab)}
            >
              {tab === 'ability' ? '能力' : tab === 'stats' ? '年度別成績' : '年度別能力値'}
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {detailTab === 'ability' && (<>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* フィジカル系 */}
              <div className="bg-gray-700 rounded p-3">
                <h3 className="text-sm font-bold text-blue-300 mb-2">フィジカル系</h3>
                <StatBar label="走力" value={player.physical?.speed || 0} />
                <StatBar label="肩力" value={player.physical?.arm || 0} />
                <div className="border-t border-gray-600 mt-2 pt-2">
                  <StatBar label="体力" value={player.physical?.bodyStamina || 50} />
                  <StatBar label="回復" value={player.physical?.recovery || 50} />
                </div>
                <div className="border-t border-gray-600 mt-2 pt-2">
                  <StatBar label="体幹" value={player.physical?.muscle ?? 50} />
                  <StatBar label="器用さ" value={player.physical?.dexterity ?? 50} />
                </div>
                <div className="border-t border-gray-600 mt-2 pt-2 text-xs text-gray-400 space-y-1">
                  <div>体格: <span className="text-white">{player.physical?.build === 'large' ? '大柄' : player.physical?.build === 'small' ? '小柄' : '中肉'}</span></div>
                  <div>成長: <span className={`font-bold ${(player.growthPotential ?? 1.0) >= 1.1 ? 'text-orange-400' : 'text-white'}`}>
                    {Math.max(0.3, Math.min(1.8, (player.growthPotential ?? 1.0) + (player.growthModifier || 0))).toFixed(2)}
                  </span></div>
                </div>
              </div>

              {/* 技術系 */}
              <div className="bg-gray-700 rounded p-3">
                <h3 className="text-sm font-bold text-green-300 mb-2">技術系</h3>
                {player.batting && (<>
                  <div className="text-xs text-gray-500 mb-1">打撃・走塁</div>
                  <StatBar label="ミート" value={player.batting?.meet || 0} />
                  <StatBar label="パワー" value={player.batting?.power || 0} />
                  <StatBar label="選球眼" value={player.batting?.eye || 0} />
                  <StatBar label="盗塁" value={player.batting?.steal || 0} />
                  <StatBar label="バント" value={player.batting?.bunt || 0} />
                </>)}
                <div className={player.batting ? 'border-t border-gray-600 mt-2 pt-2' : ''}>
                  <div className="text-xs text-gray-500 mb-1">守備</div>
                  <StatBar label="守備" value={player.fielding?.defense || 0} />
                  {catcherLead !== undefined && <StatBar label="リード" value={catcherLead} />}
                </div>
              </div>

              {/* 精神系 + 投球系 */}
              <div className="bg-gray-700 rounded p-3">
                <h3 className="text-sm font-bold text-yellow-300 mb-2">精神系</h3>
                <StatBar label="プロ意識" value={player.personality?.discipline || 50} />
                <StatBar label="精神力" value={player.personality?.mental || 50} />
                {player.pitching && (<>
                  <div className="border-t border-gray-600 mt-3 pt-2">
                    <h3 className="text-sm font-bold text-red-300 mb-2">投球系</h3>
                    <StatBar label="球速" value={player.pitching?.velocity || 0} max={165} />
                    <StatBar label="制球" value={player.pitching?.control || 0} />
                    <StatBar label="スタミナ" value={player.pitching?.stamina || 0} />
                    <StatBar label="回転" value={player.pitching?.spinRate ?? 50} />
                    <div className="mt-2 text-xs text-gray-400">
                      フォーム: <span className="text-white">{formName}</span>
                    </div>
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">変化球</div>
                      {arsenal.filter(p => p.type !== 'straight').length > 0
                        ? arsenal.filter(p => p.type !== 'straight').map((pitch, i) => (
                          <div key={i} className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-white w-20">{BALL_EFFECTS[pitch.type]?.name || pitch.type}</span>
                            <div className="flex-1 bg-gray-600 rounded h-2">
                              <div className="h-2 rounded bg-purple-500" style={{ width: `${pitch.level}%` }} />
                            </div>
                            <span className={`text-xs font-bold ${getAbilityColor(pitch.level)}`}>{pitch.level}</span>
                          </div>
                        ))
                        : <div className="text-xs text-gray-500">なし</div>
                      }
                    </div>
                  </div>
                </>)}
              </div>
            </div>

            {/* ポジション適性 */}
            <div className="bg-gray-700 rounded p-3 mb-4">
              <h3 className="text-sm font-bold text-white mb-2">ポジション適性</h3>
              <div className="grid grid-cols-3 gap-1">
                {['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'].map(pos => (
                  <div key={pos} className="flex items-center gap-1">
                    <span className="text-xs text-gray-400 w-8">{POSITION_NAMES[pos]?.slice(0, 2) || pos}</span>
                    <div className="flex-1 bg-gray-600 rounded h-2">
                      <div className={`h-2 rounded ${(positionFit[pos] || 0) >= 80 ? 'bg-red-500' : (positionFit[pos] || 0) >= 50 ? 'bg-yellow-500' : 'bg-gray-500'}`}
                        style={{ width: `${positionFit[pos] || 0}%` }} />
                    </div>
                    <span className={`text-xs w-6 text-right ${getAbilityColor(positionFit[pos] || 0)}`}>{positionFit[pos] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </>)}

          {/* 年度別成績タブ */}
          {detailTab === 'stats' && (() => {
            const history = player.statsHistory || [];
            if (history.length === 0 && (!batting.games && !pitching.games)) {
              return <div className="text-gray-400 text-sm text-center py-8">まだシーズン成績がありません</div>;
            }
            return isPitcher ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="px-2 py-1 text-left">年</th>
                      <th className="px-2 py-1 text-center">試</th>
                      <th className="px-2 py-1 text-center">勝</th>
                      <th className="px-2 py-1 text-center">敗</th>
                      <th className="px-2 py-1 text-center">S</th>
                      <th className="px-2 py-1 text-center">H</th>
                      <th className="px-2 py-1 text-center">回</th>
                      <th className="px-2 py-1 text-center">防御率</th>
                      <th className="px-2 py-1 text-center">奪三振</th>
                      <th className="px-2 py-1 text-center">与四球</th>
                      <th className="px-2 py-1 text-center">失点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const p = h.pitching || {};
                      const era = p.inningsPitched > 0 ? ((p.earnedRuns * 27) / p.inningsPitched).toFixed(2) : '-.--';
                      return (
                        <tr key={i} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="px-2 py-1 text-white font-bold">{h.year}年目</td>
                          <td className="px-2 py-1 text-center">{p.games || 0}</td>
                          <td className="px-2 py-1 text-center">{p.wins || 0}</td>
                          <td className="px-2 py-1 text-center">{p.losses || 0}</td>
                          <td className="px-2 py-1 text-center">{p.saves || 0}</td>
                          <td className="px-2 py-1 text-center">{p.holds || 0}</td>
                          <td className="px-2 py-1 text-center">{p.inningsPitched > 0 ? formatInnings(p.inningsPitched) : '0'}</td>
                          <td className="px-2 py-1 text-center text-yellow-400">{era}</td>
                          <td className="px-2 py-1 text-center">{p.strikeouts || 0}</td>
                          <td className="px-2 py-1 text-center">{p.walks || 0}</td>
                          <td className="px-2 py-1 text-center">{p.runsAllowed || 0}</td>
                        </tr>
                      );
                    })}
                    {pitching.games > 0 && (
                      <tr className="border-b border-gray-700 bg-gray-800 hover:bg-gray-700">
                        <td className="px-2 py-1 text-cyan-400 font-bold">今季</td>
                        <td className="px-2 py-1 text-center">{pitching.games || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.wins || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.losses || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.saves || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.holds || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.inningsPitched > 0 ? formatInnings(pitching.inningsPitched) : '0'}</td>
                        <td className="px-2 py-1 text-center text-yellow-400">{pitching.inningsPitched > 0 ? ((pitching.earnedRuns * 27) / pitching.inningsPitched).toFixed(2) : '-.--'}</td>
                        <td className="px-2 py-1 text-center">{pitching.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.walks || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.runsAllowed || 0}</td>
                      </tr>
                    )}
                    {career && (
                      <tr className="border-t-2 border-gray-500 font-bold text-white">
                        <td className="px-2 py-1">通算</td>
                        <td className="px-2 py-1 text-center">{career.games || 0}</td>
                        <td className="px-2 py-1 text-center">{career.wins || 0}</td>
                        <td className="px-2 py-1 text-center">{career.losses || 0}</td>
                        <td className="px-2 py-1 text-center">{career.saves || 0}</td>
                        <td className="px-2 py-1 text-center">{career.holds || 0}</td>
                        <td className="px-2 py-1 text-center">{career.inningsPitched > 0 ? formatInnings(career.inningsPitched) : '0'}</td>
                        <td className="px-2 py-1 text-center text-yellow-400">{career.inningsPitched > 0 ? ((career.earnedRuns * 27) / career.inningsPitched).toFixed(2) : '-.--'}</td>
                        <td className="px-2 py-1 text-center">{career.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-center">{career.walks || 0}</td>
                        <td className="px-2 py-1 text-center">{career.runsAllowed || 0}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="px-2 py-1 text-left">年</th>
                      <th className="px-2 py-1 text-center">試</th>
                      <th className="px-2 py-1 text-center">打率</th>
                      <th className="px-2 py-1 text-center">打席</th>
                      <th className="px-2 py-1 text-center">安打</th>
                      <th className="px-2 py-1 text-center">二塁打</th>
                      <th className="px-2 py-1 text-center">三塁打</th>
                      <th className="px-2 py-1 text-center">HR</th>
                      <th className="px-2 py-1 text-center">打点</th>
                      <th className="px-2 py-1 text-center">盗塁</th>
                      <th className="px-2 py-1 text-center">四球</th>
                      <th className="px-2 py-1 text-center">三振</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const b = h.batting || {};
                      const avg = b.atBats > 0 ? (b.hits / b.atBats).toFixed(3) : '.000';
                      return (
                        <tr key={i} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="px-2 py-1 text-white font-bold">{h.year}年目</td>
                          <td className="px-2 py-1 text-center">{b.games || 0}</td>
                          <td className="px-2 py-1 text-center text-yellow-400">{avg}</td>
                          <td className="px-2 py-1 text-center">{b.atBats || 0}</td>
                          <td className="px-2 py-1 text-center">{b.hits || 0}</td>
                          <td className="px-2 py-1 text-center">{b.doubles || 0}</td>
                          <td className="px-2 py-1 text-center">{b.triples || 0}</td>
                          <td className="px-2 py-1 text-center">{b.homeruns || 0}</td>
                          <td className="px-2 py-1 text-center">{b.rbis || 0}</td>
                          <td className="px-2 py-1 text-center">{b.stolenBases || 0}</td>
                          <td className="px-2 py-1 text-center">{b.walks || 0}</td>
                          <td className="px-2 py-1 text-center">{b.strikeouts || 0}</td>
                        </tr>
                      );
                    })}
                    {batting.games > 0 && (
                      <tr className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="px-2 py-1 text-cyan-400 font-bold">今季</td>
                        <td className="px-2 py-1 text-center">{batting.games || 0}</td>
                        <td className="px-2 py-1 text-center text-yellow-400">{batting.atBats > 0 ? (batting.hits / batting.atBats).toFixed(3) : '.000'}</td>
                        <td className="px-2 py-1 text-center">{batting.atBats || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.hits || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.doubles || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.triples || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.homeruns || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.rbis || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.stolenBases || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.walks || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.strikeouts || 0}</td>
                      </tr>
                    )}
                    {career && (
                      <tr className="border-t-2 border-gray-500 font-bold text-white">
                        <td className="px-2 py-1">通算</td>
                        <td className="px-2 py-1 text-center">{career.games || 0}</td>
                        <td className="px-2 py-1 text-center text-yellow-400">{career.atBats > 0 ? (career.hits / career.atBats).toFixed(3) : '.000'}</td>
                        <td className="px-2 py-1 text-center">{career.atBats || 0}</td>
                        <td className="px-2 py-1 text-center">{career.hits || 0}</td>
                        <td className="px-2 py-1 text-center">{career.doubles || 0}</td>
                        <td className="px-2 py-1 text-center">{career.triples || 0}</td>
                        <td className="px-2 py-1 text-center">{career.homeruns || 0}</td>
                        <td className="px-2 py-1 text-center">{career.rbis || 0}</td>
                        <td className="px-2 py-1 text-center">{career.stolenBases || 0}</td>
                        <td className="px-2 py-1 text-center">{career.walks || 0}</td>
                        <td className="px-2 py-1 text-center">{career.strikeouts || 0}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 年度別能力値タブ */}
          {detailTab === 'abilityHistory' && (() => {
            const history = player.statsHistory || [];
            const hasAbilityData = history.some(h => h.abilities);
            if (!hasAbilityData) {
              return <div className="text-gray-400 text-sm text-center py-8">まだ能力値の履歴がありません（Year2以降に記録されます）</div>;
            }
            const entriesWithAbilities = history.filter(h => h.abilities);
            return isPitcher ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="px-2 py-1 text-left">年</th>
                      <th className="px-2 py-1 text-center">年齢</th>
                      <th className="px-2 py-1 text-center">球速</th>
                      <th className="px-2 py-1 text-center">制球</th>
                      <th className="px-2 py-1 text-center">スタミナ</th>
                      <th className="px-2 py-1 text-center">ミート</th>
                      <th className="px-2 py-1 text-center">パワー</th>
                      <th className="px-2 py-1 text-center">走力</th>
                      <th className="px-2 py-1 text-center">守備</th>
                      <th className="px-2 py-1 text-left pl-4">変化球</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entriesWithAbilities.map((h, i) => {
                      const a = h.abilities;
                      const prevA = i > 0 ? entriesWithAbilities[i - 1].abilities : null;
                      const diff = (cur, prev, key) => {
                        if (!prev) return '';
                        const d = cur[key] - prev[key];
                        if (d > 0) return <span className="text-green-400 text-[10px] ml-0.5">+{d}</span>;
                        if (d < 0) return <span className="text-red-400 text-[10px] ml-0.5">{d}</span>;
                        return '';
                      };
                      const arsenalStr = (a.arsenal || []).filter(p => p.type !== 'straight').map(p => {
                        const name = BALL_EFFECTS[p.type]?.name || p.type;
                        return `${name}${p.level}`;
                      }).join(', ');
                      return (
                        <tr key={i} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="px-2 py-1 text-white font-bold">{i + 1}年目</td>
                          <td className="px-2 py-1 text-center">{a.age}歳</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.velocity)}>{a.velocity}</span>{diff(a, prevA, 'velocity')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.control)}>{a.control}</span>{diff(a, prevA, 'control')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.stamina)}>{a.stamina}</span>{diff(a, prevA, 'stamina')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.meet)}>{a.meet}</span>{diff(a, prevA, 'meet')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.power)}>{a.power}</span>{diff(a, prevA, 'power')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.speed)}>{a.speed}</span>{diff(a, prevA, 'speed')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.defense)}>{a.defense}</span>{diff(a, prevA, 'defense')}</td>
                          <td className="px-2 py-1 text-left pl-4 text-[10px]">{arsenalStr || '-'}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-gray-500 font-bold">
                      <td className="px-2 py-1 text-cyan-400">現在</td>
                      <td className="px-2 py-1 text-center text-white">{player.age}歳</td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.pitching?.velocity || 0)}>{player.pitching?.velocity || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.pitching?.control || 0)}>{player.pitching?.control || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.pitching?.stamina || 0)}>{player.pitching?.stamina || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.meet || 0)}>{player.batting?.meet || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.power || 0)}>{player.batting?.power || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.physical?.speed || 0)}>{player.physical?.speed || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.fielding?.defense || 0)}>{player.fielding?.defense || 0}</span></td>
                      <td className="px-2 py-1 text-left pl-4 text-[10px]">{(player.pitching?.arsenal || []).filter(p => p.type !== 'straight').map(p => `${BALL_EFFECTS[p.type]?.name || p.type}${p.level}`).join(', ') || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="px-2 py-1 text-left">年</th>
                      <th className="px-2 py-1 text-center">年齢</th>
                      <th className="px-2 py-1 text-center">ミート</th>
                      <th className="px-2 py-1 text-center">パワー</th>
                      <th className="px-2 py-1 text-center">走力</th>
                      <th className="px-2 py-1 text-center">肩力</th>
                      <th className="px-2 py-1 text-center">守備</th>
                      <th className="px-2 py-1 text-center">選球眼</th>
                      <th className="px-2 py-1 text-center">盗塁</th>
                      {player.catching?.lead !== undefined && <th className="px-2 py-1 text-center">リード</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entriesWithAbilities.map((h, i) => {
                      const a = h.abilities;
                      const prevA = i > 0 ? entriesWithAbilities[i - 1].abilities : null;
                      const diff = (cur, prev, key) => {
                        if (!prev) return '';
                        const d = cur[key] - prev[key];
                        if (d > 0) return <span className="text-green-400 text-[10px] ml-0.5">+{d}</span>;
                        if (d < 0) return <span className="text-red-400 text-[10px] ml-0.5">{d}</span>;
                        return '';
                      };
                      return (
                        <tr key={i} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="px-2 py-1 text-white font-bold">{i + 1}年目</td>
                          <td className="px-2 py-1 text-center">{a.age}歳</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.meet)}>{a.meet}</span>{diff(a, prevA, 'meet')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.power)}>{a.power}</span>{diff(a, prevA, 'power')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.speed)}>{a.speed}</span>{diff(a, prevA, 'speed')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.arm)}>{a.arm}</span>{diff(a, prevA, 'arm')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.defense)}>{a.defense}</span>{diff(a, prevA, 'defense')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.eye)}>{a.eye}</span>{diff(a, prevA, 'eye')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.steal)}>{a.steal}</span>{diff(a, prevA, 'steal')}</td>
                          {a.catcherLead !== undefined && <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.catcherLead)}>{a.catcherLead}</span>{diff(a, prevA, 'catcherLead')}</td>}
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-gray-500 font-bold">
                      <td className="px-2 py-1 text-cyan-400">現在</td>
                      <td className="px-2 py-1 text-center text-white">{player.age}歳</td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.meet || 0)}>{player.batting?.meet || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.power || 0)}>{player.batting?.power || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.physical?.speed || 0)}>{player.physical?.speed || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.physical?.arm || 0)}>{player.physical?.arm || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.fielding?.defense || 0)}>{player.fielding?.defense || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.eye || 0)}>{player.batting?.eye || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.steal || 0)}>{player.batting?.steal || 0}</span></td>
                      {player.catching?.lead !== undefined && <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.catching?.lead || 0)}>{player.catching?.lead || 0}</span></td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

        </div>{/* end タブコンテンツ */}
      </div>
    </div>
  );
}
