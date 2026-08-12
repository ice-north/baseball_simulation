/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // src/index.css の :root トークンを Tailwind のユーティリティとして生やす。
      // 従来トークンは CSS 変数として定義だけされていて、実使用は 1〜2 箇所しか
      // 無かった（対して素の bg-gray-800/900 が 392 箇所）。
      // `bg-surface-2` / `text-accent` のように普通のクラスで書けるようにして、
      // トークンを使うのが自然な状態にする。
      //
      // ⚠ **色を増やす場所ではない**。ここに足すのはアクセントとサーフェスだけ。
      //    ランク色・チーム色・結果の意味色は素の Tailwind 色のままにする。
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          strong: 'var(--accent-strong)',
          soft: 'var(--accent-soft)',
        },
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
        },
      },
    },
  },
  plugins: [],
}
