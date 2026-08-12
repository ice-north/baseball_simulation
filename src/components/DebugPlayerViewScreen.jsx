import { useState, useMemo } from 'react';
import { TEAMS_DATA, releasedPlayersPool } from '../teams-data.js';
import { universityPool, highSchoolPool } from '../season/universityPool.js';
import { POSITION_NAMES, getAbilityColor, getPositionSortIndex } from '../utils/constants.js';

const SOURCE_TABS = [
  { key: 'all', label: '全て' },
  { key: 'team', label: 'チーム所属' },
  { key: 'university', label: '大学プール' },
  { key: 'highschool', label: '高校生プール' },
  { key: 'released', label: 'リリースプール' },
];

function collectAllPlayers() {
  const result = [];

  for (const teamName of Object.keys(TEAMS_DATA)) {
    const team = TEAMS_DATA[teamName];
    if (!team?.players) continue;
    for (const player of team.players) {
      result.push({ player, source: 'team', sourceLabel: teamName });
    }
  }

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

  if (highSchoolPool?.players) {
    for (const player of highSchoolPool.players) {
      const hsName = player.highSchool?.name || '高校生';
      result.push({ player, source: 'highschool', sourceLabel: hsName });
    }
  }

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

function getSortValue(entry, key) {
  const p = entry.player;
  if (!p) return 0;
  switch (key) {
    case 'name': return p.name || '';
    case 'age': return p.age || 0;
    case 'position': return getPositionSortIndex(p.position);
    case 'source': return entry.sourceLabel || '';
    case 'velocity': return p.pitching?.velocity || 0;
    case 'control': return p.pitching?.control || 0;
    case 'stamina': return p.pitching?.stamina || 0;
    case 'meet': return p.batting?.meet || 0;
    case 'power': return p.batting?.power || 0;
    case 'eye': return p.batting?.eye || 0;
    case 'speed': return p.physical?.speed || 0;
    case 'defense': return p.fielding?.defense || 0;
    case 'arm': return p.physical?.arm || 0;
    case 'steal': return p.batting?.steal || 0;
    case 'bodyStamina': return p.physical?.bodyStamina || 0;
    case 'recovery': return p.physical?.recovery || 0;
    case 'growth': return (p.growthPotential ?? 1.0) + (p.growthModifier || 0);
    case 'fame': return p.fame || 0;
    case 'discipline': return p.personality?.discipline || 0;
    case 'mental': return p.personality?.mental || 0;
    case 'build': return p.physical?.build === 'large' ? 2 : p.physical?.build === 'small' ? 0 : 1;
    case 'throws': return p.physical?.throws === 'left' ? 0 : 1;
    case 'bats': return p.batting?.bats === 'left' ? 0 : p.batting?.bats === 'switch' ? 1 : 2;
    default: return 0;
  }
}

const COLUMNS = [
  { key: 'name', label: '名前', w: 'w-24' },
  { key: 'age', label: '齢', w: 'w-6' },
  { key: 'position', label: '位', w: 'w-6' },
  { key: 'build', label: '格', w: 'w-6' },
  { key: 'throws', label: '投', w: 'w-5' },
  { key: 'bats', label: '打', w: 'w-5' },
  { key: 'source', label: '所属', w: 'w-28' },
  { key: 'velocity', label: '球速', w: 'w-8' },
  { key: 'control', label: '制球', w: 'w-7' },
  { key: 'stamina', label: 'ｽﾀﾐ', w: 'w-7' },
  { key: 'meet', label: 'ﾐｰﾄ', w: 'w-7' },
  { key: 'power', label: 'ﾊﾟﾜｰ', w: 'w-7' },
  { key: 'eye', label: '選球', w: 'w-7' },
  { key: 'speed', label: '走力', w: 'w-7' },
  { key: 'defense', label: '守備', w: 'w-7' },
  { key: 'arm', label: '肩', w: 'w-7' },
  { key: 'steal', label: '盗塁', w: 'w-7' },
  { key: 'bodyStamina', label: '体力', w: 'w-7' },
  { key: 'recovery', label: '回復', w: 'w-7' },
  { key: 'discipline', label: 'プロ', w: 'w-7' },
  { key: 'mental', label: '精神', w: 'w-7' },
  { key: 'growth', label: '成長', w: 'w-7' },
  { key: 'fame', label: '名声', w: 'w-7' },
];

const BUILD_LABEL = { large: '大', medium: '中', small: '小' };

export default function DebugPlayerViewScreen({ onBack }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const allEntries = useMemo(() => collectAllPlayers(), []);

  const sourceFiltered = useMemo(() => {
    if (sourceFilter === 'all') return allEntries;
    return allEntries.filter(e => e.source === sourceFilter);
  }, [allEntries, sourceFilter]);

  const availableAges = useMemo(() => {
    const ages = new Set();
    for (const e of sourceFiltered) {
      if (e.player?.age != null) ages.add(e.player.age);
    }
    return [...ages].sort((a, b) => a - b);
  }, [sourceFiltered]);

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

  const sortedEntries = useMemo(() => {
    if (!sortKey) return filteredEntries;
    return [...filteredEntries].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
  }, [filteredEntries, sortKey, sortAsc]);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'name' || key === 'source'); }
  };

  return (
    <div className="min-h-screen bg-surface-1 text-white p-4">
      {/* 背景は全幅のまま、本文だけ 7xl で止める（4Kで列が伸びきるのを防ぐ） */}
      <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">戻る</button>
          )}
          <h1 className="text-xl font-bold">デバッグ用 全選手閲覧</h1>
          <span className="text-gray-300 text-sm">({sortedEntries.length} / {allEntries.length}人)</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {SOURCE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setSourceFilter(tab.key); setAgeFilter(null); }}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              sourceFilter === tab.key ? 'seg-on' : 'seg'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <input
          type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="選手名で検索..."
          className="w-64 px-3 py-1.5 bg-surface-2 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        <button onClick={() => setAgeFilter(null)}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${ageFilter === null ? 'seg-on' : 'seg'}`}>
          全年齢
        </button>
        {availableAges.map(age => (
          <button key={age} onClick={() => setAgeFilter(age)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${ageFilter === age ? 'seg-on' : 'seg'}`}>
            {age}歳
          </button>
        ))}
      </div>

      {sortedEntries.length === 0 ? (
        <div className="text-gray-400 text-center py-8">該当する選手がいません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-gray-700">
                {COLUMNS.map(col => (
                  <th key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`py-1 px-1 cursor-pointer hover:text-white select-none transition-colors ${col.w} ${
                      col.key === 'name' || col.key === 'source' ? 'text-left' : 'text-center'
                    } ${sortKey === col.key ? 'text-cyan-400' : 'text-gray-300'}`}>
                    {col.label}{sortKey === col.key ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry, idx) => (
                <PlayerRow key={entry.player?.id ?? idx} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const gp = Math.max(0.3, Math.min(1.8, (player.growthPotential ?? 1.0) + (player.growthModifier || 0)));

  const C = ({ v, isVel }) => {
    if (v == null) return <span className="text-gray-700">-</span>;
    return <span className={getAbilityColor(isVel ? Math.min(99, (v - 115) * 2.5) : v)}>{v}</span>;
  };

  const gpColor = gp >= 1.3 ? 'text-red-400' : gp >= 1.1 ? 'text-orange-400' : gp >= 0.9 ? 'text-yellow-300' : gp >= 0.7 ? 'text-blue-400' : 'text-gray-400';

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/50">
      <td className="py-0.5 px-1 text-white truncate max-w-[6rem]" title={player.name}>{player.name}</td>
      <td className="py-0.5 px-1 text-center text-gray-300">{player.age}</td>
      <td className="py-0.5 px-1 text-center">
        <span className={isPitcher ? 'text-red-400' : 'text-blue-400'}>{POSITION_NAMES[player.position] || player.position}</span>
      </td>
      <td className="py-0.5 px-1 text-center text-gray-300">{BUILD_LABEL[player.physical?.build] || '-'}</td>
      <td className="py-0.5 px-1 text-center text-gray-300">{player.physical?.throws === 'left' ? '左' : '右'}</td>
      <td className="py-0.5 px-1 text-center text-gray-300">{player.batting?.bats === 'left' ? '左' : player.batting?.bats === 'switch' ? '両' : '右'}</td>
      <td className="py-0.5 px-1 text-gray-300 truncate max-w-[7rem]" title={sourceLabel}>{sourceLabel}</td>
      <td className="py-0.5 px-1 text-center">{isPitcher && vel != null ? <C v={vel} isVel /> : <span className="text-gray-700">-</span>}</td>
      <td className="py-0.5 px-1 text-center">{isPitcher ? <C v={ctrl} /> : <span className="text-gray-700">-</span>}</td>
      <td className="py-0.5 px-1 text-center">{isPitcher ? <C v={stm} isVel={false} /> : <span className="text-gray-700">-</span>}</td>
      <td className="py-0.5 px-1 text-center"><C v={player.batting?.meet} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.batting?.power} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.batting?.eye} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.physical?.speed} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.fielding?.defense} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.physical?.arm} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.batting?.steal} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.physical?.bodyStamina} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.physical?.recovery} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.personality?.discipline} /></td>
      <td className="py-0.5 px-1 text-center"><C v={player.personality?.mental} /></td>
      <td className="py-0.5 px-1 text-center"><span className={gpColor}>{gp.toFixed(2)}</span></td>
      <td className="py-0.5 px-1 text-center">{(player.fame || 0) > 0 ? <span className="text-yellow-300">{player.fame}</span> : <span className="text-gray-700">-</span>}</td>
    </tr>
  );
}
