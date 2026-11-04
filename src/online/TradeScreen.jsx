import React, { useMemo, useState } from 'react';
import { useRead } from './useRead.js';
import { teamLabel, teamShort } from './gameText.js';
import { POS } from './api.js';
import { Page } from './Page.jsx';
import { Choice } from './Choice.jsx';
import { PlayerStatsButton } from './PlayerPerformance.jsx';

// ============================================================
// 球団間のトレード。
//
// 【流れ】提案 → 相手が「受ける／逆提案／断る」。
//   - 受ける → その場で成立し、選手が入れ替わる
//   - 逆提案 → **提案した側に戻る**。そこで受ければ成立、断れば消える
//   - 断る   → 消える（どちらの側からでも＝取り下げも兼ねる）
// ⚠ **逆提案は1回だけ**。何度でも投げ返せると終わらない。
//
// ⚠ **相手は参加者の球団だけ**。CPU球団は返事をしないので、出せても永久に
//    待つことになる。出さない（できないことを、できるように見せない）。
// ⚠ 相手の名簿は**その場で取りに行く**（`useRead('team')`）。12球団ぶんを
//    いつもビューに載せると重い。
// ⚠ 成立するかはサーバーが決める（`assertTradeAllowed`）。画面では止めず、
//    断られた理由をそのまま出す——画面で先に止めると、規則が2か所になる。
// ============================================================

/** 選手の一行。選ぶためのチェックと、名前・年齢・守備位置 */
function PickRow({ player, checked, disabled, onToggle }) {
  return (
    <label className="online-check online-trade-pick">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(player.id)}
      />
      <PlayerStatsButton player={player} panel="abilities" />
      <small>
        {player.age}歳·{POS[player.position]}
      </small>
    </label>
  );
}

