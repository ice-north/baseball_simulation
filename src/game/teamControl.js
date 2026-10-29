// 球団の操作主体。未設定の既存一人用セーブは従来どおり先頭の1球団を人間とする。
export function humanTeamNames(teams, legacyUserTeam = Object.keys(teams)[0]) {
  const entries = Object.entries(teams);
  if (entries.some(([, team]) => team?.controlType != null)) {
    return entries.filter(([, team]) => team?.controlType === 'human').map(([name]) => name);
  }
  return legacyUserTeam && teams[legacyUserTeam] ? [legacyUserTeam] : [];
}

export function assignTeamControllers(teams, names) {
  if (!Array.isArray(names) || new Set(names).size !== names.length || names.some(name => !teams[name])) {
    throw new Error('担当球団の指定が不正です');
  }
  const humans = new Set(names);
  for (const [name, team] of Object.entries(teams)) {
    team.controlType = humans.has(name) ? 'human' : 'cpu';
  }
}
