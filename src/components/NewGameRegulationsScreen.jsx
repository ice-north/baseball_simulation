import React, { useState } from 'react';
import TutorialHint from './TutorialHint.jsx';
import { REGULATION_PRESETS, getPlayoffFormatDescription } from '../season/regulationSettings.js';
import { getValidTwoLeagueGameCounts } from '../season/scheduleGenerator.js';
import { INDEPENDENT_LEAGUES } from '../corporate/independentLeagueData.js';

const NewGameRegulationsScreen = ({ onComplete, onBack, selectedLeague = null }) => {
  const initialPreset = selectedLeague ? REGULATION_PRESETS[selectedLeague] : null;
  const initialRegs = initialPreset?.regulations || {};
  const initialCount = initialRegs.teamsCount || 4;
  const defaultAbbr_ = (i) => String.fromCharCode(0xFF21 + i);
  const leagueDef = selectedLeague ? INDEPENDENT_LEAGUES[selectedLeague] : null;
  const initialNames = [];
  const initialAbbrs = [];
  for (let i = 0; i < initialCount; i++) {
    if (leagueDef && leagueDef.teams[i]) {
      initialNames.push(leagueDef.teams[i].name);
      initialAbbrs.push(leagueDef.teams[i].abbreviation);
    } else {
      initialNames.push(`チーム${String.fromCharCode(65 + i)}`);
      initialAbbrs.push(defaultAbbr_(i));
    }
  }

  const [tempSettings, setTempSettings] = useState({
    // 独立リーグ名（カスタムリーグ用。プリセット選択時は定義名を使う）
    leagueName: leagueDef?.name || '新規独立リーグ',
    useDH: initialRegs.useDH || false,
    gamesPerSeason: initialRegs.gamesPerSeason || 75,
    teamsCount: initialCount,
    leagueFormat: initialRegs.leagueFormat || 'single',
    leagueNames: initialRegs.leagueNames || null,
    playoffFormat: initialRegs.playoffFormat || 'short',
    maxExtraInnings: initialRegs.maxExtraInnings || 12,
    teamNames: initialNames,
    teamAbbreviations: initialAbbrs,
  });

  // 半角→全角変換（略称用）
  const toFullWidth = (str) => str.replace(/[A-Za-z0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
  // デフォルト略称を生成（全角アルファベット1文字）
  const defaultAbbr = (i) => String.fromCharCode(0xFF21 + i); // Ａ, Ｂ, Ｃ...

  const handleTeamsCountChange = (newCount) => {
    const currentNames = tempSettings.teamNames || [];
    const currentAbbrs = tempSettings.teamAbbreviations || [];
    const newNames = [];
    const newAbbrs = [];
    for (let i = 0; i < newCount; i++) {
      newNames.push(currentNames[i] || `チーム${String.fromCharCode(65 + i)}`);
      newAbbrs.push(currentAbbrs[i] || defaultAbbr(i));
    }
    // 試合数を自動調整
    const oldGames = tempSettings.gamesPerSeason || 60;
    const isTwoLeague = tempSettings.leagueFormat === 'two' && newCount >= 4;
    let adjustedGames;
    if (isTwoLeague) {
      const validCounts = getValidTwoLeagueGameCounts(newCount, 150);
      if (validCounts.length > 0) {
        const closest = validCounts.reduce((best, o) =>
          Math.abs(o.value - oldGames) < Math.abs(best.value - oldGames) ? o : best
        );
        adjustedGames = closest.value;
      } else {
        adjustedGames = oldGames;
      }
    } else {
      const newD = Math.max(1, newCount - 1);
      const oldD = Math.max(1, (tempSettings.teamsCount || 4) - 1);
      const roundsPerOpponent = Math.max(1, Math.round(oldGames / oldD));
      adjustedGames = newD * roundsPerOpponent;
      if (adjustedGames < newD) adjustedGames = newD;
      if (adjustedGames > 150) adjustedGames = Math.floor(150 / newD) * newD;
    }
    setTempSettings({
      ...tempSettings,
      teamsCount: newCount,
      teamNames: newNames,
      teamAbbreviations: newAbbrs,
      gamesPerSeason: adjustedGames
    });
  };

  // 地域ごとの都市。ランダム生成では1つの地域からまとめて選び、
  // 実在の独立リーグのように地理的にまとまったリーグを作れるようにする。
  const REGIONS = [
    { key: 'hokkaido', label: '北海道', cities: ['札幌', '函館', '旭川', '釧路', '帯広', '小樽', '北見', '室蘭', '苫小牧', '岩見沢'] },
    { key: 'tohoku', label: '東北', cities: ['仙台', '青森', '弘前', '八戸', '盛岡', '秋田', '山形', '福島', '郡山', '石巻'] },
    { key: 'kanto_n', label: '北関東', cities: ['水戸', '宇都宮', '前橋', '高崎', 'つくば', '日立', '太田', '足利', '熊谷', '川越'] },
    { key: 'kanto_s', label: '南関東', cities: ['東京', '横浜', '川崎', '千葉', '相模原', '柏', '船橋', '浦和', '湘南', '八王子'] },
    { key: 'hokushinetsu', label: '北信越', cities: ['新潟', '長野', '松本', '富山', '金沢', '福井', '上越', '長岡', '諏訪', '能登'] },
    { key: 'tokai', label: '東海', cities: ['名古屋', '静岡', '浜松', '岐阜', '豊田', '四日市', '沼津', '富士', '岡崎', '津'] },
    { key: 'kansai', label: '関西', cities: ['大阪', '神戸', '京都', '堺', '姫路', '奈良', '和歌山', '尼崎', '滋賀', '東大阪'] },
    { key: 'chugoku', label: '中国', cities: ['広島', '岡山', '倉敷', '福山', '下関', '山口', '鳥取', '松江', '出雲', '呉'] },
    { key: 'shikoku', label: '四国', cities: ['松山', '高松', '高知', '徳島', '今治', '丸亀', '新居浜', '鳴門', '四万十', '宇和島'] },
    { key: 'kyushu', label: '九州', cities: ['福岡', '北九州', '熊本', '大分', '長崎', '佐賀', '宮崎', '鹿児島', '久留米', '佐世保'] },
    { key: 'okinawa', label: '沖縄', cities: ['那覇', '沖縄', '宜野湾', '浦添', 'うるま', '名護', '糸満', '宮古島', '石垣', '豊見城'] },
  ];
  // 隣接地域（1地域で人数が足りない場合の拡張先）
  const ADJACENT = {
    hokkaido: ['tohoku'], tohoku: ['hokkaido', 'kanto_n'], kanto_n: ['kanto_s', 'tohoku', 'hokushinetsu'],
    kanto_s: ['kanto_n', 'tokai'], hokushinetsu: ['kanto_n', 'tokai'], tokai: ['kansai', 'kanto_s', 'hokushinetsu'],
    kansai: ['tokai', 'chugoku', 'shikoku'], chugoku: ['kansai', 'shikoku', 'kyushu'],
    shikoku: ['chugoku', 'kansai', 'kyushu'], kyushu: ['chugoku', 'okinawa'], okinawa: ['kyushu'],
  };
  // 実在の収録リーグ（四国アイランドリーグplus / 北海道フロンティアリーグ）と
  // 名称が被らないものだけを使う
  const LEAGUE_SUFFIXES = [
    'ベースボールリーグ', '独立リーグ', 'チャレンジリーグ', 'ドリームリーグ',
    'ユナイテッドリーグ', 'ネクストリーグ', 'サマーリーグ', 'パートナーズリーグ',
  ];
  const TEAM_SUFFIXES = [
    'ファイターズ', 'ドラゴンズ', 'タイガース', 'イーグルス', 'ホークス',
    'マリナーズ', 'ベアーズ', 'ライオンズ', 'スターズ', 'フェニックス',
    'サンダーズ', 'ブレイブス', 'レイズ', 'ウォリアーズ', 'ナイツ',
    'オーシャンズ', 'フレイムズ', 'ウィングス', 'キングス', 'パイレーツ',
    'バッファローズ', 'カープ', 'ジャガーズ', 'コンドルズ', 'レジェンズ',
    'ストームズ', 'ガルーダ', 'サムライズ', 'ブリッツ', 'シャークス',
    'タイタンズ', 'セイバーズ', 'ヴィクトリー', 'クレインズ', 'マーベリックス',
  ];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffled = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // 1つの地域を基点に、必要数だけ近隣都市を集める（足りなければ隣接地域へ拡張）
  const collectNearbyCities = (count) => {
    const base = pick(REGIONS);
    let cities = shuffled(base.cities);
    const usedRegions = [base];
    for (const nextKey of (ADJACENT[base.key] || [])) {
      if (cities.length >= count) break;
      const r = REGIONS.find(x => x.key === nextKey);
      if (!r) continue;
      cities = cities.concat(shuffled(r.cities));
      usedRegions.push(r);
    }
    // それでも足りなければ全国から補う
    if (cities.length < count) {
      cities = cities.concat(shuffled(REGIONS.flatMap(r => r.cities)));
    }
    return { cities: cities.slice(0, count), base, usedRegions };
  };

  // リーグ名を生成（地域名＋接尾辞。地域が複数にまたがる場合は基点の地域名を使う）
  const makeLeagueName = (regionLabel) => `${regionLabel}${pick(LEAGUE_SUFFIXES)}`;

  const generateRandomLeagueName = () => {
    const label = pick(REGIONS).label;
    setTempSettings(prev => ({ ...prev, leagueName: makeLeagueName(label) }));
  };

  const generateRandomTeamNames = () => {
    const count = tempSettings.teamsCount;
    const { cities, base } = collectNearbyCities(count);
    const usedSuffixes = new Set();
    const newNames = [];
    const newAbbrs = [];
    for (let i = 0; i < count; i++) {
      const place = cities[i];
      let suffix;
      do { suffix = pick(TEAM_SUFFIXES); } while (usedSuffixes.has(suffix));
      usedSuffixes.add(suffix);
      newNames.push(`${place}${suffix}`);
      const abbrChars = [...place].slice(0, 3);
      newAbbrs.push(abbrChars.length >= 3 ? abbrChars.join('') : toFullWidth(place).slice(0, 3));
    }
    // チーム名と同時にリーグ名も地域に合わせて生成する
    setTempSettings(prev => ({
      ...prev,
      teamNames: newNames,
      teamAbbreviations: newAbbrs,
      leagueName: makeLeagueName(base.label),
    }));
  };

  const handleTeamNameChange = (index, newName) => {
    const newNames = [...tempSettings.teamNames];
    newNames[index] = newName;
    setTempSettings({ ...tempSettings, teamNames: newNames });
  };

  const handleTeamAbbrChange = (index, newAbbr) => {
    // 全角3文字まで（半角入力は全角に変換）
    const converted = toFullWidth(newAbbr);
    // 全角文字数で3文字までに制限
    const trimmed = [...converted].slice(0, 3).join('');
    const newAbbrs = [...(tempSettings.teamAbbreviations || [])];
    newAbbrs[index] = trimmed;
    setTempSettings({ ...tempSettings, teamAbbreviations: newAbbrs });
  };

  const handleStart = () => {
    onComplete({ ...tempSettings, preset: selectedLeague });
  };

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">⚙️ レギュレーション設定</h1>
        {selectedLeague && (
          <p className="text-gray-300 text-sm mb-6">※レギュレーションは毎年オフシーズンに変更することができます</p>
        )}

        <TutorialHint id="regulations-intro" title="リーグのルールを決める">
          DH制・年間試合数・プレーオフ形式などを設定します。<b className="text-cyan-200">2リーグ制</b>ではリーグ内対戦＋交流戦の試合数が選べます。迷ったらそのまま確定でOK——設定は毎年オフに変更できます。
        </TutorialHint>

        {/* 詳細設定 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">詳細設定（カスタマイズ可能）</h2>
          <div className="space-y-4 text-white">
            <div className="flex items-center justify-between">
              <label className="font-medium">DH制</label>
              <select value={tempSettings.useDH ? 'true' : 'false'} onChange={(e) => setTempSettings({...tempSettings, useDH: e.target.value === 'true'})} className="bg-gray-700 rounded px-3 py-2">
                <option value="true">有効</option>
                <option value="false">無効</option>
              </select>
            </div>
            {!selectedLeague && <div className="flex items-center justify-between">
              <label className="font-medium">チーム数</label>
              <input type="number" min="2" max="12" value={tempSettings.teamsCount} onChange={(e) => handleTeamsCountChange(parseInt(e.target.value) || 4)} className="bg-gray-700 rounded px-3 py-2 w-24" />
            </div>}
            {!selectedLeague && <div className="flex items-center justify-between">
              <label className="font-medium">リーグ形式</label>
              <select value={tempSettings.leagueFormat || 'single'} onChange={(e) => {
                const newFormat = e.target.value;
                const tc = tempSettings.teamsCount || 4;
                const currentGames = tempSettings.gamesPerSeason || 60;
                let adjustedGames = currentGames;
                if (newFormat === 'two' && tc >= 4) {
                  const validCounts = getValidTwoLeagueGameCounts(tc, 150);
                  if (validCounts.length > 0 && !validCounts.some(o => o.value === currentGames)) {
                    const closest = validCounts.reduce((best, o) =>
                      Math.abs(o.value - currentGames) < Math.abs(best.value - currentGames) ? o : best
                    );
                    adjustedGames = closest.value;
                  }
                } else {
                  const d = Math.max(1, tc - 1);
                  if (currentGames % d !== 0) {
                    adjustedGames = Math.max(d, Math.round(currentGames / d) * d);
                    if (adjustedGames > 150) adjustedGames = Math.floor(150 / d) * d;
                  }
                }
                setTempSettings({...tempSettings, leagueFormat: newFormat, gamesPerSeason: adjustedGames});
              }} className="bg-gray-700 rounded px-3 py-2">
                <option value="single">1リーグ制</option>
                <option value="two" disabled={tempSettings.teamsCount < 4}>2リーグ制（{Math.floor(tempSettings.teamsCount / 2)}チーム×2）</option>
              </select>
            </div>}
            <div className="flex items-center justify-between">
              <label className="font-medium">年間試合数</label>
              <div className="flex items-center gap-2">
                <select
                  value={tempSettings.gamesPerSeason}
                  onChange={(e) => setTempSettings({...tempSettings, gamesPerSeason: parseInt(e.target.value)})}
                  className="bg-gray-700 rounded px-3 py-2"
                >
                  {(() => {
                    const tc = tempSettings.teamsCount || 4;
                    const isTwoLeague = tempSettings.leagueFormat === 'two' && tc >= 4;
                    if (isTwoLeague) {
                      const validCounts = getValidTwoLeagueGameCounts(tc, 150);
                      return validCounts.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.value}試合（リーグ内各{opt.intra}戦・交流各{opt.inter}戦）
                        </option>
                      ));
                    } else {
                      const d = Math.max(1, tc - 1);
                      const options = [];
                      for (let i = 1; d * i <= 150; i++) options.push(d * i);
                      return options.map(v => (
                        <option key={v} value={v}>{v}試合（各{v / d}戦）</option>
                      ));
                    }
                  })()}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">プレーオフ形式</label>
              <select value={tempSettings.playoffFormat} onChange={(e) => setTempSettings({...tempSettings, playoffFormat: e.target.value})} className="bg-gray-700 rounded px-3 py-2">
                <option value="short">3回戦制（2勝先取）</option>
                <option value="full">5回戦制（3勝先取）</option>
                <option value="tournament">4チームトーナメント</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">延長最大回数</label>
              <input type="number" min="9" max="20" value={tempSettings.maxExtraInnings} onChange={(e) => setTempSettings({...tempSettings, maxExtraInnings: parseInt(e.target.value)})} className="bg-gray-700 rounded px-3 py-2 w-24" />
            </div>
          </div>
        </div>

        {/* リーグ名設定（カスタムリーグのみ編集可） */}
        {!selectedLeague && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xl font-bold text-white">🏆 リーグ名</h2>
              <button
                onClick={generateRandomLeagueName}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm font-bold transition"
              >🎲 ランダム生成</button>
            </div>
            <input
              type="text"
              value={tempSettings.leagueName || ''}
              onChange={(e) => setTempSettings({ ...tempSettings, leagueName: e.target.value })}
              placeholder="例: 北海道フロンティアリーグ"
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-lg"
            />
            <p className="text-xs text-gray-300 mt-2">
              あなたが立ち上げる独立リーグの名称です。日程画面やトレードのリーグ表示に使われます。
            </p>
          </div>
        )}

        {/* チーム名設定 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-bold text-white">📝 チーム名設定</h2>
            <button
              onClick={generateRandomTeamNames}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm font-bold transition"
              title="1つの地域から近い都市を選び、リーグ名も地域に合わせて生成します"
            >🎲 ランダム生成</button>
            <span className="text-xs text-gray-300">近隣都市でまとめて生成されます</span>
          </div>
          {tempSettings.leagueFormat === 'two' ? (
            <>
              {/* 2リーグ制の場合はリーグごとに表示 */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={tempSettings.leagueNames?.[0] || 'リーグ1'}
                    onChange={(e) => {
                      const names = [...(tempSettings.leagueNames || ['リーグ1', 'リーグ2'])];
                      names[0] = e.target.value;
                      setTempSettings({ ...tempSettings, leagueNames: names });
                    }}
                    maxLength={10}
                    className="bg-gray-700 text-blue-400 font-bold text-lg rounded px-3 py-1 border border-blue-600/50 w-48"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tempSettings.teamNames.slice(0, Math.floor(tempSettings.teamsCount / 2)).map((name, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-blue-400 text-sm w-8">#{index + 1}</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => handleTeamNameChange(index, e.target.value)}
                        maxLength={15}
                        className="bg-gray-700 text-white rounded px-3 py-2 flex-1 border border-blue-600"
                        placeholder={`チーム${String.fromCharCode(65 + index)}`}
                      />
                      <input
                        type="text"
                        value={(tempSettings.teamAbbreviations || [])[index] || ''}
                        onChange={(e) => handleTeamAbbrChange(index, e.target.value)}
                        className="bg-gray-700 text-white rounded px-2 py-2 w-16 text-center border border-blue-600/50 text-sm"
                        placeholder="略称"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={tempSettings.leagueNames?.[1] || 'リーグ2'}
                    onChange={(e) => {
                      const names = [...(tempSettings.leagueNames || ['リーグ1', 'リーグ2'])];
                      names[1] = e.target.value;
                      setTempSettings({ ...tempSettings, leagueNames: names });
                    }}
                    maxLength={10}
                    className="bg-gray-700 text-orange-400 font-bold text-lg rounded px-3 py-1 border border-orange-600/50 w-48"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tempSettings.teamNames.slice(Math.floor(tempSettings.teamsCount / 2)).map((name, index) => {
                    const actualIndex = Math.floor(tempSettings.teamsCount / 2) + index;
                    return (
                      <div key={actualIndex} className="flex items-center gap-2">
                        <span className="text-orange-400 text-sm w-8">#{actualIndex + 1}</span>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => handleTeamNameChange(actualIndex, e.target.value)}
                          maxLength={15}
                          className="bg-gray-700 text-white rounded px-3 py-2 flex-1 border border-orange-600"
                          placeholder={`チーム${String.fromCharCode(65 + actualIndex)}`}
                        />
                        <input
                          type="text"
                          value={(tempSettings.teamAbbreviations || [])[actualIndex] || ''}
                          onChange={(e) => handleTeamAbbrChange(actualIndex, e.target.value)}
                          className="bg-gray-700 text-white rounded px-2 py-2 w-16 text-center border border-orange-600/50 text-sm"
                          placeholder="略称"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tempSettings.teamNames.map((name, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-gray-300 text-sm w-8">#{index + 1}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleTeamNameChange(index, e.target.value)}
                    maxLength={15}
                    className="bg-gray-700 text-white rounded px-3 py-2 flex-1"
                    placeholder={`チーム${String.fromCharCode(65 + index)}`}
                  />
                  <input
                    type="text"
                    value={(tempSettings.teamAbbreviations || [])[index] || ''}
                    onChange={(e) => handleTeamAbbrChange(index, e.target.value)}
                    className="bg-gray-700 text-white rounded px-2 py-2 w-16 text-center border border-gray-600 text-sm"
                    placeholder="略称"
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-gray-400 text-xs mt-3">※正式名（最大15文字）はドラフト・記録画面で使用。略称（全角3文字まで）はカレンダー・順位表・ランキングで使用されます</p>
        </div>

        <div className="flex items-center justify-center gap-6">
          {onBack && (
            <button onClick={onBack} className="text-gray-300 hover:text-white text-sm transition">
              ← 戻る
            </button>
          )}
          <button onClick={handleStart} className="bg-green-600 hover:bg-green-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition">
            設定完了 - トライアウトへ
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewGameRegulationsScreen;
