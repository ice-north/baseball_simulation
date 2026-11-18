import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReadContext } from './useRead.js';
import { inOnlineRoot } from './dialogPortal.js';
import { paperView, player, gameResult } from './paper/paperView.js';
import { buildFrontPage, loadOwnHistory } from './paper/frontPage.js';
import { buildNationalPage } from './paper/national.js';

// ============================================================
// PC のスポーツ新聞（いしだ 2026-11-18「PC版でも新聞を。リーグ順位の右あたりに『スポーツ新聞』ボタン」
// 「1〜3面ぜんぶ移す」）。ホームのリーグ順位の見出しのボタンから小窓で開く。
//
// ⚠ 紙面の文はアプリと同じ（`paper/` はアプリの `FrontPage*.kt` の写し）。文を変えるときは両方を直す。
//    照合: `node mobile/tools/expect-paper.mjs` が書き出す期待値を、アプリの検査（FrontPageWebTest）が読む。
// ⚠ 読むものはアプリのホームと同じ（自球団の最新の試合の詳細・今季の自球団の試合・次の相手の名簿）。
//    開いたときだけ読む（ホームを開くたびには読まない）。
// ⚠ PC にはアプリの「お知らせ」（手続き）・コラム（TIPS）・アプリの版の記事は無い（ホームと上の帯が受け持つ）。
// ============================================================

const OWN_HISTORY_PAGE = 200;

/** 自球団の最新の試合（ビューの直近の結果から。アプリのホームと同じ） */
function lastOwnResult(view) {
  const team = view.teamName;
  const own = (view.results || []).filter((r) => r.home === team || r.away === team);
  return own.length ? own[own.length - 1] : null;
}

function nextOpponent(view) {
  const team = view.teamName;
  const g = (view.nextGames || []).find((x) => x.home === team || x.away === team);
  return g ? (g.home === team ? g.away : g.home) : null;
}

