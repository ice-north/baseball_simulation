import { requireOnline } from '../src/online/shared.js';
import {
  STARTER_ROLES,
  RELIEF_ROLES,
  TACTIC_FIELDS,
  TACTIC_DEFAULTS,
  roleFor,
} from '../src/online/tactics.js';
export function validateTactics(team, plan, rotationChanged) {
  let tactics = team.onlineTactics;
  if (plan.tactics !== undefined) {
    requireOnline(
      plan.tactics &&
        typeof plan.tactics === 'object' &&
        !Array.isArray(plan.tactics),
      '自動采配の指定が不正です',
    );
    requireOnline(
      Object.keys(plan.tactics).every((key) =>
        Object.hasOwn(TACTIC_FIELDS, key),
      ),
      '未対応の采配項目です',
    );
    tactics = {};
    for (const [key, [, options]] of Object.entries(TACTIC_FIELDS)) {
      const value = plan.tactics[key] ?? TACTIC_DEFAULTS[key];
      requireOnline(
        typeof value === typeof TACTIC_DEFAULTS[key] &&
          Object.hasOwn(options, value),
        '自動采配の値が不正です',
      );
      tactics[key] =
        typeof TACTIC_DEFAULTS[key] === 'number' ? Number(value) : value;
    }
  }
  let rotation = null;
  if (plan.pitcherRoles !== undefined || rotationChanged) {
    const explicit = plan.pitcherRoles !== undefined;
    const raw = explicit
      ? plan.pitcherRoles
      : team.pitchingRotation?.pitcherRoles || {};
    requireOnline(
      raw && typeof raw === 'object' && !Array.isArray(raw),
      '投手の役割が不正です',
    );
    const pitchers = team.players.filter(
      (p) => p.position === 'pitcher' && p.isActive !== false,
    );
    if (explicit)
      for (const [id, role] of Object.entries(raw)) {
        const p = pitchers.find((p) => String(p.id) === id);
        requireOnline(
          p &&
            typeof role === 'string' &&
            Object.hasOwn(
              plan.starters.includes(p.id) ? STARTER_ROLES : RELIEF_ROLES,
              role,
            ),
          '自球団の投手と先発・救援に合う役割を指定してください',
        );
      }
    const roles = Object.fromEntries(
      pitchers.map((p) => [
        p.id,
        roleFor(
          raw[p.id] ??
            team.pitchingRotation?.pitcherRoles?.[p.id] ??
            (team.pitchingRotation?.closer === p.id
              ? 'closer'
              : team.pitchingRotation?.setupMen?.includes(p.id)
                ? 'setup'
                : team.pitchingRotation?.middleRelievers?.includes(p.id)
                  ? 'long'
                  : undefined),
          plan.starters.includes(p.id),
        ),
      ]),
    );
    requireOnline(
      Object.values(roles).filter((r) => r === 'closer').length <= 1,
      '守護神は1人まで指定してください',
    );
    rotation = {
      pitcherRoles: roles,
      relievers: pitchers
        .filter((p) => !plan.starters.includes(p.id))
        .map((p) => p.id),
      middleRelievers: pitchers
        .filter(
          (p) =>
            !plan.starters.includes(p.id) &&
            !['setup', 'closer'].includes(roles[p.id]),
        )
        .map((p) => p.id),
      setupMen: pitchers
        .filter((p) => roles[p.id] === 'setup')
        .map((p) => p.id),
      closer: pitchers.find((p) => roles[p.id] === 'closer')?.id ?? null,
    };
  }
  return { tactics, rotation };
}
