// ============================================================
// 注目選手・プロスペクトボード - src/components/ProspectBoardScreen.jsx
//
// 高校生プール(5000人)＋大学3-4年生の「アマチュア注目選手」を将来性(ポテンシャル)で
// ランキング表示する。5000人の見えない存在を主役にし、「今年の目玉は誰か」を毎年の
// 楽しみにするための画面。将来性は projectPeak() による推定（スカウト材料）。
// ============================================================
import React, { useState, useMemo } from 'react';
import { highSchoolPool, universityPool } from '../season/universityPool.js';
import { projectPeak } from '../season/potential.js';
import { calcPlayerOverall } from '../season/dispatchSystem.js';
import { getScoutAccuracy, formatRange, MAX_SCOUT_LEVEL } from '../season/scouting.js';
import { POSITION_NAMES } from '../utils/constants.js';
import PotentialBadge from './PotentialBadge.jsx';
import PlayerDetailModal from './PlayerDetailModal.jsx';
import TutorialHint from './TutorialHint.jsx';

const SOURCE_BADGE = {
  highschool: { label: '高校', cls: 'text-green-300 bg-green-900/40 border-green-700/40' },
  university: { label: '大学', cls: 'text-blue-300 bg-blue-900/40 border-blue-700/40' },
};
const POS_GROUP = {
  pitcher: 'pitcher', catcher: 'catcher',
  first: 'infield', second: 'infield', third: 'infield', short: 'infield',
  left: 'outfield', center: 'outfield', right: 'outfield',
};

