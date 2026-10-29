import React, { useEffect, useRef } from 'react';
export default function MobilePanel({ title, close, children, footer }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current,
      trigger = document.activeElement;
    node.showModal();
    return () => {
      if (node.open) node.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="online-mobile-panel"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2>{title}</h2>
      </header>
      <div className="online-mobile-panel-content">{children}</div>
      <footer>{footer}</footer>
    </dialog>
  );
}
