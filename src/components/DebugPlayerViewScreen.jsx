import { useState, useMemo } from 'react';
import { TEAMS_DATA, releasedPlayersPool } from '../teams-data.js';
import { universityPool, highSchoolPool } from '../season/universityPool.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';

const SOURCE_TABS = [
  { key: 'all', label: '全て' },
  { key: 'team', label: 'チーム所属' },
  { key: 'university', label: '大学プール' },
  { key: 'highschool', label: '高校生プール' },
  { key: 'released', label: 'リリースプール' },
];

/**
 * 全ソースから選手を収集し、ソース情報を付与して返す
 */
function collectAllPlayers() {
  const result = [];

  // 1. チーム所属選手
  for (const teamName of Object.keys(TEAMS_DATA)) {
    const team = TEAMS_DATA[teamName];
    if (!team?.players) continue;
    for (const player of team.players) {
      result.push({ player, source: 'team', sourceLabel: teamName });
    }
  }

  // 2. 大学プール
  for (const enrollYear of Object.keys(universityPool)) {
    const cohort = universityPool[enrollYear];
    if (!Array.isArray(cohort)) continue;
    for (const entry of cohort) {
      const p = entry.player;
      if (!p) continue;
      const label = entry.universityTeamName
        ? `${entry.universityTeamName}(${entry.universityRank || '?'})`
        : `大学(${entry.universityRank || '?'})`;
      result.push({ player: p, source: 'university', sourceLabel: label });
    }
  }

  // 3. 高校生プール
  if (highSchoolPool?.players) {
    for (const player of highSchoolPool.players) {
      result.push({ player, source: 'highschool', sourceLabel: '高校生' });
    }
  }

  // 4. リリースプール
  if (Array.isArray(releasedPlayersPool)) {
    for (const player of releasedPlayersPool) {
      const label = player.previousTeam
        ? `元${player.previousTeam}`
        : player.formerTeam
          ? `元${player.formerTeam}`
          : 'リリース';
      result.push({ player, source: 'released', sourceLabel: label });
    }
  }

  return result;
}

