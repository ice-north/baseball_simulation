// ============================================================
// アプリ全体のエラー境界 - src/components/AppErrorBoundary.jsx
//
// どこか1画面のレンダリング例外でアプリ全体が白画面になるのを防ぐ。
// クラッシュ時は現在のゲーム状態を「緊急保存」し、進行中データを守る。
// ============================================================
import React from 'react';
import { getGameSnapshot } from '../game/crashRecovery.js';
import { saveEmergency } from '../game/saveSystem.js';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, emergencySaved: false, showDetail: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('アプリでエラーが発生しました:', error, info);
    // 現在のゲーム状態を緊急保存（localStorageへ同期書き込み）
    let saved = false;
    try {
      const snap = getGameSnapshot();
      if (snap && snap.seasonData) saved = saveEmergency(snap);
    } catch (e) { /* 緊急保存の失敗はここで握りつぶす */ }
    this.setState({ emergencySaved: saved });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const err = this.state.error;
    const msg = err?.message || String(err || '不明なエラー');

    return (
      <div style={{
        minHeight: '100vh', background: '#0d1119', color: '#e8edf6',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        fontFamily: '"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",system-ui,sans-serif',
      }}>
        <div style={{ maxWidth: 560, width: '100%', background: '#141a26', border: '1px solid #273349', borderRadius: 16, padding: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>予期しないエラーが発生しました</h1>
          <p style={{ color: '#aab6cc', fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>
            ご迷惑をおかけします。アプリを再読み込みして続行してください。
            {this.state.emergencySaved
              ? '進行中のデータは自動でバックアップしました（再起動後に「緊急バックアップから復旧」で戻せます）。'
              : 'セーブ済みのデータは保持されています。'}
          </p>

          <div style={{
            background: this.state.emergencySaved ? '#0e2a1a' : '#1b2233',
            border: `1px solid ${this.state.emergencySaved ? '#1f6f43' : '#273349'}`,
            borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 13,
            color: this.state.emergencySaved ? '#6ee7a8' : '#aab6cc',
          }}>
            {this.state.emergencySaved
              ? '✓ 緊急バックアップを作成しました'
              : 'ℹ 進行中データの緊急バックアップは作成されませんでした（直近のセーブは無事です）'}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#22d3ee', color: '#0d1119', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
            >
              アプリを再読み込み
            </button>
            <button
              onClick={() => this.setState(s => ({ showDetail: !s.showDetail }))}
              style={{ background: 'transparent', color: '#aab6cc', border: '1px solid #273349', borderRadius: 10, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}
            >
              {this.state.showDetail ? 'エラー詳細を隠す' : 'エラー詳細を表示'}
            </button>
          </div>

          {this.state.showDetail && (
            <pre style={{
              marginTop: 14, background: '#0d1119', border: '1px solid #273349', borderRadius: 8,
              padding: 12, fontSize: 12, color: '#f87171', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 200, overflow: 'auto',
            }}>{msg}{err?.stack ? '\n\n' + err.stack : ''}</pre>
          )}
        </div>
      </div>
    );
  }
}
