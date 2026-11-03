import React, { useState } from 'react';
import { teamLabel } from './gameText.js';

// ============================================================
// 自チーム情報。球団名とプレイヤー名をここで決める。
//
// ⚠ **参加のときしか名前を付けられなかった**。リーグを作った管理者には
//    その機会すら無く、順位表に「湘南サンズ（湘南サンズ）」のように
//    球団名が2回出ていた（参加時の呼び名の既定が球団名だったため）。
// ⚠ 内部名（`teamName`）は変わらない。記録の選手キーまで貫いているので、
//    見せる名前だけ差し替える。
// ============================================================

export default function TeamProfile({ view, busy, run, command }) {
  const me = (view.members || []).find((m) => m.teamName === view.teamName);
  const [teamName, setTeamName] = useState(
    () => me?.displayName || teamLabel(view.teamName),
  );
  const [playerName, setPlayerName] = useState(() => me?.label || '');
  const [saved, setSaved] = useState(false);
  const roster = view.roster || [];
  const pitchers = roster.filter((p) => p.position === 'pitcher').length;
  return (
    <div className="online-form-width">
      <section className="online-card">
        <h2>自チーム情報</h2>
        <dl className="online-profile-facts">
          <div>
            <dt>所属</dt>
            <dd>
              {view.divisions?.find((d) =>
                d.rows.some((r) => r.team === view.teamName),
              )?.name || '—'}
            </dd>
          </div>
          <div>
            <dt>順位</dt>
            <dd>
              {view.divisions
                ?.flatMap((d) => d.rows)
                .find((r) => r.team === view.teamName)?.rank || '—'}
              位
            </dd>
          </div>
          <div>
            <dt>所属選手</dt>
            <dd>
              {roster.length}人（投手{pitchers} 野手{roster.length - pitchers}）
            </dd>
          </div>
          <div>
            <dt>年</dt>
            <dd>{view.year}年目</dd>
          </div>
        </dl>
      </section>
      <section className="online-card">
        <h2>名前</h2>
        <p className="online-muted">
          球団名と、順位表に出るあなたの名前を決められます。いつでも変えられます。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            run(async () => {
              await command('profile', {
                teamName: teamName.trim(),
                playerName: playerName.trim(),
              });
              setSaved(true);
            });
          }}
        >
          <label>
            球団名
            <input
              value={teamName}
              maxLength={24}
              disabled={busy}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </label>
          <label>
            あなたの名前（順位表に括弧で出ます）
            <input
              value={playerName}
              maxLength={24}
              disabled={busy}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </label>
          <button className="online-primary" type="submit" disabled={busy}>
            保存する
          </button>
        </form>
        {saved && <p role="status">保存しました。</p>}
      </section>
    </div>
  );
}
