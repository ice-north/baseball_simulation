import React from 'react';

// --- PositionControl コンポーネント ---
export const PositionControl = ({ position, label, defense, setDefense }) => {
  const [show, setShow] = React.useState(false);
  if (!defense || !defense[position]) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="btn-primary w-8 h-8 rounded-full text-xs shadow-lg border-2 border-white"
      >
        {label}
      </button>
      {show && (
        <div className="absolute z-10 bg-surface-2 border border-gray-600 rounded-xl shadow-xl w-48 text-xs p-3"
             style={{left: '50%', transform: 'translateX(-50%)', marginTop: '4px'}}>
          <div className="mb-1.5">
            <label className="block font-bold text-gray-300">守:{defense[position].defense}</label>
            <input type="range" min="0" max="100" value={defense[position].defense}
              onChange={(e) => setDefense({...defense, [position]: {...defense[position], defense: Number(e.target.value)}})}
              className="w-full h-1 cursor-pointer accent-blue-500" />
          </div>
          <div className="mb-1.5">
            <label className="block font-bold text-gray-300">足:{defense[position].speed}</label>
            <input type="range" min="0" max="100" value={defense[position].speed}
              onChange={(e) => setDefense({...defense, [position]: {...defense[position], speed: Number(e.target.value)}})}
              className="w-full h-1 cursor-pointer accent-green-500" />
          </div>
          <div>
            <label className="block font-bold text-gray-300">肩:{defense[position].arm}</label>
            <input type="range" min="0" max="100" value={defense[position].arm}
              onChange={(e) => setDefense({...defense, [position]: {...defense[position], arm: Number(e.target.value)}})}
              className="w-full h-1 cursor-pointer accent-orange-500" />
          </div>
        </div>
      )}
    </div>
  );
};