export default function DebugPlayerViewScreen({ onBack }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState(null); // null = 全年齢
  const [searchText, setSearchText] = useState('');

  // 全選手収集（タブ切替やフィルタ変更のたびに再計算しない範囲でメモ化）
  const allEntries = useMemo(() => collectAllPlayers(), []);

  // ソースフィルタ適用
  const sourceFiltered = useMemo(() => {
    if (sourceFilter === 'all') return allEntries;
    return allEntries.filter(e => e.source === sourceFilter);
  }, [allEntries, sourceFilter]);

  // 利用可能な年齢一覧
  const availableAges = useMemo(() => {
    const ages = new Set();
    for (const e of sourceFiltered) {
      if (e.player?.age != null) ages.add(e.player.age);
    }
    return [...ages].sort((a, b) => a - b);
  }, [sourceFiltered]);

  // 年齢フィルタ + 名前検索適用
  const filteredEntries = useMemo(() => {
    let entries = sourceFiltered;
    if (ageFilter !== null) {
      entries = entries.filter(e => e.player?.age === ageFilter);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      entries = entries.filter(e => e.player?.name?.toLowerCase().includes(q));
    }
    return entries;
  }, [sourceFiltered, ageFilter, searchText]);

  // 年齢別グループ（表示用）
  const groupedByAge = useMemo(() => {
    const map = {};
    for (const entry of filteredEntries) {
      const age = entry.player?.age ?? '?';
      if (!map[age]) map[age] = [];
      map[age].push(entry);
    }
    const keys = Object.keys(map).sort((a, b) => Number(a) - Number(b));
    return keys.map(age => ({ age, entries: map[age] }));
  }, [filteredEntries]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              戻る
            </button>
          )}
          <h1 className="text-xl font-bold">デバッグ用 全選手閲覧</h1>
          <span className="text-gray-400 text-sm">
            ({filteredEntries.length} / {allEntries.length}人)
          </span>
        </div>
      </div>

      {/* Source filter tabs */}
      <div className="flex flex-wrap gap-1 mb-3">
        {SOURCE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setSourceFilter(tab.key); setAgeFilter(null); }}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              sourceFilter === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="選手名で検索..."
          className="w-64 px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Age filter buttons */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setAgeFilter(null)}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${
            ageFilter === null
              ? 'bg-yellow-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          全年齢
        </button>
        {availableAges.map(age => (
          <button
            key={age}
            onClick={() => setAgeFilter(age)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              ageFilter === age
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {age}歳
          </button>
        ))}
      </div>

      {/* Player table grouped by age */}
      {filteredEntries.length === 0 ? (
        <div className="text-gray-500 text-center py-8">該当する選手がいません</div>
      ) : (
        groupedByAge.map(group => (
          <div key={group.age} className="mb-4">
            <div className="text-sm font-bold text-yellow-400 mb-1 border-b border-gray-700 pb-0.5">
              {group.age}歳 ({group.entries.length}人)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="py-1 px-1.5 text-left w-24">名前</th>
                    <th className="py-1 px-1 text-center w-6">齢</th>
                    <th className="py-1 px-1 text-center w-6">位</th>
                    <th className="py-1 px-1.5 text-left w-32">所属</th>
                    <th className="py-1 px-1 text-center w-8">球速</th>
                    <th className="py-1 px-1 text-center w-8">制球</th>
                    <th className="py-1 px-1 text-center w-8">ｽﾀﾐﾅ</th>
                    <th className="py-1 px-1 text-center w-8">ﾐｰﾄ</th>
                    <th className="py-1 px-1 text-center w-8">ﾊﾟﾜｰ</th>
                    <th className="py-1 px-1 text-center w-8">選球</th>
                    <th className="py-1 px-1 text-center w-8">走力</th>
                    <th className="py-1 px-1 text-center w-8">守備</th>
                    <th className="py-1 px-1 text-center w-8">肩</th>
                    <th className="py-1 px-1 text-center w-8">名声</th>
                  </tr>
                </thead>
                <tbody>
                  {group.entries.map((entry, idx) => (
                    <PlayerRow key={entry.player?.id ?? idx} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PlayerRow({ entry }) {
  const { player, sourceLabel } = entry;
  if (!player) return null;

  const isPitcher = player.position === 'pitcher';
  const vel = player.pitching?.velocity;
  const ctrl = player.pitching?.control;
  const stm = player.pitching?.stamina;
  const meet = player.batting?.meet;
  const power = player.batting?.power;
  const eye = player.batting?.eye;
  const speed = player.physical?.speed;
  const defense = player.fielding?.defense;
  const arm = player.physical?.arm;
  const fame = player.fame || 0;

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/50">
      <td className="py-0.5 px-1.5 text-white truncate max-w-[6rem]" title={player.name}>
        {player.name}
      </td>
      <td className="py-0.5 px-1 text-center text-gray-300">{player.age}</td>
      <td className="py-0.5 px-1 text-center">
        <span className={isPitcher ? 'text-red-400' : 'text-blue-400'}>
          {POSITION_NAMES[player.position] || player.position}
        </span>
      </td>
      <td className="py-0.5 px-1.5 text-gray-400 truncate max-w-[8rem]" title={sourceLabel}>
        {sourceLabel}
      </td>
      {/* Pitcher stats */}
      <td className="py-0.5 px-1 text-center">
        {isPitcher && vel != null ? <span className={getAbilityColor((vel - 115) * 2.5)}>{vel}</span> : <span className="text-gray-700">-</span>}
      </td>
      <td className="py-0.5 px-1 text-center">
        {isPitcher && ctrl != null ? <span className={getAbilityColor(ctrl)}>{ctrl}</span> : <span className="text-gray-700">-</span>}
      </td>
      <td className="py-0.5 px-1 text-center">
        {isPitcher && stm != null ? <span className={getAbilityColor(stm / 2)}>{stm}</span> : <span className="text-gray-700">-</span>}
      </td>
      {/* Batter stats */}
      <td className="py-0.5 px-1 text-center">
        {meet != null ? <span className={getAbilityColor(meet)}>{meet}</span> : <span className="text-gray-700">-</span>}
      </td>
      <td className="py-0.5 px-1 text-center">
        {power != null ? <span className={getAbilityColor(power)}>{power}</span> : <span className="text-gray-700">-</span>}
      </td>
      <td className="py-0.5 px-1 text-center">
        {eye != null ? <span className={getAbilityColor(eye)}>{eye}</span> : <span className="text-gray-700">-</span>}
      </td>
      <td className="py-0.5 px-1 text-center">
        {speed != null ? <span className={getAbilityColor(speed)}>{speed}</span> : <span className="text-gray-700">-</span>}
      </td>
      <td className="py-0.5 px-1 text-center">
        {defense != null ? <span className={getAbilityColor(defense)}>{defense}</span> : <span className="text-gray-700">-</span>}
      </td>
      <td className="py-0.5 px-1 text-center">
        {arm != null ? <span className={getAbilityColor(arm)}>{arm}</span> : <span className="text-gray-700">-</span>}
      </td>
      <td className="py-0.5 px-1 text-center">
        {fame > 0 ? <span className="text-yellow-300">{fame}</span> : <span className="text-gray-700">-</span>}
      </td>
    </tr>
  );
}
