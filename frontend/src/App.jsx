import React, { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import EditorPanel from './components/EditorPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import Terminal from './components/Terminal.jsx';
import Statusbar from './components/Statusbar.jsx';
import GitHubModal from './components/GitHubModal.jsx';
import { useFiles } from './hooks/useFiles.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import styles from './styles/App.module.css';

export default function App() {
  const ws = useWebSocket();
  const fileStore = useFiles();

  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [showGitHub, setShowGitHub] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [githubToken, setGithubToken] = useState(() => {
    try { return localStorage.getItem('gh_token') || ''; } catch { return ''; }
  });

  const runCode = useCallback(async () => {
    const { activeFile, files } = fileStore;
    if (!activeFile) return;
    const file = files.get(activeFile);
    if (!file) return;

    setRunning(true);
    setOutput({ status: 'running', text: '' });

    try {
      const res = await fetch('/api/code/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: file.content, language: file.language }),
      });
      const data = await res.json();

      if (file.language === 'html') {
        setOutput({ status: 'html', html: data.html || file.content });
      } else {
        setOutput({
          status: data.exitCode === 0 ? 'success' : 'error',
          text: data.output || '',
          error: data.error || '',
          duration: data.duration,
          exitCode: data.exitCode,
        });
      }
    } catch (err) {
      setOutput({ status: 'error', text: '', error: err.message });
    } finally {
      setRunning(false);
    }
  }, [fileStore]);

  // Drag to resize editor/chat split
  const handleSplitDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startRatio = splitRatio;
    const containerWidth = document.getElementById('main-area')?.offsetWidth || 1;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const newRatio = Math.min(0.8, Math.max(0.2, startRatio + dx / containerWidth));
      setSplitRatio(newRatio);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [splitRatio]);

  // Handle AI creating a file
  const handleFileCreated = useCallback((path, content) => {
    fileStore.createFile(path);
    setTimeout(() => fileStore.updateFile(path, content), 50);
  }, [fileStore]);

  return (
    <div className={styles.app}>
      {/* Title bar */}
      <div className={styles.titlebar}>
        <div className={styles.titleLeft}>
          <span className={styles.logo}>◈ AI IDE</span>
        </div>
        <div className={styles.titleCenter}>
          {fileStore.activeFile && (
            <span className={styles.activeFilename}>{fileStore.activeFile}</span>
          )}
        </div>
        <div className={styles.titleRight}>
          <button
            className={styles.runBtn}
            onClick={runCode}
            disabled={running}
            title="Run code"
          >
            {running ? '⏳ Running...' : '▶ Run'}
          </button>
          <button
            className={`${styles.runBtn} ${showTerminal ? styles.runBtnActive : ''}`}
            onClick={() => setShowTerminal(v => !v)}
            title="Toggle terminal"
          >
            ⌨ Terminal
          </button>
          <button
            className={styles.githubBtn}
            onClick={() => setShowGitHub(true)}
            title="Push to GitHub"
          >
            ⬆ GitHub
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className={styles.body}>
        <Sidebar
          files={fileStore.files}
          activeFile={fileStore.activeFile}
          onSelectFile={fileStore.setActiveFile}
          onCreateFile={fileStore.createFile}
          onDeleteFile={fileStore.deleteFile}
          onRenameFile={fileStore.renameFile}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />

        <div className={styles.rightColumn}>
          {/* Top: editor + chat */}
          <div className={styles.mainArea} id="main-area">
            <div className={styles.editorArea} style={{ width: `${splitRatio * 100}%` }}>
              <EditorPanel
                files={fileStore.files}
                activeFile={fileStore.activeFile}
                onActiveFileChange={fileStore.setActiveFile}
                onFileUpdate={fileStore.updateFile}
                output={output}
                onClearOutput={() => setOutput(null)}
                onRun={runCode}
                running={running}
              />
            </div>

            <div className={styles.splitHandle} onMouseDown={handleSplitDrag} />

            <div className={styles.chatArea} style={{ width: `${(1 - splitRatio) * 100}%` }}>
              <ChatPanel
                ws={ws}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                activeFile={fileStore.activeFile}
                activeFileContent={fileStore.files.get(fileStore.activeFile)?.content || ''}
                onInsertCode={(code, filename) => {
                  if (filename) {
                    fileStore.createFile(filename);
                    setTimeout(() => fileStore.updateFile(filename, code), 50);
                  } else if (fileStore.activeFile) {
                    fileStore.updateFile(fileStore.activeFile, code);
                  }
                }}
                onFileCreated={handleFileCreated}
              />
            </div>
          </div>

          {/* Bottom: terminal */}
          {showTerminal && (
            <Terminal
              sessionId="main"
              height={terminalHeight}
              onHeightChange={setTerminalHeight}
            />
          )}
        </div>
      </div>

      <Statusbar connected={ws.connected} model={selectedModel} activeFile={fileStore.activeFile} />

      {showGitHub && (
        <GitHubModal
          token={githubToken}
          onTokenChange={(t) => {
            setGithubToken(t);
            try { localStorage.setItem('gh_token', t); } catch {}
          }}
          getAllFiles={fileStore.getAllFilesForExport}
          onClose={() => setShowGitHub(false)}
        />
      )}
    </div>
  );
}
