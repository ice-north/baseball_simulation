import { requireOnline } from '../src/online/shared.js';
import { reliefOrderOf } from '../src/online/pitchingEdit.js';
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
    // ⚠ **投手陣＝投手登録の選手＋投手起用に加えた野手**（二刀流）。野手を全員
    //    救援に入れないこと（「おまかせ」の救援として試合で投げてしまう）。
    //    加えた野手は、先発ローテに入れたか、役割を付けた選手だけ。役割を送らない
    //    保存（ローテだけ変えた）では、前に付けた役割を引き継ぐ
    const known = explicit ? raw : team.pitchingRotation?.pitcherRoles || {};
    const pitchers = team.players.filter(
      (p) =>
        p.isActive !== false &&
        (p.position === 'pitcher' ||
          (p.pitching &&
            (plan.starters.includes(p.id) ||
              Object.hasOwn(known, String(p.id))))),
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
      'クローザーは1人まで指定してください',
    );
    // ⚠ **同じ役割の中の順番**（いしだ 2026-11-20「リリーフ投手が同じロールだった場合、
    //    並びが上の選手が優先して使われてしまいます」）。画面が送ってきた順（`pitcherOrder`）で
    //    並べ替えてから一覧を作る。送って来なければ前の順、それも無ければ名簿の並び（今までどおり）
    const sentOrder = plan.pitcherOrder;
    if (sentOrder !== undefined)
      requireOnline(
        Array.isArray(sentOrder) && sentOrder.every((id) => Number.isFinite(Number(id))),
        '投手の並び順が不正です',
      );
    // ⚠ **並べ替えたことのない球団には足さない**。いつも書き込むと、画面へ返す編成の形が
    //    増えて、編集中だった人の保存が「ほかの画面で更新されています」で弾かれる
    //    （検査で実際に踏んだ）。送って来たときと、前から持っているときだけ残す
    const storedOrder = team.pitchingRotation?.pitcherOrder;
    const order =
      sentOrder !== undefined || storedOrder?.length
        ? reliefOrderOf(sentOrder ?? storedOrder, pitchers)
        : null;
    const rank = (id) => {
      const at = (order || []).indexOf(id);
      return at === -1 ? Number.MAX_SAFE_INTEGER : at;
    };
    const sorted = [...pitchers].sort((a, b) => rank(a.id) - rank(b.id));
    rotation = {
      pitcherRoles: roles,
      // ⚠ 決めた順をそのまま残す（次に役割だけ保存したときも順番が消えない）
      ...(order ? { pitcherOrder: order } : {}),
      relievers: sorted
        .filter((p) => !plan.starters.includes(p.id))
        .map((p) => p.id),
      middleRelievers: sorted
        .filter(
          (p) =>
            !plan.starters.includes(p.id) &&
            !['setup', 'closer'].includes(roles[p.id]),
        )
        .map((p) => p.id),
      setupMen: sorted
        .filter((p) => roles[p.id] === 'setup')
        .map((p) => p.id),
      closer: sorted.find((p) => roles[p.id] === 'closer')?.id ?? null,
    };
  }
  return { tactics, rotation };
}
