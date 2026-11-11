import React, { useEffect, useState } from 'react';
import TeamRoster from './TeamRoster.jsx';
import { Page } from './Page.jsx';
import { teamLabel } from './gameText.js';
import { COACH_ROLES as ROLE_ORDER, ROLE_LABELS } from './coaches.js';
import { useDraftState, STAFF_MODES_DRAFT } from './Drafts.jsx';
import { delegationSettles } from './notices.js';

// ============================================================
// 指導者（監督・投手コーチ・野手コーチ）。PC のページとスマホの画面で共用。
//
// ⚠ いしだ依頼（2026-11-09「CPU球団に個性を持たせる」）。仕様書:
//    https://claude.ai/artifact/HN144s1P83tcUtWbSdH7yU
// ⚠ 文はサーバーが作る（`server/coachView.mjs`）。アプリ（`mobile/.../Staff*.kt`）と
//    同じ文を出すため、画面で言い換えないこと。
// ⚠ 監督は人の采配の肩代わり。能力を上げる効果は無い（いしだ指定「監督バフはナシ」）。
//    ビジョン（攻めの型 × 守りの型 × 時間軸）と育成観・性格で、采配の「AI判断」・
//    トライアウト・退団・キャンプの案・トレードの返事が変わるだけ。
// ============================================================

/** 考え方・性格の1行（「継投: 早め」）。目盛りは -2〜2 の5段 */
function Scale({ item }) {
  const cells = [-2, -1, 0, 1, 2];
  return (
    <li className="online-staff-scale">
      <span className="online-staff-scale-label">{item.label}</span>
      <span className="online-staff-scale-ends">
        <small>{item.low}</small>
        <span className="online-staff-scale-bar" aria-hidden="true">
          {cells.map((v) => (
            <i
              key={v}
              className={`${v === item.value ? 'is-on' : ''}${item.oneSided && v > 0 ? ' is-off' : ''}`}
            />
          ))}
        </span>
        <small>{item.high}</small>
      </span>
      <b>{item.text}</b>
    </li>
  );
}

