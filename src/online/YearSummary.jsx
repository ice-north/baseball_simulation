import React from 'react';
import { POS } from './api.js';
import { SEASON_START_MONTH } from './shared.js';

// ============================================================
// その年のまとめ（年度更新の直後に出す）。
//
// ⚠ いしだ 2026-11-18「トライアウト後の年度更新の際に、キャンプの結果やオフの成長は
//    要りません。その年の順位、入退団の選手、主なトピックに止めて下さい」。
//    年が替わった画面には、キャンプの結果（前の年の2月の話）と年度更新の伸び
//    （能力の細かい増減）が並んでいて、肝心の「その年がどうだったか」が無かった。
//
// ⚠ **出すのは3つだけ**（順位・入退団・主なトピック）。細かい数字は
//    球団史・記録（`Chronicle.jsx`）と取引の記録に揃っているので、ここには足さない。
// ⚠ 中身はサーバーが組む（`server/yearSummary.mjs`）。画面は並べるだけ。
// ============================================================

/** 入退団の1人（入団は「どこから」、退団は「どこへ」） */
function MoveRow({ row }) {
  return (
    <li>
      <span className="online-year-move-how" data-side={row.side}>
        {row.how}
      </span>
      <span className="online-year-move-name">
        {row.name}
        {row.position && <small>{POS[row.position] || row.position}</small>}
      </span>
      {row.other && (
        <small className="online-muted">
          {row.side === 'in' ? `← ${row.other}` : `→ ${row.other}`}
        </small>
      )}
    </li>
  );
}

export default function YearSummary({ view }) {
  const s = view?.yearSummary;
  if (!s) return null;
  // ⚠ 出すのは**年度更新から開幕まで**。終わった年のまとめなので、シーズンに入ったら消す
  //    （次の11月にまた出てくると、今年の話に見える）。古い年の分は球団史・記録で見る
  if (s.year !== view.year - 1) return null;
  if ((view.currentDate?.month || 0) >= SEASON_START_MONTH) return null;
  return (
    <section className="online-card online-year-summary" aria-label="その年のまとめ">
      <h2>
        {s.year}年目のまとめ
        {s.rank && (
          <small>
            {s.league ? `${s.league} ` : ''}
            {s.rank}位
            {s.record
              ? `（${s.record.wins}勝${s.record.losses}敗${s.record.draws ? `${s.record.draws}分` : ''}）`
              : ''}
          </small>
        )}
      </h2>

      {/* ① その年の順位（自分の部だけ。自球団に印） */}
      <div className="online-year-summary-grid">
        <div>
          <h3>順位</h3>
          <table className="online-standings online-year-standings">
            <thead>
              <tr>
                <th>順</th>
                <th>球団</th>
                <th>勝</th>
                <th>敗</th>
                <th>分</th>
              </tr>
            </thead>
            <tbody>
              {(s.standings || []).map((r) => (
                <tr key={r.team} data-mine={r.mine || undefined}>
                  <th scope="row">{r.rank}</th>
                  <td>{r.label}</td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td>{r.draws}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ② 入退団（その年のぶん。トライアウト・契約更改・トレード・引退・プロ入り） */}
        <div>
          <h3>
            入退団 <small>入団{s.joined?.length || 0}人・退団{s.left?.length || 0}人</small>
          </h3>
          {!s.joined?.length && !s.left?.length ? (
            <p className="online-muted">この年の入退団はありません。</p>
          ) : (
            <ul className="online-year-moves">
              {(s.joined || []).map((row, i) => (
                <MoveRow key={`in${i}`} row={row} />
              ))}
              {(s.left || []).map((row, i) => (
                <MoveRow key={`out${i}`} row={row} />
              ))}
            </ul>
          )}
        </div>

        {/* ③ 主なトピック（優勝・昇降格・表彰・節目） */}
        <div>
          <h3>主なトピック</h3>
          {s.topics?.length ? (
            <ul className="online-year-topics">
              {s.topics.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="online-muted">この年に残った話題はありません。</p>
          )}
        </div>
      </div>
    </section>
  );
}