// --- renderBases (フィールドSVG + ポジション設定UI) ---
// Returns JSX. Caller should invoke as: <RenderBases defense={...} setDefense={...} bases={...} />
export const RenderBases = ({ defense, setDefense, bases }) => (
  <div className="relative w-full max-w-2xl mx-auto">
    {/* 全ポジション一括設定 */}
    <div className="bg-gray-800/60 border border-gray-700/50 p-4 rounded-xl mb-4">
      <h4 className="font-bold text-sm mb-3 text-gray-300">全ポジション一括設定</h4>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1 text-gray-300">
            守備力: <span className="text-blue-400">{defense.first.defense}</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={defense.first.defense}
            onChange={(e) => {
              const val = Number(e.target.value);
              setDefense({
                pitcher: { ...defense.pitcher, defense: val },
                catcher: { ...defense.catcher, defense: val },
                first: { ...defense.first, defense: val },
                second: { ...defense.second, defense: val },
                short: { ...defense.short, defense: val },
                third: { ...defense.third, defense: val },
                left: { ...defense.left, defense: val },
                center: { ...defense.center, defense: val },
                right: { ...defense.right, defense: val }
              });
            }}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 text-gray-300">
            足: <span className="text-green-400">{defense.first.speed}</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={defense.first.speed}
            onChange={(e) => {
              const val = Number(e.target.value);
              setDefense({
                pitcher: { ...defense.pitcher, speed: val },
                catcher: { ...defense.catcher, speed: val },
                first: { ...defense.first, speed: val },
                second: { ...defense.second, speed: val },
                short: { ...defense.short, speed: val },
                third: { ...defense.third, speed: val },
                left: { ...defense.left, speed: val },
                center: { ...defense.center, speed: val },
                right: { ...defense.right, speed: val }
              });
            }}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 text-gray-300">
            肩: <span className="text-orange-400">{defense.first.arm}</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={defense.first.arm}
            onChange={(e) => {
              const val = Number(e.target.value);
              setDefense({
                pitcher: { ...defense.pitcher, arm: val },
                catcher: { ...defense.catcher, arm: val },
                first: { ...defense.first, arm: val },
                second: { ...defense.second, arm: val },
                short: { ...defense.short, arm: val },
                third: { ...defense.third, arm: val },
                left: { ...defense.left, arm: val },
                center: { ...defense.center, arm: val },
                right: { ...defense.right, arm: val }
              });
            }}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
        </div>
      </div>
    </div>

    <svg viewBox="0 0 400 350" className="w-full h-full">
      {/* スタジアム外周（グレー） */}
      <ellipse cx="200" cy="280" rx="180" ry="140" fill="#9ca3af" />

      {/* 観客席 */}
      <path d="M 50 200 Q 200 80 350 200 L 350 320 Q 200 360 50 320 Z" fill="#d1d5db" />

      {/* スコアボード（センター後方） */}
      <rect x="160" y="10" width="80" height="35" fill="#1e40af" stroke="#1e3a8a" strokeWidth="2" rx="3" />
      <rect x="165" y="15" width="70" height="10" fill="#16a34a" opacity="0.8" />

      {/* ファウルポール（黄色） */}
      <rect x="30" y="200" width="8" height="80" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
      <rect x="362" y="200" width="8" height="80" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />

      {/* 外野フェンス（曲線） */}
      <path d="M 40 260 Q 200 120 360 260" fill="none" stroke="#8b7355" strokeWidth="4" />

      {/* 外野芝（深緑、ストライプ） */}
      <defs>
        <linearGradient id="grassStripes" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#15803d" />
          <stop offset="10%" stopColor="#16a34a" />
          <stop offset="20%" stopColor="#15803d" />
          <stop offset="30%" stopColor="#16a34a" />
          <stop offset="40%" stopColor="#15803d" />
          <stop offset="50%" stopColor="#16a34a" />
          <stop offset="60%" stopColor="#15803d" />
          <stop offset="70%" stopColor="#16a34a" />
          <stop offset="80%" stopColor="#15803d" />
          <stop offset="90%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <path d="M 40 260 Q 200 120 360 260 L 270 300 L 200 265 L 130 300 Z" fill="url(#grassStripes)" />

      {/* 内野土（茶色、ダイヤモンド） */}
      <path d="M 200 310 L 270 250 L 200 190 L 130 250 Z" fill="#d4a574" stroke="#b8956a" strokeWidth="2" />

      {/* 内野グラス（円弧） */}
      <ellipse cx="200" cy="310" rx="80" ry="55" fill="#22c55e" opacity="0.6" />

      {/* ファウルライン（白線） */}
      <line x1="200" y1="310" x2="40" y2="260" stroke="white" strokeWidth="2.5" />
      <line x1="200" y1="310" x2="360" y2="260" stroke="white" strokeWidth="2.5" />

      {/* ベースパス */}
      <line x1="200" y1="310" x2="270" y2="250" stroke="#b8956a" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />
      <line x1="270" y1="250" x2="200" y2="190" stroke="#b8956a" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />
      <line x1="200" y1="190" x2="130" y2="250" stroke="#b8956a" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />
      <line x1="130" y1="250" x2="200" y2="310" stroke="#b8956a" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />

      {/* 投手マウンド */}
      <ellipse cx="200" cy="280" rx="12" ry="8" fill="#d4a574" stroke="#b8956a" strokeWidth="1.5" />
      <ellipse cx="200" cy="280" rx="4" ry="3" fill="#b8956a" />

      {/* ホームベース */}
      <path d="M 200 310 L 195 305 L 195 300 L 205 300 L 205 305 Z"
            fill="white" stroke="#333" strokeWidth="1.5" />

      {/* 一塁ベース */}
      <rect x="265" y="245" width="10" height="10"
            fill={bases[0] ? '#fbbf24' : 'white'}
            stroke="#333" strokeWidth="1.5"
            transform="rotate(45 270 250)" />
      {bases[0] && <circle cx="270" cy="250" r="5" fill="#ef4444" />}

      {/* 二塁ベース */}
      <rect x="195" y="185" width="10" height="10"
            fill={bases[1] ? '#fbbf24' : 'white'}
            stroke="#333" strokeWidth="1.5"
            transform="rotate(45 200 190)" />
      {bases[1] && <circle cx="200" cy="190" r="5" fill="#ef4444" />}

      {/* 三塁ベース */}
      <rect x="125" y="245" width="10" height="10"
            fill={bases[2] ? '#fbbf24' : 'white'}
            stroke="#333" strokeWidth="1.5"
            transform="rotate(45 130 250)" />
      {bases[2] && <circle cx="130" cy="250" r="5" fill="#ef4444" />}

      {/* ポジション表示（小さい円） */}
      {/* 投手 */}
      <circle cx="200" cy="280" r="3" fill="#1e40af" opacity="0.7" />

      {/* 捕手 */}
      <circle cx="200" cy="315" r="3" fill="#dc2626" opacity="0.7" />

      {/* 一塁手 */}
      <circle cx="260" cy="260" r="3" fill="#7c3aed" opacity="0.7" />

      {/* 二塁手 */}
      <circle cx="230" cy="230" r="3" fill="#7c3aed" opacity="0.7" />

      {/* 遊撃手 */}
      <circle cx="170" cy="230" r="3" fill="#7c3aed" opacity="0.7" />

      {/* 三塁手 */}
      <circle cx="140" cy="260" r="3" fill="#7c3aed" opacity="0.7" />

      {/* 左翼手 */}
      <circle cx="120" cy="200" r="3" fill="#059669" opacity="0.7" />

      {/* 中堅手 */}
      <circle cx="200" cy="160" r="3" fill="#059669" opacity="0.7" />

      {/* 右翼手 */}
      <circle cx="280" cy="200" r="3" fill="#059669" opacity="0.7" />
    </svg>

    {/* ポジション別パラメータ設定UI */}
    <div className="absolute inset-0 pointer-events-none">
      {/* 投手 */}
      <div className="absolute pointer-events-auto" style={{left: '48%', top: '58%'}}>
        <PositionControl position="pitcher" label="投" defense={defense} setDefense={setDefense} />
      </div>

      {/* 捕手 */}
      <div className="absolute pointer-events-auto" style={{left: '48%', top: '72%'}}>
        <PositionControl position="catcher" label="捕" defense={defense} setDefense={setDefense} />
      </div>

      {/* 一塁手 */}
      <div className="absolute pointer-events-auto" style={{left: '68%', top: '52%'}}>
        <PositionControl position="first" label="一" defense={defense} setDefense={setDefense} />
      </div>

      {/* 二塁手 */}
      <div className="absolute pointer-events-auto" style={{left: '60%', top: '38%'}}>
        <PositionControl position="second" label="二" defense={defense} setDefense={setDefense} />
      </div>

      {/* 遊撃手 */}
      <div className="absolute pointer-events-auto" style={{left: '38%', top: '38%'}}>
        <PositionControl position="short" label="遊" defense={defense} setDefense={setDefense} />
      </div>

      {/* 三塁手 */}
      <div className="absolute pointer-events-auto" style={{left: '30%', top: '52%'}}>
        <PositionControl position="third" label="三" defense={defense} setDefense={setDefense} />
      </div>

      {/* 左翼手 */}
      <div className="absolute pointer-events-auto" style={{left: '25%', top: '28%'}}>
        <PositionControl position="left" label="左" defense={defense} setDefense={setDefense} />
      </div>

      {/* 中堅手 */}
      <div className="absolute pointer-events-auto" style={{left: '48%', top: '15%'}}>
        <PositionControl position="center" label="中" defense={defense} setDefense={setDefense} />
      </div>

      {/* 右翼手 */}
      <div className="absolute pointer-events-auto" style={{left: '71%', top: '28%'}}>
        <PositionControl position="right" label="右" defense={defense} setDefense={setDefense} />
      </div>
    </div>
  </div>
);

// --- Tooltip 共通ツールチップコンポーネント ---
export const Tooltip = ({ text, children, position = 'top' }) => {
  const [show, setShow] = React.useState(false);
  const posStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && text && (
        <span className={`absolute z-50 px-2 py-1 rounded text-xs text-gray-100 bg-surface-1 border border-gray-700 shadow-lg whitespace-nowrap pointer-events-none ${posStyles[position] || posStyles.top}`}>
          {text}
        </span>
      )}
    </span>
  );
};

