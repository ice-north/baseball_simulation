import React from 'react';
import { ScreenShell, ScreenHeader } from './GameUIComponents.jsx';
import { validateRegulations, getPlayoffFormatDescription, canModifyRegulations, thinTwoLeagueGameCounts, twoLeagueGameCountLabel } from '../season/regulationSettings.js';
import { getValidTwoLeagueGameCounts, getValidSingleLeagueGameCounts, fitGamesPerSeason } from '../season/scheduleGenerator.js';
import { PHASE_INFO } from '../season/seasonManager.js';
import { normalizeMaxExtraInnings } from '../teams-data.js';
import { getModeCapabilities } from '../game/modeCapabilities.js';
import { validateLeagueTeamNames } from '../season/nextSeasonRegulations.js';

// ⚠ 部品の中で定義しないこと。描画のたびに別の部品として作り直され、中の入力欄が
//   1文字打つごとに消えて作り直される（以前は延長の欄に2桁を打てなかった）
const SettingRow = ({ label, children }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-700/50">
    <label className="text-gray-300 text-sm font-medium">{label}</label>
    {children}
  </div>
);

// 延長最大回数を試合で使える値（9〜30回）にする。打っている途中の空欄は標準の12回へ
const fixExtra = (settings) => ({
  ...settings,
  maxExtraInnings: normalizeMaxExtraInnings(settings.maxExtraInnings === '' ? undefined : settings.maxExtraInnings),
});

