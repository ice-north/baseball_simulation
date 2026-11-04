import { useEffect, useState } from 'react';

// スマホ表示（767px以下）かどうか。⚠ 画面の幅で表示を切り替えるときは**これを使う**。
// 描画の途中で `matchMedia(...).matches` を直に読むと、幅が変わっても
// 別の理由で描き直されるまで切り替わらない（開いたダイアログの中の部品が途中で入れ替わる）。
export const MOBILE_QUERY = '(max-width: 767px)';
export function useMobile() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const change = () => setMobile(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return mobile;
}
