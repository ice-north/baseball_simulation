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
        // ⚠ **gray スケールごと持ち上げてある**（Football Manager のような
        //    「明るめのグレー寄りの青」に寄せるため）。surface-* だけを明るくすると、
        //    素の `bg-gray-800`(105箇所) が `bg-surface-2`(192箇所) より暗いまま残り、
        //    同じ「カード」が2種類の色で出る。**gray-900/800 は surface-0/2 と同値**に
        //    してあるので、どちらで書いても揃う。
        //    ⚠ これは色を増やしているのではなく、既存スケールの再定義。
        gray: {
          50:  '#f4f6f9',
          100: '#e7ebf1',
          200: '#cfd6e0',
          300: '#b0bacb',
          400: '#96a2b6',   // カード上で 4.74:1（AA 4.5 を確保）
          500: '#697588',
          600: '#4d5a6d',
          700: '#3c4757',
          800: '#2c3644',   // = surface-2（カード）
          900: '#1d232c',   // = surface-0（地色）
          950: '#141920',
        },
      },
    },
  },
  plugins: [],
}