// --- StatHeader ツールチップ付き略称ヘッダー ---
const STAT_TOOLTIPS = {
  'ミ': 'ミート（打撃精度）', 'パ': 'パワー（長打力）', '走': '走力', '肩': '肩力', '守': '守備力',
  '眼': '選球眼', '盗': '盗塁技術', '速': '球速（km/h）', '制': '制球力', 'ス': 'スタミナ',
  '体': '体力（疲労耐性）', '回': '回復力', '伸': '球の伸び', 'バ': 'バント技術',
  'Cリ': 'キャッチャーリード', '齢': '年齢', '位': 'ポジション', '成長': '成長率（基礎+変動）',
  'プ意': 'プロ意識', '精神': '精神力', '野': '野手総合力', '投': '投手総合力',
  '試': '試合出場数', 'HR': '本塁打', '打点': '打点',
};

// ツールチップは native title で付ける（Tooltipで<th>をラップすると<tr>直下が
// <span>になり、テーブルの列がデータ行とズレるため）
export const StatHeader = ({ label, sortKey, sortActive, sortAsc, onClick, className = '' }) => (
  <th
    title={STAT_TOOLTIPS[label]}
    className={`py-1 px-1 cursor-pointer hover:text-white hover:bg-gray-600/40 transition select-none text-center ${sortActive ? 'text-yellow-400' : ''} ${className}`}
    onClick={onClick}
  >
    {label}{sortActive ? (sortAsc ? '↑' : '↓') : ''}
  </th>
);

