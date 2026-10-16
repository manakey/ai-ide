import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import EditorPanel from './components/EditorPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import Terminal from './components/Terminal.jsx';
import Statusbar from './components/Statusbar.jsx';
import GitHubModal from './components/GitHubModal.jsx';
import { useFiles } from './hooks/useFiles.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import styles from './styles/App.module.css';

// Persist theme across sessions
function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ide_theme') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ide_theme', theme); } catch {}
  }, [theme]);
  return [theme, setTheme];
}

// Browser-style tab bar
const PANEL_TABS = [
  { id: 'editor', label: '📝 Editor' },
  { id: 'chat',   label: '◈ AI Chat' },
  { id: 'terminal', label: '⌨ Terminal' },
];

export default function App() {
  const ws = useWebSocket();
  const fileStore = useFiles();
  const [theme, setTheme] = useTheme();

  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [showGitHub, setShowGitHub] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [githubToken, setGithubToken] = useState(() => {
    try { return localStorage.getItem('gh_token') || ''; } catch { return ''; }
  });

  // Active tab: on wide screens show side-by-side editor+chat; on narrow show tabs
  const [activeTab, setActiveTab] = useState('editor');
  const [narrowMode, setNarrowMode] = useState(false);

  useEffect(() => {
    const check = () => setNarrowMode(window.innerWidth < 900);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  // Drag to resize editor/chat split (wide mode only)
  const handleSplitDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startRatio = splitRatio;
    const containerWidth = document.getElementById('main-area')?.offsetWidth || 1;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      setSplitRatio(Math.min(0.8, Math.max(0.2, startRatio + dx / containerWidth)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [splitRatio]);

  const handleFileCreated = useCallback((path, content) => {
    fileStore.createFile(path);
    setTimeout(() => fileStore.updateFile(path, content), 50);
  }, [fileStore]);

  const editorPane = (
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
  );

  const chatPane = (
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
  );

  const terminalPane = (
    <Terminal
      sessionId="main"
      height={terminalHeight}
      onHeightChange={setTerminalHeight}
    />
  );

  return (
    <div className={styles.app}>
      {/* Title bar */}
      <div className={styles.titlebar}>
        <div className={styles.titleLeft}>
          <span className={styles.logo}>◈ AI IDE</span>
        </div>

        {/* Browser-style panel tabs (always visible) */}
        <div className={styles.panelTabs}>
          {PANEL_TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.panelTab} ${activeTab === tab.id ? styles.panelTabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.titleRight}>
          {fileStore.activeFile && (
            <span className={styles.activeFilename}>{fileStore.activeFile}</span>
          )}
          <button
            className={styles.runBtn}
            onClick={runCode}
            disabled={running}
            title="Run code (Ctrl+Enter)"
          >
            {running ? '⏳' : '▶ Run'}
          </button>
          <button
            className={`${styles.iconBtn} ${theme === 'light' ? styles.iconBtnActive : ''}`}
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
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
          {narrowMode ? (
            /* ── NARROW: single pane shown at a time ── */
            <div className={styles.singlePane}>
              {activeTab === 'editor' && editorPane}
              {activeTab === 'chat' && chatPane}
              {activeTab === 'terminal' && (
                <div className={styles.terminalFull}>
                  <Terminal sessionId="main" height={9999} onHeightChange={() => {}} />
                </div>
              )}
            </div>
          ) : (
            /* ── WIDE: editor+chat side-by-side, terminal below ── */
            <>
              <div
                className={styles.mainArea}
                id="main-area"
                style={{ display: activeTab === 'terminal' ? 'none' : undefined }}
              >
                <div
                  className={styles.editorArea}
                  style={{ width: `${splitRatio * 100}%`, display: activeTab === 'chat' ? 'none' : undefined }}
                >
                  {editorPane}
                </div>

                {activeTab === 'editor' && (
                  <div className={styles.splitHandle} onMouseDown={handleSplitDrag} />
                )}

                <div
                  className={styles.chatArea}
                  style={{
                    width: activeTab === 'editor' ? `${(1 - splitRatio) * 100}%` : '100%',
                    display: activeTab === 'editor' ? undefined : (activeTab === 'chat' ? undefined : 'none'),
                  }}
                >
                  {chatPane}
                </div>
              </div>

              {(activeTab === 'terminal' || activeTab === 'editor' || activeTab === 'chat') && (
                <Terminal
                  sessionId="main"
                  height={activeTab === 'terminal' ? 9999 : terminalHeight}
                  onHeightChange={setTerminalHeight}
                />
              )}
            </>
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
