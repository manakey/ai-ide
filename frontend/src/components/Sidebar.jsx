import React, { useState, useRef, useCallback } from 'react';
import styles from './Sidebar.module.css';

const LANG_ICONS = {
  javascript: '🟨', typescript: '🔷', python: '🐍', html: '🌐',
  css: '🎨', json: '📋', markdown: '📝', bash: '⚡', go: '🔵',
  rust: '🦀', ruby: '💎', java: '☕', php: '🐘', sql: '🗃️',
  plaintext: '📄',
};

function getIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const langMap = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown',
    sh: 'bash', go: 'go', rs: 'rust', rb: 'ruby', java: 'java', php: 'php',
    sql: 'sql',
  };
  return LANG_ICONS[langMap[ext] || 'plaintext'] || '📄';
}

export default function Sidebar({ files, activeFile, onSelectFile, onCreateFile, onDeleteFile, onRenameFile, width, onWidthChange }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const inputRef = useRef(null);

  const startCreate = () => {
    setCreating(true);
    setNewName('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmCreate = () => {
    const name = newName.trim();
    if (name) onCreateFile(name);
    setCreating(false);
    setNewName('');
  };

  const startRename = (name) => {
    setRenaming(name);
    setRenameVal(name);
    setContextMenu(null);
  };

  const confirmRename = () => {
    if (renaming && renameVal.trim() && renameVal !== renaming) {
      onRenameFile(renaming, renameVal.trim());
    }
    setRenaming(null);
  };

  const handleContext = (e, name) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, name });
  };

  const handleDragResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev) => {
      const newW = Math.max(140, Math.min(400, startW + ev.clientX - startX));
      onWidthChange(newW);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, onWidthChange]);

  return (
    <>
      <div className={styles.sidebar} style={{ width }}>
        <div className={styles.header}>
          <span className={styles.label}>Files</span>
          <button className={styles.newBtn} onClick={startCreate} title="New file">+</button>
        </div>

        <div className={styles.fileList}>
          {creating && (
            <div className={styles.newFileRow}>
              <input
                ref={inputRef}
                className={styles.newInput}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onBlur={confirmCreate}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                }}
                placeholder="filename.js"
              />
            </div>
          )}

          {Array.from(files.keys()).map(name => (
            <div
              key={name}
              className={`${styles.fileItem} ${activeFile === name ? styles.active : ''}`}
              onClick={() => onSelectFile(name)}
              onContextMenu={(e) => handleContext(e, name)}
            >
              <span className={styles.fileIcon}>{getIcon(name)}</span>
              {renaming === name ? (
                <input
                  className={styles.renameInput}
                  value={renameVal}
                  autoFocus
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={confirmRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className={styles.fileName}>{name}</span>
              )}
            </div>
          ))}

          {files.size === 0 && !creating && (
            <div className={styles.empty}>No files yet.<br />Click + to create one.</div>
          )}
        </div>

        {/* Resize handle */}
        <div className={styles.resizeHandle} onMouseDown={handleDragResize} />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className={styles.contextOverlay} onClick={() => setContextMenu(null)} />
          <div className={styles.contextMenu} style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={() => { startRename(contextMenu.name); }}>Rename</button>
            <button className={styles.danger} onClick={() => { onDeleteFile(contextMenu.name); setContextMenu(null); }}>Delete</button>
          </div>
        </>
      )}
    </>
  );
}
