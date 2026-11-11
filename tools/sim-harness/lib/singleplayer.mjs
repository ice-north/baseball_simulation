// 一人用の画面を Playwright で動かすための道具（singleplayer-ui-check と open-scene が使う）。
//
// - 配布用のビルド（dist/）を `vite preview` で配る。開発サーバーは StrictMode で
//   effect を2回走らせるので、成績の数え方が本番と変わる（CLAUDE.md 参照）。
// - URL に `?dev=1` を付けて、開発用の早送り（src/game/devTools.js）を出す。
// - ブラウザは Playwright のものを使う。別の場所の Chromium を使うときは
//   PW_CHROMIUM にその実行ファイルを指定する。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const PORT = Number(process.env.SINGLE_TEST_PORT || 4173);
export const BASE = `http://127.0.0.1:${PORT}`;

export async function startPreview() {
  if (!existsSync(join(root, 'dist', 'index.html')))
    throw new Error('dist/index.html がありません。先に `npm run build` を実行してください');
  const child = spawn(
    process.execPath,
    [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } },
  );
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`vite preview が起動しませんでした\n${log}`);
    try {
      const res = await fetch(BASE);
      if (res.ok) return () => child.kill();
    } catch {
      // まだ起動中
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`vite preview が応答しません\n${log}`);
}

export async function launchBrowser({ headless = true } = {}) {
  const options = { headless };
  if (process.env.PW_CHROMIUM) options.executablePath = process.env.PW_CHROMIUM;
  return chromium.launch(options);
}