export default function ProspectBoardScreen({ onBack }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [posFilter, setPosFilter] = useState('all');
  const [sortKey, setSortKey] = useState('potential'); // potential | current | age
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [scoutTick, setScoutTick] = useState(0); // 調査で再描画

  // 個別調査: _scoutLevel を上げて精度を高める
  const investigate = (player) => {
    player._scoutLevel = Math.min(MAX_SCOUT_LEVEL, (player._scoutLevel || 0) + 1);
    setScoutTick(t => t + 1);
  };

  // アマチュア候補を収集し、将来性で評価（重い処理なので一度だけ）
  const prospects = useMemo(() => {
    const list = [];
    // 高校生（全員）
    (highSchoolPool.players || []).forEach(p => {
      const proj = projectPeak(p);
      list.push({ player: p, source: 'highschool', affiliation: p.highSchoolName || p.highSchool || '高校', proj, current: calcPlayerOverall(p) });
    });
    // 大学3-4年生（在学2年目以降 or 20歳以上）
    Object.values(universityPool || {}).forEach(cohort => {
      if (!Array.isArray(cohort)) return;
      cohort.forEach(e => {
        const p = e.player;
        if (!p) return;
        const age = p.age || 18;
        if (age < 20) return; // 1-2年生は除外（3年生以上を注目候補に）
        const proj = projectPeak(p);
        list.push({ player: p, source: 'university', affiliation: e.universityTeamName || p.universityName || '大学', proj, current: calcPlayerOverall(p) });
      });
    });
    // 将来性(予測ピーク)で降順ソートし上位のみ保持（表示・処理の上限）
    list.sort((a, b) => b.proj.peak - a.proj.peak);
    return list.slice(0, 150);
  }, []);

  const filtered = useMemo(() => {
    let l = prospects.filter(x => {
      if (sourceFilter !== 'all' && x.source !== sourceFilter) return false;
      if (posFilter !== 'all' && POS_GROUP[x.player.position] !== posFilter) return false;
      return true;
    });
    l = [...l].sort((a, b) => {
      if (sortKey === 'current') return b.current - a.current;
      if (sortKey === 'age') return (a.player.age || 18) - (b.player.age || 18) || b.proj.peak - a.proj.peak;
      return b.proj.peak - a.proj.peak;
    });
    return l;
  }, [prospects, sourceFilter, posFilter, sortKey]);

  const gradeCount = useMemo(() => {
    const c = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    prospects.forEach(x => { c[x.proj.grade] = (c[x.proj.grade] || 0) + 1; });
    return c;
  }, [prospects]);

  if (prospects.length === 0) {
    return (
      <div className="p-6 text-white">
        <div className="flex items-center gap-3 mb-6">
          {onBack && <button onClick={onBack} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">← 戻る</button>}
          <h2 className="text-xl font-bold">注目選手ボード</h2>
        </div>
        <div className="text-gray-400 text-center py-16">
          <div className="text-5xl mb-4">🔭</div>
          <p className="text-lg mb-2">アマチュア候補がまだいません</p>
          <p className="text-sm text-gray-500">高校生は4月に生成されます。シーズンが進むと注目選手が並びます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 text-white">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {onBack && <button onClick={onBack} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">← 戻る</button>}
        <h2 className="text-xl font-bold">注目選手ボード</h2>
        <span className="text-xs font-bold text-amber-200 bg-amber-900/50 border border-amber-600/50 rounded px-2 py-0.5">アマチュア将来性ランキング</span>
        <span className="ml-auto text-gray-400 text-sm">上位 {prospects.length} 名</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        高校生プール＋大学3-4年生を<span className="text-cyan-300 font-bold">将来性（予測ピーク総合力）</span>で評価。今年の目玉を見つけましょう。※将来性はスカウト推定値で、実際の到達点は起用・育成で変動します。
      </p>

      <TutorialHint id="prospects-intro" title="注目選手ボードの見方">
        自チーム以外の選手は能力が「幅（レンジ）」で表示されます。<b className="text-cyan-200">「調査」</b>を重ねるほど精度が上がり、確定値に近づきます。無名でも将来性の高い原石を見つけるのが狙いです。
      </TutorialHint>

      {/* グレード分布 */}
      <div className="flex gap-2 mb-3">
        {['S', 'A', 'B', 'C', 'D'].map(g => (
          <div key={g} className="flex-1 text-center py-1.5 rounded border border-gray-700 bg-gray-800/60">
            <div className="text-sm font-bold text-gray-200">{g}級</div>
            <div className="text-xs text-gray-400 tabular-nums">{gradeCount[g]}名</div>
          </div>
        ))}
      </div>

      {/* フィルタ */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex gap-1">
          {[['all', '全て'], ['highschool', '高校'], ['university', '大学']].map(([v, l]) => (
            <button key={v} onClick={() => setSourceFilter(v)}
              className={`px-2 py-1 rounded text-xs font-medium ${sourceFilter === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {[['all', '全'], ['pitcher', '投'], ['catcher', '捕'], ['infield', '内'], ['outfield', '外']].map(([v, l]) => (
            <button key={v} onClick={() => setPosFilter(v)}
              className={`px-2 py-1 rounded text-xs font-medium ${posFilter === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <span className="text-xs text-gray-400 self-center">並び替え:</span>
          {[['potential', '将来性'], ['current', '現総合'], ['age', '年齢']].map(([v, l]) => (
            <button key={v} onClick={() => setSortKey(v)}
              className={`px-2 py-1 rounded text-xs font-medium ${sortKey === v ? 'bg-cyan-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* ランキング表 */}
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="text-gray-400 border-b border-gray-700 text-xs">
              <th className="text-right pr-2 py-2 w-10">#</th>
              <th className="text-left py-2 pl-1">選手</th>
              <th className="text-left py-2 w-14">区分</th>
              <th className="text-left py-2">所属</th>
              <th className="text-center py-2 w-12">守備</th>
              <th className="text-center py-2 w-10">齢</th>
              <th className="text-center py-2 w-16">現総合</th>
              <th className="text-left py-2 w-44 pl-2">将来性</th>
              <th className="text-center py-2 w-16">調査</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x, i) => {
              const sb = SOURCE_BADGE[x.source];
              const acc = getScoutAccuracy(x.player);
              const lvl = x.player._scoutLevel || 0;
              const maxed = lvl >= MAX_SCOUT_LEVEL;
              return (
                <tr key={x.player.id} className="border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer"
                  onClick={() => setDetailPlayer(x.player)}>
                  <td className={`text-right pr-2 py-1.5 font-mono ${i < 10 ? 'text-amber-400 font-bold' : 'text-gray-500'}`}>{i + 1}</td>
                  <td className="pl-1 py-1.5 font-bold text-white whitespace-nowrap">{x.player.name}</td>
                  <td className="py-1.5"><span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${sb.cls}`}>{sb.label}</span></td>
                  <td className="py-1.5 text-gray-300 text-xs truncate max-w-[10rem]">{x.affiliation}</td>
                  <td className="text-center py-1.5 text-gray-300 text-xs">{POSITION_NAMES[x.player.position] || '-'}</td>
                  <td className="text-center py-1.5 text-gray-300 tabular-nums">{x.player.age}</td>
                  <td className="text-center py-1.5 text-gray-200 font-mono tabular-nums text-xs">{formatRange(x.current, acc)}</td>
                  <td className="pl-2 py-1.5"><PotentialBadge player={x.player} compact scoutAccuracy={acc} /></td>
                  <td className="text-center py-1.5" onClick={(e) => e.stopPropagation()}>
                    {maxed ? (
                      <span className="text-xs text-cyan-300 font-bold">確定</span>
                    ) : (
                      <button onClick={() => investigate(x.player)}
                        className="text-xs px-2 py-0.5 rounded bg-cyan-800/70 hover:bg-cyan-700 text-cyan-100 border border-cyan-600/50 font-bold"
                        title="調査するとスカウト精度が上がる">
                        調査<span className="opacity-60 ml-0.5">{lvl}/{MAX_SCOUT_LEVEL}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-gray-500">該当する選手がいません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailPlayer && <PlayerDetailModal player={detailPlayer} scoutAccuracy={getScoutAccuracy(detailPlayer)} onClose={() => setDetailPlayer(null)} />}
    </div>
  );
}
