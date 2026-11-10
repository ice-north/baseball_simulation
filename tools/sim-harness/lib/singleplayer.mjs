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
  const devIdle = () =>
    page.waitForFunction(
      () => !document.querySelector('[data-testid=dev-advance]')?.textContent.includes('残り'),
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
    // 独立リーグ（四国・徳島）で新しく始めて、初回のトライアウトで自分の番を待つ
    async newIndependentTryout() {
      await page.goto(`${BASE}/?dev=1`);
      for (const t of ['はじめから', '独立リーグ', '四国アイランドリーグplus', '徳島インディゴソックス']) await click(t);
      await this.waitTryoutTurn();
    },
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
        if (!(await visible('次のクールへ'))) break;
        await click('次のクールへ');
      }
      await click('キャンプ終了');
      const confirm = page.getByRole('button', { name: 'キャンプ終了', exact: true });
      if (await confirm.count()) await confirm.click();
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
