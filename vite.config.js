import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: {
    port: 3000,
    // ⚠ **`strictPort` を外さないこと。セーブが消えたように見える原因そのもの。**
    //    既定（false）だと 3000 が埋まっているとき Vite は黙って 3001 へずらす。
    //    ブラウザの保存領域は**オリジン（scheme+ホスト+ポート）ごとに完全に分離**
    //    されているので、`localhost:3000` と `localhost:3001` は別のサイト扱いになり、
    //    3000 で作ったセーブは 3001 から1件も見えない（実測: IndexedDB のキー 1 → 0）。
    //    起動スクリプトを二重に叩いた・前のウィンドウが残っていた、で普通に起きる。
    //    **黙って別のオリジンへ移るより、起動に失敗して気づかせる方が良い。**
    strictPort: true,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
  }
})