// 画面の操作。押せるボタンの名前で探す（文言が変わったらここを直す）。
export function driver(page) {
  const btn = (name) => page.getByRole('button', { name: typeof name === 'string' ? new RegExp(name) : name });
  const visible = async (name) => (await btn(name).count()) > 0;
  const dismissHint = async () => {
    const hint = btn('ヒントを今後表示しない');
    if (await hint.count()) await hint.first().click();
  };
  const click = async (name) => {
    await dismissHint();
    await btn(name).first().click();
    await page.waitForTimeout(250);
  };
  // ⚠ 大会の組み合わせを作っている間（「都市対抗予選を開催中...」）は、日程画面ごと読み込み
  //    画面に替わって早送りの枠が消える。枠が無いのを終わりと読むと早送りの途中で抜けてしまう
  //    （社会人の5月で起きた）ので、読み込み画面の間は待ち続ける。
  //    枠が消えて読み込み画面でもないときは、ほかの画面（大学の夏季合宿など）へ移って止まった
  const devIdle = () =>
    page.waitForFunction(
      () => {
        const panel = document.querySelector('[data-testid=dev-advance]');
        if (panel) return !panel.textContent.includes('残り');
        return !document.body.innerText.includes('予選を開催中');
      },
      null,
      { timeout: 10 * 60 * 1000 },
    );
  return {
    btn,
    visible,
    click,
    // 画面に出ている日付（サイドバーの「1年目 | 2024/10/24」）
    async date() {
      const text = await page.locator('body').innerText();
      const m = text.match(/(\d+)年目\s*[|｜]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      return m ? { year: Number(m[1]), y: Number(m[2]), month: Number(m[3]), day: Number(m[4]) } : null;
    },
    // 大学野球（東京六大学・法政大学）で新しく始めて、キャンプを済ませ、開幕日に立つ
    async newUniversityGame() {
      await page.goto(`${BASE}/?dev=1`);
      for (const t of ['はじめから', '大学野球', '東京六大学野球リーグ', '法政大学', '法政大学で始める']) await click(t);
      await this.runCamp();
      await click('シーズン開始');
      await click('全て自動割り当て');
      await click('確定してシーズン開始');
      await page.getByTestId('dev-advance').waitFor();
    },
    // 独立リーグ（四国・徳島）で新しく始めて、初回のトライアウトで自分の番を待つ。
    // keepHint: ヒント（TutorialHint）を消さずに待つ（ヒントの枠を測るとき。消すのは dismissHint）
    async newIndependentTryout({ keepHint = false } = {}) {
      await page.goto(`${BASE}/?dev=1`);
      for (const t of ['はじめから', '独立リーグ', '四国アイランドリーグplus', '徳島インディゴソックス']) await click(t);
      if (keepHint) await page.getByText('あなたの指名順です').waitFor({ timeout: 120000 });
      else await this.waitTryoutTurn();
    },
    // 出ているヒントを「ヒントを今後表示しない」で消す（click() は押す前に毎回これを呼ぶ）
    dismissHint,
    // トライアウトで自分の番が来るまで待つ
    async waitTryoutTurn() {
      await dismissHint();
      await page.getByText('あなたの指名順です').waitFor({ timeout: 120000 });
    },
    // トライアウトの「現在のピック」と「獲得選手数」
    async tryoutState() {
      const text = await page.locator('body').innerText();
      const pick = text.match(/現在のピック\s*(\d+)\s*\/\s*(\d+)/);
      const got = text.match(/獲得選手数\s*(\d+)\s*人/);
      return { pick: pick ? Number(pick[1]) : null, of: pick ? Number(pick[2]) : null, got: got ? Number(got[1]) : null };
    },
    // キャンプ・合宿: 各クールの練習を実行して終える
    async runCamp() {
      for (let i = 0; i < 12; i++) {
        await click('練習を実行');
        // ⚠ 練習の結果が出るまで待ってから見る。click の 250ms だけで「次のクールへ」の有無を
        //    読むと、重い端末で結果が間に合わずに途中のクールで抜けてしまう
        await btn('次のクールへ').or(btn('キャンプ終了')).first().waitFor();
        if (!(await visible('次のクールへ'))) break;
        await click('次のクールへ');
      }
      // 「キャンプ終了 → 成長確認」は帯を出すだけ。帯の「キャンプを終える」で決める
      // （以前は中央の窓で、見出し「キャンプ終了確認」・やめるが「戻る」だった）
      await click('キャンプ終了');
      const bar = page.getByTestId('confirm-bar');
      await bar.waitFor().catch(() => {
        throw new Error('「キャンプ終了 → 成長確認」を押しても、キャンプを終える確認の帯が出ない');
      });
      await bar.getByRole('button', { name: 'キャンプを終える', exact: true }).click();
      await page.waitForTimeout(500);
    },
    // 開発用の早送り。days は 7 / 30 / 'phase'（次の区切りまで）
    async advance(days) {
      await dismissHint();
      await page.getByTestId(`dev-advance-${days}`).click();
      await devIdle();
    },
    // セーブ＆ロード画面でスロット1に保存し、日程進行へ戻る
    async saveToSlot1() {
      await click('セーブ＆ロード');
      await btn(/新規保存|上書き保存/).first().click();
      await page.waitForFunction(() => !document.body.innerText.includes('セーブ中'), null, { timeout: 120000 });
      await click('日程進行');
    },
    // 地色（明るい紙）の上に載っていて読めない文字（コントラスト 4.5 未満）を返す。
    // 半透明の枠は下の地色と重ねて計算する（gray-800/40 の枠は紙が透けて灰色になる）。
    // 不透明な面（カード・ボタン）の上の文字は見ない（カードの gray-400 は 4.11 の決まり）
    async groundTextContrast() {
      return page.evaluate(() => {
        const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
        const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const ground = parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
        // 文字の下の色。不透明な面に当たったら null（地色の上ではない）
        const bgOf = (el) => {
          const layers = [];
          for (let e = el; e && e !== document.body; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.backgroundImage !== 'none') return null;
            const m = parse(cs.backgroundColor);
            const a = m.length === 4 ? m[3] : 1;
            if (a === 0) continue;
            if (a >= 1) {
              if (m[0] !== ground[0] || m[1] !== ground[1] || m[2] !== ground[2]) return null;
              break;
            }
            layers.push([m[0], m[1], m[2], a]);
          }
          let c = ground;
          for (let i = layers.length - 1; i >= 0; i--) {
            const [r, g, b, a] = layers[i];
            c = [r * a + c[0] * (1 - a), g * a + c[1] * (1 - a), b * a + c[2] * (1 - a)];
          }
          return c;
        };
        const out = [];
        const seen = new Set();
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const t = w.currentNode;
          const el = t.parentElement;
          if (!el || seen.has(el) || el instanceof SVGElement) continue;
          seen.add(el);
          if (!/[\p{L}\p{N}]/u.test(t.textContent)) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || el.closest('button:disabled, [aria-hidden="true"]')) continue;
          let op = 1;
          for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
          if (op < 0.95) continue;
          const bg = bgOf(el);
          if (!bg) continue;
          const cr = ratio(parse(getComputedStyle(el).color).slice(0, 3), bg);
          if (cr < 4.5) out.push(`${cr.toFixed(2)}:1 「${t.textContent.trim().slice(0, 20)}」 ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
        }
        return out;
      });
    },
    // 見出し（h2）が heading のカードの中で、読めない文字（4.5 未満。太字の大きい字は 3 未満）を返す。
    // 地色の上だけでなく、カードの中の行の地（gray-700 など）の上のランク色も見る。
    // 文字の下の色は、最初の不透明な面まで半透明の層を重ねて求める。
    // カードの text-gray-400（4.11）は「意図的に読ませない段」（index.css の文字色の決まり）なので数えない
    async cardTextContrast(heading) {
      return page.evaluate((heading) => {
        const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
        const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === heading);
        const card = h?.parentElement;
        if (!card) return [`見出し「${heading}」のカードが無い`];
        const bgOf = (el) => {
          const layers = [];
          let base = parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
          for (let e = el; e; e = e.parentElement) {
            const m = parse(getComputedStyle(e).backgroundColor);
            const a = m.length === 4 ? m[3] : 1;
            if (a === 0) continue;
            if (a >= 1) { base = m.slice(0, 3); break; }
            layers.push([m[0], m[1], m[2], a]);
          }
          let c = base;
          for (let i = layers.length - 1; i >= 0; i--) {
            const [r, g, b, a] = layers[i];
            c = [r * a + c[0] * (1 - a), g * a + c[1] * (1 - a), b * a + c[2] * (1 - a)];
          }
          return c;
        };
        const out = [];
        const w = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        while (w.nextNode()) {
          const el = w.currentNode.parentElement;
          if (!el || seen.has(el) || el instanceof SVGElement) continue;
          seen.add(el);
          if (!/[\p{L}\p{N}]/u.test(w.currentNode.textContent)) continue;
          if (el.closest('[aria-hidden="true"], button:disabled')) continue;
          let op = 1;
          for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
          if (op < 0.95) continue;
          const cs = getComputedStyle(el);
          const fg = parse(cs.color).slice(0, 3);
          if (fg.join() === '167,179,200') continue; // gray-400
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          const cr = ratio(fg, bgOf(el));
          if (cr < (large ? 3 : 4.5)) out.push(`${cr.toFixed(2)}:1 「${w.currentNode.textContent.trim().slice(0, 20)}」 ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
        }
        return out;
      }, heading);
    },
    // スタメン設定の打順のカードの窮屈さ。行の中の要素が行の右端からはみ出す量（px）と、
    // 名前の行（1行目）が折り返している行の数を返す
    async lineupCardFit() {
      return page.evaluate(() => {
        const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === 'スタメン設定');
        const card = h?.closest('.rounded-xl');
        if (!card) return null;
        const rows = [...card.querySelectorAll('[draggable="true"]')];
        let overflow = 0, wrapped = 0;
        for (const r of rows) {
          const right = r.getBoundingClientRect().right;
          for (const el of r.querySelectorAll('*')) {
            const b = el.getBoundingClientRect();
            if (b.width) overflow = Math.max(overflow, b.right - right);
          }
          const kids = [...(r.querySelector('.flex-wrap')?.children || [])].map((c) => c.getBoundingClientRect()).filter((b) => b.width);
          const firstBottom = Math.min(...kids.map((b) => b.bottom));
          if (kids.some((b) => b.top >= firstBottom - 1)) wrapped++;
        }
        return { width: Math.round(card.getBoundingClientRect().width), rows: rows.length, overflow: Math.round(overflow), wrapped };
      });
    },
    // 確認の帯（ConfirmBar）の収まり。ページの最後までスクロールして、
    //   hidden: 帯の下に隠れたままのページの中身の高さ（px。0 以下なら隠れていない）
    //   titleCut: 帯の問いが途中で切れているか / fitsWidth: 帯が画面の幅に収まっているか
    // 帯の余白（帯の直前の要素）の上端がページの中身の終わりなので、それが帯の上端より下にあれば隠れる
    async confirmBarFit() {
      return page.evaluate(async () => {
        const bar = document.querySelector('[data-testid="confirm-bar"]');
        if (!bar) return null;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const b = bar.getBoundingClientRect();
        const spacer = bar.previousElementSibling;
        const title = bar.querySelector('.font-bold');
        return {
          height: Math.round(b.height),
          hidden: spacer ? Math.round(spacer.getBoundingClientRect().top - b.top) : null,
          titleCut: title ? title.scrollWidth > title.clientWidth + 1 : null,
          fitsWidth: b.left >= 0 && b.right <= window.innerWidth,
        };
      });
    },
    // タイトルの「つづきから」でスロット1を開く
    async continueSlot1() {
      await page.goto(`${BASE}/?dev=1`);
      await click('つづきから');
      const slot = page.getByRole('button', { name: /スロット\s*1/ });
      if (await slot.count()) await slot.first().click();
      // 読み込みは数秒かかる（世界まるごと展開する）。サイドバーに日付が出るまで待つ
      await page.waitForFunction(() => /\d+年目\s*[|｜]\s*\d{4}\//.test(document.body.innerText), null, { timeout: 120000 });
    },
  };
}
