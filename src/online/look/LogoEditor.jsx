// ============================================================
// 球団ロゴを作る小窓（新しい見た目（試作）を入にしているときだけ入口が出る）。
//
// 手間の少ない順に3つの作り方を並べる:
//   1 おまかせ   … 球団の名前と色から候補が12個。押すだけ
//   2 少し変える … 型・台座・絵・書体・配色を矢印で1つずつ送る。頭文字とことばは打ちかえられる
//   3 こだわる   … 部品を1枚ずつ動かす・回す・大きさと色を変える・足す・消す
// 型は重ね方のお手本で、保存するのは出来上がった重ね（`logoParts.js`）。だから型から作ったあとに崩せる。
//
// ⚠ 保存するまでサーバーは変わらない。保存は `profile` 命令（`membership.js` の `applyProfile`）で、
//    送ったものはサーバーがもう一度確かめる（`logoData.js` の `cleanLogo`）。
// ⚠ 3で手を入れたあとに1・2を触ると、型から作り直すので手直しは消える（その旨を画面に出す）。
// ⚠ 描く手順は `logoArt.js`、候補と型は `logoBuild.js`。ここは画面の状態だけを持つ。
// ============================================================
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArtSvg, useLogoIcons } from './Art.jsx';
import { teamLook, PALETTES } from './teamLook.js';
import {
  LOGO_SHAPES,
  LOGO_SHAPE_KEYS,
  LOGO_BASES,
  LOGO_FONTS,
  LOGO_LATIN_FONTS,
  LOGO_MAX_LAYERS,
  LOGO_TEXT_MAX,
  logoColors,
  textWidth,
} from './logoParts.js';
import {
  LOGO_TEMPLATES,
  LOGO_TEMPLATE_KEYS,
  LOGO_MINI_KINDS,
  LOGO_TEXT_UNIT,
  logoCandidates,
  buildLogoLayers,
  buildLogoMini,
  logoSchemes,
  normalRecipe,
  teamMotifs,
} from './logoBuild.js';
import { LOGO_ICON_NAMES } from './logoMotifs.js';
import { cleanLogo, openLayer } from './logoData.js';
import { logoArt, LOGO_BOX } from './logoArt.js';
import { logoTeamOf } from './teamLogo.js';
import './logo.css';

/** ロゴの絵（重ねを描くだけ） */
function LogoPic({ layers, colors, icons, size, label }) {
  const art = useMemo(() => logoArt(layers, colors, icons), [layers, colors, icons]);
  return <ArtSvg art={art} size={size} label={label} />;
}

/**
 * 大きな見本。部品を押して選び、つまんで動かす。
 * ⚠ 選んだ部品の枠は、描いた後の位置を測って重ねる（回した絵・アーチの字の外枠は計算で出しにくい）
 */
