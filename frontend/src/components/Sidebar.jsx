import React, { useState, useRef, useCallback, useEffect } from 'react';
import styles from './Sidebar.module.css';

const FILE_ICONS = {
  js:'🟨', jsx:'🟨', ts:'🔷', tsx:'🔷', py:'🐍', html:'🌐', css:'🎨',
  json:'📋', md:'📝', sh:'⚡', go:'🔵', rs:'🦀', rb:'💎', java:'☕',
  php:'🐘', sql:'🗃️', yml:'⚙️', yaml:'⚙️', toml:'⚙️', txt:'📄',
};
function fileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || '📄';
}

// Flat file list from Map — render with folder grouping
function groupByFolder(files) {
  const roots = [];
  const folders = {};
  for (const [path] of files) {
    const parts = path.split('/');
    if (parts.length === 1) {
      roots.push({ type: 'file', path });
    } else {
      const folder = parts.slice(0, -1).join('/');
      if (!folders[folder]) folders[folder] = [];
      folders[folder].push(path);
    }
  }
  const result = [];
  // folders first
  for (const [folder, paths] of Object.entries(folders)) {
    result.push({ type: 'folder', path: folder, children: paths.map(p => ({ type: 'file', path: p })) });
  }
  result.push(...roots.map(r => ({ type: 'file', path: r.path })));
  return result;
}

export default function Sidebar({
  files, activeFile, onSelectFile,
  onCreateFile, onCreateFolder, onDeleteFile, onRenameFile, onMoveFile,
  width, onWidthChange
}) {
  const [creating, setCreating] = useState(null); // null | 'file' | 'folder'
  const [newName, setNewName] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const inputRef = useRef(null);

  const startCreate = (type, folder = '') => {
    setCreating(type);
    setNewName('');
    setNewFolder(folder);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmCreate = () => {
    const name = newName.trim();
    if (!name) { setCreating(null); return; }
    const fullPath = newFolder ? `${newFolder}/${name}` : name;
    if (creating === 'file') onCreateFile(fullPath);
    else if (creating === 'folder') onCreateFolder?.(fullPath);
    setCreating(null); setNewName('');
  };

  const startRename = (path) => {
    setRenaming(path);
    setRenameVal(path.split('/').pop());
    setContextMenu(null);
  };

  const confirmRename = () => {
    if (renaming && renameVal.trim()) {
      const parts = renaming.split('/');
      parts[parts.length - 1] = renameVal.trim();
      const newPath = parts.join('/');
      if (newPath !== renaming) onRenameFile(renaming, newPath);
    }
    setRenaming(null);
  };

  const handleContext = (e, path, type) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, nodeType: type });
  };

  // Drag-and-drop to move files between folders
  const handleDragStart = (e, path) => { e.dataTransfer.setData('text/plain', path); };
  const handleDrop = (e, targetFolder) => {
    e.preventDefault();
    const src = e.dataTransfer.getData('text/plain');
    if (!src) return;
    const name = src.split('/').pop();
    const dest = targetFolder ? `${targetFolder}/${name}` : name;
    if (src !== dest) onMoveFile?.(src, dest);
    setDragOver(null);
  };

  const handleDragResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    const onMove = (ev) => onWidthChange(Math.max(140, Math.min(400, startW + ev.clientX - startX)));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, onWidthChange]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const h = () => setContextMenu(null);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [contextMenu]);

  const tree = groupByFolder(files);

  const renderFile = (path, indent = 0) => {
    const name = path.split('/').pop();
    return (
      <div
        key={path}
        className={`${styles.fileItem} ${activeFile === path ? styles.active : ''}`}
        style={{ paddingLeft: 10 + indent * 14 }}
        onClick={() => onSelectFile(path)}
        onContextMenu={(e) => handleContext(e, path, 'file')}
        draggable
        onDragStart={(e) => handleDragStart(e, path)}
        title={path}
      >
        <span className={styles.fileIcon}>{fileIcon(name)}</span>
        {renaming === path ? (
          <input
            className={styles.renameInput}
            value={renameVal}
            autoFocus
            onChange={e => setRenameVal(e.target.value)}
            onBlur={confirmRename}
            onKeyDown={e => { if (e.key==='Enter') confirmRename(); if (e.key==='Escape') setRenaming(null); }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={styles.fileName}>{name}</span>
        )}
      </div>
    );
  };

  const renderFolder = (node, indent = 0) => {
    const isOpen = !collapsed[node.path];
    return (
      <div key={node.path}>
        <div
          className={`${styles.folderItem} ${dragOver === node.path ? styles.dragTarget : ''}`}
          style={{ paddingLeft: 10 + indent * 14 }}
          onClick={() => setCollapsed(p => ({ ...p, [node.path]: !p[node.path] }))}
          onContextMenu={(e) => handleContext(e, node.path, 'folder')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(node.path); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => handleDrop(e, node.path)}
        >
          <span className={styles.folderArrow}>{isOpen ? '▾' : '▸'}</span>
          <span className={styles.fileIcon}>📁</span>
          {renaming === node.path ? (
            <input
              className={styles.renameInput}
              value={renameVal}
              autoFocus
              onChange={e => setRenameVal(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={e => { if (e.key==='Enter') confirmRename(); if (e.key==='Escape') setRenaming(null); }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className={styles.fileName}>{node.path.split('/').pop()}</span>
          )}
        </div>
        {isOpen && node.children?.map(child => renderFile(child.path, indent + 1))}
      </div>
    );
  };

  return (
    <>
      <div
        className={styles.sidebar}
        style={{ width }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(''); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => handleDrop(e, '')}
      >
        <div className={styles.header}>
          <span className={styles.label}>Explorer</span>
          <div className={styles.headerBtns}>
            <button className={styles.iconBtn} onClick={() => startCreate('file')} title="New File">📄</button>
            <button className={styles.iconBtn} onClick={() => startCreate('folder')} title="New Folder">📁</button>
          </div>
        </div>

        <div className={styles.fileList}>
          {creating && (
            <div className={styles.newFileRow}>
              <span className={styles.fileIcon}>{creating === 'folder' ? '📁' : '📄'}</span>
              <input
                ref={inputRef}
                className={styles.newInput}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onBlur={confirmCreate}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmCreate();
                  if (e.key === 'Escape') { setCreating(null); setNewName(''); }
                }}
                placeholder={creating === 'folder' ? 'folder-name' : 'filename.js'}
              />
            </div>
          )}

          {tree.map(node =>
            node.type === 'folder' ? renderFolder(node) : renderFile(node.path)
          )}

          {files.size === 0 && !creating && (
            <div className={styles.empty}>No files yet.<br />Click 📄 to create one.</div>
          )}
        </div>

        <div className={styles.resizeHandle} onMouseDown={handleDragResize} />
      </div>

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.nodeType === 'folder' && (
            <button onClick={() => { startCreate('file', contextMenu.path); setContextMenu(null); }}>📄 New file here</button>
          )}
          <button onClick={() => startRename(contextMenu.path)}>✏️ Rename</button>
          <button
            className={styles.danger}
            onClick={() => { onDeleteFile(contextMenu.path); setContextMenu(null); }}
          >🗑 Delete</button>
        </div>
      )}
    </>
  );
}
