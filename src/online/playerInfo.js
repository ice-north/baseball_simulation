import { BALL_EFFECTS, PITCHING_FORM_EFFECTS } from '../utils/constants.js';
import { getDeception } from '../game/deception.js';
import { getBatterType, BATTER_TYPE_LABEL } from '../game/batterType.js';
const n = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const handed = (value) =>
  ({ left: '左', right: '右', switch: '両' })[value] || '—';
export const ABILITY_GROUPS = [
  ['batting', '打撃・走塁'],
  ['pitching', '投球'],
  ['arsenal', '球種'],
  ['fielding', '守備・捕手'],
  ['positions', '守備適性'],
  ['physical', '身体'],
  ['mental', '精神・成長'],
  ['zone', '打撃の特徴'],
  ['profile', 'プロフィール'],
];
export function abilityRows(player, group) {
  const b = player.batting || {},
    p = player.pitching || {},
    f = player.physical || {};
  const rows = {
    batting: [
      ['ミート', n(b.meet)],
      ['パワー', n(b.power)],
      ['選球眼', n(b.eye)],
      ['盗塁技術', n(b.steal)],
      ['バント', n(b.bunt)],
      [
        '打者型',
        player.batting ? BATTER_TYPE_LABEL[getBatterType(player)] : null,
      ],
    ],
    pitching: [
      ['球速', n(p.velocity)],
      ['制球', n(p.control)],
      ['スタミナ', n(p.stamina)],
      ['回転', n(p.spinRate)],
      ['出どころ', player.pitching ? getDeception(player) : null],
      ['フォーム', PITCHING_FORM_EFFECTS[p.form]?.name || p.form || null],
    ],
    physical: [
      ['走力', n(f.speed)],
      ['肩力', n(f.arm)],
      ['体力', n(f.bodyStamina)],
      ['回復', n(f.recovery)],
      ['体幹', n(f.muscle)],
      ['器用さ', n(f.dexterity)],
    ],
    fielding: [
      ['守備', n(player.fielding?.defense)],
      ['捕手リード', n(player.catching?.lead)],
      ['肩力', n(f.arm)],
      ['走力', n(f.speed)],
    ],
    positions: [
      'pitcher',
      'catcher',
      'first',
      'second',
      'third',
      'short',
      'left',
      'center',
      'right',
    ].map((id, i) => [
      ['投手', '捕手', '一塁', '二塁', '三塁', '遊撃', '左翼', '中堅', '右翼'][
        i
      ],
      n(player.positionFitness?.[id]),
    ]),
    mental: [
      ['プロ意識', n(player.personality?.discipline)],
      ['精神力', n(player.personality?.mental)],
      [
        '成長係数',
        n(player.growthPotential) === null
          ? null
          : Math.max(
              0.3,
              Math.min(
                1.8,
                player.growthPotential + (n(player.growthModifier) ?? 0),
              ),
            ).toFixed(2),
      ],
    ],
    profile: [
      ['背番号', player.number ?? null],
      ['年齢', n(player.age)],
      ['投げ', handed(f.throws)],
      ['打ち', handed(b.bats)],
      [
        '体格',
        { large: '大柄', medium: '中肉', normal: '中肉', small: '小柄' }[
          f.build
        ] ||
          f.build ||
          null,
      ],
      ['出身高校', player.origin?.highSchool || null],
      ['出身大学', player.origin?.university || null],
      ['前所属', player.origin?.previousTeam || null],
    ],
    arsenal: (p.arsenal || []).map((pitch) => [
      BALL_EFFECTS[pitch.type]?.name || pitch.type,
      n(pitch.level),
    ]),
  };
  return rows[group] || [];
}