/** 紙面に要るもの（試合の詳細・今季の試合・次の相手の名簿）を読む。読めなかったものは無しで組む */
function usePaperSources(view) {
  const read = useContext(ReadContext);
  const last = lastOwnResult(view);
  const lastId = last?.gameId ?? null;
  const opp = nextOpponent(view);
  const year = view.year ?? '';
  const [state, setState] = useState({ ready: false, game: null, history: null, opponent: null });
  useEffect(() => {
    let cancelled = false;
    const safe = (p) => Promise.resolve().then(p).catch(() => null);
    Promise.all([
      lastId == null || !read ? null : safe(() => read('game', { id: lastId, year })),
      !read
        ? null
        : safe(() =>
            loadOwnHistory(
              view.teamName ?? '',
              (page) => read('games', { year, page, scope: 'own', size: OWN_HISTORY_PAGE }),
              gameResult,
            ),
          ),
      opp == null || !read ? null : safe(() => read('team', { team: opp })),
    ]).then(([game, history, team]) => {
      if (cancelled) return;
      setState({
        ready: true,
        game: game || null,
        history: history || null,
        opponent: Array.isArray(team?.roster) ? team.roster.map(player) : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [read, lastId, year, opp, view.teamName]);
  return state;
}

/** 紙面を組む（地元紙と全国紙） */
function usePapers(raw, sources) {
  return useMemo(() => {
    if (!sources.ready) return null;
    const view = paperView(raw);
    const local = buildFrontPage(view, raw, sources.game, {
      history: sources.history?.[0] ?? null,
      historyComplete: sources.history?.[1] ?? false,
      opponent: sources.opponent,
    });
    return { Local: local, National: buildNationalPage(view, raw, local) };
  }, [raw, sources]);
}

export function SportsPaperButton({ view }) {
  const [open, setOpen] = useState(false);
  if (!view?.teamName) return null;
  return (
    <>
      <button type="button" className="online-paper-open" onClick={() => setOpen(true)} title="きょうの紙面（地元紙・全国紙）を開く">
        スポーツ新聞
      </button>
      {open && <SportsPaperDialog view={view} close={() => setOpen(false)} />}
    </>
  );
}

function SportsPaperDialog({ view, close }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    const trigger = document.activeElement;
    node.showModal();
    return () => {
      if (node.open) node.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const dismiss = () => {
    ref.current?.close();
    close();
  };
  const sources = usePaperSources(view);
  const papers = usePapers(view, sources);
  const [kind, setKind] = useState('Local');
  const [pageNo, setPageNo] = useState(1);
  const page = papers?.[kind] ?? null;
  const pages = page ? [1, page.teamPage ? 2 : null, page.recordPage ? 3 : null].filter(Boolean) : [1];
  const now = pages.includes(pageNo) ? pageNo : 1;
  const body = useRef(null);
  const go = (n) => {
    setPageNo(n);
    body.current?.scrollTo?.({ top: 0 });
  };
  return inOnlineRoot(
    <dialog
      ref={ref}
      className="online-paper-dialog"
      aria-label="スポーツ新聞"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === ref.current) dismiss();
      }}
    >
      <div className="online-sp online-paper-bar">
        <div className="online-paper-switch" role="tablist" aria-label="新聞">
          {[
            ['Local', '地元紙'],
            ['National', '全国紙'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? 'is-on' : ''}
              onClick={() => {
                setKind(k);
                go(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {pages.length > 1 && (
          <div className="online-paper-switch" role="tablist" aria-label="面">
            {pages.map((n) => (
              <button key={n} type="button" role="tab" aria-selected={now === n} className={now === n ? 'is-on' : ''} onClick={() => go(n)}>
                {n}面
              </button>
            ))}
          </div>
        )}
        <button type="button" className="online-paper-close" onClick={dismiss} aria-label="スポーツ新聞を閉じる">
          閉じる
        </button>
      </div>
      <div ref={body} className={`online-sp online-paper ${kind === 'National' ? 'is-national' : 'is-local'}`}>
        {!page ? (
          <p className="online-paper-wait">ただいま印刷中…</p>
        ) : (
          <>
            <RunningHead page={page} pageNo={now} />
            <Masthead page={page} />
            {now === 2 && page.teamPage ? (
              <TeamPageView t={page.teamPage} onNext={() => go(3)} />
            ) : now === 3 && page.recordPage ? (
              <RecordPageView r={page.recordPage} onBack={() => go(1)} />
            ) : (
              <FrontView page={page} onPage={go} />
            )}
          </>
        )}
      </div>
    </dialog>,
  );
}

// ------------------------------------------------------------------------------------------
// 題字まわり

function RunningHead({ page, pageNo }) {
  return (
    <div className="paper-running">
      <span>
        （{pageNo}）{page.issueNo != null ? `　第${page.issueNo}号` : ''}
      </span>
      <span>{page.dateLine}</span>
      <span>{page.title}社</span>
    </div>
  );
}

function Masthead({ page }) {
  return (
    <header className="paper-masthead">
      <div className="paper-title">
        <strong>{page.title}</strong>
        <em>{page.badge}</em>
      </div>
      <div className="paper-mast-side">
        <b>{page.team}</b>
        <span>{[page.standing, page.status].filter(Boolean).join('　')}</span>
        <span>{page.issue}</span>
      </div>
      {page.index.length > 0 && (
        <ul className="paper-index" aria-label="きょうの紙面">
          {page.index.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </header>
  );
}

// ------------------------------------------------------------------------------------------
// 1面

function FrontView({ page, onPage }) {
  const articles = page.frontArticles ?? page.articles;
  return (
    <div className="paper-front">
      {page.extra && <div className="paper-extra">号　外</div>}
      {page.score ? (
        <div className={`paper-top ${page.hero ? 'has-hero' : ''}`}>
          {page.bigHead && (
            <div className="paper-bighead" aria-label={page.headline}>
              <VText className="paper-big" text={page.bigHead} />
              {page.bigSub && <VText className="paper-bigsub" text={page.bigSub} />}
            </div>
          )}
          <figure className="paper-photo">
            <Scoreboard page={page} />
            {page.caption && <figcaption>{page.caption}</figcaption>}
          </figure>
          {page.hero && <HeroBox hero={page.hero} />}
        </div>
      ) : (
        <div className="paper-blackhead">
          {page.kicker && <small>{page.kicker}</small>}
          <h2>{page.headline}</h2>
        </div>
      )}
      <div className="paper-leadblock">
        {page.score && page.leadHead && <VText className="paper-leadhead" text={page.leadHead} />}
        <div>
          {page.score && (
            <>
              {page.kicker && <small className="paper-kicker">{page.kicker}</small>}
              <h2 className="paper-headline">{page.headline}</h2>
            </>
          )}
          {page.subhead && <p className="paper-subhead">{page.subhead}</p>}
          {page.lead && <p className="paper-lead">{page.lead}</p>}
        </div>
      </div>
      {page.box.length > 0 && (
        <p className="paper-boxline">
          {page.box.map(([k, v]) => (
            <span key={k + v}>
              <b>{k}</b>
              {v}
            </span>
          ))}
        </p>
      )}
      <ArticleGrid articles={articles} />
      {page.results.length > 0 ? (
        <section className="paper-results">
          <h3>きのうの結果</h3>
          <table>
            <tbody>
              {page.results.map((r) => (
                <tr key={`${r.away}-${r.home}`}>
                  <td>{r.away}</td>
                  <td className={r.awayScore > r.homeScore ? 'is-win' : ''}>{r.awayScore}</td>
                  <td>―</td>
                  <td className={r.homeScore > r.awayScore ? 'is-win' : ''}>{r.homeScore}</td>
                  <td>{r.home}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        page.shorts.length > 0 && (
          <section className="paper-results">
            <h3>リーグ短信</h3>
            {page.shorts.map((s) => (
              <p key={s}>▽{s}</p>
            ))}
          </section>
        )
      )}
      {page.teamPage && (
        <button type="button" className="paper-next" onClick={() => onPage(2)}>
          2面に詳報 ▶
        </button>
      )}
    </div>
  );
}

/**
 * 縦書きの見出し。⚠ writing-mode は使わない（格子・flex の中で箱の高さが中身に合わず、字が箱の外へはみ出した）。
 * 1字ずつ縦に積み、長ければ左の列へ折り返す（右の列から読む）。2桁までの数は1マスに横に並べる（縦中横）
 */
function VText({ text, className }) {
  const cells = text.match(/\d{1,2}|./gu) || [];
  return (
    <span className={`paper-v ${className}`} aria-label={text}>
      {cells.map((c, i) => (
        <i key={i} aria-hidden="true" className={c === ' ' || c === '　' ? 'is-space' : c.length === 2 ? 'is-tcy' : ''}>
          {c}
        </i>
      ))}
    </span>
  );
}

/** 写真の代わりの得点板（回ごとの得点。無ければ最終の点だけ） */
function Scoreboard({ page }) {
  const ls = page.lineScore;
  const sc = page.score;
  if (!ls) {
    return (
      <div className="paper-board is-plain">
        <span>{sc.away}</span>
        <b>{sc.awayScore}</b>
        <i>―</i>
        <b>{sc.homeScore}</b>
        <span>{sc.home}</span>
      </div>
    );
  }
  const n = Math.max(9, ls.awayRuns.length, ls.homeRuns.length);
  const cells = (runs, home) =>
    Array.from({ length: n }, (_, i) => {
      if (i < runs.length) {
        const last = home && ls.walkOff && i === runs.length - 1;
        return <td key={i}>{`${runs[i]}${last ? 'x' : ''}`}</td>;
      }
      return <td key={i}>{home && i === ls.homeRuns.length && i < ls.awayRuns.length ? 'x' : ''}</td>;
    });
  return (
    <table className="paper-board">
      <thead>
        <tr>
          <th />
          {Array.from({ length: n }, (_, i) => (
            <th key={i}>{i + 1}</th>
          ))}
          <th>計</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>{ls.away}</th>
          {cells(ls.awayRuns, false)}
          <td className="paper-board-total">{sc.awayScore}</td>
        </tr>
        <tr>
          <th>{ls.home}</th>
          {cells(ls.homeRuns, true)}
          <td className="paper-board-total">{sc.homeScore}</td>
        </tr>
      </tbody>
    </table>
  );
}

function HeroBox({ hero }) {
  return (
    <aside className="paper-hero">
      <small>{hero.title}</small>
      <strong>{hero.name}</strong>
      {hero.position && <span className="paper-hero-pos">{hero.position}</span>}
      <p>
        {hero.lines.map(([t, strong], i) =>
          strong ? (
            <b key={i}>{t}</b>
          ) : (
            <span key={i}>{t}</span>
          ),
        )}
      </p>
      {hero.season && <span className="paper-hero-season">{hero.season}</span>}
    </aside>
  );
}

function ArticleGrid({ articles }) {
  if (!articles.length) return null;
  return (
    <div className="paper-articles">
      {articles.map((a, i) => (
        <article key={`${a.kicker}-${i}`} className="paper-article">
          <small>{a.kicker}</small>
          <h3>{a.title}</h3>
          <p>{a.body}</p>
        </article>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// 2面（チーム面）

const ARROWS = { 2: '↑', 1: '↗', 0: '→', '-1': '↘', '-2': '↓' };

function TeamPageView({ t, onNext }) {
  return (
    <div className="paper-team">
      <div className="paper-section">
        <strong>{t.section}</strong>
        <span>チーム面</span>
      </div>
      <div className="paper-team-grid">
        <div className="paper-team-main">
          {t.interview && (
            <section className="paper-interview">
              <h2>{t.interview.title}</h2>
              <p className="paper-lead">{t.interview.intro}</p>
              <dl>
                {t.interview.qa.map(([q, a], i) => (
                  <React.Fragment key={i}>
                    <dt>{q}</dt>
                    <dd>{a}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          )}
          <ArticleGrid articles={t.articles} />
        </div>
        <aside className="paper-team-side">
          <section>
            <h3>チームの今</h3>
            {t.form.length > 0 && (
              <p className="paper-form" aria-label="直近の試合（古い順）">
                {t.form.map((r, i) => (
                  <span key={i} className={r > 0 ? 'is-win' : r < 0 ? 'is-lose' : 'is-draw'}>
                    {r > 0 ? '○' : r < 0 ? '●' : '△'}
                  </span>
                ))}
              </p>
            )}
            <table className="paper-kv">
              <tbody>
                {t.now.map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {t.nowNote && <p className="paper-note">{t.nowNote}</p>}
          </section>
          {t.conditions.length > 0 && (
            <section>
              <h3>調子の矢印</h3>
              <table className="paper-kv">
                <tbody>
                  {t.conditions.map((c) => (
                    <tr key={c.name + c.position}>
                      <td className={`paper-arrow is-${c.arrow > 0 ? 'up' : c.arrow < 0 ? 'down' : 'flat'}`}>{ARROWS[c.arrow]}</td>
                      <td>{c.position}</td>
                      <th>{c.name}</th>
                      <td className="paper-small">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {(t.pitchers.length > 0 || t.rotation) && (
            <section>
              <h3>投手陣</h3>
              {t.pitchers.map(([name, note, rest]) => (
                <p key={name} className={rest ? 'is-tired' : ''}>
                  {name}　{note}
                  {rest ? '（休ませたい）' : ''}
                </p>
              ))}
              {t.rotation && <p>次の先発：{t.rotation}</p>}
            </section>
          )}
        </aside>
      </div>
      <button type="button" className="paper-next" onClick={onNext}>
        3面 記録面へ ▶
      </button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// 3面（記録面）

function RecordPageView({ r, onBack }) {
  return (
    <div className="paper-record">
      <div className="paper-section">
        <strong>記録</strong>
        <span>{r.game ?? '記録面'}</span>
      </div>
      <div className="paper-record-grid">
        <div>
          {r.review && (
            <section className="paper-review">
              <h2>{r.reviewHead}</h2>
              <p>{r.review}</p>
            </section>
          )}
          {r.boxes.length > 0 && (
            <div className="paper-boxes">
              {r.boxes.map((b) => (
                <BoxScore key={b.name} b={b} />
              ))}
            </div>
          )}
          {r.notes.length > 0 && (
            <div className="paper-notes">
              {r.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
          {r.relays.length > 0 && (
            <section className="paper-relays">
              <h3>継投</h3>
              {r.relays.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </section>
          )}
          {r.shorts.length > 0 && <ArticleGrid articles={r.shorts} />}
        </div>
        <aside>
          {r.standings.length > 0 && (
            <section>
              <h3>{r.leagueName}順位</h3>
              <table className="paper-table">
                <thead>
                  <tr>
                    <th />
                    <th>球団</th>
                    <th>勝</th>
                    <th>敗</th>
                    <th>差</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {r.standings.map((s) => (
                    <tr key={s.team} className={s.mine ? 'is-mine' : ''}>
                      <td>{s.rank}</td>
                      <th>{s.team}</th>
                      <td>{s.w}</td>
                      <td>{s.l}</td>
                      <td>{s.gb}</td>
                      <td className="paper-small">{s.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {r.probables.length > 0 && (
            <section>
              <h3>{r.probablesTitle ?? '予告先発'}</h3>
              {r.probables.map(([line, mine]) => (
                <p key={line} className={mine ? 'is-mine' : ''}>
                  {line}
                </p>
              ))}
            </section>
          )}
          {r.leaders.map((b) => (
            <section key={b.title}>
              <h3>{b.title}</h3>
              <table className="paper-table">
                <tbody>
                  {b.rows.map((x, i) => (
                    <tr key={i} className={x.mine ? 'is-mine' : ''}>
                      <td>{i + 1}</td>
                      <th>
                        {x.name}（{x.team}）
                      </th>
                      <td>{x.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </aside>
      </div>
      <button type="button" className="paper-next" onClick={onBack}>
        1面へ戻る ▶
      </button>
    </div>
  );
}

function BoxScore({ b }) {
  return (
    <section className="paper-box">
      <h3>{b.name}</h3>
      <table className="paper-table">
        <thead>
          <tr>
            <th />
            <th>選手</th>
            <th>打</th>
            <th>安</th>
            <th>点</th>
            <th>本</th>
          </tr>
        </thead>
        <tbody>
          {b.batters.map((x, i) => (
            <tr key={i} className={x.sub ? 'is-sub' : ''}>
              <td>{x.pos}</td>
              <th>{x.sub ? `　${x.name}` : x.name}</th>
              <td>{x.ab}</td>
              <td>{x.h}</td>
              <td>{x.rbi}</td>
              <td>{x.hr}</td>
            </tr>
          ))}
          <tr className="is-total">
            <td />
            <th>計</th>
            {b.totals.map((v, i) => (
              <td key={i}>{v}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <table className="paper-table">
        <thead>
          <tr>
            <th>投手</th>
            <th>回</th>
            <th>安</th>
            <th>振</th>
            <th>失</th>
            <th>球</th>
          </tr>
        </thead>
        <tbody>
          {b.pitchers.map((p, i) => (
            <tr key={i}>
              <th>{p.name}</th>
              <td>{p.ip}</td>
              <td>{p.h}</td>
              <td>{p.so}</td>
              <td>{p.r}</td>
              <td>{p.pitches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
