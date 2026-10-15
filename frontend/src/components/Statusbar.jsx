import React from 'react';
import styles from './Statusbar.module.css';

export default function Statusbar({ connected, model, activeFile }) {
  const lang = activeFile ? activeFile.split('.').pop()?.toUpperCase() : '';

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={`${styles.dot} ${connected ? styles.connected : styles.disconnected}`} />
        <span className={styles.item}>{connected ? 'Connected' : 'Reconnecting...'}</span>
      </div>
      <div className={styles.right}>
        {model && <span className={styles.item}>◈ {model}</span>}
        {activeFile && <span className={styles.item}>{activeFile}</span>}
        {lang && <span className={styles.item}>{lang}</span>}
      </div>
    </div>
  );
}
