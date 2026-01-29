import React from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import LineupSettingScreen from './LineupSettingScreen.jsx';

const RosterScreen = () => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeam = teamNames[0] || 'チームA';

  if (!TEAMS_DATA[userTeam]) {
    return <div className="p-8 text-white">チームデータが見つかりません。NEW GAMEからゲームを開始してください。</div>;
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="text-lg font-bold text-white">🏠 自チーム: {userTeam}</div>
          <p className="text-sm text-gray-400 mt-1">ロスター管理は自チームのみ設定できます</p>
        </div>
        <LineupSettingScreen teamName={userTeam} onBack={null} />
      </div>
    </div>
  );
};

export default RosterScreen;