/** カードの表の1行（値が無ければ出さない。アプリの `Fact` と同じ） */
function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function CoachCard({ coach, roleLabel, actions = null }) {
  if (!coach)
    return (
      <article className="online-staff-card is-empty">
        <header>
          <span className="online-eyebrow">{roleLabel}</span>
          <strong>空席</strong>
        </header>
        <p className="online-muted">いません。受け持ちの分野は自分で決めます。</p>
        {actions}
      </article>
    );
  return (
    <article className="online-staff-card">
      <header>
        <span className="online-eyebrow">{roleLabel || coach.roleLabel}</span>
        <strong>{coach.name}</strong>
        <small>
          {coach.age}歳 · {coach.origin}
          {coach.legend ? ' · 名選手' : ''}
        </small>
        {coach.titles?.length ? (
          <span className="online-staff-titles">
            {coach.titles.map((t) => (
              <b key={t}>{t}</b>
            ))}
          </span>
        ) : null}
      </header>
      <p className="online-staff-color">{coach.headline}</p>
      {coach.pitch && <p className="online-staff-pitch">「{coach.pitch}」</p>}
      <dl className="online-staff-facts">
        <Fact label="ビジョン" value={coach.vision} />
        <Fact label="育成観" value={coach.growth} />
        <Fact label="性格" value={coach.personality} />
        {/* ⚠ 監督がコーチの考えをどれだけ使うか（サーバーの「任せ度25%」）。下の「任せ方」
            （自分がコーチに任せる分野）と別の話なので、同じ「任せ方」の名前にしない */}
        <Fact label="コーチ任せ" value={coach.delegation} />
        <Fact label="軸の選手" value={coach.keyPlayers} />
        <Fact label="通算" value={coach.career} />
        <Fact label="恩師" value={coach.mentor} />
        <Fact label="現役時代" value={coach.playerLine} />
      </dl>
      {coach.views && (
        <details className="online-staff-more">
          <summary>考え方・性格・好む選手・履歴</summary>
          {coach.prefs && <p className="online-staff-prefs">好む選手: {coach.prefs}</p>}
          <ul className="online-staff-scales">
            {coach.views.map((item) => (
              <Scale key={item.key} item={item} />
            ))}
          </ul>
          <ul className="online-staff-scales">
            {coach.traits.map((item) => (
              <Scale key={item.key} item={item} />
            ))}
          </ul>
          {coach.history?.length ? (
            <ul className="online-staff-history">
              {coach.history.map((h, i) => (
                <li key={`${h.year}:${h.team}:${i}`}>
                  <b>{h.year}年</b> {h.teamLabel} {h.roleLabel} {h.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="online-muted">指導者としての履歴はまだありません。</p>
          )}
        </details>
      )}
      {actions}
    </article>
  );
}

/**
 * 解任・市場から呼ぶの前の確認（アプリの `StaffAsk` と同じ文）。
 * ⚠ 解任した人は市場に出てほかの球団に呼ばれることがあるので、押した瞬間には送らない。
 *    入れ替えは席の中で動くだけなので確認しない（アプリと同じ）。
 *    見た目はトレードの確認（`.online-trade-confirm`）と同じ「取り消せない操作の前の確認」の枠
 */
function StaffConfirm({ ask, busy, act, onBack }) {
  const roleLabel = ROLE_LABELS[ask.role] || '';
  const release = ask.action === 'release';
  return (
    <div className="online-trade-confirm" role="group" aria-label="指導者の操作の確認">
      <p className="online-trade-confirm-head">
        {release
          ? `${ask.name}${roleLabel}を解任しますか`
          : `${ask.name}を${roleLabel}に呼びますか`}
      </p>
      <p>
        {release
          ? '市場に出るので、ほかの球団に呼ばれることがあります（このキャンプの間なら、市場に残っていれば呼び戻せます）。'
          : `空いている${roleLabel}の席に就きます。`}
      </p>
      <div className="online-actions">
        <button
          className="online-primary"
          disabled={busy}
          onClick={async () => {
            const result = await act(ask);
            if (result?.ok) onBack();
          }}
        >
          {release ? '解任する' : '呼ぶ'}
        </button>
        <button disabled={busy} onClick={onBack}>
          戻る
        </button>
      </div>
    </div>
  );
}

/** 指導者の操作が済んだときの知らせ（アプリの `staffDoneText` と同じ文） */
export function staffDoneText({ action, role, other, name }) {
  const label = ROLE_LABELS[role] || '';
  if (action === 'release') return `${name || ''}${label}を解任しました`;
  if (action === 'hire') return `${name || ''}を${label}に呼びました`;
  if (action === 'swap') return `${label}と${ROLE_LABELS[other] || ''}を入れ替えました`;
  return '指導者を入れ替えました';
}

/** 席の操作（キャンプの間だけ）: 解任・役職の入れ替え */
function SeatActions({ role, seats, busy, act, ask, setAsk }) {
  const coach = seats.find((s) => s.role === role)?.coach;
  if (ask?.action === 'release' && ask.role === role)
    return <StaffConfirm ask={ask} busy={busy} act={act} onBack={() => setAsk(null)} />;
  return (
    <div className="online-actions online-staff-actions">
      {coach && (
        <button
          disabled={busy}
          onClick={() => setAsk({ action: 'release', role, name: coach.name })}
        >
          解任する
        </button>
      )}
      {ROLE_ORDER.filter((r) => r !== role).map((other) => {
        const otherCoach = seats.find((s) => s.role === other)?.coach;
        if (!coach && !otherCoach) return null;
        return (
          <button
            key={other}
            disabled={busy}
            onClick={() => act({ action: 'swap', role, other })}
          >
            {ROLE_LABELS[other]}と入れ替える
          </button>
        );
      })}
    </div>
  );
}

/**
 * 任せ方の下書き（変えた分野だけ）から、送る分を取り出す。席が空いた分野（`locked`）と、
 * いまの値と同じものは送らない。アプリの `staffModeChanges`（Staff.kt）と同じ決め方
 */
export function staffModeChanges(modes, draft) {
  return Object.fromEntries(
    (modes || [])
      .filter((a) => !a.locked && draft?.[a.key] && draft[a.key] !== a.effective)
      .map((a) => [a.key, draft[a.key]]),
  );
}

/**
 * 任せ方。⚠ **まとめて変えて「任せ方を保存」で1回だけ送る**（いしだ指摘 2026-11-10:
 *    1つ押すたびに保存と読み込みが走るのは微妙）。下書きは変えた分野だけを持つ
 *    （`STAFF_MODES_DRAFT`。閉じる前の確認にも効く）。席が空いた分野は「自分で」に固定
 */
function Modes({ view, staff, busy, run, command }) {
  const [draft, setDraft] = useDraftState(STAFF_MODES_DRAFT, {});
  const [error, setError] = useState('');
  // 保存すると手続きがその場で決まるときの確認（決まる手続きの名前。再監査 A2）
  const [asking, setAsking] = useState(null);
  const changes = staffModeChanges(staff.modes, draft);
  const count = Object.keys(changes).length;
  // 席が空いた・他の端末で同じ値にした、で送る分が無くなった下書きは捨てる
  //  （残すと、閉じる前の確認が変更の無いまま出る）
  useEffect(() => {
    if (!count && Object.keys(draft || {}).length) setDraft({});
  }, [count, draft, setDraft]);
  const pick = (area, value) => {
    const next = { ...draft };
    if (value === area.effective) delete next[area.key];
    else next[area.key] = value;
    setDraft(next);
    setError('');
    setAsking(null);
  };
  const save = () =>
    run(async () => {
      setError('');
      try {
        await command('staffModes', { modes: changes });
        setDraft({});
      } catch (e) {
        setError(e.message);
        throw e;
      }
    });
  const discard = () => {
    setDraft({});
    setError('');
    setAsking(null);
  };
  // ⚠ **待たれている最後の1人が手続きの分野を「任せる」にすると、保存した瞬間にその手続きが
  //    指導者の案で決まる**（サーバーの `updateStaffModes`。キャンプなら残りのクールが回って人事の
  //    期間も終わる）。取り消せないので確認を1段挟む。以前は確認が無く、知らせも「任せ方を
  //    変えました」だけだった（再監査 A2）。文と条件はアプリの StaffPanel と同じ
  const requestSave = () => {
    const settles = delegationSettles(view, changes);
    if (settles) setAsking(settles);
    else save();
  };
  return (
    <section className="online-card">
      <h2>任せ方</h2>
      <p className="online-muted">
        分野ごとに選びます。「意見を聞く」は決めるのはあなたで、指導者の案が標準案になります（采配の「AI判断」は指導者の考えで動きます）。「任せる」は指導者が決めます（トライアウト・退団・キャンプは、あなたの決定を待たずに進みます）。全部「自分で」なら指導者を入れる前と同じです。
      </p>
      <div className="online-choices online-staff-modes">
        {staff.modes.map((area) => {
          const shown = area.locked ? area.effective : draft?.[area.key] || area.effective;
          return (
            <div
              key={area.key}
              className={`online-choice${changes[area.key] ? ' is-changed' : ''}`}
            >
              <span className="online-choice-label">
                {area.label}
                {changes[area.key] && <em className="online-staff-unsaved">未保存</em>}
                <small>{area.ownerLabel}</small>
              </span>
              <div className="online-segments" role="group" aria-label={area.label}>
                {staff.modeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={shown === option.value}
                    disabled={busy || (area.locked && option.value !== 'self')}
                    onClick={() => pick(area, option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {area.note && <small className="online-muted">{area.note}</small>}
            </div>
          );
        })}
      </div>
      <div className="online-actions online-staff-save">
        <span className={error ? 'online-error-text' : 'online-muted'} role={error ? 'alert' : undefined}>
          {error
            ? `保存できませんでした：${error}（変更は残っています）`
            : count
              ? `保存していない変更があります（${count}件）`
              : '保存済み'}
        </span>
        <button disabled={busy || !count} onClick={discard}>
          変更を取り消す
        </button>
        <button className="online-primary" disabled={busy || !count} onClick={requestSave}>
          任せ方を保存
        </button>
      </div>
      {asking && (
        <div className="online-trade-confirm" role="group" aria-label="任せ方の確認">
          <p className="online-trade-confirm-head">
            {`いま決めていないのはあなただけです。任せると、この場で${asking}が指導者の案で決まり、取り消せません。任せますか？`}
          </p>
          <div className="online-actions">
            <button
              className="online-primary"
              disabled={busy}
              onClick={() => {
                setAsking(null);
                save();
              }}
            >
              任せる
            </button>
            <button disabled={busy} onClick={() => setAsking(null)}>
              やめる
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** 采配の内訳（実際に動く中身と決めた人）。⚠ 人の球団の分は自分の球団だけ届く */
export function TacticsLines({ lines, title = '試合中の采配（実際の動き）' }) {
  if (!lines?.length) return null;
  return (
    <section className="online-card">
      <h2>{title}</h2>
      <p className="online-muted">
        「AI判断」の項目に指導者が入れている中身と、決めた人です。
      </p>
      <ul className="online-staff-tactics">
        {lines.map((line) => (
          <li key={`${line.field}:${line.key}`} className={line.by ? 'is-coached' : ''}>
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Market({ staff, busy, act, ask, setAsk }) {
  const empty = staff.seats.filter((s) => !s.coach).map((s) => s.role);
  return (
    <section className="online-card">
      <h2>市場（呼べる指導者）</h2>
      <p className="online-muted">
        キャンプの間だけ入れ替えられます。空いた席に呼べます（先に解任して席を空けてください）。CPU球団はキャンプの終わりに市場から埋めるので、早い者勝ちです。
      </p>
      {staff.market.length ? (
        <div className="online-staff-grid">
          {staff.market.map((coach) => (
            <CoachCard
              key={coach.id}
              coach={coach}
              roleLabel={coach.fromPlayer ? '引退したばかり' : '浪人中'}
              actions={
                ask?.action === 'hire' && ask.coachId === coach.id ? (
                  <StaffConfirm ask={ask} busy={busy} act={act} onBack={() => setAsk(null)} />
                ) : (
                  <div className="online-actions online-staff-actions">
                    {ROLE_ORDER.map((role) => (
                      <button
                        key={role}
                        disabled={busy || !empty.includes(role)}
                        onClick={() =>
                          setAsk({ action: 'hire', role, coachId: coach.id, name: coach.name })
                        }
                      >
                        {ROLE_LABELS[role]}に呼ぶ
                      </button>
                    ))}
                  </div>
                )
              }
            />
          ))}
        </div>
      ) : (
        <p>いま市場にいる人はいません。</p>
      )}
    </section>
  );
}

function Events({ events, title = '最近の人事' }) {
  if (!events?.length) return null;
  return (
    <section className="online-card">
      <h2>{title}</h2>
      <ul className="online-staff-events">
        {events.map((e, i) => (
          <li key={`${e.year}:${e.coachId}:${e.kind}:${i}`}>
            <small>{e.year}年</small> {e.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LeagueStaff({ leagueStaff }) {
  if (!leagueStaff?.teams?.length) return null;
  return (
    <section className="online-card">
      <h2>各球団の指導者</h2>
      <table className="online-standings online-staff-table">
        <thead>
          <tr>
            <th>球団</th>
            <th>監督</th>
            <th>投手コーチ</th>
            <th>野手コーチ</th>
          </tr>
        </thead>
        <tbody>
          {leagueStaff.teams.map((t) => (
            <tr key={t.team}>
              <th>{teamLabel(t.team)}</th>
              {ROLE_ORDER.map((role) => (
                <td key={role}>
                  {t[role] ? (
                    <>
                      {t[role].name}
                      <small>{t[role].color}</small>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** 自分の球団の指導者（席・任せ方・采配の内訳・市場） */
function OwnStaff({ view, busy, run, command }) {
  const staff = view.staff;
  // 確かめている操作（解任・市場から呼ぶ。1つだけ）。`name` は知らせの文に使うだけで送らない
  const [ask, setAsk] = useState(null);
  const act = ({ name, ...payload }) =>
    run(() => command('staff', payload, { message: staffDoneText({ ...payload, name }) }));
  return (
    <>
      <section className="online-card">
        <h2>首脳陣</h2>
        <p className="online-muted">
          {staff.canEditSeats
            ? 'キャンプの間は、解任・役職の入れ替え・市場から呼ぶことができます。何もしなければ留任です。'
            : '入れ替えられるのは年度更新のすぐ後のキャンプの間だけです。'}
        </p>
        <div className="online-staff-grid">
          {staff.seats.map((seat) => (
            <CoachCard
              key={seat.role}
              coach={seat.coach}
              roleLabel={seat.roleLabel}
              actions={
                staff.canEditSeats ? (
                  <SeatActions
                    role={seat.role}
                    seats={staff.seats}
                    busy={busy}
                    act={act}
                    ask={ask}
                    setAsk={setAsk}
                  />
                ) : null
              }
            />
          ))}
        </div>
      </section>
      <Modes view={view} staff={staff} busy={busy} run={run} command={command} />
      <TacticsLines lines={staff.tactics} />
      {staff.canEditSeats && (
        <Market staff={staff} busy={busy} act={act} ask={ask} setAsk={setAsk} />
      )}
      <Events events={staff.events} title="うちの球団の人事" />
    </>
  );
}

/** 他球団の指導者（読むだけ）。⚠ 人の球団の采配は届かない（サーバーが出さない） */
function OtherStaff({ shown }) {
  const staff = shown.staff;
  if (!staff) return <p>指導者の情報がありません。</p>;
  return (
    <>
      <section className="online-card">
        <h2>首脳陣</h2>
        {staff.front && (
          <p className="online-muted">
            球団の期待: {staff.front.ambition} · 我慢強さ: {staff.front.patience}
          </p>
        )}
        <div className="online-staff-grid">
          {staff.seats.map((seat) => (
            <CoachCard key={seat.role} coach={seat.coach} roleLabel={seat.roleLabel} />
          ))}
        </div>
      </section>
      {staff.tactics ? (
        <TacticsLines lines={staff.tactics} />
      ) : (
        <section className="online-card">
          <p className="online-muted">人の球団の采配は見られません。</p>
        </section>
      )}
      <Events events={staff.events} title="この球団の人事" />
    </>
  );
}

export function StaffBody({ view, busy, run, command, mobile = false, children }) {
  if (!view.staff)
    return (
      <section className="online-card">
        <p>指導者の情報がまだありません。</p>
      </section>
    );
  return (
    <TeamRoster view={view}>
      {(shown, selector) =>
        children ? (
          children(
            shown,
            selector,
            shown.teamName === view.teamName ? (
              <OwnStaff view={view} busy={busy} run={run} command={command} />
            ) : (
              <OtherStaff shown={shown} />
            ),
          )
        ) : (
          <>
            {mobile && <div className="online-team-selector">{selector}</div>}
            {shown.teamName === view.teamName ? (
              <OwnStaff view={view} busy={busy} run={run} command={command} />
            ) : (
              <OtherStaff shown={shown} />
            )}
            <LeagueStaff leagueStaff={view.leagueStaff} />
            <Events events={view.leagueStaff?.events} title="リーグの人事" />
          </>
        )
      }
    </TeamRoster>
  );
}

/** PC の「指導者」ページ */
export default function StaffPage(props) {
  const { view } = props;
  return (
    <StaffBody {...props}>
      {(shown, selector, body) => (
        <Page
          title="指導者"
          sub="監督・投手コーチ・野手コーチの考え方と性格で、采配やトライアウトの案が変わります（能力は上がりません）。監督の「任せ度」は、投手・野手の判断でコーチの考えをどれだけ使うかです（ワンマン 0%〜任せる 100%）。"
          actions={<div className="online-team-selector">{selector}</div>}
        >
          {body}
          <LeagueStaff leagueStaff={view.leagueStaff} />
          <Events events={view.leagueStaff?.events} title="リーグの人事" />
        </Page>
      )}
    </StaffBody>
  );
}

/** 方針・采配の各項目の横に出す「実際の動き」（`view.staff.tactics` から） */
export function tacticLineOf(view, field, key) {
  return (view.staff?.tactics || []).find((l) => l.field === field && l.key === key) || null;
}

/**
 * 方針・采配の項目の下に出す「→ 積極的（山田監督）」。指導者が決めていなければ出さない。
 * ⚠ 保存した設定に対する中身。変えて保存するまでは前の設定のまま（PC・スマホ共用）
 */
export function StaffActual({ view, field, name }) {
  const line = tacticLineOf(view, field, name);
  if (!line?.by) return null;
  return (
    <small className="online-staff-actual">
      → {line.resolvedLabel}（{line.by}）
    </small>
  );
}

/** 任せ方（分野）の今の値 */
export function staffModeOf(view, area) {
  return view.staff?.modes?.find((m) => m.key === area) || null;
}

/** 方針・采配を指導者に任せているときの断り（PC・スマホ共用。アプリの `TacticsEditor` と同じ文） */
export function TacticsDelegateNote({ view }) {
  if (staffModeOf(view, 'tactics')?.effective !== 'delegate') return null;
  return (
    <p className="online-staff-note" role="status">
      試合中の采配は指導者に任せています（「→」の内容で動きます）。ここで変えて保存すると、任せ方は「意見を聞く」に戻ります。
    </p>
  );
}
