import React from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { getPlayerSalary, getStaffSalary } from '../corporate/staffData.js';
import { getReputationBudgetBonus, getManagingBudgetBonus, getTournamentBudgetBonus, getSponsorIncome, applyBudgetDeficitPenalty } from '../corporate/corporateInit.js';

const BudgetSettlementScreen = ({ seasonData, onComplete }) => {
  const userTeamName = seasonData?.settings?.teamNames?.[0]
    || Object.keys(TEAMS_DATA).find(n => TEAMS_DATA[n]?.corporateData);
  const teamData = TEAMS_DATA[userTeamName];
  const cd = teamData?.corporateData;
  const staff = cd?.staff || [];
  const players = teamData?.players || [];

  const baseBudget = cd?.budget || 13000;
  const reputation = cd?.reputation || 0;
  const reputationBonus = cd?.yearlyBudgetBonus ?? getReputationBudgetBonus(reputation);
  const managingValue = Math.max(...staff.map(s => s.abilities?.managing || 0), 0);
  const managingBonus = getManagingBudgetBonus(managingValue);
  const tournamentBonus = getTournamentBudgetBonus(cd);
  const sponsorIncome = getSponsorIncome(cd);
  const totalBudget = baseBudget + reputationBonus + managingBonus + tournamentBonus + sponsorIncome;

  const playerSalary = players.reduce((sum, p) => sum + getPlayerSalary(p), 0);
  const staffSalary = staff.reduce((sum, s) => sum + getStaffSalary(s), 0);
  const totalExpense = playerSalary + staffSalary;
  const balance = totalBudget - totalExpense;
  const isDeficit = balance < 0;

  const handleConfirm = () => {
    if (isDeficit && cd) {
      cd.budgetDeficit = Math.abs(balance);
      const deficitRate = Math.min(1, Math.abs(balance) / (baseBudget || 13000));
      cd.scoutPenalty = Math.min(4, Math.round(deficitRate * 5));
      const penalties = applyBudgetDeficitPenalty(teamData);
      if (penalties && penalties.length > 0) {
        onComplete(penalties);
        return;
      }
    } else if (cd) {
      cd.budgetDeficit = 0;
      cd.scoutPenalty = 0;
    }
    onComplete(null);
  };

  return (
    <div className="p-3 min-h-screen">
      <div className="max-w-lg mx-auto">
        <h1 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span className="text-yellow-400">💰</span> 年度末決算（11月30日）
        </h1>
        <p className="text-xs text-gray-400 mb-4">
          退団・入団・スタッフ整理・スポンサー契約を踏まえた最終決算です。
        </p>

        {/* 収入の部 */}
        <div className="bg-gray-800/80 rounded-xl p-3 mb-3 border border-gray-700/50">
          <h2 className="text-sm font-bold text-green-400 mb-2">収入の部</h2>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">基本予算</span>
              <span className="text-white">{baseBudget.toLocaleString()}万円</span>
            </div>
            {reputationBonus > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">注目度ボーナス</span>
                <span className="text-green-300">+{reputationBonus.toLocaleString()}万円</span>
              </div>
            )}
            {managingBonus > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">経営手腕ボーナス</span>
                <span className="text-green-300">+{managingBonus.toLocaleString()}万円</span>
              </div>
            )}
            {tournamentBonus > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">大会成績ボーナス</span>
                <span className="text-green-300">+{tournamentBonus.toLocaleString()}万円</span>
              </div>
            )}
            {sponsorIncome > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">スポンサー収入</span>
                <span className="text-green-300">+{sponsorIncome.toLocaleString()}万円</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-600 pt-1 mt-1">
              <span className="text-white font-bold">収入合計</span>
              <span className="text-green-400 font-bold">{totalBudget.toLocaleString()}万円</span>
            </div>
          </div>
        </div>

        {/* 支出の部 */}
        <div className="bg-gray-800/80 rounded-xl p-3 mb-3 border border-gray-700/50">
          <h2 className="text-sm font-bold text-red-400 mb-2">支出の部</h2>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">選手年俸（{players.length}名）</span>
              <span className="text-white">{playerSalary.toLocaleString()}万円</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">スタッフ人件費（{staff.length}名）</span>
              <span className="text-white">{staffSalary.toLocaleString()}万円</span>
            </div>
            <div className="flex justify-between border-t border-gray-600 pt-1 mt-1">
              <span className="text-white font-bold">支出合計</span>
              <span className="text-red-400 font-bold">{totalExpense.toLocaleString()}万円</span>
            </div>
          </div>
        </div>

        {/* 収支 */}
        <div className={`rounded-xl p-3 mb-4 border ${isDeficit ? 'bg-red-900/30 border-red-700/50' : 'bg-green-900/30 border-green-700/50'}`}>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-white">収支</span>
            <span className={`text-lg font-bold ${isDeficit ? 'text-red-400' : 'text-green-400'}`}>
              {balance >= 0 ? '+' : ''}{balance.toLocaleString()}万円
            </span>
          </div>
          {isDeficit && (
            <div className="mt-2 text-xs text-red-300 space-y-1">
              <p>予算超過のため、以下のペナルティが適用されます:</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-200/80">
                <li>チームの注目度が低下</li>
                <li>スポンサーが離脱する可能性</li>
                <li>来季のスカウト活動が制限</li>
              </ul>
            </div>
          )}
          {!isDeficit && (
            <p className="mt-1 text-xs text-green-300">
              健全な経営を維持しています。
            </p>
          )}
        </div>

        <button
          onClick={handleConfirm}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
            isDeficit
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-blue-700 hover:bg-blue-600 text-white'
          }`}
        >
          {isDeficit ? '赤字を確定してオフシーズンへ' : 'オフシーズンへ進む'}
        </button>
      </div>
    </div>
  );
};

export default BudgetSettlementScreen;