// confirmLabel: 年度更新の決定ボタンの名前。行き先で変える（箱庭はキャンプが無くチーム設定へ進む）
// currentTeams: いまのリーグの球団（`allTeams`）。年度更新で、行ごとの改名・解散・新規参入を決める元
const RegulationsContent = ({ seasonData, setSeasonData, onConfirm, confirmLabel = '確定 → キャンプへ進む', currentTeams }) => {
  const currentPhase = seasonData.phase || 'off_season';
  const canModify = onConfirm ? true : canModifyRegulations(currentPhase);
  const phaseInfo = currentPhase && PHASE_INFO[currentPhase]
    ? PHASE_INFO[currentPhase]
    : { name: '', color: 'bg-gray-100', description: '' };
  // ⚠ 大学・社会人の設定には延長とプレーオフの項目が無い（作るときに入れていない）。
  //   試合は無いとき12回で打ち切るので、欄と「現在の設定」も12回を出す（以前は空欄・「延長: 回」）
  // ⚠ **独立リーグ・箱庭の試合数は、いまのリーグの形で選べる値に合わせて始める**（`fitGamesPerSeason`）。
  //    古い保存は選べない値を持つことがあり（2リーグの奇数球団など）、以前は選択欄が別の値
  //    （並びの先頭）を見せていた。確定すると、この値で翌年の日程を組む（翌年の日程も同じ直し方）
  const [tempSettings, setTempSettings] = React.useState(() => {
    const settings = seasonData.settings || {};
    const games = getModeCapabilities(settings).independent && settings.gamesPerSeason > 0
      ? fitGamesPerSeason({
          teamsCount: settings.teamsCount || 4,
          leagueFormat: settings.leagueFormat,
          games: settings.gamesPerSeason,
        })
      : settings.gamesPerSeason;
    return {
      ...settings,
      gamesPerSeason: games,
      maxExtraInnings: settings.maxExtraInnings ?? 12,
    };
  });
  // プレーオフは独立リーグ（と箱庭）だけ。大学・社会人では形式の欄を出さない（以前は「PO:」が空だった）
  const { leaguePlayoffs, independent } = getModeCapabilities(seasonData.settings);
  // ⚠ 大学・社会人のリーグの形（チーム数・形式・試合数・チーム名）は、実在のリーグと世界の球団に
  //    合わせて決まっている。ここで変えると設定の球団名だけが「チームA」などに替わり、世界の球団と
  //    食い違う（以前はオフと年度更新で変えられた）。DH と延長だけ変えられるようにする
  const canModifyStructure = canModify && independent;

  // 半角→全角変換（略称用）
  const toFullWidth = (str) => str.replace(/[A-Za-z0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
  const defaultAbbr = (i) => String.fromCharCode(0xFF21 + i);

  const handleTeamsCountChange = (newCount) => {
    if (isNaN(newCount) || newCount < 2 || newCount > 12 || newCount % 2 !== 0) return;
    const currentNames = tempSettings.teamNames || [];
    const currentAbbrs = tempSettings.teamAbbreviations || [];
    const newNames = [];
    const newAbbrs = [];
    for (let i = 0; i < newCount; i++) {
      newNames.push(currentNames[i] || `チーム${String.fromCharCode(65 + i)}`);
      newAbbrs.push(currentAbbrs[i] || defaultAbbr(i));
    }
    // 試合数を選べる値に自動調整（新規の規定画面・翌年の日程と同じ `fitGamesPerSeason`）。
    // ⚠ 以前は2リーグでも1リーグの決め方（チーム数-1の倍数）で直し、選べない値になることがあった
    const adjustedGames = fitGamesPerSeason({
      teamsCount: newCount,
      leagueFormat: tempSettings.leagueFormat,
      games: tempSettings.gamesPerSeason || 60,
      previousTeamsCount: tempSettings.teamsCount || 4,
    });
    setTempSettings({
      ...tempSettings,
      teamsCount: newCount,
      teamNames: newNames,
      teamAbbreviations: newAbbrs,
      gamesPerSeason: adjustedGames
    });
  };

  const handleTeamNameChange = (index, newName) => {
    const newNames = [...(tempSettings.teamNames || [])];
    newNames[index] = newName;
    setTempSettings({ ...tempSettings, teamNames: newNames });
  };

  const handleTeamAbbrChange = (index, newAbbr) => {
    const converted = toFullWidth(newAbbr);
    const trimmed = [...converted].slice(0, 3).join('');
    const newAbbrs = [...(tempSettings.teamAbbreviations || [])];
    newAbbrs[index] = trimmed;
    setTempSettings({ ...tempSettings, teamAbbreviations: newAbbrs });
  };

  const handleSaveSettings = () => {
    const settings = fixExtra(tempSettings);
    const validation = validateRegulations(settings);
    if (!validation.valid) {
      alert('設定エラー:\n' + validation.errors.join('\n'));
      return;
    }
    setTempSettings(settings);
    setSeasonData({ ...seasonData, settings });
    alert('レギュレーション設定を保存しました');
  };

  return (
    <ScreenShell width="form">
      <ScreenHeader title="レギュレーション設定" />

      {/* ⚠ この帯は**地色の上に直に載る**。半透明のままだと明るい紙の上で薄まり、
          載っている黄色い文字が 2.69:1 で読めなくなる（実測）。不透明にすること */}
      {!canModify && (
        <div className="bg-yellow-950 border border-yellow-700/50 rounded-lg p-3 mb-3">
          <p className="text-yellow-200 font-bold text-sm">レギュレーション変更はオフシーズンのみ可能です</p>
          <p className="text-yellow-300/70 text-xs mt-0.5">現在: {phaseInfo.name}</p>
        </div>
      )}

      <div className="bg-surface-2 rounded-lg p-4 mb-3">
        <h2 className="text-sm font-bold mb-2 text-white">詳細設定</h2>
        {canModify && !independent && (
          <p className="text-xs text-gray-300 mb-2">
            チーム数・リーグ形式・試合数・チーム名は、実在のリーグに合わせて決まっているので変えられません。DH制と延長は変えられます。
          </p>
        )}
        <div className="space-y-0">
          <SettingRow label="DH制（指名打者）">
            <input type="checkbox" checked={tempSettings.useDH} onChange={(e) => setTempSettings({ ...tempSettings, useDH: e.target.checked })} disabled={!canModify} className="w-5 h-5 rounded" />
          </SettingRow>
          <SettingRow label="チーム数">
            <select value={tempSettings.teamsCount} onChange={(e) => handleTeamsCountChange(parseInt(e.target.value))} disabled={!canModifyStructure} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm w-24">
              {/* ⚠ 奇数の球団数（新規の規定画面では選べる）はいまの値として残す。無いと選択欄が「2チーム」を見せた */}
              {[...new Set([2, 4, 6, 8, 10, 12, tempSettings.teamsCount].filter(Number.isInteger))].sort((a, b) => a - b)
                .map(n => <option key={n} value={n}>{n}チーム</option>)}
            </select>
          </SettingRow>
          <SettingRow label="リーグ形式">
            <select
              value={tempSettings.leagueFormat || 'single'}
              onChange={(e) => setTempSettings({
                ...tempSettings,
                leagueFormat: e.target.value,
                // ⚠ 形式を変えたら試合数も選べる値に合わせる（以前はそのままで、選択欄が別の値を見せた）
                gamesPerSeason: fitGamesPerSeason({ teamsCount: tempSettings.teamsCount || 4, leagueFormat: e.target.value, games: tempSettings.gamesPerSeason || 60 }),
              })}
              disabled={!canModifyStructure}
              className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm"
            >
              <option value="single">1リーグ制</option>
              <option value="two" disabled={tempSettings.teamsCount < 4}>2リーグ制</option>
            </select>
          </SettingRow>
          {tempSettings.leagueFormat === 'two' && (
            <SettingRow label="リーグ名">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={tempSettings.leagueNames?.[0] || 'リーグ1'}
                  onChange={(e) => setTempSettings({ ...tempSettings, leagueNames: [e.target.value, tempSettings.leagueNames?.[1] || 'リーグ2'] })}
                  disabled={!canModifyStructure} maxLength={15}
                  className="bg-gray-700 text-white px-2 py-1.5 rounded text-sm w-28"
                />
                <input
                  type="text"
                  value={tempSettings.leagueNames?.[1] || 'リーグ2'}
                  onChange={(e) => setTempSettings({ ...tempSettings, leagueNames: [tempSettings.leagueNames?.[0] || 'リーグ1', e.target.value] })}
                  disabled={!canModifyStructure} maxLength={15}
                  className="bg-gray-700 text-white px-2 py-1.5 rounded text-sm w-28"
                />
              </div>
            </SettingRow>
          )}
          <SettingRow label="年間試合数">
            <select
              value={tempSettings.gamesPerSeason}
              onChange={(e) => setTempSettings({ ...tempSettings, gamesPerSeason: parseInt(e.target.value) })}
              disabled={!canModifyStructure}
              className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm"
            >
              {(() => {
                const tc = tempSettings.teamsCount || 4;
                const isTwoLeague = tempSettings.leagueFormat === 'two' && tc >= 4;
                if (isTwoLeague) {
                  const validCounts = thinTwoLeagueGameCounts(getValidTwoLeagueGameCounts(tc, 150), tempSettings.gamesPerSeason);
                  if (validCounts.length === 0) {
                    return <option value={tempSettings.gamesPerSeason}>{tempSettings.gamesPerSeason}試合</option>;
                  }
                  return validCounts.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {twoLeagueGameCountLabel(opt, tc)}
                    </option>
                  ));
                }
                const d = Math.max(1, tc - 1);
                const options = getValidSingleLeagueGameCounts(tc, 150);
                return options.map(v => (
                  <option key={v} value={v}>{v}試合（各{v / d}戦）</option>
                ));
              })()}
            </select>
          </SettingRow>
          {leaguePlayoffs && (<>
          <SettingRow label="プレーオフ形式">
            <select value={tempSettings.playoffFormat} onChange={(e) => setTempSettings({ ...tempSettings, playoffFormat: e.target.value })} disabled={!canModify} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">
              <option value="short">3回戦制（2勝先取）</option>
              <option value="full">5回戦制（3勝先取）</option>
              <option value="tournament">4チームトーナメント</option>
            </select>
          </SettingRow>
          <div className="text-xs text-gray-400 py-1 pl-2">{getPlayoffFormatDescription(tempSettings.playoffFormat, tempSettings.leagueFormat)}</div>
          </>)}
          <SettingRow label="延長最大回数">
            <div className="flex items-center gap-2">
              <input type="number" value={tempSettings.maxExtraInnings}
                onChange={(e) => { const raw = e.target.value; setTempSettings(t => ({ ...t, maxExtraInnings: raw === '' ? '' : Math.floor(Number(raw)) })); }}
                onBlur={() => setTempSettings(fixExtra)}
                disabled={!canModify} min="9" max="30" className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm w-20" />
              <span className="text-xs text-gray-400">回まで（9〜30）</span>
            </div>
          </SettingRow>
        </div>
        {/* 年度更新（onConfirm あり）では下の決定ボタン（`confirmLabel`）が保存も兼ねるので出さない。
            ⚠ 以前は両方が並び、どちらを押せば決まるのか分からなかった */}
        {!onConfirm && (
          <div className="mt-3">
            <button onClick={handleSaveSettings} disabled={!canModify} className="w-full py-2 rounded-lg font-bold text-sm transition btn-primary">
              設定を保存
            </button>
          </div>
        )}
      </div>

      {/* チーム名設定（大学・社会人は実在の球団なので出さない） */}
      {canModifyStructure && (
        <div className="bg-surface-2 rounded-lg p-4 mb-3">
          <h2 className="text-sm font-bold mb-2 text-white">チーム名設定</h2>
          {tempSettings.leagueFormat === 'two' ? (
            <>
              <div className="mb-3">
                <h3 className="text-xs font-bold text-blue-400 mb-1.5">
                  {tempSettings.leagueNames?.[0] || 'リーグ1'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(tempSettings.teamNames || []).slice(0, Math.floor(tempSettings.teamsCount / 2)).map((name, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <span className="text-blue-400 text-xs w-6">#{index + 1}</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => handleTeamNameChange(index, e.target.value)}
                        maxLength={15}
                        className="bg-gray-700 text-white rounded px-2 py-1 flex-1 text-sm border border-blue-600/50"
                        placeholder={`チーム${String.fromCharCode(65 + index)}`}
                      />
                      <input
                        type="text"
                        value={(tempSettings.teamAbbreviations || [])[index] || ''}
                        onChange={(e) => handleTeamAbbrChange(index, e.target.value)}
                        className="bg-gray-700 text-white rounded px-1.5 py-1 w-14 text-center border border-blue-600/30 text-xs"
                        placeholder="略称"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-bold text-orange-400 mb-1.5">
                  {tempSettings.leagueNames?.[1] || 'リーグ2'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(tempSettings.teamNames || []).slice(Math.floor(tempSettings.teamsCount / 2)).map((name, index) => {
                    const actualIndex = Math.floor(tempSettings.teamsCount / 2) + index;
                    return (
                      <div key={actualIndex} className="flex items-center gap-1.5">
                        <span className="text-orange-400 text-xs w-6">#{actualIndex + 1}</span>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => handleTeamNameChange(actualIndex, e.target.value)}
                          maxLength={15}
                          className="bg-gray-700 text-white rounded px-2 py-1 flex-1 text-sm border border-orange-600/50"
                          placeholder={`チーム${String.fromCharCode(65 + actualIndex)}`}
                        />
                        <input
                          type="text"
                          value={(tempSettings.teamAbbreviations || [])[actualIndex] || ''}
                          onChange={(e) => handleTeamAbbrChange(actualIndex, e.target.value)}
                          className="bg-gray-700 text-white rounded px-1.5 py-1 w-14 text-center border border-orange-600/30 text-xs"
                          placeholder="略称"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(tempSettings.teamNames || []).map((name, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <span className="text-gray-300 text-xs w-6">#{index + 1}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleTeamNameChange(index, e.target.value)}
                    maxLength={15}
                    className="bg-gray-700 text-white rounded px-2 py-1 flex-1 text-sm"
                    placeholder={`チーム${String.fromCharCode(65 + index)}`}
                  />
                  <input
                    type="text"
                    value={(tempSettings.teamAbbreviations || [])[index] || ''}
                    onChange={(e) => handleTeamAbbrChange(index, e.target.value)}
                    className="bg-gray-700 text-white rounded px-1.5 py-1 w-14 text-center border border-gray-600 text-xs"
                    placeholder="略称"
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-gray-400 text-xs mt-2">※正式名（最大15文字）はドラフト・記録画面で使用。略称（全角3文字まで）はカレンダー・順位表で使用</p>
        </div>
      )}

      <div className="bg-surface-2 rounded-lg p-4">
        <h2 className="text-sm font-bold mb-2 text-white">現在の設定</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300">
          <div>DH制: <span className="text-white">{seasonData.settings.useDH ? '有効' : '無効'}</span></div>
          <div>チーム数: <span className="text-white">{seasonData.settings.teamsCount}チーム</span></div>
          <div>形式: <span className="text-white">{{ two: '2リーグ', tournament: '大会' }[seasonData.settings.leagueFormat] || '1リーグ'}</span></div>
          {/* 社会人は大会だけで、リーグの試合数（0）を持たない */}
          {seasonData.settings.gamesPerSeason > 0 && <div>試合数: <span className="text-white">{seasonData.settings.gamesPerSeason}試合</span></div>}
          {leaguePlayoffs && <div className="col-span-2">PO: <span className="text-white">{getPlayoffFormatDescription(seasonData.settings.playoffFormat, seasonData.settings.leagueFormat)}</span></div>}
          <div>延長: <span className="text-white">{normalizeMaxExtraInnings(seasonData.settings.maxExtraInnings ?? 12)}回まで</span></div>
        </div>
      </div>

      {onConfirm && (
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              const settings = fixExtra(tempSettings);
              const validation = validateRegulations(settings);
              // 球団名（空・重なり・リーグの外の球団と同じ名前）も確定の前に確かめる（`validateLeagueTeamNames`）
              const errors = [
                ...validation.errors,
                ...(canModifyStructure
                  ? validateLeagueTeamNames(settings.teamNames || [], currentTeams || seasonData.settings?.teamNames || [])
                  : []),
              ];
              if (errors.length > 0) {
                alert('設定エラー:\n' + errors.join('\n'));
                return;
              }
              setSeasonData(prev => ({ ...prev, settings }));
              onConfirm(settings);
            }}
            className="btn-primary px-8 py-3 rounded-lg text-base transition shadow"
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </ScreenShell>
  );
};

const RegulationsScreen = (props) => props.seasonData
  ? <RegulationsContent {...props} />
  : <div className="p-8 text-white">読み込み中...</div>;

export default RegulationsScreen;
