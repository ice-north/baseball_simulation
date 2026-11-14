import React, { useState } from 'react';
import { AbilityGrade, TeamPlayerButton } from './PlayerPerformance.jsx';
import { POS } from './api.js';
import { teamShort } from './gameText.js';
import { Page } from './Page.jsx';

// ============================================================
// 能力ランキング（**リーグ全球団**の中で、項目ごとに上位を並べる）。
//
// ⚠ 以前は自球団の中だけだった。12球団288人の中での位置が分からないと、
//    自分の選手が強いのか弱いのか判断できない。
// ⚠ 能力は元から公開の情報（他球団の名簿は「選手成績」から能力も見られる）。
//    ここで新しく秘密を開けているわけではない。
// ⚠ **並べ替えはサーバーで済ませる**（`abilityLeaders`）。画面は自球団の名簿
//    しか持っていないので、ここでは並べられない。項目の表もサーバーが正本で、
//    画面に同じ表を置くと、足したときに片方だけ直して食い違う。
// ⚠ 球速とスタミナは0〜100ではない。段位は `AbilityGrade` が揃えて出す。
// ⚠ PCの**ほかのページと同じ枠**（`Page`）に入れる。区分の切り替えは
//    選手成績と同じく、カードの一番上に並んだボタンで出す。
// ============================================================

export default function AbilityRanking({ view }) {
  const [side, setSide] = useState('batting');
  const all = view.abilityLeaders || [];
  const shown = all.filter((f) => f.side === side);
  return (
    <Page
      title="能力ランキング"
      sub="リーグ全球団の選手の中で、項目ごとの上位です。自球団の選手は黄色で出します。"
    >
      <section className="online-card">
        <div className="online-segments" role="group" aria-label="区分">
          {[
            ['batting', '野手'],
            ['pitching', '投手'],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={side === id}
              onClick={() => setSide(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="online-leaders">
          {shown.map((field) => (
            <div key={field.id} className="online-leader-box">
              <h4>{field.label}</h4>
              <ol>
                {field.rows.map((row, i) => (
                  <li
                    key={row.id}
                    /* ⚠ 自球団の選手は黄色で強調する（順位表と同じ） */
                    className={
                      row.team === view.teamName ? 'online-own-text' : ''
                    }
                  >
                    <span className="online-leader-rank" data-rank={i + 1}>
                      {i + 1}
                    </span>
                    <span className="online-leader-name">
                      <TeamPlayerButton
                        view={view}
                        team={row.team}
                        id={row.id}
                        name={row.name}
                        panel="abilities"
                      />
                      <small>
                        {teamShort(row.team)}·{POS[row.position]}
                      </small>
                    </span>
                    <span className="online-leader-value">
                      <AbilityGrade
                        value={row.value}
                        velocity={field.velocity}
                        stamina={field.stamina}
                      />
                    </span>
                  </li>
                ))}
                {!field.rows.length && (
                  <li className="online-muted">該当なし</li>
                )}
              </ol>
            </div>
          ))}
          {!shown.length && (
            <p className="online-muted">まだ集計がありません。</p>
          )}
        </div>
      </section>
    </Page>
  );
}
