import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { STAFF_ABILITIES, STAFF_ROLE_PROFILES, STAFF_GRADES, getStaffSalary, generateStaffMarket, getTeamStaffBonus } from '../corporate/staffData.js';
import { getReputationScoutBonus, getReputationRecruitBonus, getReputationBudgetBonus } from '../corporate/corporateInit.js';
import { getAbilityColor } from '../utils/constants.js';
import { universityPool } from '../season/universityPool.js';
import { releasedPlayersPool } from '../teams-data.js';

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
