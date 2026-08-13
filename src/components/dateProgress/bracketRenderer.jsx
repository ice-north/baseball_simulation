import React from 'react';

// 都市対抗・日本選手権・大学トーナメント等のブラケットをSVGの接続線付きで描画する。
// DateProgressScreen から実装のみを抽出（userTeamName は敗退判定用に引数で受け取る）。
export function renderBracketWithLines(bracket, teamDefsMap = null, userTeamName = null) {
    if (!bracket || !bracket.rounds || bracket.rounds.length === 0) return null;
    const rounds = bracket.rounds;
    const numRounds = rounds.length;
    const firstRoundCount = rounds[0].length;
    const compact = firstRoundCount > 8;

    // ⚠ **12px を下回らせないこと**（CLAUDE.md「最小サイズは text-xs（12px）」）。
    // ここは SVG の fontSize なので Tailwind のクラス検査に引っかからず、
    // 32チームの都市対抗本戦で チーム名11px / スコア10px / 日付9px になっていた
    // （1画面に99箇所）。文字を大きくするぶん、名前の枠と行の高さも一緒に広げる。
    const TEAM_H = compact ? 22 : 27;
    const MATCH_GAP = compact ? 4 : 6;
    const SLOT_H = TEAM_H * 2 + MATCH_GAP;
    const NAME_W = compact ? 196 : 215;
    const CONN_W = compact ? 30 : 44;
    const PAD_TOP = 8;
    const PAD_LEFT = 4;
    const PAD_BOTTOM = 20;
    const FONT = compact ? 12 : 13;
    const SCORE_FONT = 12;
    const DATE_FONT = 12;
    const WIN_COLOR = '#f97316';
    const DEF_COLOR = '#4b5563';
    const WIN_W = 2.5;
    const DEF_W = 1;

    const svgH = PAD_TOP + firstRoundCount * SLOT_H + PAD_BOTTOM;
    const svgW = PAD_LEFT + NAME_W + numRounds * CONN_W + 30;

    const getTeamCY = (ri, mi, isTop) => {
      if (ri === 0) {
        const base = PAD_TOP + mi * SLOT_H;
        return isTop ? base + TEAM_H / 2 : base + TEAM_H + TEAM_H / 2;
      }
      const i1 = mi * 2, i2 = mi * 2 + 1;
      if (i2 >= rounds[ri - 1].length) return getTeamCY(ri - 1, i1, isTop);
      return isTop ? getMatchMidY(ri - 1, i1) : getMatchMidY(ri - 1, i2);
    };
    const getMatchMidY = (ri, mi) => (getTeamCY(ri, mi, true) + getTeamCY(ri, mi, false)) / 2;

    const isEliminated = (teamName) => {
      for (const round of rounds) {
        for (const match of round) {
          if (match.loser === teamName) return true;
        }
      }
      return false;
    };

    const getLabel = (name) => {
      if (!name) return 'TBD';
      const city = teamDefsMap?.[name]?.city;
      return city ? `${name}(${city})` : name;
    };

    const teamEntries = [];
    for (let mi = 0; mi < rounds[0].length; mi++) {
      const m = rounds[0][mi];
      const isByeMatch = m.isBye && !(m.team1 && m.team2);
      if (isByeMatch) {
        const byeTeam = m.team1 || m.team2;
        if (byeTeam) teamEntries.push({ team: byeTeam, mi, isTop: 'mid' });
      } else {
        if (m.team1) teamEntries.push({ team: m.team1, mi, isTop: true });
        if (m.team2) teamEntries.push({ team: m.team2, mi, isTop: false });
      }
    }

    return (
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '700px' }}>
        <svg width={svgW} height={svgH} xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block', fontFamily: "'Hiragino Sans','Yu Gothic','Meiryo',system-ui,sans-serif" }}>

          {/* Team names */}
          {teamEntries.map(({ team, mi, isTop }) => {
            const cy = isTop === 'mid' ? getMatchMidY(0, mi) : getTeamCY(0, mi, isTop);
            const isUser = team === userTeamName;
            const elim = isEliminated(team);
            const fill = isUser ? '#fde047' : elim ? '#6b7280' : '#e5e7eb';
            const fw = isUser ? 'bold' : 'normal';
            const seedNum = bracket.seeds?.[team];
            const seedPrefix = seedNum ? `[${seedNum}]` : '';
            const champPrefix = bracket.champion === team ? '🏆' : '';
            return (
              <text key={`t${mi}-${isTop}`} x={PAD_LEFT} y={cy + FONT * 0.35}
                fill={fill} fontSize={FONT} fontWeight={fw}
>
                {seedPrefix && <tspan fill="#f59e0b" fontWeight="bold">{seedPrefix}</tspan>}
                {champPrefix}{getLabel(team)}
              </text>
            );
          })}

          {/* Bracket lines */}
          {rounds.map((round, ri) => {
            const xL = PAD_LEFT + NAME_W + ri * CONN_W;
            const xMid = xL + CONN_W / 2;
            const xR = xL + CONN_W;

            return round.map((m, mi) => {
              // Bye: straight line through — orange only if the bye team won their next match
              if (m.isBye && !(m.team1 && m.team2)) {
                const midY = getMatchMidY(ri, mi);
                const byeTeam = m.winner;
                const nextMatch = rounds[ri + 1]?.[Math.floor(mi / 2)];
                const wonNext = byeTeam && nextMatch?.winner === byeTeam;
                return (
                  <g key={`m${ri}-${mi}`}>
                    <line x1={xL} y1={midY} x2={xR} y2={midY}
                      stroke={wonNext ? WIN_COLOR : DEF_COLOR} strokeWidth={wonNext ? WIN_W : DEF_W} />
                  </g>
                );
              }

              const cy1 = getTeamCY(ri, mi, true);
              const cy2 = getTeamCY(ri, mi, false);
              const midY = (cy1 + cy2) / 2;
              const hasW = m.winner != null;
              const w1 = hasW && m.winner === m.team1;
              const w2 = hasW && m.winner === m.team2;

              return (
                <g key={`m${ri}-${mi}`}>
                  {/* Base vertical bar (gray, full height) */}
                  <line x1={xMid} y1={cy1} x2={xMid} y2={cy2} stroke={DEF_COLOR} strokeWidth={DEF_W} />

                  {/* Winner's vertical path overlay (winner's Y → midpoint) */}
                  {hasW && (
                    <line x1={xMid} y1={w1 ? cy1 : cy2} x2={xMid} y2={midY}
                      stroke={WIN_COLOR} strokeWidth={WIN_W} />
                  )}

                  {/* Team1 horizontal */}
                  <line x1={xL} y1={cy1} x2={xMid} y2={cy1}
                    stroke={w1 ? WIN_COLOR : DEF_COLOR} strokeWidth={w1 ? WIN_W : DEF_W} />

                  {/* Team2 horizontal */}
                  <line x1={xL} y1={cy2} x2={xMid} y2={cy2}
                    stroke={w2 ? WIN_COLOR : DEF_COLOR} strokeWidth={w2 ? WIN_W : DEF_W} />

                  {/* Output horizontal (midpoint → next round) */}
                  {ri < numRounds - 1 && (
                    <line x1={xMid} y1={midY} x2={xR} y2={midY}
                      stroke={hasW ? WIN_COLOR : DEF_COLOR} strokeWidth={hasW ? WIN_W : DEF_W} />
                  )}

                  {/* Scores straddling the output line */}
                  {hasW && m.score && (
                    <>
                      <text x={xMid + 3} y={midY - 3}
                        fill={w1 ? '#fbbf24' : '#9ca3af'} fontSize={SCORE_FONT}
                        fontWeight={w1 ? 'bold' : 'normal'}>
                        {m.score[0]}
                      </text>
                      <text x={xMid + 3} y={midY + SCORE_FONT + 1}
                        fill={w2 ? '#fbbf24' : '#9ca3af'} fontSize={SCORE_FONT}
                        fontWeight={w2 ? 'bold' : 'normal'}>
                        {m.score[1]}
                      </text>
                    </>
                  )}
                </g>
              );
            });
          })}

          {/* Champion terminal line */}
          {bracket.champion && (() => {
            const lastXMid = PAD_LEFT + NAME_W + (numRounds - 1) * CONN_W + CONN_W / 2;
            const midY = getMatchMidY(numRounds - 1, 0);
            return (
              <line x1={lastXMid} y1={midY} x2={lastXMid + 20} y2={midY}
                stroke={WIN_COLOR} strokeWidth={WIN_W} />
            );
          })()}

          {/* Round dates */}
          {rounds.map((_, ri) => {
            const x = PAD_LEFT + NAME_W + ri * CONN_W + CONN_W / 2;
            const rd = bracket.roundDates?.[ri];
            if (!rd) return null;
            return <text key={`d${ri}`} x={x} y={svgH - 3} textAnchor="middle" fill="#6b7280" fontSize={DATE_FONT}>{rd.month}/{rd.day}</text>;
          })}
        </svg>
      </div>
    );
}
