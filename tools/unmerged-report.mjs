// 取りこぼし検知: 作業用のフォークのブランチにあって、ice-north の main に入っていないコミットを一覧にする。
// 「別のブランチに置いた直しが、PR に入らないまま忘れられる」のを防ぐ。
//
//   node tools/unmerged-report.mjs                      # 一覧を出す（落とさない）
//   node tools/unmerged-report.mjs --fail-after-days 3  # PR の無い取りこぼしが3日より古ければ終了コード1
//
// 見分け方は `git cherry`（中身が同じ変更は、cherry-pick や rebase で別のコミットになっていても「取り込み済み」）。
// 取り込むときに中身を直したコミットは「未取り込み」に見える。もう要らないブランチは
// .github/unmerged-ignore.txt に名前を書く（1行に1本。# から後ろは注釈。末尾の * は前方一致）。
//
// どこを見るか（上から順に決まる）:
//   取り込み先 … 環境変数 UPSTREAM_URL、無ければ ice-north/baseball_simulation
//   フォーク   … 環境変数 FORK_URL、GitHub Actions ではそのリポジトリ、手元では取り込み先でない remote
// 取ってきた先頭は refs/unmerged/ に置く（手元のブランチや remote の追跡には触らない）。
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM_REPO = process.env.UPSTREAM_REPO || 'ice-north/baseball_simulation';
const UPSTREAM_URL = process.env.UPSTREAM_URL || `https://github.com/${UPSTREAM_REPO}.git`;
const SKIP = (name) => name === 'main' || name === 'master' || name === 'android-screens' || name.startsWith('pr/');
const MAX_LISTED = 12; // 1本のブランチで並べるコミットの数

const args = process.argv.slice(2);
const failAt = args.indexOf('--fail-after-days');
const FAIL_AFTER_DAYS = failAt >= 0 ? Number(args[failAt + 1]) : null;
if (failAt >= 0 && !(FAIL_AFTER_DAYS >= 0)) {
  console.error('--fail-after-days は日数（0以上）を付ける');
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const tryGit = (...a) => {
  try {
    return git(...a);
  } catch {
    return null;
  }
};
const slug = (url) => (/github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url) || [])[1]?.toLowerCase();

function forkUrl() {
  if (process.env.FORK_URL) return process.env.FORK_URL;
  if (process.env.GITHUB_REPOSITORY) return `https://github.com/${process.env.GITHUB_REPOSITORY}.git`;
  const remotes = (tryGit('remote') || '').split('\n').filter(Boolean);
  // origin を先に見る（クラウドのセッションは origin がフォーク、いしだの手元は origin が取り込み先）
  for (const name of [...remotes].sort((a, b) => (a === 'origin' ? -1 : b === 'origin' ? 1 : 0))) {
    const url = tryGit('remote', 'get-url', name);
    if (url && slug(url) && slug(url) !== slug(UPSTREAM_URL)) return url;
  }
  return null;
}

const FORK_URL = forkUrl();
if (!FORK_URL) {
  console.error('フォークが分からない。FORK_URL=https://github.com/<持ち主>/baseball_simulation.git を付けて回す');
  process.exit(2);
}
if (slug(FORK_URL) === slug(UPSTREAM_URL)) {
  console.log(`ここは取り込み先（${UPSTREAM_REPO}）なので、比べるフォークが無い。何もしない`);
  process.exit(0);
}

// 履歴が浅いと合流点が分からず、全部が「未取り込み」に見える。足りなければ全部取る
const shallow = tryGit('rev-parse', '--is-shallow-repository') === 'true';
const fetch = (url, ...refspecs) =>
  execFileSync('git', ['fetch', '--quiet', '--no-tags', '--prune', ...(shallow ? ['--unshallow'] : []), url, ...refspecs], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
try {
  fetch(UPSTREAM_URL, '+refs/heads/main:refs/unmerged/upstream');
} catch {
  // 浅くない写しに --unshallow を付けると落ちる（浅いかどうかは途中で変わる）。付けずにもう一度
  execFileSync('git', ['fetch', '--quiet', '--no-tags', UPSTREAM_URL, '+refs/heads/main:refs/unmerged/upstream'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
}
execFileSync('git', ['fetch', '--quiet', '--no-tags', '--prune', FORK_URL, '+refs/heads/*:refs/unmerged/fork/*'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });

// 見ないブランチ
const ignoreFile = join(root, '.github', 'unmerged-ignore.txt');
const ignores = existsSync(ignoreFile)
  ? readFileSync(ignoreFile, 'utf8')
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim())
      .filter(Boolean)
  : [];
const ignored = (name) => ignores.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : p === name));

// 開いている PR（フォークから出したもの）。見られなければ null（「PR の有無は分からない」と出す）
async function openPrs() {
  const owner = slug(FORK_URL).split('/')[0];
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    const res = await fetch_(`https://api.github.com/repos/${UPSTREAM_REPO}/pulls?state=open&per_page=100`, token);
    if (!res.ok) return null;
    const map = new Map();
    for (const pr of await res.json())
      if (pr.head?.repo?.owner?.login?.toLowerCase() === owner) map.set(pr.head.ref, { number: pr.number });
    return map;
  } catch {
    return null;
  }
}
const fetch_ = (url, token) =>
  globalThis.fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'unmerged-report', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(15000),
  });