function PlayerList({ title, players, picked, busy, onToggle, empty }) {
  return (
    <section className="online-trade-column">
      <h3>
        {title}
        <small>{picked.length}人を選択中</small>
      </h3>
      {players.length ? (
        <div className="online-trade-list">
          {players.map((p) => (
            <PickRow
              key={p.id}
              player={p}
              checked={picked.includes(p.id)}
              disabled={busy}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : (
        <p className="online-muted">{empty}</p>
      )}
    </section>
  );
}

/** 提案の中身（どちらが誰を出すか）を1行で */
function TradeSummary({ trade }) {
  const side = (players) =>
    players.length ? players.map((p) => p.name).join('・') : 'なし';
  return (
    <p className="online-trade-summary">
      <span>
        <b>{teamShort(trade.fromTeam)}</b> が出す: {side(trade.offer)}
      </span>
      <span>
        <b>{teamShort(trade.toTeam)}</b> が出す: {side(trade.want)}
      </span>
    </p>
  );
}

/** 提案を作る／逆提案を作る欄 */
function TradeForm({
  view,
  partner,
  setPartner,
  partners,
  busy,
  offer,
  want,
  setOffer,
  setWant,
  onSubmit,
  submitLabel,
  lockPartner = false,
}) {
  const theirs = useRead(partner ? 'team' : null, {
    team: partner,
    revision: view.revision,
  });
  const theirRoster = theirs.data?.teamName === partner ? theirs.data.roster : null;
  const toggle = (list, setList) => (id) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <>
      {!lockPartner && (
        <Choice
          label="相手の球団"
          options={Object.fromEntries(
            partners.map((name) => [name, teamLabel(name)]),
          )}
          value={partner || ''}
          disabled={busy}
          onChange={setPartner}
        />
      )}
      <div className="online-trade-grid">
        <PlayerList
          title={`${teamLabel(view.teamName)} が出す`}
          players={view.roster || []}
          picked={offer}
          busy={busy}
          onToggle={toggle(offer, setOffer)}
          empty="選手が居ません。"
        />
        <PlayerList
          title={`${teamLabel(partner)} が出す`}
          players={theirRoster || []}
          picked={want}
          busy={busy}
          onToggle={toggle(want, setWant)}
          empty={theirs.error ? '名簿を読めませんでした。' : '名簿を読んでいます…'}
        />
      </div>
      {/* ⚠ 人数が合わないと上限（24人）を超えて断られる。先に知らせる */}
      {offer.length !== want.length && (
        <p className="online-muted">
          出す{offer.length}人・もらう{want.length}人。人数が違うと、どちらかの
          名簿が24人を超えたり9人を割ったりして断られることがあります。
        </p>
      )}
      <div className="online-actions">
        <button
          className="online-primary"
          disabled={busy || !partner || offer.length + want.length === 0}
          onClick={() => onSubmit(offer, want)}
        >
          {submitLabel}
        </button>
      </div>
    </>
  );
}

function TradeCard({ view, trade, busy, run, command }) {
  const [countering, setCountering] = useState(false);
  // ⚠ **自分の側／相手の側で入れ直すこと**。`trade.offer` はいつも
  //    「提案した側（`fromTeam`）が出す選手」なので、提案を受けた側から見ると
  //    それは**相手の選手**。そのまま入れると、自分の欄に相手の選手を
  //    選んだ状態で送ってしまい「出す選手が名簿にいません」で断られる（実測）。
  const myIds = (trade.mine ? trade.offer : trade.want).map((p) => p.id);
  const theirIds = (trade.mine ? trade.want : trade.offer).map((p) => p.id);
  const [offer, setOffer] = useState(myIds);
  const [want, setWant] = useState(theirIds);
  const partner = trade.mine ? trade.toTeam : trade.fromTeam;
  const respond = (action, payload) =>
    run(() => command('tradeRespond', { tradeId: trade.id, action, ...payload }));
  // ⚠ 移籍済みの選手が混ざっていたら、受けても断られる。先に知らせる
  const stale = [...trade.offer, ...trade.want].some((p) => p.gone);
  return (
    <section className="online-card online-trade-card">
      <div className="online-card-heading">
        <h3>
          {trade.mine
            ? `${teamLabel(trade.toTeam)} へ提案中`
            : `${teamLabel(trade.fromTeam)} からの提案`}
        </h3>
        <small className={trade.myTurn ? 'online-own-text' : 'online-muted'}>
          {trade.myTurn ? 'あなたの返事待ち' : '相手の返事待ち'}
          {trade.countered && '（逆提案あり）'}
        </small>
      </div>
      <TradeSummary trade={trade} />
      {stale && (
        <p role="alert">
          この提案の選手は、別のトレードで移っています。受けても成立しません。
        </p>
      )}
      {trade.myTurn && !countering && (
        <div className="online-actions">
          <button
            className="online-primary"
            disabled={busy || stale}
            onClick={() => respond('accept')}
          >
            この内容で成立させる
          </button>
          {/* ⚠ 逆提案は1回だけ。2回目の返事では出さない */}
          {trade.canCounter && (
            <button disabled={busy} onClick={() => setCountering(true)}>
              逆提案する
            </button>
          )}
          <button disabled={busy} onClick={() => respond('reject')}>
            断る
          </button>
        </div>
      )}
      {trade.myTurn && countering && (
        <>
          <p className="online-muted">
            中身を作り替えて返します。
            <strong>逆提案はこの1回だけ</strong>
            で、相手が受けなければこの提案は消えます。
          </p>
          <TradeForm
            view={view}
            partner={partner}
            partners={[partner]}
            lockPartner
            busy={busy}
            offer={offer}
            want={want}
            setOffer={setOffer}
            setWant={setWant}
            submitLabel="この内容で返す"
            onSubmit={(o, w) =>
              run(async () => {
                await command('tradeRespond', {
                  tradeId: trade.id,
                  action: 'counter',
                  // ⚠ `offer` はいつも**提案した側**が出す選手。向きを変えない
                  offer: trade.mine ? o : w,
                  want: trade.mine ? w : o,
                });
                setCountering(false);
              })
            }
          />
          <div className="online-actions">
            <button disabled={busy} onClick={() => setCountering(false)}>
              やめる
            </button>
          </div>
        </>
      )}
      {!trade.myTurn && (
        <div className="online-actions">
          <button disabled={busy} onClick={() => respond('reject')}>
            {trade.mine ? '取り下げる' : '断る'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function TradeScreen({ view, busy, run, command }) {
  const partners = useMemo(
    () =>
      (view.members || [])
        .map((m) => m.teamName)
        .filter((name) => name !== view.teamName),
    [view.members, view.teamName],
  );
  const [partner, setPartner] = useState(partners[0] || '');
  const [offer, setOffer] = useState([]);
  const [want, setWant] = useState([]);
  const trades = view.trades || [];
  const waiting = trades.filter((t) => t.myTurn);
  const sent = trades.filter((t) => !t.myTurn);
  return (
    <Page
      title="トレード"
      sub="参加者の球団と選手を交換します。相手が受ければその場で成立します。"
    >
      {waiting.map((t) => (
        <TradeCard
          key={t.id}
          view={view}
          trade={t}
          busy={busy}
          run={run}
          command={command}
        />
      ))}
      {sent.map((t) => (
        <TradeCard
          key={t.id}
          view={view}
          trade={t}
          busy={busy}
          run={run}
          command={command}
        />
      ))}
      <section className="online-card">
        <h2>新しく提案する</h2>
        {partners.length ? (
          <>
            <p className="online-muted">
              相手が「受ける」を押すと、その場で選手が入れ替わります。相手が
              逆提案を返してきたら、こんどはあなたが受けるか断るかを選びます
              （逆提案は1回だけ）。
            </p>
            <TradeForm
              view={view}
              partner={partner}
              setPartner={(name) => {
                setPartner(name);
                setWant([]);
              }}
              partners={partners}
              busy={busy}
              offer={offer}
              want={want}
              setOffer={setOffer}
              setWant={setWant}
              submitLabel="この内容で提案する"
              onSubmit={(o, w) =>
                run(async () => {
                  await command('tradeOffer', { to: partner, offer: o, want: w });
                  setOffer([]);
                  setWant([]);
                })
              }
            />
          </>
        ) : (
          /* ⚠ **できないことを、できるように見せない**。CPU球団は返事をしない */
          <p>
            トレードの相手は、いまリーグに参加している人の球団だけです。
            ほかの人が参加すると選べるようになります（CPU球団とは交換できません）。
          </p>
        )}
      </section>
      <section className="online-card">
        <h2>解雇と獲得</h2>
        <p>
          <strong>解雇</strong>は土曜の「契約更改」、
          <strong>選手の獲得</strong>は土曜の「トライアウト」で行います。
        </p>
      </section>
    </Page>
  );
}
