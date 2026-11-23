// ============================================================
// 新しい見た目（試作）段4: 番記者のメモ（ホームの頭、今日の一戦の下）と、球団の出来事の場面
// （優勝・昇格・残留・降格が決まったとき、ホームを開くと1度だけ出る）。中身は `story.js`。
//
// ⚠ **切のときは何も出さない**。表示専用（見た場面の印だけ、この端末のブラウザに覚える）。
// ⚠ アプリにも同じ部品がある（`mobile/androidApp/.../LookStory.kt`。番記者のメモは新聞の社告の代わり）。
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { useLook } from './LookContext.jsx';
import { StadiumBackdrop, StoryFace } from './Art.jsx';
import { reporterOf, reporterChat, eventScene } from './story.js';

/** 見た場面の印（新しい順に20まで）。⚠ 端末ごと。消えても場面がもう1度出るだけ */
const SEEN_KEY = 'baseball-online-look-seen-v1';
const readSeen = () => {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(SEEN_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const markSeen = (key) => {
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify([key, ...readSeen().filter((k) => k !== key)].slice(0, 20)));
  } catch {
    // 覚えられないときは、この画面を開いている間だけ
  }
};

/** 番記者のメモ。言うことが無ければ出さない */
export function ReporterMemo({ view }) {
  const { on } = useLook();
  const me = view?.teamName;
  const reporter = useMemo(() => (on && me ? reporterOf(me, view.teamLabels) : null), [on, me, view?.teamLabels]);
  const lines = useMemo(() => (on ? reporterChat(view) : []), [on, view]);
  if (!reporter || !lines.length) return null;
  return (
    <section className="online-reporter-memo" aria-label="番記者メモ">
      <span className="online-reporter-tag">番記者メモ</span>
      <StoryFace seed={reporter.seed} team={me} age={reporter.age} level={3} suit size={60} />
      <div>
        <small>
          {reporter.title}　{reporter.name}
        </small>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  );
}

/** 球団の出来事の場面（1度見たら出さない） */
export function EventScene({ view }) {
  const { on } = useLook();
  const scene = useMemo(() => (on ? eventScene(view) : null), [on, view]);
  const [seen, setSeen] = useState(readSeen);
  const open = scene && !seen.includes(scene.key);
  const close = () => {
    markSeen(scene.key);
    setSeen(readSeen());
  };
  // Esc でも閉じる
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!open) return null;
  const me = view.teamName;
  const city = view.teamLabels?.[me]?.city || '';
  const face = scene.good ? 4 : 1;
  return (
    <div className="online-event-scene" role="dialog" aria-modal="true" aria-label={scene.heading}>
      <div className="online-event-stage">
        <StadiumBackdrop team={me} city={city} crowd={scene.good ? 1 : 0.4} />
        <header>
          <small>{scene.title}</small>
          <strong>{scene.heading}</strong>
        </header>
        <div className="online-event-faces">
          <figure>
            <StoryFace seed={scene.speaker.seed} team={me} age={scene.speaker.age} level={face} suit={scene.speaker.kind === 'reporter'} size={150} />
            <figcaption>{scene.speaker.label}</figcaption>
          </figure>
          {scene.star && (
            <figure>
              <StoryFace seed={`p${scene.star.id}`} team={me} age={scene.star.age} level={face} size={120} />
              <figcaption>{scene.star.name}</figcaption>
            </figure>
          )}
        </div>
        <div className="online-event-talk">
          <span>{scene.speaker.label}</span>
          <p>{scene.line}</p>
        </div>
        <button type="button" className="online-event-close" onClick={close} autoFocus>
          閉じる
        </button>
      </div>
    </div>
  );
}
