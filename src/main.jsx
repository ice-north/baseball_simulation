import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// 入口を分け、オンラインで一人用の画面や日次副作用をマウントしない。
const online = window.location.pathname.replace(/\/$/, '') === '/online';
class OnlineBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  // ⚠ **残したビュー（`savedView.js`）を忘れてから再読込させる**。開いた直後は残したビューを
  //    そのまま描くので、そのビューで落ちたのなら、再読込してもまた同じビューで落ちる
  //    （閉じて開き直しても同じ）。忘れればサーバーから読み直したビューで描く。
  //    一人用の入口に読み込ませないよう、ここで読む（オンラインの画面がもう読んでいるので即座に済む）
  componentDidCatch() {
    import('./online/savedView.js')
      .then(({ forgetView }) => forgetView())
      .catch(() => {});
  }
  render() {
    return this.state.failed ? (
      <div role="alert" style={{ padding: 24 }}>
        画面を表示できませんでした。
        <button onClick={() => window.location.reload()}>再読込</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const root = ReactDOM.createRoot(document.getElementById('root'));
if (online) {
  import('./online/OnlineApp.jsx').then(({ default: OnlineApp }) =>
    root.render(
      <React.StrictMode>
        <OnlineBoundary>
          <OnlineApp />
        </OnlineBoundary>
      </React.StrictMode>,
    ),
  );
} else {
  Promise.all([
    import('./App.jsx'),
    import('./components/AppErrorBoundary.jsx'),
  ]).then(([{ default: App }, { default: AppErrorBoundary }]) =>
    root.render(
      <React.StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </React.StrictMode>,
    ),
  );
}