// --- AbilityLegend 能力値凡例 ---
export const AbilityLegend = ({ className = '' }) => (
  <div className={`flex items-center gap-1.5 text-xs ${className}`}>
    <span className="text-gray-400 font-bold">能力:</span>
    {[
      { min: 90, color: 'text-pink-400', label: '90+' },
      { min: 80, color: 'text-red-400', label: '80+' },
      { min: 70, color: 'text-orange-400', label: '70+' },
      { min: 60, color: 'text-yellow-400', label: '60+' },
      { min: 50, color: 'text-green-400', label: '50+' },
      { min: 40, color: 'text-blue-400', label: '40+' },
      { min: 0, color: 'text-gray-300', label: '40未満' },
    ].map(t => (
      <span key={t.min} className={t.color}>{t.label}</span>
    ))}
  </div>
);

// --- GameButton 共通ボタンコンポーネント ---
const BUTTON_VARIANTS = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm',
  secondary: 'bg-gray-600 hover:bg-gray-500 text-gray-100',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white',
  ghost: 'bg-transparent hover:bg-gray-700/60 text-gray-300 hover:text-white',
};
const BUTTON_SIZES = {
  sm: 'px-2.5 py-1 text-xs rounded',
  md: 'px-4 py-1.5 text-sm rounded-lg',
  lg: 'px-6 py-2.5 text-base rounded-lg',
};
export const GameButton = ({ variant = 'primary', size = 'md', className = '', disabled = false, children, ...props }) => (
  <button
    className={`font-bold transition-all ${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary} ${BUTTON_SIZES[size] || BUTTON_SIZES.md} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    disabled={disabled}
    {...props}
  >
    {children}
  </button>
);

// --- TabBar 共通タブコンポーネント ---
export const TabBar = ({ tabs, activeKey, onChange, className = '' }) => (
  <div className={`flex gap-1 bg-gray-800/60 rounded-xl p-1 border border-gray-700/50 ${className}`}>
    {tabs.map(({ key, label, icon, count }) => (
      <button
        key={key}
        onClick={() => onChange(key)}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
          activeKey === key
            ? 'seg-on' : 'seg'
        }`}
      >
        {icon && <span className="text-base leading-none">{icon}</span>}
        <span>{label}</span>
        {count !== undefined && <span className="text-xs opacity-60 ml-0.5">({count})</span>}
      </button>
    ))}
  </div>
);

