import React from 'react';
import { abilityRows } from './playerInfo.js';
import { statGroup, formatStat } from './statsView.js';
import { POS } from './api.js';
import { getZoneProfile, zoneHeatmap } from '../game/batterZone.js';
import { getAbilityRank, getRankColor } from '../utils/constants.js';
import { teamLabel } from './gameText.js';

// ============================================================
// 選手の詳細（1画面）。
//
//   上  … 名前・年齢・利き手などの札と、**チームの経歴**
//   中  … 成績（打率・本塁打など。投手は防御率・勝敗など）
//   下  … 能力値
//
// ⚠ **タブで分けないこと**。以前は「成績／能力・人物／場面別」の3タブ＋
//    その中でさらに区分の切り替えがあり、1人を見るのに何度も押していた。
//    見たいものは一度に出す。
// ⚠ **縦に送らせないこと**。列を増やして横に並べる。項目を足すときは、
//    どれかを削るか列を増やすかを考える（積むと元に戻る）。
// ============================================================

/** 経歴の種類 → 画面に出す言い方 */
const CAREER_LABEL = {
  highschool: '高校',
  university: '大学',
  independent: '入団',
  corporate_join: '入社',
  club_join: '加入',
  released: '退団',
  trade: 'トレード',
};

/** 経歴を1行で。⚠ 新しい順。古い順だと「いま何処か」が末尾になって読みにくい */
export function CareerLine({ player }) {
  const history = player.careerHistory || [];
  if (!history.length) {
    // ⚠ 空のときに欄ごと消さない。「経歴が無い」のか「出し忘れ」なのか
    //    分からなくなる
    return <p className="online-career">経歴: 記録なし</p>;
  }
  return (
    <p className="online-career">
      経歴:{' '}
      {[...history].reverse().map((h, i) => (
        <span key={`${h.year}:${h.label}:${i}`}>
          {i > 0 && ' ← '}
          {/* ⚠ 年の無い経歴（高校・大学など）がある。`undefined年` と出さない */}
          {Number.isFinite(h.year) && <b>{h.year}年目 </b>}
          {h.label ? teamLabel(h.label) : ''}
          {CAREER_LABEL[h.type] ? `（${CAREER_LABEL[h.type]}）` : ''}
        </span>
      ))}
    </p>
  );
}

/** 成績の1区分（基本＋出場など）を横一列で */
function StatRow({ player, category, groups }) {
  const columns = groups.flatMap((id) => statGroup(category, id).columns);
  return (
    <dl className="online-detail-stats">
      {columns.map((column) => (
        <div key={column.id}>
          <dt>{column.label}</dt>
          <dd>{formatStat(column, column.get(player), true)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 能力の1かたまり（見出し＋値の並び）。
 * ⚠ 数字は**格で色を付ける**（ほかの画面と同じ `getAbilityRank`）。
 *    球速とスタミナは0〜100ではないので、名前で見分けて別の物差しを使う。
 * ⚠ 色だけに頼らない——数字そのものを出しているので、色は補助。
 */
function AbilityBlock({ title, rows }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined);
  if (!shown.length) return null;
  return (
    <div className="online-detail-block">
      <h4>{title}</h4>
      <dl>
        {shown.map(([label, value], i) => (
          <div key={`${label}:${i}`}>
            <dt>{label}</dt>
            <dd
              className={
                typeof value === 'number'
                  ? getRankColor(
                      getAbilityRank(value, label === '球速', label === 'スタミナ'),
                    )
                  : ''
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function PlayerDetailBody({ player, shown, periodLabel }) {
  const isPitcher = player.position === 'pitcher';
  // ⚠ 二刀流は**両方**出す。投手欄だけだと打撃が見えない
  const twoWay = !!player.isTwoWay;
  const abilities = (group) => abilityRows(player, group);
  return (
    <>
      <CareerLine player={player} />

      <section className="online-detail-section">
        <h3>
          成績<small>{periodLabel}</small>
        </h3>
        {(!isPitcher || twoWay) && (
          <StatRow
            player={shown}
            category="batting"
            groups={['basic', 'appearances']}
          />
        )}
        {(isPitcher || twoWay) && (
          <StatRow
            player={shown}
            category="pitching"
            groups={['basic', 'record']}
          />
        )}
      </section>

      <section className="online-detail-section">
        <h3>能力</h3>
        <div className="online-detail-grid">
          {(!isPitcher || twoWay) && (
            <AbilityBlock title="打撃・走塁" rows={abilities('batting')} />
          )}
          {(isPitcher || twoWay) && (
            <AbilityBlock title="投球" rows={abilities('pitching')} />
          )}
          {(isPitcher || twoWay) && (
            <AbilityBlock title="球種" rows={abilities('arsenal')} />
          )}
          <AbilityBlock title="守備" rows={abilities('fielding')} />
          <AbilityBlock title="身体" rows={abilities('physical')} />
          <AbilityBlock title="精神・成長" rows={abilities('mental')} />
          <AbilityBlock title="守備適性" rows={abilities('positions')} />
          {/* ⚠ 打撃コースは**図で出す**。数字の列にすると25個並んで読めない。
              打者型（引っ張り・広角など）は「打撃・走塁」に入っている */}
          {player.batting && (
            <div className="online-detail-block">
              <h4>打撃コース</h4>
              <div
                className="online-zone-grid"
                role="img"
                aria-label="打撃コース適性。上が高め、下が低め、左が外角、右が内角。赤が得意、青が苦手。"
              >
                {zoneHeatmap(getZoneProfile(player), {
                  withLocation: true,
                }).flatMap((line, y) =>
                  line.map((value, x) => (
                    <span
                      key={`${x}:${y}`}
                      className={`online-zone-${value >= 0.5 ? 'hot' : value >= 0.2 ? 'warm' : value > -0.2 ? 'neutral' : value > -0.5 ? 'cool' : 'cold'} ${x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 'online-zone-strike' : ''}`}
                    />
                  )),
                )}
              </div>
              <small className="online-zone-legend">
                赤＝得意／青＝苦手　左＝外角・右＝内角
              </small>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/** 札（名前の下に出す1行） */
export function PlayerTags({ player }) {
  const profile = Object.fromEntries(abilityRows(player, 'profile'));
  const tags = [
    POS[player.position],
    profile['年齢'] ? `${profile['年齢']}歳` : null,
    profile['背番号'] ? `背番号 ${profile['背番号']}` : null,
    profile['投げ'] && profile['打ち']
      ? `${profile['投げ']}投${profile['打ち']}打`
      : null,
    profile['体格'],
    player.isTwoWay ? '二刀流' : null,
    profile['出身高校'],
    profile['出身大学'],
  ].filter(Boolean);
  return <>{tags.join(' · ')}</>;
}