function Stage({ layers, colors, icons, sel, onSelect, onMove, onMoveEnd }) {
  const box = useRef(null);
  const drag = useRef(null);
  const [frame, setFrame] = useState(null);
  useLayoutEffect(() => {
    const root = box.current;
    const parts = sel >= 0 && root ? root.querySelectorAll(`[data-li="${sel}"]`) : [];
    if (!parts.length) {
      setFrame(null);
      return;
    }
    const base = root.getBoundingClientRect();
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (const el of parts) {
      const q = el.getBoundingClientRect();
      l = Math.min(l, q.left);
      t = Math.min(t, q.top);
      r = Math.max(r, q.right);
      b = Math.max(b, q.bottom);
    }
    setFrame({ left: l - base.left, top: t - base.top, width: r - l, height: b - t });
  }, [layers, colors, icons, sel]);
  return (
    <div
      ref={box}
      className="online-logo-stage"
      onPointerDown={(e) => {
        const hit = e.target.closest?.('[data-li]');
        if (!hit) {
          onSelect(-1);
          return;
        }
        const index = Number(hit.dataset.li);
        const L = openLayer(layers[index]);
        onSelect(index);
        // 画面の1px がロゴの箱のいくつ分か
        drag.current = { index, x: e.clientX, y: e.clientY, lx: L.x, ly: L.y, k: LOGO_BOX[2] / box.current.getBoundingClientRect().width };
        box.current.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // ⚠ 押しただけ（選んだだけ）では動かさない。少し引いてから動かし始める
        if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 4) return;
        d.moved = true;
        onMove(d.index, d.lx + (e.clientX - d.x) * d.k, d.ly + (e.clientY - d.y) * d.k);
      }}
      onPointerUp={() => {
        if (drag.current) onMoveEnd?.();
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <LogoPic layers={layers} colors={colors} icons={icons} size="100%" label="いまのロゴ" />
      {frame && <span className="online-logo-frame" style={frame} aria-hidden="true" />}
    </div>
  );
}

/** 矢印で1つずつ送る欄 */
function Knob({ label, value, onStep }) {
  return (
    <div className="online-logo-knob">
      <span>{label}</span>
      <button type="button" aria-label={`${label}を前へ`} onClick={() => onStep(-1)}>
        ◀
      </button>
      <output>{value}</output>
      <button type="button" aria-label={`${label}を次へ`} onClick={() => onStep(1)}>
        ▶
      </button>
    </div>
  );
}

/** 色を選ぶ丸（球団の色3つ＋白＋黒、自由な色。`none` なら「なし」も） */
function ColorChips({ label, value, colors, none = false, onPick }) {
  const five = logoColors(colors);
  return (
    <div className="online-logo-chips" role="group" aria-label={label}>
      <span>{label}</span>
      {none && (
        <button type="button" className="is-none" aria-pressed={value === undefined} aria-label={`${label}なし`} onClick={() => onPick(undefined)} />
      )}
      {five.map((c, i) => (
        <button
          key={i}
          type="button"
          style={{ background: c }}
          aria-pressed={value === i}
          aria-label={`${label} ${['地の色', '差し色', '縁の色', '白', '黒'][i]}`}
          onClick={() => onPick(i)}
        />
      ))}
      <input
        type="color"
        aria-label={`${label}を自由に選ぶ`}
        value={typeof value === 'string' ? value : five[1]}
        onChange={(e) => onPick(e.target.value)}
      />
    </div>
  );
}

const kindName = (L) =>
  L.k === 'text' ? `文字「${L.t}」` : Object.hasOwn(LOGO_SHAPES, L.k) ? `${LOGO_SHAPES[L.k].name}${L.line ? '（線）' : ''}` : '絵';
/** 部品1枚の小さな絵（一覧用）。箱いっぱいに置き直す（小さい部品も何か分かるように） */
function thumbLayer(raw) {
  const L = openLayer(raw);
  if (L.k !== 'text') return { ...L, x: 50, y: 50, r: 0, s: 0.86 };
  const width = textWidth(L.t, L.font) * LOGO_TEXT_UNIT || 1;
  return { ...L, x: 50, y: 50, r: 0, arc: 0, s: Math.min(2, 84 / width) };
}
const cycle = (list, current, step) => list[(Math.max(0, list.indexOf(current)) + step + list.length) % list.length];
const TABS = [
  ['pick', '1 おまかせ'],
  ['tune', '2 少し変える'],
  ['craft', '3 こだわる'],
];

export function LogoEditor({ view, busy, run, command, close }) {
  const dialog = useRef(null);
  const name = view.teamName;
  const labels = view.teamLabels?.[name] || {};
  const look = teamLook(name);
  const saved = labels.logo && !labels.logo.auto ? labels.logo : null;
  const start = labels.logo || null;
  const icons = useLogoIcons(true);

  const [colors, setColors] = useState(() => start?.colors || [look.c1, look.c2, look.c3]);
  // ⚠ 「球団」は色を選び直すたびに作り直す（配色の候補が色で変わる）
  const team = useMemo(() => logoTeamOf(name, labels, look, colors), [name, labels, look, colors]);
  const [page, setPage] = useState(0);
  const candidates = useMemo(() => logoCandidates(team, page), [team, page]);
  const [rec, setRec] = useState(() => normalRecipe(saved?.rec || logoCandidates(logoTeamOf(name, labels, look, colors), 0)[0]));
  const [layers, setLayers] = useState(() => start?.layers || buildLogoLayers(team, rec));
  // 小さい表示: 'keep' は保存してあるものをそのまま使う（開いた直後だけ）
  const [miniKind, setMiniKind] = useState(() => (saved ? (saved.mini ? 'keep' : 'same') : 'mono'));
  // こだわって手を入れたか（型から作り直すと消えるので、知らせる）
  const [crafted, setCrafted] = useState(false);
  // いまの重ねが型どおりか（色を選び直したときに作り直してよいか）。保存してあるロゴは、手を入れたものかもしれない
  const [byRecipe, setByRecipe] = useState(!saved);
  const touch = () => {
    setCrafted(true);
    setByRecipe(false);
  };
  const [sel, setSel] = useState(-1);
  const [tab, setTab] = useState('pick');
  const [error, setError] = useState('');
  const schemes = useMemo(() => logoSchemes(logoColors(colors)), [colors]);
  const mini = useMemo(
    () => (miniKind === 'keep' ? saved?.mini || null : miniKind === 'same' ? null : buildLogoMini(team, rec, miniKind)),
    [miniKind, saved, team, rec],
  );

  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.open && node.close();
  }, []);

  /** 型から作り直す（1・2の操作）。手直しは消える */
  const remake = (next, nextTeam = team) => {
    const r = normalRecipe(next);
    setRec(r);
    setLayers(buildLogoLayers(nextTeam, r));
    setSel(-1);
    setCrafted(false);
    setByRecipe(true);
    if (miniKind === 'keep') setMiniKind('mono');
  };
  /** 球団の色を変える。色は番号で持っているので、重ねはそのまま色だけ変わる */
  const recolor = (next) => {
    setColors(next);
    // 配色の番号が色の組ごとに違うので、型どおりのロゴは作り直す（手を入れたロゴはそのまま）
    if (byRecipe) setLayers(buildLogoLayers(logoTeamOf(name, labels, look, next), rec));
  };
  /** 部品1枚を書き換える（3の操作） */
  const patch = (index, change) => {
    setLayers((list) => list.map((L, i) => (i === index ? { ...openLayer(L), ...change } : L)));
    touch();
  };
  const current = sel >= 0 && layers[sel] ? openLayer(layers[sel]) : null;
  const isIcon = (L) => L && L.k !== 'text' && !Object.hasOwn(LOGO_SHAPES, L.k);
  const mine = teamMotifs(team);
  const motifList = useMemo(() => [...new Set([...mine, ...LOGO_ICON_NAMES])], [mine]);
  const add = (L) => {
    if (layers.length >= LOGO_MAX_LAYERS) return;
    setLayers([...layers, L]);
    setSel(layers.length);
    touch();
  };
  const S = schemes[rec.scheme % schemes.length];

  const save = async (logo) => {
    setError('');
    const result = await run(() => command('profile', { logo }));
    if (result?.ok) close();
    else setError(result?.error || '保存できませんでした');
  };
  const submit = () => {
    const logo = cleanLogo({ colors, layers, mini, rec });
    if (!logo) {
      setError('部品が1枚もありません。おまかせから選び直してください');
      return;
    }
    save(logo);
  };

  return (
    <dialog
      ref={dialog}
      className="online-player-dialog online-logo-dialog"
      aria-labelledby="online-logo-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="online-logo-title">球団ロゴを作る</h2>
        <button onClick={close}>閉じる</button>
      </header>
      <div className="online-logo-editor">
        <div className="online-logo-side">
          <div className="online-logo-stage-wrap">
            <Stage
              layers={layers}
              colors={colors}
              icons={icons}
              sel={tab === 'craft' ? sel : -1}
              onSelect={(i) => {
                setSel(i);
                if (i >= 0) setTab('craft');
              }}
              onMove={(i, x, y) => patch(i, { x: Math.round(x), y: Math.round(y) })}
            />
          </div>
          <div className="online-logo-small" aria-label="小さく出したときの見え方">
            {[32, 24, 16].map((px) => (
              <LogoPic key={px} layers={mini || layers} colors={colors} icons={icons} size={px} />
            ))}
            <label>
              小さい表示
              <select value={miniKind} onChange={(e) => setMiniKind(e.target.value)}>
                {miniKind === 'keep' && <option value="keep">いまのまま</option>}
                {LOGO_MINI_KINDS.map(([id, text]) => (
                  <option key={id} value={id}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="online-logo-palettes" role="group" aria-label="球団の色">
            {PALETTES.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-label={`色の組 ${i + 1}`}
                aria-pressed={p.join() === colors.join()}
                onClick={() => recolor(p)}
              >
                {p.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </button>
            ))}
          </div>
          <div className="online-logo-own-colors">
            {['地の色', '差し色', '縁の色'].map((text, i) => (
              <label key={text}>
                {text}
                <input
                  type="color"
                  value={colors[i]}
                  onChange={(e) => recolor(colors.map((c, j) => (j === i ? e.target.value : c)))}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="online-logo-main">
          <div className="online-segments" role="group" aria-label="作り方">
            {TABS.map(([id, text]) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
                {text}
              </button>
            ))}
          </div>
          {crafted && tab !== 'craft' && (
            <p className="online-muted" role="note">
              ここで選び直すと、「3 こだわる」で入れた手直しは消えます。
            </p>
          )}

          {tab === 'pick' && (
            <section aria-label="おまかせ">
              <div className="online-logo-row">
                <p className="online-muted">球団の名前と色から作った候補です。押すだけで決まります。</p>
                <button type="button" onClick={() => setPage(page + 1)}>
                  別の候補を出す
                </button>
              </div>
              <div className="online-logo-cands">
                {candidates.map((R, i) => (
                  <button key={`${page}-${i}`} type="button" aria-label={`候補 ${i + 1}（${LOGO_TEMPLATES[R.tpl].name}）`} onClick={() => remake(R)}>
                    <LogoPic layers={buildLogoLayers(team, R)} colors={colors} icons={icons} size={76} />
                    <small>{LOGO_TEMPLATES[R.tpl].name}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          {tab === 'tune' && (
            <section aria-label="少し変える">
              <div className="online-logo-knobs">
                <Knob label="型" value={LOGO_TEMPLATES[rec.tpl].name} onStep={(d) => remake({ ...rec, tpl: cycle(LOGO_TEMPLATE_KEYS, rec.tpl, d) })} />
                <Knob label="台座" value={LOGO_SHAPES[rec.base].name} onStep={(d) => remake({ ...rec, base: cycle(LOGO_BASES, rec.base, d) })} />
                <Knob
                  label="絵"
                  value={`${motifList.indexOf(rec.motif) + 1} / ${motifList.length}`}
                  onStep={(d) => remake({ ...rec, motif: cycle(motifList, rec.motif, d) })}
                />
                <Knob label="書体" value={LOGO_FONTS[rec.font].name} onStep={(d) => remake({ ...rec, font: cycle(LOGO_LATIN_FONTS, rec.font, d) })} />
                <Knob
                  label="配色"
                  value={`${(rec.scheme % schemes.length) + 1} / ${schemes.length}`}
                  onStep={(d) => remake({ ...rec, scheme: ((rec.scheme % schemes.length) + d + schemes.length) % schemes.length })}
                />
                <Knob label="頭文字" value={rec.ini ? '2字' : '1字'} onStep={() => remake({ ...rec, ini: rec.ini ? 0 : 1, mono: '' })} />
                <Knob label="ことば" value={rec.word ? '愛称' : '土地'} onStep={() => remake({ ...rec, word: rec.word ? 0 : 1, text: '' })} />
              </div>
              <div className="online-logo-row">
                <label>
                  頭文字を打つ
                  <input value={rec.mono} maxLength={2} size={3} onChange={(e) => remake({ ...rec, mono: e.target.value })} />
                </label>
                <label>
                  ことばを打つ
                  <input value={rec.text} maxLength={LOGO_TEXT_MAX} size={12} onChange={(e) => remake({ ...rec, text: e.target.value })} />
                </label>
              </div>
              <MotifPicker icons={icons} mine={mine} value={rec.motif} onPick={(motif) => remake({ ...rec, motif })} />
            </section>
          )}

          {tab === 'craft' && (
            <section aria-label="こだわる">
              <div className="online-logo-row">
                <button type="button" disabled={layers.length >= LOGO_MAX_LAYERS} onClick={() => add({ k: 'star', s: 0.3, c: S.ac, o: S.fg, ow: 2 })}>
                  ＋台座・飾り
                </button>
                <button type="button" disabled={layers.length >= LOGO_MAX_LAYERS} onClick={() => add({ k: rec.motif, s: 0.4, c: S.ac, o: S.fg, ow: 2 })}>
                  ＋絵
                </button>
                <button
                  type="button"
                  disabled={layers.length >= LOGO_MAX_LAYERS}
                  onClick={() => add({ k: 'text', t: team.mono || 'A', s: 0.6, c: S.fg, o: S.bg, ow: 2, font: 'graduate' })}
                >
                  ＋文字
                </button>
                <span className="online-muted">
                  部品 {layers.length} / {LOGO_MAX_LAYERS} 枚。左の絵をつまんで動かせます
                </span>
              </div>
              <ol className="online-logo-layers" reversed>
                {layers
                  .map((L, i) => ({ L, i }))
                  .reverse()
                  .map(({ L, i }) => (
                    <li key={i}>
                      <button type="button" aria-pressed={i === sel} onClick={() => setSel(i === sel ? -1 : i)}>
                        <LogoPic layers={[thumbLayer(L)]} colors={colors} icons={icons} size={26} />
                        {kindName(L)}
                        <small>{i === layers.length - 1 ? 'いちばん手前' : i === 0 ? 'いちばん奥' : ''}</small>
                      </button>
                    </li>
                  ))}
              </ol>
              {!current && <p className="online-muted">直したい部品を、上の一覧か左の絵から選んでください。</p>}
              {current && (
                <LayerControls
                  key={sel}
                  L={current}
                  colors={colors}
                  change={(c) => patch(sel, c)}
                  icons={icons}
                  mine={mine}
                  isIcon={isIcon(current)}
                  act={(what) => {
                    const list = [...layers];
                    if (what === 'del') {
                      list.splice(sel, 1);
                      setSel(-1);
                    } else if (what === 'dup') {
                      if (list.length >= LOGO_MAX_LAYERS) return;
                      list.splice(sel + 1, 0, { ...current, x: current.x + 6, y: current.y + 6 });
                      setSel(sel + 1);
                    } else {
                      const to = sel + (what === 'up' ? 1 : -1);
                      if (to < 0 || to >= list.length) return;
                      [list[sel], list[to]] = [list[to], list[sel]];
                      setSel(to);
                    }
                    setLayers(list);
                    touch();
                  }}
                />
              )}
            </section>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="online-error-text">
          {error}
        </p>
      )}
      <footer className="online-logo-foot">
        <button type="button" className="online-primary" disabled={busy} onClick={submit}>
          このロゴを保存する
        </button>
        {saved && (
          <button type="button" disabled={busy} onClick={() => save(null)}>
            自動のロゴに戻す
          </button>
        )}
        {/* ⚠ 作者の表示は消さない（絵の素材の利用条件。`public/look/LICENSE-game-icons.txt`） */}
        <small className="online-muted">
          絵の素材: game-icons.net（Lorc、Delapouite ほか。CC BY 3.0）。ロゴはほかのオーナーにも見えます。
        </small>
      </footer>
    </dialog>
  );
}

/** 絵を選ぶ一覧（愛称に合う絵が先頭） */
function MotifPicker({ icons, mine, value, onPick }) {
  const order = useMemo(() => [...new Set([...mine, ...LOGO_ICON_NAMES])], [mine]);
  if (!icons) return <p className="online-muted">絵を読み込んでいます…</p>;
  return (
    <div className="online-logo-picker" role="group" aria-label="絵をえらぶ">
      {order.map((m) => (
        <button key={m} type="button" className={mine.includes(m) ? 'is-mine' : ''} aria-pressed={m === value} aria-label={m} onClick={() => onPick(m)}>
          <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">
            <path fill="currentColor" d={icons[m]} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** 選んだ部品1枚の直し（位置・大きさ・回転・色・ふち。字は文字と書体とアーチも） */
function LayerControls({ L, colors, change, act, icons, mine, isIcon }) {
  const isText = L.k === 'text';
  const isShape = !isText && !isIcon;
  const slider = (key, label, min, max, step, value, unit = '') => (
    <label>
      {label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => change({ [key]: key === 's' ? Number(e.target.value) / 100 : Number(e.target.value) })} />
      <output>
        {value}
        {unit}
      </output>
    </label>
  );
  return (
    <div className="online-logo-controls">
      <div className="online-logo-sliders">
        {slider('x', '横', -10, 110, 1, Math.round(L.x))}
        {slider('y', '縦', -10, 110, 1, Math.round(L.y))}
        {slider('s', '大きさ', 5, 250, 1, Math.round(L.s * 100), '%')}
        {slider('r', '回転', -180, 180, 1, Math.round(L.r || 0), '°')}
        {!L.line && slider('ow', 'ふちの太さ', 0, 10, 0.5, L.ow || 0)}
        {isText && slider('arc', 'アーチ', -80, 80, 1, Math.round(L.arc || 0))}
      </div>
      <ColorChips label="色" value={L.c} colors={colors} onPick={(c) => change({ c })} />
      {!L.line && (
        <ColorChips
          label="ふち"
          value={L.ow ? L.o : undefined}
          colors={colors}
          none
          onPick={(o) => change(o === undefined ? { o: undefined, ow: 0 } : { o, ow: L.ow || 3 })}
        />
      )}
      {isText && (
        <div className="online-logo-row">
          <label>
            文字
            <input value={L.t} maxLength={LOGO_TEXT_MAX} size={12} onChange={(e) => change({ t: e.target.value })} />
          </label>
          <label>
            書体
            <select value={L.font} onChange={(e) => change({ font: e.target.value })}>
              {Object.entries(LOGO_FONTS).map(([id, f]) => (
                <option key={id} value={id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {isShape && (
        <div className="online-logo-row">
          <label>
            形
            <select value={L.k} onChange={(e) => change({ k: e.target.value })}>
              {LOGO_SHAPE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {LOGO_SHAPES[k].name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="online-logo-row">
        <button type="button" onClick={() => change({ f: L.f ? 0 : 1 })}>
          左右を反転
        </button>
        <button type="button" onClick={() => act('up')}>
          手前へ
        </button>
        <button type="button" onClick={() => act('down')}>
          奥へ
        </button>
        <button type="button" onClick={() => act('dup')}>
          複製
        </button>
        <button type="button" onClick={() => act('del')}>
          消す
        </button>
      </div>
      {isIcon && <MotifPicker icons={icons} mine={mine} value={L.k} onPick={(k) => change({ k })} />}
    </div>
  );
}