// --- AccordionSection コンポーネント ---
export const AccordionSection = ({ title, isExpanded, onToggle, children }) => (
  <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-700/40 transition text-left"
    >
      <span className="font-semibold text-gray-200">{title}</span>
      <span className={`text-gray-300 text-xs transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
    </button>
    <div className={`grid transition-all duration-200 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <div className="p-4 border-t border-gray-700/50">
          {children}
        </div>
      </div>
    </div>
  </div>
);

// --- SidebarButton コンポーネント ---
const BLOCKING_VIEWS = new Set(['draft', 'contract', 'tryout', 'corporate_departure', 'corporate_scout', 'club_recruit', 'budget_settlement']);

export const SidebarButton = ({ view, icon, label, onActiveClick, screenMode, managementView, setScreenMode, setManagementView }) => {
  const isActive = screenMode === 'management' && managementView === view;
  const isBlocked = screenMode === 'management' && BLOCKING_VIEWS.has(managementView) && !isActive;
  return (
    <button
      onClick={() => {
        if (isBlocked) return;
        if (isActive && onActiveClick) { onActiveClick(); return; }
        setScreenMode('management'); setManagementView(view);
      }}
      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5 ${
        isBlocked
          ? 'text-gray-400 border-l-[3px] border-transparent cursor-not-allowed'
          : isActive
          ? 'seg-on border-l-[3px] border-l-[var(--accent)] shadow-sm'
          : 'text-gray-300 hover:bg-gray-700/60 hover:text-white border-l-[3px] border-transparent'
      }`}
    >
      <span className="text-base w-5 text-center shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
};

// --- Sidebar コンポーネント ---
export const Sidebar = ({
  gameMode,
  userTeamName,
  seasonData,
  formatDate,
  screenMode,
  managementView,
  setScreenMode,
  setManagementView,
  advanceDayRef
}) => (
  <div className="w-56 bg-gray-900/95 backdrop-blur text-white h-screen fixed left-0 top-0 flex flex-col border-r border-gray-700/50">
    <div className="px-4 py-4 border-b border-gray-700/50 bg-gray-800/30">
      <h2 className={`text-lg font-black tracking-tight ${gameMode === 'sandbox' ? 'text-orange-400' : 'text-green-400'}`}>⚾ {userTeamName}</h2>
      <div className="text-xs text-gray-300 mt-1 flex items-center gap-1.5">
        {gameMode === 'sandbox' && <span className="text-orange-400/80 bg-orange-400/10 px-1.5 py-0.5 rounded text-xs font-bold">箱庭</span>}
        {gameMode === 'university' && <span className="text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded text-xs font-bold">大学</span>}
        <span>{seasonData?.year || 1}年目</span>
        <span className="text-gray-400">|</span>
        <span>{seasonData?.currentDate ? formatDate(seasonData.currentDate) : ''}</span>
      </div>
    </div>

    <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-0.5">
      <div className="text-xs uppercase tracking-widest text-gray-400 font-bold px-3 pt-1 pb-2">進行</div>
      <SidebarButton view="dateprogress" icon="📅" label="日程進行" onActiveClick={() => advanceDayRef.current?.()} screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />
      <SidebarButton view="roster" icon="📋" label="ロスター管理" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />
      <SidebarButton view="stats" icon="📊" label="選手成績" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />
      <SidebarButton view="ranking" icon="📰" label="能力ランキング" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />
      <SidebarButton view="team_ranking" icon="🏅" label="チームランキング" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />

      <div className="border-t border-gray-700/40 my-2"></div>
      <div className="text-xs uppercase tracking-widest text-gray-400 font-bold px-3 pt-1 pb-2">チーム</div>
      <SidebarButton view="teaminfo" icon="👥" label="チーム情報" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />
      {gameMode === 'corporate' && !seasonData?.settings?.clubMode && <SidebarButton view="corporate_management" icon="🏢" label="チーム運営" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />}
      {gameMode === 'university' && <SidebarButton view="university_scout" icon="🔍" label="スカウト" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />}
      {gameMode !== 'corporate' && gameMode !== 'university' && <SidebarButton view="trade" icon="🔄" label="トレード" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />}
      <SidebarButton view="halloffame" icon="🏆" label="資料室" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />
      <SidebarButton view="player_search" icon="🔎" label="選手検索" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />

      <div className="border-t border-gray-700/40 my-2"></div>
      <div className="text-xs uppercase tracking-widest text-gray-400 font-bold px-3 pt-1 pb-2">システム</div>
      <SidebarButton view="save" icon="💾" label="セーブ＆ロード" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />
      <SidebarButton view="regulations" icon="⚙️" label="レギュレーション" screenMode={screenMode} managementView={managementView} setScreenMode={setScreenMode} setManagementView={setManagementView} />
    </nav>
  </div>
);
