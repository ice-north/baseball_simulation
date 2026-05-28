import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { STAFF_ABILITIES, STAFF_ROLE_PROFILES, STAFF_GRADES, getStaffSalary, generateStaffMarket, getTeamStaffBonus } from '../corporate/staffData.js';
import { getReputationScoutBonus, getReputationRecruitBonus, getReputationBudgetBonus } from '../corporate/corporateInit.js';
import { getAbilityColor, POSITION_NAMES } from '../utils/constants.js';
import { universityPool } from '../season/universityPool.js';
import { releasedPlayersPool } from '../teams-data.js';
import { dispatchScout, SCOUT_TARGETS, investigatePlayer } from '../corporate/scoutingSystem.js';

const CorporateManagementScreen = ({ seasonData, gameMode }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const teamData = TEAMS_DATA[userTeamName];
  const cd = teamData?.corporateData;

  const [tab, setTab] = useState('staff');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [marketStaff, setMarketStaff] = useState(null);
  const [confirmHire, setConfirmHire] = useState(null);
  const [confirmFire, setConfirmFire] = useState(null);
  const [dispatchMessage, setDispatchMessage] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [dispatchTarget, setDispatchTarget] = useState(null); // 派遣先選択中
  const [, setRefreshTick] = useState(0);

  if (!cd) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">チーム運営</h1>
        <p className="text-gray-400">社会人モードでのみ利用可能です。</p>
      </div>
    );
  }

  const staff = cd.staff || [];
  const staffBonus = getTeamStaffBonus(staff);
  const totalSalary = staff.reduce((sum, s) => sum + getStaffSalary(s), 0);

  const gradeColor = (grade) => {
    const colors = { S: 'text-red-400', A: 'text-orange-400', B: 'text-yellow-400', C: 'text-green-400', D: 'text-gray-400' };
    return colors[grade] || 'text-gray-400';
  };

  const roleLabel = (role) => STAFF_ROLE_PROFILES[role]?.name || role;

  const AbilityBar = ({ label, value, compact = false }) => (
    <div className={`flex items-center gap-1.5 ${compact ? 'mb-0.5' : 'mb-1'}`}>
      <span className={`text-gray-400 ${compact ? 'text-[10px] w-16' : 'text-xs w-20'}`}>{label}</span>
      <div className="flex-1 bg-gray-700 rounded h-2.5">
        <div
          className={`h-2.5 rounded ${value >= 80 ? 'bg-red-500' : value >= 60 ? 'bg-yellow-500' : value >= 40 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className={`font-bold w-6 text-right ${compact ? 'text-[10px]' : 'text-xs'} ${getAbilityColor(value)}`}>{value}</span>
    </div>
  );

  const uniPoolSummary = (() => {
    let total = 0;
    const byYear = {};
    const currentYear = seasonData?.year || 1;
    Object.entries(universityPool).forEach(([enrollYear, cohort]) => {
      const yr = parseInt(enrollYear);
      const yearsIn = currentYear - yr;
      const label = `${yearsIn + 1}年生`;
      byYear[label] = (byYear[label] || 0) + cohort.length;
      total += cohort.length;
    });
    return { total, byYear };
  })();

  const releasedCount = releasedPlayersPool.length;
  const scoutEye = staffBonus.scoutingEye || 0;
  const negotiation = staffBonus.negotiation || 0;
  const reputation = cd.reputation || 0;

  const handleOpenMarket = () => {
    if (!marketStaff) {
      setMarketStaff(generateStaffMarket(15));
    }
  };

  const handleHire = (newStaff) => {
    cd.staff.push(newStaff);
    const idx = marketStaff.findIndex(s => s.id === newStaff.id);
    if (idx >= 0) marketStaff.splice(idx, 1);
    setMarketStaff([...marketStaff]);
    setConfirmHire(null);
  };

  const handleFire = (staffId) => {
    const idx = cd.staff.findIndex(s => s.id === staffId);
    if (idx >= 0) cd.staff.splice(idx, 1);
    setConfirmFire(null);
    setSelectedStaff(null);
  };

  const tabs = [
    { id: 'staff', label: 'スタッフ' },
    { id: 'scout', label: 'スカウト状況' },
    { id: 'finance', label: '財務・注目度' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">チーム運営</h1>
      <p className="text-xs text-gray-500 mb-4">{userTeamName} - {STAFF_GRADES[cd.rank]?.label || cd.rank}ランク</p>

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-gray-700">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-bold rounded-t transition ${
              tab === t.id ? 'bg-gray-800 text-white border-b-2 border-green-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== スタッフタブ ===== */}
      {tab === 'staff' && (
        <div>
          {/* チーム総合ボーナス */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-2">チームスタッフ総合力</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0">
              {Object.entries(STAFF_ABILITIES).map(([key, info]) => (
                <AbilityBar key={key} label={info.name} value={staffBonus[key] || 0} compact />
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              スタッフ{staff.length}名 / 総人件費: {totalSalary}万円/年
            </div>
          </div>

          {/* スタッフ一覧 */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300">所属スタッフ ({staff.length}名)</h2>
              <button
                onClick={handleOpenMarket}
                className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-xs font-bold"
              >
                スタッフ市場を見る
              </button>
            </div>

            {staff.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">スタッフがいません</p>
            ) : (
              <div className="space-y-2">
                {staff.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedStaff(selectedStaff?.id === s.id ? null : s)}
                    className={`p-3 rounded border cursor-pointer transition ${
                      selectedStaff?.id === s.id
                        ? 'bg-gray-700 border-green-600'
                        : 'bg-gray-750 border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`font-bold ${gradeColor(s.grade)}`}>{STAFF_GRADES[s.grade]?.label || s.grade}</span>
                      <span className="text-yellow-400 text-xs w-16">{roleLabel(s.role)}</span>
                      <span className="text-white font-medium flex-1">{s.name}</span>
                      <span className="text-gray-500 text-xs">{s.age}歳</span>
                      <span className="text-gray-500 text-xs">経験{s.experience}年</span>
                      <span className="text-gray-600 text-xs">{s.personality}</span>
                      <span className="text-gray-400 text-xs">{getStaffSalary(s)}万円</span>
                    </div>

                    {/* 得意分野タグ */}
                    <div className="flex gap-1 mt-1.5">
                      {(s.strengths || []).map(key => (
                        <span key={key} className="text-[10px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded">
                          {STAFF_ABILITIES[key]?.name || key}
                        </span>
                      ))}
                    </div>

                    {/* 詳細展開 */}
                    {selectedStaff?.id === s.id && (
                      <div className="mt-3 pt-3 border-t border-gray-600">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0 mb-3">
                          {Object.entries(STAFF_ABILITIES).map(([key, info]) => (
                            <AbilityBar key={key} label={info.name} value={s.abilities[key] || 0} />
                          ))}
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmFire(s); }}
                            className="px-3 py-1 bg-red-800 hover:bg-red-700 text-red-200 rounded text-xs"
                          >
                            解雇
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* スタッフ市場 */}
          {marketStaff && (
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-300">スタッフ市場</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMarketStaff(generateStaffMarket(15))}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs"
                  >
                    更新
                  </button>
                  <button
                    onClick={() => setMarketStaff(null)}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs"
                  >
                    閉じる
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {marketStaff.map(s => (
                  <div key={s.id} className="flex items-center gap-2 p-2 bg-gray-750 rounded text-xs hover:bg-gray-700 transition">
                    <span className={`font-bold w-8 ${gradeColor(s.grade)}`}>{STAFF_GRADES[s.grade]?.label || s.grade}</span>
                    <span className="text-yellow-400 w-16">{roleLabel(s.role)}</span>
                    <span className="text-white font-medium w-20">{s.name}</span>
                    <span className="text-gray-500 w-10">{s.age}歳</span>
                    <span className="text-gray-600 w-12">経験{s.experience}年</span>
                    <span className="text-gray-600 w-12">{s.personality}</span>
                    <div className="flex gap-1 flex-1">
                      {(s.strengths || []).map(key => (
                        <span key={key} className="text-[9px] bg-blue-900/30 text-blue-400 px-1 py-0.5 rounded">
                          {STAFF_ABILITIES[key]?.name || key}
                        </span>
                      ))}
                    </div>
                    <span className="text-gray-400 w-16 text-right">{getStaffSalary(s)}万円</span>
                    <button
                      onClick={() => setConfirmHire(s)}
                      className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-[10px] font-bold"
                    >
                      雇用
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== スカウト状況タブ ===== */}
      {tab === 'scout' && (
        <div>
          {/* スカウト能力 */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">スカウト能力</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <AbilityBar label="スカウト眼" value={scoutEye} />
                <p className="text-[10px] text-gray-500 ml-20">
                  候補者数: {6 + Math.floor(scoutEye / 20)}名 / 精度: {Math.max(20, Math.min(95, 40 + Math.floor(scoutEye * 0.5)))}%前後
                </p>
              </div>
              <div>
                <AbilityBar label="交渉力" value={negotiation} />
                <p className="text-[10px] text-gray-500 ml-20">
                  交渉ボーナス: {Math.round(negotiation)}%
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-gray-400">注目度: </span>
                <span className={`text-sm font-bold ${reputation >= 60 ? 'text-yellow-400' : reputation >= 30 ? 'text-green-400' : 'text-gray-400'}`}>
                  {reputation}
                </span>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  スカウト補正: x{getReputationScoutBonus(reputation).toFixed(2)} / 候補者質: {getReputationRecruitBonus(reputation) >= 0 ? '+' : ''}{getReputationRecruitBonus(reputation)}
                </p>
              </div>
            </div>
          </div>

          {/* 選手プール */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">選手プール状況</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-750 rounded p-3">
                <h3 className="text-xs font-bold text-cyan-400 mb-2">大学プール ({uniPoolSummary.total}名)</h3>
                {Object.keys(uniPoolSummary.byYear).length > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(uniPoolSummary.byYear).map(([label, count]) => (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-gray-400">{label}</span>
                        <span className="text-white">{count}名</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs">まだ大学プールが生成されていません</p>
                )}
                <p className="text-[10px] text-gray-600 mt-2">3年生以上がスカウト対象</p>
              </div>

              <div className="bg-gray-750 rounded p-3">
                <h3 className="text-xs font-bold text-orange-400 mb-2">リリースプール ({releasedCount}名)</h3>
                {releasedCount > 0 ? (
                  <div className="space-y-1">
                    {(() => {
                      const byOrigin = {};
                      releasedPlayersPool.forEach(p => {
                        const origin = p.origin === 'university' ? '大学卒'
                          : p.origin === 'corporate_candidate' ? '社会人候補'
                          : p.origin === 'independent_candidate' ? '独立L候補'
                          : p.previousTeam ? `元所属` : 'その他';
                        byOrigin[origin] = (byOrigin[origin] || 0) + 1;
                      });
                      return Object.entries(byOrigin).map(([origin, count]) => (
                        <div key={origin} className="flex justify-between text-xs">
                          <span className="text-gray-400">{origin}</span>
                          <span className="text-white">{count}名</span>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs">リリースプールは空です</p>
                )}
                <p className="text-[10px] text-gray-600 mt-2">戦力外・大学卒業生が対象</p>
              </div>
            </div>
          </div>

          {/* スカウト派遣 */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">スカウトを派遣する</h2>
            <p className="text-[10px] text-gray-500 mb-3">スタッフを選んで派遣先に送ると、一定期間後に候補選手をリストアップして帰還します</p>

            {dispatchMessage && (
              <div className={`text-xs p-2 rounded mb-3 ${dispatchMessage.ok ? 'bg-green-900/40 text-green-400 border border-green-700/50' : 'bg-red-900/40 text-red-400 border border-red-700/50'}`}>
                {dispatchMessage.text}
              </div>
            )}

            {/* 派遣先カード */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Object.entries(SCOUT_TARGETS).map(([key, def]) => {
                const missions = cd.scoutMissions || [];
                const active = missions.find(m => !m.completed && m.target === key);
                return (
                  <div key={key} className={`bg-gray-750 rounded-lg p-3 text-center border transition ${
                    dispatchTarget === key ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700/50'
                  }`}>
                    <div className="text-sm font-bold text-white mb-1">{def.label}</div>
                    <div className="text-[10px] text-gray-500 mb-2">{def.days}日間</div>
                    {active ? (
                      <div className="text-[10px] text-yellow-400 font-bold">
                        {active.staffName} 派遣中
                        <div className="text-gray-500 font-normal">{active.returnDate.month}/{active.returnDate.day} 帰還</div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDispatchTarget(dispatchTarget === key ? null : key)}
                        className="px-3 py-1.5 rounded text-xs font-bold transition bg-blue-600 hover:bg-blue-500 text-white"
                      >
                        {dispatchTarget === key ? '選択中…' : '派遣先に選択'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* スタッフ選択パネル */}
            {dispatchTarget && (() => {
              const missions = cd.scoutMissions || [];
              const dispatchedIds = new Set(missions.filter(m => !m.completed).map(m => m.staffId));
              const availableStaff = staff.filter(s => !dispatchedIds.has(s.id));
              const targetDef = SCOUT_TARGETS[dispatchTarget];

              return (
                <div className="bg-gray-750 rounded-lg p-3 mb-4 border border-blue-500/30">
                  <div className="text-xs font-bold text-blue-400 mb-2">
                    {targetDef?.label}に派遣するスタッフを選んでください
                  </div>
                  {availableStaff.length === 0 ? (
                    <p className="text-xs text-gray-500">派遣可能なスタッフがいません（全員派遣中）</p>
                  ) : (
                    <div className="space-y-1.5">
                      {availableStaff.map(s => (
                        <div key={s.id} className="flex items-center gap-3 bg-gray-800/80 rounded-lg p-2 hover:bg-gray-700/60 transition">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${gradeColor(s.grade)}`}>{STAFF_GRADES[s.grade]?.label}</span>
                              <span className="text-yellow-400 text-xs">{roleLabel(s.role)}</span>
                              <span className="text-white text-sm font-bold">{s.name}</span>
                            </div>
                            <div className="flex gap-3 mt-0.5 text-[10px]">
                              <span className="text-gray-400">スカウト眼<span className={`font-bold ml-0.5 ${getAbilityColor(s.abilities?.scoutingEye || 0)}`}>{s.abilities?.scoutingEye || 0}</span></span>
                              <span className="text-gray-400">交渉<span className={`font-bold ml-0.5 ${getAbilityColor(s.abilities?.negotiation || 0)}`}>{s.abilities?.negotiation || 0}</span></span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const result = dispatchScout(teamData, dispatchTarget, s.id, seasonData.currentDate);
                              setDispatchMessage({ text: result.message, ok: result.success });
                              setDispatchTarget(null);
                              setTimeout(() => setDispatchMessage(null), 3000);
                            }}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded transition"
                          >
                            派遣する
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setDispatchTarget(null)} className="text-[10px] text-gray-500 hover:text-gray-300 mt-2">キャンセル</button>
                </div>
              );
            })()}

            {/* 完了した派遣レポート */}
            {(() => {
              const missions = cd.scoutMissions || [];
              const completedMissions = missions.filter(m => m.completed && m.results);
              if (completedMissions.length === 0) return null;

              const renderAbility = (label, val) => {
                if (val === '?' || val === undefined) return <span className="text-gray-600">{label} <span className="font-bold">?</span></span>;
                const numVal = typeof val === 'number' ? val : parseInt(val);
                return <span className="text-gray-400">{label}<span className={`font-bold ml-0.5 ${getAbilityColor(numVal)}`}>{val}{label === '球速' ? 'km' : ''}</span></span>;
              };

              return (
                <div>
                  <h3 className="text-xs font-bold text-yellow-400 mb-2">スカウトレポート</h3>
                  <div className="space-y-1.5">
                    {completedMissions.map((mission, idx) => (
                      <div key={idx}
                        className="bg-gray-750 rounded-lg p-2.5 border border-gray-700/50 cursor-pointer hover:border-yellow-600/50 transition"
                        onClick={() => setSelectedReport(selectedReport === idx ? null : idx)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-yellow-400">{SCOUT_TARGETS[mission.target]?.label}</span>
                            <span className="text-[10px] text-gray-500">{mission.results.length}名発見</span>
                            <span className="text-[10px] text-gray-600">({mission.staffName})</span>
                          </div>
                          <span className="text-[10px] text-gray-500">{selectedReport === idx ? '▲' : '▼'}</span>
                        </div>
                        {selectedReport === idx && mission.results.length > 0 && (
                          <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                            {mission.results.map((p, pi) => {
                              const sa = p.scoutedAbilities || {};
                              const revealLevel = p._revealLevel || 0;
                              const revealLabel = ['概要', '詳細', '完全'][revealLevel];
                              return (
                                <div key={pi} className="bg-gray-800/80 rounded p-2 text-xs">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-white font-bold">{p.name}</span>
                                    <span className="text-gray-400">{p.age}歳</span>
                                    <span className="text-blue-400 font-semibold">{POSITION_NAMES[p.position] || p.position}</span>
                                    <span className="text-gray-500">{p._scoutSource}</span>
                                    {p._poolRef?.teamName && (
                                      <span className="text-emerald-400 text-[10px]">所属: {p._poolRef.teamName}</span>
                                    )}
                                    {(p.fame || 0) > 0 && (
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        p.fame >= 50 ? 'bg-yellow-600/30 text-yellow-300' : 'bg-gray-700 text-gray-400'
                                      }`}>
                                        知名度{p.fame}
                                      </span>
                                    )}
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                      revealLevel === 2 ? 'bg-green-900/40 text-green-400' :
                                      revealLevel === 1 ? 'bg-blue-900/40 text-blue-400' :
                                      'bg-gray-700 text-gray-400'
                                    }`}>
                                      {revealLabel}
                                    </span>
                                  </div>
                                  <div className="flex gap-3 mt-1.5 text-[10px] flex-wrap">
                                    {p.position === 'pitcher' ? (<>
                                      {renderAbility('球速', sa.pitching?.velocity)}
                                      {renderAbility('制球', sa.pitching?.control)}
                                      {renderAbility('スタ', sa.pitching?.stamina)}
                                    </>) : (<>
                                      {renderAbility('ミート', sa.batting?.meet)}
                                      {renderAbility('パワー', sa.batting?.power)}
                                      {renderAbility('選球眼', sa.batting?.eye)}
                                      {renderAbility('走力', sa.physical?.speed)}
                                      {renderAbility('守備', sa.fielding?.defense)}
                                    </>)}
                                  </div>
                                  {revealLevel < 2 && (
                                    <button
                                      onClick={() => {
                                        investigatePlayer(p);
                                        setRefreshTick(t => t + 1);
                                      }}
                                      className="mt-1.5 px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-bold rounded transition"
                                    >
                                      🔍 調査する（{revealLevel === 0 ? '詳細を調べる' : '全能力を調べる'}）
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* スカウト入団スケジュール */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-2">スカウト入団スケジュール</h2>
            <div className="text-xs text-gray-400 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-20 text-gray-500">11月9日</span>
                <span>退団処理（引退・戦力外通告）</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-gray-500">11月10日</span>
                <span>スカウト入団（大学プール+リリースプールから最大3名獲得）</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-gray-500">オフシーズン</span>
                <span>大学プール成長処理・新入学者追加</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 財務タブ ===== */}
      {tab === 'finance' && (
        <div>
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">財務状況</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">基本予算</div>
                <div className="text-xl font-bold text-white">{cd.budget || 0}<span className="text-sm text-gray-400">万円</span></div>
              </div>
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">注目度ボーナス</div>
                <div className="text-xl font-bold text-green-400">+{cd.yearlyBudgetBonus || getReputationBudgetBonus(reputation)}<span className="text-sm text-gray-400">万円</span></div>
              </div>
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">人件費</div>
                <div className="text-xl font-bold text-red-400">{totalSalary}<span className="text-sm text-gray-400">万円</span></div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">注目度</h2>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">注目度</span>
                  <span className={`font-bold ${reputation >= 60 ? 'text-yellow-400' : reputation >= 30 ? 'text-green-400' : 'text-gray-400'}`}>
                    {reputation} / 100
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      reputation >= 80 ? 'bg-red-500' : reputation >= 60 ? 'bg-yellow-500' : reputation >= 40 ? 'bg-green-500' : reputation >= 20 ? 'bg-blue-500' : 'bg-gray-500'
                    }`}
                    style={{ width: `${reputation}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <div>注目度が高いと: より有望なスカウト候補、企業からの追加資金、入団希望者の質が向上</div>
              <div className="text-gray-500">注目度は勝利、大会優勝、プロ輩出で上昇し、毎年自然減衰します</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">チーム実績</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">プロ輩出数</div>
                <div className="text-2xl font-bold text-cyan-400">{cd.proDraftCount || 0}<span className="text-sm text-gray-400">名</span></div>
              </div>
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">大会優勝</div>
                <div className="text-2xl font-bold text-yellow-400">{cd.tournamentWins || 0}<span className="text-sm text-gray-400">回</span></div>
              </div>
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">チームランク</div>
                <div className={`text-2xl font-bold ${gradeColor(cd.rank)}`}>{STAFF_GRADES[cd.rank]?.label || cd.rank}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 雇用確認モーダル */}
      {confirmHire && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmHire(null)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-3">スタッフ雇用確認</h3>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`font-bold ${gradeColor(confirmHire.grade)}`}>{STAFF_GRADES[confirmHire.grade]?.label}</span>
                <span className="text-yellow-400 text-sm">{roleLabel(confirmHire.role)}</span>
                <span className="text-white font-medium">{confirmHire.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                {Object.entries(STAFF_ABILITIES).map(([key, info]) => (
                  <AbilityBar key={key} label={info.name} value={confirmHire.abilities[key] || 0} compact />
                ))}
              </div>
              <div className="mt-2 text-sm text-gray-400">
                年俸: <span className="text-white font-bold">{getStaffSalary(confirmHire)}万円</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmHire(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">
                キャンセル
              </button>
              <button onClick={() => handleHire(confirmHire)} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-bold">
                雇用する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 解雇確認モーダル */}
      {confirmFire && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmFire(null)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-3">解雇確認</h3>
            <p className="text-gray-300 mb-4">
              <span className="font-bold text-white">{confirmFire.name}</span>
              （{roleLabel(confirmFire.role)}）を解雇しますか？
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmFire(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">
                キャンセル
              </button>
              <button onClick={() => handleFire(confirmFire.id)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-bold">
                解雇する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CorporateManagementScreen;
