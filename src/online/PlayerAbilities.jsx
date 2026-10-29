import React, { useState } from 'react';
import { ABILITY_GROUPS, abilityRows } from './playerInfo.js';
import {
  getZoneProfile,
  zoneHeatmap,
  describeZoneProfile,
} from '../game/batterZone.js';
import {
  getBatterType,
  BATTER_TYPE_LABEL,
  BATTER_TYPE_NOTE,
} from '../game/batterType.js';
import { PageNav } from './PageNav.jsx';
import { getAbilityRank, getRankColor } from '../utils/constants.js';
export default function PlayerAbilities({ player }) {
  const [group, setGroup] = useState(
    player.position === 'pitcher' ? 'pitching' : 'batting',
  );
  const [page, setPage] = useState(0);
  const rows = abilityRows(player, group);
  const size = group === 'arsenal' ? 6 : rows.length || 1;
  const type = player.batting ? getBatterType(player) : null;
  return (
    <section className="online-player-abilities">
      <label className="online-ability-select">
        見る能力
        <select
          aria-label="能力の表示項目"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(0);
          }}
        >
          {ABILITY_GROUPS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {group === 'zone' ? (
        player.batting ? (
          <>
            <p className="online-batter-type">{BATTER_TYPE_LABEL[type]}</p>
            <small>{BATTER_TYPE_NOTE[type]}</small>
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
            <p className="online-zone-legend">
              赤＝得意／青＝苦手　左＝外角・右＝内角
            </p>
            <ul>
              {describeZoneProfile(getZoneProfile(player)).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>打撃データはありません。</p>
        )
      ) : (
        <>
          <dl
            className={`online-stat-grid ${group === 'profile' ? 'online-profile-grid' : ''}`}
          >
            {rows
              .slice(page * size, page * size + size)
              .map(([label, value], index) => (
                <div key={`${label}:${index}`}>
                  <dt>{label}</dt>
                  <dd
                    className={
                      typeof value === 'number' && group !== 'profile'
                        ? getRankColor(
                            getAbilityRank(
                              value,
                              label === '球速',
                              label === 'スタミナ',
                            ),
                          )
                        : ''
                    }
                  >
                    {value ?? '—'}
                  </dd>
                </div>
              ))}
          </dl>
          {!rows.length && <p>記録はありません。</p>}
          {group === 'arsenal' && rows.length > size && (
            <PageNav
              page={page}
              count={rows.length}
              size={size}
              setPage={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