// 変更の中身の指紋。cherry-pick で別のブランチへ写したコミットを「同じもの」と数える
const patchKey = (sha) => {
  try {
    const diff = execFileSync('git', ['diff-tree', '-p', '--no-color', sha], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
    const id = execFileSync('git', ['patch-id', '--stable'], { cwd: root, input: diff, encoding: 'utf8' }).split(' ')[0];
    return id || sha;
  } catch {
    return sha;
  }
};

const prs = await openPrs();
const heads = git('for-each-ref', '--format=%(refname:strip=3)', 'refs/unmerged/fork/').split('\n').filter(Boolean);
const now = Date.now();
const branches = [];
let skippedIgnored = 0;
for (const name of heads) {
  if (SKIP(name)) continue;
  if (ignored(name)) {
    skippedIgnored++;
    continue;
  }
  const ref = `refs/unmerged/fork/${name}`;
  if (!tryGit('merge-base', 'refs/unmerged/upstream', ref)) {
    branches.push({ name, commits: [], unrelated: true });
    continue;
  }
  // + は中身が main に無いコミット（マージコミットは数えない）
  const shas = git('cherry', 'refs/unmerged/upstream', ref)
    .split('\n')
    .filter((line) => line.startsWith('+ '))
    .map((line) => line.slice(2));
  if (!shas.length) continue;
  const commits = shas.map((sha) => {
    const [time, subject] = git('show', '-s', '--format=%ct%x09%s', sha).split('\t');
    return { sha, time: Number(time) * 1000, subject, key: patchKey(sha) };
  });
  const newest = Math.max(...commits.map((c) => c.time));
  const pr = prs?.get(name) ?? null;
  branches.push({ name, commits, newest, days: Math.floor((now - newest) / 86400000), pr });
}
branches.sort((a, b) => (b.newest ?? 0) - (a.newest ?? 0));

// 同じ中身のコミットが何本ものブランチに乗っている（積み上げた・cherry-pick で写した）ときは、
// 最初の1本にだけ並べる。PR に出ているブランチを先に数える（そこに入っていれば取りこぼしではない）
const seen = new Set();
for (const b of [...branches].sort((a, z) => Number(Boolean(z.pr)) - Number(Boolean(a.pr)))) {
  b.fresh = b.commits.filter((c) => !seen.has(c.key));
  for (const c of b.commits) seen.add(c.key);
}

const waiting = branches.filter((b) => !b.unrelated && !b.pr && b.fresh.length);
const inPr = branches.filter((b) => b.pr);
const out = [];
out.push(`## 取りこぼし検知（${slug(FORK_URL)} → ${UPSTREAM_REPO} の main）`);
out.push('');
if (prs === null) out.push('> 開いている PR の一覧を取れなかった。下の「PR の無い」は、PR を出しているものも含む。', '');
if (!waiting.length) out.push('PR の無い未取り込みのコミットは無い。');
else {
  out.push(`**PR の無い未取り込み: ${waiting.length} 本のブランチ・${waiting.reduce((n, b) => n + b.fresh.length, 0)} コミット**`, '');
  for (const b of waiting) {
    out.push(`- \`${b.name}\` — ${b.fresh.length} コミット（いちばん新しいのは ${b.days} 日前）`);
    for (const c of b.fresh.slice(-MAX_LISTED).reverse()) out.push(`  - ${c.sha.slice(0, 8)} ${c.subject}`);
    if (b.fresh.length > MAX_LISTED) out.push(`  - …ほか ${b.fresh.length - MAX_LISTED} コミット`);
    if (b.commits.length > b.fresh.length) out.push(`  - （ほか ${b.commits.length - b.fresh.length} コミットは、同じ中身がほかのブランチにある）`);
  }
}
if (inPr.length) {
  out.push('', 'PR に出ているもの（取り込み待ち）');
  for (const b of inPr) out.push(`- \`${b.name}\` — #${b.pr.number}・${b.commits.length} コミット`);
}
const copies = branches.filter((b) => !b.unrelated && !b.pr && !b.fresh.length);
if (copies.length) out.push('', `中身が全部ほかのブランチにもあるブランチ（消してよい）: ${copies.map((b) => `\`${b.name}\``).join('、')}`);
const unrelated = branches.filter((b) => b.unrelated);
if (unrelated.length) out.push('', `main と履歴がつながっていないブランチ: ${unrelated.map((b) => `\`${b.name}\``).join('、')}`);
if (skippedIgnored) out.push('', `見なかったブランチ（.github/unmerged-ignore.txt）: ${skippedIgnored} 本`);
out.push('');
out.push('取り込むなら、開いている PR のブランチへ cherry-pick するか、新しい PR にする。もう要らないなら .github/unmerged-ignore.txt に書く。');

const text = out.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);

if (FAIL_AFTER_DAYS !== null) {
  const stale = waiting.filter((b) => b.days >= FAIL_AFTER_DAYS);
  if (stale.length) {
    console.error(`\n✗ ${FAIL_AFTER_DAYS} 日より古い取りこぼし: ${stale.map((b) => b.name).join(', ')}`);
    process.exit(1);
  }
}
