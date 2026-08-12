import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { STAFF_ABILITIES, STAFF_ROLE_PROFILES, STAFF_GRADES, getStaffSalary, getPlayerSalary, generateStaffMarket, getTeamStaffBonus, STAFF_GRADE_CAP, canHireGrade, MAX_STAFF } from '../corporate/staffData.js';
import { getReputationScoutBonus, getReputationRecruitBonus, getReputationBudgetBonus, getManagingBudgetBonus, getTournamentBudgetBonus, getSponsorIncome, SPONSOR_TIERS, BUDGET_BY_RANK } from '../corporate/corporateInit.js';
import { getAbilityColor, POSITION_NAMES, getPositionSortIndex } from '../utils/constants.js';
import { dispatchScout, SCOUT_TARGETS, investigatePlayer, startInvestigation, setAutoInvestigationFilter, getAutoInvestigationFilter, toggleFavoritePlayer, getFavoriteBonus, getAllScoutedPlayers, calculateRecruitSuccessRate, getScoutRecommendation, estimateRivalCount, assignScoutTask, cancelScoutTask, getAllScoutTasks, MAX_FAVORITES_PER_SCOUT } from '../corporate/scoutingSystem.js';
import { getUniversityPipes } from '../university/universityPipeSystem.js';
import { SPECIALTY_LABELS, SPECIALTY_ICONS } from '../university/universityTeamsData.js';

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
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [investigateTargetId, setInvestigateTargetId] = useState(null);
  const [, setRefreshTick] = useState(0);
  const [playerSortKey, setPlayerSortKey] = useState('name');
  const [playerSortAsc, setPlayerSortAsc] = useState(true);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [favoriteSelectId, setFavoriteSelectId] = useState(null);
  const [filterDraft, setFilterDraft] = useState(() => {
    const f = getAutoInvestigationFilter(teamData);
    return f || { ageMin: '', ageMax: '', positions: [], abilities: {} };
  });

  if (!cd) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">チーム運営</h1>
        <p className="text-gray-300">社会人モードでのみ利用可能です。</p>
      </div>
    );
  }

  const staff = cd.staff || [];
  const staffBonus = getTeamStaffBonus(staff);
  const players = teamData?.players || [];
  const staffSalaryTotal = staff.reduce((sum, s) => sum + getStaffSalary(s), 0);
  const playerSalaryTotal = players.reduce((sum, p) => sum + getPlayerSalary(p), 0);
  const totalSalary = staffSalaryTotal + playerSalaryTotal;
  const reputation = cd.reputation || 0;
  const baseBudget = cd.budget || 12000;
  const reputationBonus = cd.yearlyBudgetBonus ?? getReputationBudgetBonus(reputation);
  const managingValue = Math.max(...staff.map(s => s.abilities?.managing || 0), 0);
  const managingBonus = getManagingBudgetBonus(managingValue);
  const tournamentBonus = getTournamentBudgetBonus(cd);
  const sponsorIncome = getSponsorIncome(cd);
  const totalBudget = baseBudget + reputationBonus + managingBonus + tournamentBonus + sponsorIncome;
  const budgetBalance = totalBudget - totalSalary;

  const gradeColor = (grade) => {
    const colors = { S: 'text-red-400', A: 'text-orange-400', B: 'text-yellow-400', C: 'text-green-400', D: 'text-gray-300' };
    return colors[grade] || 'text-gray-300';
  };

  const roleLabel = (role) => STAFF_ROLE_PROFILES[role]?.name || role;

  const AbilityBar = ({ label, value, compact = false }) => (
    <div className={`flex items-center gap-1.5 ${compact ? 'mb-0.5' : 'mb-1'}`}>
      <span className={`text-gray-300 ${compact ? 'text-xs w-16' : 'text-xs w-20'}`}>{label}</span>
      <div className="flex-1 bg-gray-700 rounded h-2.5">
        <div
          className={`h-2.5 rounded ${value >= 80 ? 'bg-red-500' : value >= 60 ? 'bg-yellow-500' : value >= 40 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className={`font-bold w-6 text-right ${compact ? 'text-xs' : 'text-xs'} ${getAbilityColor(value)}`}>{value}</span>
    </div>
  );

  const scoutEye = staffBonus.scoutingEye || 0;
  const negotiation = staffBonus.negotiation || 0;

  const teamRank = cd.rank || 'C';
  const maxStaffGrade = STAFF_GRADE_CAP[teamRank] || 'C';

  const handleOpenMarket = () => {
    if (!marketStaff) {
      setMarketStaff(generateStaffMarket(15, teamRank));
    }
  };

  const handleHire = (newStaff) => {
    if (!canHireGrade(teamRank, newStaff.grade)) {
      setConfirmHire(null);
      return;
    }
    if (staff.length >= MAX_STAFF) {
      setConfirmHire(null);
      return;
    }
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
    { id: 'pipe', label: 'パイプ' },
    { id: 'finance', label: '予算' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">チーム運営</h1>
      <p className="text-xs text-gray-400 mb-4">{userTeamName} - {STAFF_GRADES[cd.rank]?.label || cd.rank}ランク</p>

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-gray-700">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-bold rounded-t transition ${
              tab === t.id ? 'bg-surface-2 text-white border-b-2 border-green-400' : 'text-gray-300 hover:text-gray-200'
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
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-2">チームスタッフ総合力</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0">
              {Object.entries(STAFF_ABILITIES).map(([key, info]) => (
                <AbilityBar key={key} label={info.name} value={staffBonus[key] || 0} compact />
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-400">
              スタッフ{staff.length}名 / 上限{MAX_STAFF}名 / 人件費: {staffSalaryTotal.toLocaleString()}万円
              <span className="ml-3 text-gray-400">雇用上限: {STAFF_GRADES[maxStaffGrade]?.label}まで</span>
            </div>
          </div>

          {/* スタッフ一覧 */}
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300">所属スタッフ ({staff.length}名)</h2>
              <button
                onClick={handleOpenMarket}
                className="btn-primary px-3 py-1.5 rounded text-xs"
              >
                スタッフ市場を見る
              </button>
            </div>

            {staff.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">スタッフがいません</p>
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
                      <span className="text-gray-400 text-xs">{s.age}歳</span>
                      <span className="text-gray-400 text-xs">経験{s.experience}年</span>
                      <span className="text-gray-400 text-xs">{s.personality}</span>
                      <span className="text-gray-300 text-xs">{getStaffSalary(s)}万円</span>
                    </div>

                    {/* 専門＋得意分野タグ */}
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {s.specialtyLabel && (
                        <span className="text-xs bg-purple-900/40 text-purple-400 px-1.5 py-0.5 rounded font-bold">
                          {s.specialtyLabel}
                        </span>
                      )}
                      {(s.strengths || []).map(key => (
                        <span key={key} className="text-xs bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded">
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
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-300">役職:</span>
                            {Object.entries(STAFF_ROLE_PROFILES).map(([roleKey, rp]) => (
                              <button
                                key={roleKey}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (s.role !== roleKey) {
                                    s.role = roleKey;
                                    setRefreshTick(t => t + 1);
                                  }
                                }}
                                className={`px-2.5 py-1 text-xs rounded transition ${
                                  s.role === roleKey
                                    ? 'seg-on font-bold' : 'seg'
                                }`}
                              >
                                {rp.name}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmFire(s); }}
                            className="btn-danger px-3 py-1 rounded text-xs"
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
            <div className="bg-surface-2 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-300">スタッフ市場</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMarketStaff(generateStaffMarket(15, teamRank))}
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
                    <span className="text-gray-400 w-10">{s.age}歳</span>
                    <span className="text-gray-400 w-12">経験{s.experience}年</span>
                    <span className="text-gray-400 w-12">{s.personality}</span>
                    <div className="flex gap-1 flex-1 flex-wrap">
                      {s.specialtyLabel && (
                        <span className="text-xs bg-purple-900/30 text-purple-400 px-1 py-0.5 rounded font-bold">
                          {s.specialtyLabel}
                        </span>
                      )}
                      {(s.strengths || []).map(key => (
                        <span key={key} className="text-xs bg-blue-900/30 text-blue-400 px-1 py-0.5 rounded">
                          {STAFF_ABILITIES[key]?.name || key}
                        </span>
                      ))}
                    </div>
                    <span className="text-gray-300 w-16 text-right">{getStaffSalary(s)}万円</span>
                    <button
                      onClick={() => setConfirmHire(s)}
                      className="btn-primary px-2 py-1 rounded text-xs"
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
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">スカウト能力</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <AbilityBar label="スカウト眼" value={scoutEye} />
                <p className="text-xs text-gray-400 ml-20">
                  候補者数: {6 + Math.floor(scoutEye / 20)}名 / 精度: {Math.max(20, Math.min(95, 40 + Math.floor(scoutEye * 0.5)))}%前後
                </p>
              </div>
              <div>
                <AbilityBar label="交渉力" value={negotiation} />
                <p className="text-xs text-gray-400 ml-20">
                  交渉ボーナス: {Math.round(negotiation)}%
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-gray-300">注目度: </span>
                <span className={`text-sm font-bold ${reputation >= 60 ? 'text-yellow-400' : reputation >= 30 ? 'text-green-400' : 'text-gray-300'}`}>
                  {reputation}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  スカウト補正: x{getReputationScoutBonus(reputation).toFixed(2)} / 候補者質: {getReputationRecruitBonus(reputation) >= 0 ? '+' : ''}{getReputationRecruitBonus(reputation)}
                </p>
              </div>
            </div>
          </div>

          {/* スカウト指示状況 */}
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">スカウト指示状況</h2>
            <p className="text-xs text-gray-400 mb-3">各スカウトにタスクを割り当てると、中止するまで繰り返し行動します</p>

            {dispatchMessage && (
              <div className={`text-xs p-2 rounded mb-3 ${dispatchMessage.ok ? 'bg-green-900/40 text-green-400 border border-green-700/50' : 'bg-red-900/40 text-red-400 border border-red-700/50'}`}>
                {dispatchMessage.text}
              </div>
            )}

            {/* 派遣先概要 */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {Object.entries(SCOUT_TARGETS).map(([key, def]) => {
                const tasks = cd.scoutTasks || {};
                const activeTask = Object.entries(tasks).find(
                  ([, t]) => t.type === 'dispatch' && t.target === key && t.active
                );
                return (
                  <div key={key} className="bg-gray-750 rounded p-2 text-center border border-gray-700/50">
                    <div className="text-xs font-bold text-white">{def.label}</div>
                    <div className="text-xs text-gray-400">{def.days}日/回</div>
                    {activeTask ? (
                      <div className="text-xs text-blue-400 mt-0.5">{tasks[activeTask[0]]?.staffName} 巡回中</div>
                    ) : (
                      <div className="text-xs text-gray-400 mt-0.5">未配置</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 各スカウトのタスク状況 */}
            <div className="space-y-2">
              {staff.map(s => {
                const task = (cd.scoutTasks || {})[s.id];
                const activeMission = (cd.scoutMissions || []).find(m => !m.completed && !m.cancelled && m.staffId === s.id);
                const hasTask = !!task?.active;
                const isBusy = !!activeMission;
                const favCount = Object.values(cd.favoritePlayerIds || {}).filter(f => f.staffId === s.id).length;

                return (
                  <div key={s.id} className="bg-gray-750 rounded-lg p-3 border border-gray-700/50">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${gradeColor(s.grade)}`}>{STAFF_GRADES[s.grade]?.label}</span>
                      <span className="text-white text-sm font-bold">{s.name}</span>
                      <span className="text-xs text-gray-400">
                        眼<span className={`font-bold ml-0.5 ${getAbilityColor(s.abilities?.scoutingEye || 0)}`}>{s.abilities?.scoutingEye || 0}</span>
                        {' '}交渉<span className={`font-bold ml-0.5 ${getAbilityColor(s.abilities?.negotiation || 0)}`}>{s.abilities?.negotiation || 0}</span>
                      </span>
                      {favCount > 0 && (
                        <span className="text-xs text-yellow-400 ml-auto">★担当{favCount}/{MAX_FAVORITES_PER_SCOUT}</span>
                      )}
                    </div>

                    {/* Task status */}
                    {hasTask ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        {task.type === 'dispatch' ? (
                          <>
                            <span className="text-blue-400 text-xs font-bold">
                              {SCOUT_TARGETS[task.target]?.label || task.target}巡回中
                            </span>
                            {activeMission && (
                              <span className="text-xs text-gray-400">
                                帰還: {activeMission.returnDate.month}/{activeMission.returnDate.day}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-cyan-400 text-xs font-bold">自動調査中</span>
                            {activeMission?.type === 'investigation' ? (
                              <span className="text-xs text-gray-400">
                                {activeMission.targetPlayerName}を調査中 ({activeMission.returnDate.month}/{activeMission.returnDate.day}完了)
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">調査対象待ち</span>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => {
                            cancelScoutTask(teamData, s.id);
                            setRefreshTick(t => t + 1);
                            setDispatchMessage({ text: `${s.name}のタスクを中止しました`, ok: true });
                            setTimeout(() => setDispatchMessage(null), 3000);
                          }}
                          className="btn-danger ml-auto px-2.5 py-1 rounded text-xs transition"
                        >
                          中止
                        </button>
                      </div>
                    ) : isBusy ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-yellow-400 text-xs">
                          {activeMission.type === 'investigation'
                            ? `${activeMission.targetPlayerName}を調査中`
                            : `${SCOUT_TARGETS[activeMission.target]?.label || '?'}に派遣中`
                          }
                        </span>
                        <span className="text-xs text-gray-400">
                          {activeMission.returnDate.month}/{activeMission.returnDate.day} 帰還
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-xs text-gray-400 mr-1">待機中</span>
                        {Object.entries(SCOUT_TARGETS).map(([key, def]) => {
                          const tasks = cd.scoutTasks || {};
                          const occupied = Object.entries(tasks).find(
                            ([sid, t]) => t.type === 'dispatch' && t.target === key && t.active && parseInt(sid) !== s.id
                          );
                          return (
                            <button
                              key={key}
                              onClick={() => {
                                const result = assignScoutTask(teamData, s.id, 'dispatch', { target: key }, seasonData.currentDate, seasonData.year || 1);
                                setDispatchMessage({ text: result.message, ok: result.success });
                                setRefreshTick(t => t + 1);
                                setTimeout(() => setDispatchMessage(null), 3000);
                              }}
                              disabled={!!occupied}
                              className={`px-2 py-0.5 rounded text-xs font-bold transition ${
                                occupied
                                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                  : 'bg-blue-700 hover:bg-blue-600 text-white'
                              }`}
                              title={occupied ? `${tasks[occupied[0]]?.staffName}が巡回中` : `${def.label}を巡回（${def.days}日/回）`}
                            >
                              {def.label}
                            </button>
                          );
                        })}
                        <span className="text-gray-400 mx-0.5">|</span>
                        <button
                          onClick={() => {
                            const result = assignScoutTask(teamData, s.id, 'investigation', {}, seasonData.currentDate, seasonData.year || 1);
                            setDispatchMessage({ text: result.message, ok: result.success });
                            setRefreshTick(t => t + 1);
                            setTimeout(() => setDispatchMessage(null), 3000);
                          }}
                          className="btn-primary px-2 py-0.5 rounded text-xs transition"
                        >
                          自動調査
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 自動調査フィルタ */}
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-gray-300">自動調査フィルタ</h2>
                <div className="flex gap-2">
                  {cd.autoInvestFilter && (
                    <span className="text-xs text-green-400 font-bold bg-green-900/30 px-2 py-0.5 rounded">有効</span>
                  )}
                  <button
                    onClick={() => setShowFilterPanel(!showFilterPanel)}
                    className="btn-primary px-3 py-1 rounded text-xs"
                  >
                    {showFilterPanel ? '閉じる' : '設定'}
                  </button>
                </div>
              </div>
              {cd.autoInvestFilter && !showFilterPanel && (
                <div className="text-xs text-gray-300 flex gap-3 flex-wrap">
                  {(cd.autoInvestFilter.ageMin || cd.autoInvestFilter.ageMax) && (
                    <span>年齢: {cd.autoInvestFilter.ageMin || '?'}〜{cd.autoInvestFilter.ageMax || '?'}歳</span>
                  )}
                  {cd.autoInvestFilter.positions?.length > 0 && (
                    <span>ポジション: {cd.autoInvestFilter.positions.map(p => POSITION_NAMES[p] || p).join(', ')}</span>
                  )}
                  {cd.autoInvestFilter.abilities && Object.entries(cd.autoInvestFilter.abilities).map(([k, v]) => {
                    const labels = { velocity: '球速', meet: 'ミート', power: 'パワー', eye: '選球眼', speed: '走力', defense: '守備', control: '制球', stamina: 'スタミナ' };
                    return (v.min || v.max) ? <span key={k}>{labels[k]}: {v.min || '?'}〜{v.max || '?'}</span> : null;
                  })}
                  <button onClick={() => { setAutoInvestigationFilter(teamData, null); setRefreshTick(t => t + 1); }}
                    className="text-red-400 hover:text-red-300">解除</button>
                </div>
              )}
              {showFilterPanel && (
                <div className="mt-2 bg-gray-900/60 rounded p-3 border border-cyan-500/20 space-y-3">
                  <p className="text-xs text-gray-400">条件に合う未調査の選手をスタッフが空き次第自動で調査します</p>
                  <div className="flex gap-4 items-end">
                    <div>
                      <label className="text-xs text-gray-300 block mb-0.5">年齢（最小）</label>
                      <input type="number" min="15" max="40" value={filterDraft.ageMin}
                        onChange={e => setFilterDraft(f => ({ ...f, ageMin: e.target.value ? parseInt(e.target.value) : '' }))}
                        className="w-16 bg-surface-2 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                        placeholder="--" />
                    </div>
                    <span className="text-gray-400 text-xs pb-1">〜</span>
                    <div>
                      <label className="text-xs text-gray-300 block mb-0.5">年齢（最大）</label>
                      <input type="number" min="15" max="40" value={filterDraft.ageMax}
                        onChange={e => setFilterDraft(f => ({ ...f, ageMax: e.target.value ? parseInt(e.target.value) : '' }))}
                        className="w-16 bg-surface-2 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                        placeholder="--" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-300 block mb-1">ポジション</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'].map(pos => (
                        <button key={pos}
                          onClick={() => setFilterDraft(f => ({
                            ...f,
                            positions: (f.positions || []).includes(pos)
                              ? f.positions.filter(p => p !== pos)
                              : [...(f.positions || []), pos]
                          }))}
                          className={`px-2 py-0.5 rounded text-xs font-bold transition ${
                            (filterDraft.positions || []).includes(pos)
                              ? 'seg-on' : 'seg'
                          }`}
                        >
                          {POSITION_NAMES[pos] || pos}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 能力値フィルタ */}
                  <div>
                    <label className="text-xs text-gray-300 block mb-1">能力値（見えている値で判定）</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { key: 'velocity', label: '球速', max: 165 },
                        { key: 'control', label: '制球' },
                        { key: 'meet', label: 'ミート' },
                        { key: 'power', label: 'パワー' },
                        { key: 'eye', label: '選球眼' },
                        { key: 'speed', label: '走力' },
                        { key: 'defense', label: '守備' },
                        { key: 'stamina', label: 'スタミナ' },
                      ].map(({ key, label, max }) => {
                        const ab = (filterDraft.abilities || {})[key] || {};
                        return (
                          <div key={key} className="flex items-center gap-1">
                            <span className="text-xs text-gray-400 w-10 shrink-0">{label}</span>
                            <input type="number" min="0" max={max || 99}
                              value={ab.min ?? ''}
                              onChange={e => setFilterDraft(f => ({
                                ...f,
                                abilities: { ...(f.abilities || {}), [key]: { ...(f.abilities?.[key] || {}), min: e.target.value ? parseInt(e.target.value) : null } }
                              }))}
                              className="w-12 bg-surface-2 border border-gray-600 rounded px-1 py-0.5 text-xs text-white"
                              placeholder="下限" />
                            <span className="text-gray-400 text-xs">〜</span>
                            <input type="number" min="0" max={max || 99}
                              value={ab.max ?? ''}
                              onChange={e => setFilterDraft(f => ({
                                ...f,
                                abilities: { ...(f.abilities || {}), [key]: { ...(f.abilities?.[key] || {}), max: e.target.value ? parseInt(e.target.value) : null } }
                              }))}
                              className="w-12 bg-surface-2 border border-gray-600 rounded px-1 py-0.5 text-xs text-white"
                              placeholder="上限" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => {
                      const ab = filterDraft.abilities || {};
                      const cleanAb = {};
                      Object.entries(ab).forEach(([k, v]) => {
                        if (v.min != null || v.max != null) cleanAb[k] = v;
                      });
                      const f = {
                        ageMin: filterDraft.ageMin || null,
                        ageMax: filterDraft.ageMax || null,
                        positions: (filterDraft.positions || []).length > 0 ? filterDraft.positions : null,
                        abilities: Object.keys(cleanAb).length > 0 ? cleanAb : null,
                      };
                      setAutoInvestigationFilter(teamData, f);
                      setShowFilterPanel(false);
                      setRefreshTick(t => t + 1);
                    }} className="btn-primary px-3 py-1.5 rounded text-xs">
                      フィルタを適用
                    </button>
                    <button onClick={() => {
                      setAutoInvestigationFilter(teamData, null);
                      setFilterDraft({ ageMin: '', ageMax: '', positions: [], abilities: {} });
                      setShowFilterPanel(false);
                      setRefreshTick(t => t + 1);
                    }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs">
                      フィルタ解除
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 発見選手一覧（ソート可能テーブル） */}
            {(() => {
              const allPlayers = getAllScoutedPlayers(cd);
              if (allPlayers.length === 0) return null;

              const favIds = cd.favoritePlayerIds || {};
              const missions = cd.scoutMissions || [];

              const recGradeOrder = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
              const recColor = (g) => ({ S: 'text-red-400', A: 'text-orange-400', B: 'text-yellow-400', C: 'text-green-400', D: 'text-blue-400', F: 'text-gray-400' }[g] || 'text-gray-400');

              const getAbilityVal = (p, key) => {
                const sa = p.scoutedAbilities || {};
                const revealLevel = p._revealLevel || 0;
                if (key === 'mental') {
                  if (revealLevel < 1) return -1;
                  const v = p.personality?.mental;
                  return (v === undefined || v === null) ? -1 : (typeof v === 'number' ? v : parseInt(v));
                }
                if (key === 'professionalism') {
                  if (revealLevel < 1) return -1;
                  const v = sa.professionalism;
                  return (v === '?' || v === undefined) ? -1 : (typeof v === 'number' ? v : parseInt(v));
                }
                if (key === 'growth') {
                  if (revealLevel < 1) return -1;
                  const v = p.growthPotential;
                  return (v === undefined || v === null) ? -1 : (typeof v === 'number' ? v : parseInt(v));
                }
                const map = {
                  velocity: sa.pitching?.velocity, control: sa.pitching?.control, stamina: sa.pitching?.stamina,
                  meet: sa.batting?.meet, power: sa.batting?.power, eye: sa.batting?.eye,
                  speed: sa.physical?.speed, defense: sa.fielding?.defense, arm: sa.physical?.arm,
                };
                const v = map[key];
                return (v === '?' || v === undefined) ? -1 : (typeof v === 'number' ? v : parseInt(v));
              };

              const sorted = [...allPlayers].sort((a, b) => {
                let va, vb;
                switch (playerSortKey) {
                  case 'name': va = a.name; vb = b.name; return playerSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
                  case 'age': va = a.age || 0; vb = b.age || 0; break;
                  case 'position': va = getPositionSortIndex(a.position); vb = getPositionSortIndex(b.position); break;
                  case 'reveal': va = a._revealLevel || 0; vb = b._revealLevel || 0; break;
                  case 'rate': va = calculateRecruitSuccessRate(a, teamData); vb = calculateRecruitSuccessRate(b, teamData); break;
                  case 'rec': va = recGradeOrder[getScoutRecommendation(a, teamRank, teamData)] || 0; vb = recGradeOrder[getScoutRecommendation(b, teamRank, teamData)] || 0; break;
                  case 'rivals': va = estimateRivalCount(a); vb = estimateRivalCount(b); break;
                  case 'favorite': va = favIds[a.id] ? 1 : 0; vb = favIds[b.id] ? 1 : 0; break;
                  case 'fame': va = a.fame || 0; vb = b.fame || 0; break;
                  default: va = getAbilityVal(a, playerSortKey); vb = getAbilityVal(b, playerSortKey); break;
                }
                return playerSortAsc ? va - vb : vb - va;
              });

              const handleSort = (key) => {
                if (playerSortKey === key) setPlayerSortAsc(!playerSortAsc);
                else { setPlayerSortKey(key); setPlayerSortAsc(key === 'name'); }
              };

              const SortHeader = ({ k, label, w }) => (
                <th onClick={() => handleSort(k)}
                  className={`py-1.5 px-1.5 cursor-pointer hover:text-white transition select-none whitespace-nowrap ${w || ''} ${playerSortKey === k ? 'text-cyan-400' : 'text-gray-400'}`}>
                  {label}{playerSortKey === k ? (playerSortAsc ? ' ▲' : ' ▼') : ''}
                </th>
              );

              const renderVal = (val, isVelocity) => {
                if (val === '?' || val === undefined) return <span className="text-gray-400">?</span>;
                const n = typeof val === 'number' ? val : parseInt(val);
                return <span className={`font-bold ${getAbilityColor(isVelocity ? Math.min(99, (n - 120) * 2) : n)}`}>{val}</span>;
              };

              const getRateColor = (r) => r >= 80 ? 'text-pink-400' : r >= 70 ? 'text-red-400' : r >= 60 ? 'text-orange-400' : r >= 50 ? 'text-yellow-400' : r >= 40 ? 'text-green-400' : r >= 30 ? 'text-blue-400' : 'text-gray-300';

              return (
                <div className="bg-surface-2 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-bold text-yellow-400 mb-3">
                    発見選手一覧（{allPlayers.length}名）
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="tabular-nums w-full text-sm">
                      <thead className="border-b border-gray-700">
                        <tr className="text-left">
                          <SortHeader k="favorite" label="★" w="w-6" />
                          <SortHeader k="rec" label="推薦" w="w-8" />
                          <SortHeader k="name" label="選手名" w="w-20" />
                          <SortHeader k="age" label="齢" w="w-6" />
                          <SortHeader k="position" label="ポジ" w="w-8" />
                          <th className="py-1 px-1 text-gray-400 w-12">出身</th>
                          <SortHeader k="meet" label="ミ" w="w-6" />
                          <SortHeader k="power" label="パ" w="w-6" />
                          <SortHeader k="eye" label="眼" w="w-6" />
                          <SortHeader k="speed" label="走" w="w-6" />
                          <SortHeader k="defense" label="守" w="w-6" />
                          <SortHeader k="arm" label="肩" w="w-6" />
                          <SortHeader k="velocity" label="球速" w="w-8" />
                          <SortHeader k="control" label="制" w="w-6" />
                          <SortHeader k="stamina" label="ス" w="w-6" />
                          <SortHeader k="mental" label="精" w="w-6" />
                          <SortHeader k="professionalism" label="プ" w="w-6" />
                          <SortHeader k="growth" label="成" w="w-6" />
                          <SortHeader k="rate" label="交渉%" w="w-10" />
                          <SortHeader k="rivals" label="他球団" w="w-8" />
                          <SortHeader k="reveal" label="調査" w="w-16" />
                          <th className="py-1 px-1 text-gray-400 w-16">状況</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(p => {
                          const sa = p.scoutedAbilities || {};
                          const revealLevel = p._revealLevel || 0;
                          const isFav = !!favIds[p.id];
                          const favInfo = favIds[p.id];
                          const favBonusVal = getFavoriteBonus(teamData, p.id);
                          const activeInv = missions.find(m => m.type === 'investigation' && !m.completed && m.targetPlayerId === p.id);
                          const invCount = p._investigationCount || 0;
                          const rate = calculateRecruitSuccessRate(p, teamData);
                          const rec = getScoutRecommendation(p, teamRank, teamData);
                          const rivals = estimateRivalCount(p);

                          return (
                            <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-750/50 transition">
                              <td className="py-1.5 px-1.5 text-center">
                                {isFav ? (
                                  <button onClick={() => { toggleFavoritePlayer(teamData, p.id); setRefreshTick(t => t + 1); }}
                                    className="text-base text-yellow-400 transition"
                                    title={`担当: ${favInfo?.staffName || '未定'} / 交渉+${favBonusVal}%`}>
                                    ★
                                  </button>
                                ) : (
                                  <button onClick={() => setFavoriteSelectId(favoriteSelectId === p.id ? null : p.id)}
                                    className="text-base text-gray-400 hover:text-gray-300 transition"
                                    title="お気に入りに追加（担当スカウト選択）">
                                    ☆
                                  </button>
                                )}
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <span className={`font-bold ${recColor(rec)}`}>{rec}</span>
                              </td>
                              <td className="py-1.5 px-1.5 text-white font-bold truncate max-w-[100px]">{p.name}</td>
                              <td className="py-1.5 px-1.5 text-gray-300 text-center">{p.age}</td>
                              <td className="py-1.5 px-1.5 text-blue-400 font-semibold">{POSITION_NAMES[p.position] || p.position}</td>
                              <td className="py-1.5 px-1.5 text-gray-400 truncate max-w-[120px]" title={p._scoutSource}>{p._scoutSource}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.batting?.meet)}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.batting?.power)}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.batting?.eye)}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.physical?.speed)}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.fielding?.defense)}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.physical?.arm)}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.pitching?.velocity, true)}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.pitching?.control)}</td>
                              <td className="py-1.5 px-1.5 text-center">{renderVal(sa.pitching?.stamina)}</td>
                              <td className="py-1.5 px-1.5 text-center">{revealLevel >= 1 ? renderVal(p.personality?.mental) : <span className="text-gray-400">?</span>}</td>
                              <td className="py-1.5 px-1.5 text-center">{revealLevel >= 1 ? renderVal(sa.professionalism) : <span className="text-gray-400">?</span>}</td>
                              <td className="py-1.5 px-1.5 text-center">{revealLevel >= 1 ? (() => {
                                const gp = p.growthPotential;
                                if (gp == null) return <span className="text-gray-400">?</span>;
                                const v = typeof gp === 'number' ? gp : parseFloat(gp);
                                if (isNaN(v)) return <span className="text-gray-400">?</span>;
                                const color = v >= 1.3 ? 'text-pink-400' : v >= 1.2 ? 'text-red-400' : v >= 1.1 ? 'text-orange-400' : v >= 1.0 ? 'text-yellow-400' : v >= 0.9 ? 'text-green-400' : 'text-blue-400';
                                return <span className={`font-bold ${color}`}>{v.toFixed(2)}</span>;
                              })() : <span className="text-gray-400">?</span>}</td>
                              <td className="py-1.5 px-1.5 text-center">
                                <span className={`font-bold ${getRateColor(rate)}`}>{rate}%</span>
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                {rivals > 0 ? (
                                  <span className={`font-bold ${rivals >= 6 ? 'text-pink-400' : rivals >= 4 ? 'text-red-400' : rivals >= 3 ? 'text-orange-400' : rivals >= 2 ? 'text-yellow-400' : 'text-green-400'}`}>
                                    {rivals}社
                                  </span>
                                ) : <span className="text-gray-400">-</span>}
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <span className={`inline-block min-w-[2.5rem] text-center px-1.5 py-0.5 rounded font-bold whitespace-nowrap ${
                                  revealLevel === 2 ? 'bg-green-900/40 text-green-400' :
                                  revealLevel === 1 ? 'bg-blue-900/40 text-blue-400' :
                                  'bg-gray-700 text-gray-300'
                                }`}>
                                  {['概要', '詳細', '完全'][revealLevel]}
                                </span>
                              </td>
                              <td className="py-1.5 px-1.5 text-xs">
                                {activeInv ? (
                                  <span className="text-yellow-400">調査中</span>
                                ) : revealLevel < 2 ? (
                                  <button onClick={() => setInvestigateTargetId(investigateTargetId === p.id ? null : p.id)}
                                    className="text-cyan-400 hover:text-cyan-300">調査</button>
                                ) : (
                                  <span className="text-green-400">完了</span>
                                )}
                                {invCount > 0 && <span className="ml-1 text-cyan-400">調+{invCount * 7}%</span>}
                                {isFav && favBonusVal > 0 && (
                                  <span className="ml-1 text-yellow-400">★+{favBonusVal}%</span>
                                )}
                                {isFav && favInfo?.staffName && (
                                  <span className="ml-1 text-purple-400">{favInfo.staffName}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* お気に入り担当スカウト選択パネル → モーダル化 */}

                  {/* 調査スカウト選択パネル */}
                  {investigateTargetId && (() => {
                    const target = allPlayers.find(p => p.id === investigateTargetId);
                    if (!target) return null;
                    const busyIds = new Set(missions.filter(m => !m.completed).map(m => m.staffId));
                    const availScouts = staff.filter(s => !busyIds.has(s.id));
                    return (
                      <div className="mt-2 bg-gray-900/60 rounded p-3 border border-cyan-500/30">
                        <div className="text-xs text-cyan-400 mb-1.5 font-bold">{target.name}を調査するスカウトを選択</div>
                        {availScouts.length === 0 ? (
                          <p className="text-xs text-gray-400">全スタッフが任務中です</p>
                        ) : (
                          <div className="flex gap-2 flex-wrap">
                            {availScouts.map(s => (
                              <button key={s.id}
                                onClick={() => {
                                  const result = startInvestigation(teamData, target.id, target.name, s.id, seasonData.currentDate);
                                  setDispatchMessage({ text: result.message, ok: result.success });
                                  setInvestigateTargetId(null);
                                  setRefreshTick(t => t + 1);
                                  setTimeout(() => setDispatchMessage(null), 3000);
                                }}
                                className="btn-primary px-2 py-1 text-xs rounded transition">
                                {s.name} (眼{s.abilities?.scoutingEye || 0})
                              </button>
                            ))}
                          </div>
                        )}
                        <button onClick={() => setInvestigateTargetId(null)} className="text-xs text-gray-400 hover:text-gray-300 mt-1.5 block">キャンセル</button>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

          {/* スカウト入団スケジュール */}
          <div className="bg-surface-2 rounded-lg p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-2">スカウト入団スケジュール</h2>
            <div className="text-xs text-gray-300 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-24 text-gray-400 shrink-0">4月〜</span>
                <span>スタッフを派遣して候補選手を発見・調査</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-gray-400 shrink-0">10月第4木曜</span>
                <span>NPBドラフト（有力選手がプロに指名される）</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-gray-400 shrink-0">11月9日</span>
                <span>退団処理（引退・戦力外通告）</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-gray-400 shrink-0">11月10日</span>
                <span>スカウト交渉（発見した選手から最大3名と交渉）</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-gray-400 shrink-0">キャンプ</span>
                <span>入団した選手がチームに合流</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== パイプタブ ===== */}
      {tab === 'pipe' && (() => {
        const pipes = getUniversityPipes(teamData);
        const pipeStrengthLabel = (s) => s >= 3 ? '◎ 太い' : s === 2 ? '○ 普通' : '△ 細い';
        const pipeStrengthColor = (s) => s >= 3 ? 'text-green-400' : s === 2 ? 'text-yellow-400' : 'text-gray-300';
        return (
          <div>
            <div className="bg-surface-2 rounded-lg p-4 mb-4">
              <h2 className="text-sm font-bold text-gray-300 mb-1">大学パイプ一覧</h2>
              <p className="text-xs text-gray-400 mb-3">
                チーム内のOB（大学出身選手）を通じた大学との繋がりです。パイプがある大学にはキャンプで選手を派遣できます。
              </p>
              <div className="flex gap-4 mb-3">
                <div className="bg-gray-750 rounded px-3 py-2 text-center">
                  <div className="text-xs text-gray-300">繋がり大学数</div>
                  <div className="text-xl font-bold text-cyan-400">{pipes.length}</div>
                </div>
                <div className="bg-gray-750 rounded px-3 py-2 text-center">
                  <div className="text-xs text-gray-300">総派遣枠</div>
                  <div className="text-xl font-bold text-yellow-400">{pipes.reduce((s, p) => s + Math.min(3, p.pipeStrength), 0)}</div>
                </div>
                <div className="bg-gray-750 rounded px-3 py-2 text-center">
                  <div className="text-xs text-gray-300">総OB人数</div>
                  <div className="text-xl font-bold text-white">{pipes.reduce((s, p) => s + p.obCount, 0)}</div>
                </div>
              </div>
            </div>

            {pipes.length === 0 ? (
              <div className="bg-surface-2 rounded-lg p-8 text-center">
                <p className="text-gray-300">大学出身の選手がいないため、パイプがありません。</p>
                <p className="text-xs text-gray-400 mt-2">大卒選手をスカウトすると、その出身大学とのパイプが生まれます。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pipes.map(pipe => (
                  <div key={pipe.universityId} className="bg-surface-2 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${gradeColor(pipe.rank)} bg-gray-700`}>{pipe.rank}</span>
                        <span className="text-white font-bold">{pipe.universityName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold ${pipeStrengthColor(pipe.pipeStrength)}`}>
                          {pipeStrengthLabel(pipe.pipeStrength)}
                        </span>
                        <span className="text-xs text-gray-300">派遣枠: <span className="text-white font-bold">{Math.min(3, pipe.pipeStrength)}</span>人</span>
                      </div>
                    </div>

                    {/* 得意分野 */}
                    {pipe.specialties.length > 0 && (
                      <div className="flex gap-1 mb-2">
                        {pipe.specialties.map(sp => (
                          <span key={sp} className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                            {SPECIALTY_ICONS[sp] || ''} {SPECIALTY_LABELS[sp] || sp}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* OB一覧 */}
                    <div className="mt-2 border-t border-gray-700 pt-2">
                      <div className="text-xs text-gray-400 mb-1">OB: {pipe.obCount}名（選手{pipe.obPlayers.length} / スタッフ{(pipe.obStaff || []).length}）</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {pipe.obPlayers.map(ob => {
                          const player = players.find(p => p.id === ob.id);
                          return (
                            <span key={`p-${ob.id}`} className="text-xs text-gray-300">
                              <span className="text-gray-400">{player ? POSITION_NAMES[player.position] || '' : ''}</span>
                              {' '}{ob.name}
                              {player && <span className="text-gray-400 ml-0.5">({player.age}歳)</span>}
                            </span>
                          );
                        })}
                        {(pipe.obStaff || []).map(ob => (
                          <span key={`s-${ob.id}`} className="text-xs text-purple-300">
                            <span className="text-purple-500">コーチ</span>
                            {' '}{ob.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== 財務タブ ===== */}
      {tab === 'finance' && (
        <div>
          {/* 予算サマリー */}
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">{seasonData?.year || 1}年目 予算</h2>
            <div className="grid grid-cols-5 gap-2 mb-3">
              <div className="bg-gray-750 rounded p-2">
                <div className="text-xs text-gray-300 mb-1">基本予算 <span className="text-gray-400">({cd.rank}ランク)</span></div>
                <div className="text-sm font-bold text-white">{baseBudget.toLocaleString()}<span className="text-xs text-gray-300">万</span></div>
              </div>
              <div className="bg-gray-750 rounded p-2">
                <div className="text-xs text-gray-300 mb-1">注目度</div>
                <div className="text-sm font-bold text-green-400">+{reputationBonus.toLocaleString()}<span className="text-xs text-gray-300">万</span></div>
              </div>
              <div className="bg-gray-750 rounded p-2">
                <div className="text-xs text-gray-300 mb-1">マネージング<span className="text-gray-400">({managingValue})</span></div>
                <div className="text-sm font-bold text-cyan-400">+{managingBonus.toLocaleString()}<span className="text-xs text-gray-300">万</span></div>
              </div>
              <div className="bg-gray-750 rounded p-2">
                <div className="text-xs text-gray-300 mb-1">大会ボーナス</div>
                <div className="text-sm font-bold text-yellow-400">+{tournamentBonus.toLocaleString()}<span className="text-xs text-gray-300">万</span></div>
              </div>
              <div className="bg-gray-750 rounded p-2">
                <div className="text-xs text-gray-300 mb-1">スポンサー</div>
                <div className="text-sm font-bold text-purple-400">+{sponsorIncome.toLocaleString()}<span className="text-xs text-gray-300">万</span></div>
              </div>
            </div>
            <div className="flex items-center justify-between bg-gray-750 rounded p-3">
              <div>
                <div className="text-xs text-gray-300">総予算</div>
                <div className="text-xl font-bold text-white">{totalBudget.toLocaleString()}<span className="text-sm text-gray-300">万円</span></div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-300">残額</div>
                <div className={`text-xl font-bold ${budgetBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {budgetBalance >= 0 ? '+' : ''}{budgetBalance.toLocaleString()}<span className="text-sm text-gray-300">万円</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-400 flex gap-3 mt-1">
              <span>ランク別基本予算:</span>
              {Object.entries(BUDGET_BY_RANK).map(([r, b]) => (
                <span key={r} className={r === cd.rank ? 'text-yellow-400 font-bold' : ''}>{r}: {(b / 10000).toFixed(1)}億</span>
              ))}
            </div>
          </div>

          {/* スポンサー一覧 */}
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">スポンサー契約</h2>
            {(cd.sponsors || []).length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">現在スポンサー契約はありません</p>
            ) : (
              <div className="space-y-1.5">
                {(cd.sponsors || []).map((s, i) => {
                  const tierInfo = SPONSOR_TIERS[s.tier];
                  return (
                    <div key={i} className="flex items-center gap-3 bg-gray-750 rounded p-2.5">
                      <span className={`text-xs font-bold w-16 ${tierInfo?.color || 'text-gray-300'}`}>
                        {tierInfo?.label || s.tier}
                      </span>
                      <span className="text-white text-sm font-medium flex-1">{s.name}</span>
                      <span className="text-yellow-400 text-xs font-bold">
                        +{(s.income || tierInfo?.income || 0).toLocaleString()}万/年
                      </span>
                      <span className="text-gray-400 text-xs">残{s.remainingYears || 0}年</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">注目度が高いほど上位スポンサーのオファーが来やすくなります</p>
          </div>

          {/* 大会ボーナス条件 */}
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-2">大会成績ボーナス条件</h2>
            <div className="text-xs text-gray-300 space-y-1">
              <div className="flex justify-between"><span>都市対抗/日本選手権 優勝</span><span className="text-yellow-400 font-bold">+2,000万</span></div>
              <div className="flex justify-between"><span>都市対抗/日本選手権 準優勝</span><span className="text-yellow-400">+1,000万</span></div>
              <div className="flex justify-between"><span>ベスト4（本戦2勝以上）</span><span className="text-yellow-400">+500万</span></div>
              <div className="flex justify-between"><span>本戦出場（予選突破）</span><span className="text-yellow-400">+300万</span></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">最も良い成績が翌年の予算に反映されます（複数大会の場合は最高額）</p>
          </div>

          {/* 人件費内訳 */}
          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">人件費 <span className="text-red-400">{totalSalary.toLocaleString()}万円</span></h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-750 rounded p-3">
                <div className="text-xs text-gray-300 mb-1">選手 ({players.length}名)</div>
                <div className="text-lg font-bold text-white">{playerSalaryTotal.toLocaleString()}<span className="text-sm text-gray-300">万円</span></div>
              </div>
              <div className="bg-gray-750 rounded p-3">
                <div className="text-xs text-gray-300 mb-1">スタッフ ({staff.length}名)</div>
                <div className="text-lg font-bold text-white">{staffSalaryTotal.toLocaleString()}<span className="text-sm text-gray-300">万円</span></div>
              </div>
            </div>
            {/* スタッフ年俸一覧 */}
            <details className="mt-2">
              <summary className="text-xs text-gray-300 cursor-pointer hover:text-gray-300">スタッフ年俸一覧 ({staff.length}名)</summary>
              <div className="mt-2 max-h-48 overflow-y-auto">
                <table className="tabular-nums w-full text-xs">
                  <thead className="text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-1 px-1">名前</th>
                      <th className="text-center py-1 px-1 w-12">役職</th>
                      <th className="text-center py-1 px-1 w-8">齢</th>
                      <th className="text-center py-1 px-1 w-10">等級</th>
                      <th className="text-right py-1 px-1 w-16">年俸</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...staff].sort((a, b) => getStaffSalary(b) - getStaffSalary(a)).map((s, i) => (
                      <tr key={s.id || i} className="border-b border-gray-800 hover:bg-gray-750">
                        <td className="py-0.5 px-1 text-white">{s.name}</td>
                        <td className="py-0.5 px-1 text-center text-cyan-400">{roleLabel(s.role)}</td>
                        <td className="py-0.5 px-1 text-center text-gray-300">{s.age}</td>
                        <td className={`py-0.5 px-1 text-center font-bold ${gradeColor(s.grade)}`}>{STAFF_GRADES[s.grade]?.label || s.grade}</td>
                        <td className="py-0.5 px-1 text-right text-yellow-400">{getStaffSalary(s).toLocaleString()}万</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {/* 選手年俸一覧 */}
            <details className="mt-2">
              <summary className="text-xs text-gray-300 cursor-pointer hover:text-gray-300">選手年俸一覧 ({players.length}名)</summary>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="tabular-nums w-full text-xs">
                  <thead className="text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-1 px-1">選手</th>
                      <th className="text-center py-1 px-1 w-8">齢</th>
                      <th className="text-center py-1 px-1 w-8">位</th>
                      <th className="text-right py-1 px-1 w-16">年俸</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...players].sort((a, b) => getPlayerSalary(b) - getPlayerSalary(a)).map(p => (
                      <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-750">
                        <td className="py-0.5 px-1 text-white">{p.name}</td>
                        <td className="py-0.5 px-1 text-center text-gray-300">{p.age}</td>
                        <td className="py-0.5 px-1 text-center text-gray-300">{p.position === 'pitcher' ? '投' : (POSITION_NAMES[p.position] || '野')}</td>
                        <td className="py-0.5 px-1 text-right text-yellow-400">{getPlayerSalary(p).toLocaleString()}万</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          <div className="bg-surface-2 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">注目度</h2>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">注目度</span>
                  <span className={`font-bold ${reputation >= 60 ? 'text-yellow-400' : reputation >= 30 ? 'text-green-400' : 'text-gray-300'}`}>
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
            <div className="text-xs text-gray-300 space-y-1">
              <div>注目度が高いと: より有望なスカウト候補、企業からの追加資金、入団希望者の質が向上</div>
              <div className="text-gray-400">注目度は勝利、大会優勝、プロ輩出で上昇し、毎年自然減衰します</div>
            </div>
          </div>

          <div className="bg-surface-2 rounded-lg p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">チーム実績</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-300 mb-1">プロ輩出数</div>
                <div className="text-2xl font-bold text-cyan-400">{cd.proDraftCount || 0}<span className="text-sm text-gray-300">名</span></div>
              </div>
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-300 mb-1">大会優勝</div>
                <div className="text-2xl font-bold text-yellow-400">{cd.tournamentWins || 0}<span className="text-sm text-gray-300">回</span></div>
              </div>
              <div className="bg-gray-750 rounded p-3 text-center">
                <div className="text-xs text-gray-300 mb-1">チームランク</div>
                <div className={`text-2xl font-bold ${gradeColor(cd.rank)}`}>{STAFF_GRADES[cd.rank]?.label || cd.rank}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 雇用確認モーダル */}
      {confirmHire && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmHire(null)}>
          <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-3">スタッフ雇用確認</h3>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`font-bold ${gradeColor(confirmHire.grade)}`}>{STAFF_GRADES[confirmHire.grade]?.label}</span>
                <span className="text-yellow-400 text-sm">{roleLabel(confirmHire.role)}</span>
                <span className="text-white font-medium">{confirmHire.name}</span>
                {confirmHire.specialtyLabel && (
                  <span className="text-xs bg-purple-900/40 text-purple-400 px-1.5 py-0.5 rounded font-bold">{confirmHire.specialtyLabel}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                {Object.entries(STAFF_ABILITIES).map(([key, info]) => (
                  <AbilityBar key={key} label={info.name} value={confirmHire.abilities[key] || 0} compact />
                ))}
              </div>
              <div className="mt-2 text-sm text-gray-300">
                年俸: <span className="text-white font-bold">{getStaffSalary(confirmHire)}万円</span>
              </div>
            </div>
            {staff.length >= MAX_STAFF && (
              <p className="text-red-400 text-xs mb-2">スタッフ枠が上限（{MAX_STAFF}名）に達しています。先に解雇してください。</p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmHire(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">
                キャンセル
              </button>
              <button
                onClick={() => handleHire(confirmHire)}
                disabled={staff.length >= MAX_STAFF}
                className={`px-4 py-2 rounded text-sm font-bold ${'btn-primary'}`}
              >
                雇用する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 解雇確認モーダル */}
      {confirmFire && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmFire(null)}>
          <div className="bg-surface-2 rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-3">解雇確認</h3>
            <p className="text-gray-300 mb-4">
              <span className="font-bold text-white">{confirmFire.name}</span>
              （{roleLabel(confirmFire.role)}）を解雇しますか？
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmFire(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">
                キャンセル
              </button>
              <button onClick={() => handleFire(confirmFire.id)} className="btn-danger px-4 py-2 rounded text-sm">
                解雇する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* お気に入り担当スカウト選択モーダル */}
      {favoriteSelectId && (() => {
        const allPlayers = getAllScoutedPlayers(cd);
        const target = allPlayers.find(p => p.id === favoriteSelectId);
        if (!target) return null;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setFavoriteSelectId(null)}>
            <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-1">担当スカウトを選択</h3>
              <p className="text-sm text-gray-300 mb-1">
                <span className="text-yellow-400 font-bold">{target.name}</span>
                <span className="text-gray-300 ml-2">{target.age}歳 {POSITION_NAMES[target.position] || target.position}</span>
              </p>
              <p className="text-xs text-gray-400 mb-4">担当スカウトが選手と常に連絡を取り、交渉ボーナスが毎週蓄積します。1人のスカウトは最大{MAX_FAVORITES_PER_SCOUT}人まで。</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {staff.map(s => {
                  const neg = s.abilities?.negotiation || 0;
                  const weeklyRate = neg >= 80 ? 5 : neg >= 50 ? 4 : 3;
                  const currentFavCount = Object.values(cd.favoritePlayerIds || {}).filter(f => f.staffId === s.id).length;
                  const isFull = currentFavCount >= MAX_FAVORITES_PER_SCOUT;
                  return (
                    <button key={s.id}
                      onClick={() => {
                        if (isFull) {
                          setDispatchMessage({ text: `${s.name}は既に${MAX_FAVORITES_PER_SCOUT}人の選手を担当しています`, ok: false });
                          setTimeout(() => setDispatchMessage(null), 3000);
                          return;
                        }
                        const result = toggleFavoritePlayer(teamData, target.id, {
                          id: s.id,
                          name: s.name,
                          negotiation: neg,
                        });
                        if (!result?.success) {
                          setDispatchMessage({ text: result?.message || '登録に失敗しました', ok: false });
                          setTimeout(() => setDispatchMessage(null), 3000);
                          return;
                        }
                        setFavoriteSelectId(null);
                        setRefreshTick(t => t + 1);
                      }}
                      disabled={isFull}
                      className={`w-full flex items-center justify-between p-3 rounded-lg transition text-left ${
                        isFull ? 'bg-surface-2 text-gray-400 cursor-not-allowed' : 'bg-gray-750 hover:bg-gray-700'
                      }`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${gradeColor(s.grade)}`}>{STAFF_GRADES[s.grade]?.label}</span>
                          <span className={`text-sm font-bold ${isFull ? 'text-gray-400' : 'text-white'}`}>{s.name}</span>
                          {currentFavCount > 0 && (
                            <span className={`text-xs ${isFull ? 'text-red-400' : 'text-yellow-400'}`}>
                              ★{currentFavCount}/{MAX_FAVORITES_PER_SCOUT}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs">
                          <span className="text-gray-300">交渉<span className={`font-bold ml-0.5 ${getAbilityColor(neg)}`}>{neg}</span></span>
                          <span className="text-gray-300">眼<span className={`font-bold ml-0.5 ${getAbilityColor(s.abilities?.scoutingEye || 0)}`}>{s.abilities?.scoutingEye || 0}</span></span>
                        </div>
                      </div>
                      <span className={`text-xs font-bold ${isFull ? 'text-gray-400' : 'text-yellow-400'}`}>
                        {isFull ? '定員' : `+${weeklyRate}%/週`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setFavoriteSelectId(null)} className="mt-3 w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">
                キャンセル
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default CorporateManagementScreen;
