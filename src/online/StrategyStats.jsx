import { STRATEGY_STAT_COLUMNS } from './strategyStats.js';

/**
 * 作戦別成績（B2）。自球団の今季の試合を、その日に敷いていた方針ごとに。
 * ⚠ 数字はサーバーが作る（ビューの `strategyStats`、`src/online/strategyStats.js`）。
 *    アプリ（方針・采配の画面の「作戦別成績」）と同じ列。
 */
export default function StrategyStats({ stats, compact = false }) {
  if (!stats?.fields?.length)
    return (
      <p className="online-muted">
        まだありません。方針を敷いて試合をすると、方針ごとの勝敗・得点・打率がここにたまります。
      </p>
    );
  return (
    <div className={`online-strategy-stats${compact ? ' is-compact' : ''}`}>
      <p className="online-muted">
        今季{stats.games}試合。攻めの方針は自球団の打撃、守りの方針は相手の打撃の数字です。
      </p>
      {stats.fields.map((f) => (
        <div key={f.key} className="online-table-wrap">
          <table className="online-table">
            <caption>{f.label}</caption>
            <thead>
              <tr>
                <th>方針</th>
                {STRATEGY_STAT_COLUMNS[f.side].map(([k, label]) => (
                  <th key={k}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.rows.map((r) => (
                <tr key={r.value}>
                  <th scope="row">{r.label}</th>
                  {STRATEGY_STAT_COLUMNS[f.side].map(([k]) => (
                    <td key={k}>{r[k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
