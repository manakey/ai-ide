import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar.jsx';
import EditorPanel from './components/EditorPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import Terminal from './components/Terminal.jsx';
import Statusbar from './components/Statusbar.jsx';
import GitHubModal from './components/GitHubModal.jsx';
import { useFiles } from './hooks/useFiles.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import styles from './styles/App.module.css';

/* ── Theme ─────────────────────────────────────────────── */
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

/* ── Run Output Panel ──────────────────────────────────── */
function RunOutput({ output, onClear }) {
  if (!output) {
    return (
      <div className={styles.runEmpty}>
        <span>▶ Run を押すとここに出力が表示されます</span>
      </div>
    );
  }

  if (output.status === 'running') {
    return <div className={styles.runEmpty}><span className={styles.runSpinner}>⏳ 実行中...</span></div>;
  }

  if (output.status === 'html') {
    return (
      <div className={styles.runHtml}>
        <div className={styles.runHtmlBar}>
          <span>🌐 HTML プレビュー</span>
          <button className={styles.runClearBtn} onClick={onClear}>✕ 閉じる</button>
        </div>
        <iframe
          className={styles.runIframe}
          srcDoc={output.html}
          sandbox="allow-scripts allow-same-origin"
          title="HTML Preview"
        />
      </div>
    );
  }

  const isOk = output.status === 'success';
  return (
    <div className={styles.runConsole}>
      <div className={styles.runConsoleBar}>
        <span className={isOk ? styles.runOk : styles.runErr}>
          {isOk ? `✓ 成功 (${output.duration}ms)` : `✗ エラー (exit ${output.exitCode})`}
        </span>
        <button className={styles.runClearBtn} onClick={onClear}>✕ 閉じる</button>
      </div>
      <div className={styles.runConsoleBody}>
        {output.text  && <pre className={styles.runStdout}>{output.text}</pre>}
        {output.error && <pre className={styles.runStderr}>{output.error}</pre>}
        {!output.text && !output.error && <pre className={styles.runMuted}>(出力なし)</pre>}
      </div>
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────── */
const TABS = [
  { id: 'editor',   label: '📝 エディタ' },
  { id: 'chat',     label: '◈ AI チャット' },
  { id: 'run',      label: '▶ 実行' },
  { id: 'terminal', label: '⌨ ターミナル' },
];

/* ── App ───────────────────────────────────────────────── */
export default function App() {
  const ws = useWebSocket();
  const fileStore = useFiles();
  const [theme, setTheme] = useTheme();

  const [sidebarWidth, setSidebarWidth]   = useState(200);
  const [splitRatio, setSplitRatio]       = useState(0.5);
  const [showGitHub, setShowGitHub]       = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [output, setOutput]               = useState(null);
  const [running, setRunning]             = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [activeTab, setActiveTab]         = useState('editor');
  const [narrowMode, setNarrowMode]       = useState(false);
  const runCmdRef = useRef(null); // Terminal の送信関数を保持

  const [githubToken, setGithubToken]     = useState(() => {
    try { return localStorage.getItem('gh_token') || ''; } catch { return ''; }
  });

  /* narrow mode detection */
  useEffect(() => {
    const check = () => setNarrowMode(window.innerWidth < 900);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* ── Run code ─────────────────────────────────────────── */
  const runCode = useCallback(async () => {
    const { activeFile, files } = fileStore;
    if (!activeFile) return;
    const file = files.get(activeFile);
    if (!file) return;

    setRunning(true);
    setOutput({ status: 'running', text: '' });
    setActiveTab('run'); // 「実行」タブへ自動切り替え

    const ext = activeFile.split('.').pop()?.toLowerCase();

    // HTML ファイルは API不要、直接プレビュー
    if (ext === 'html') {
      setOutput({ status: 'html', html: file.content });
      setRunning(false);
      return;
    }

    // ターミナルにも同じコマンドを流す（並行実行）
    const termCmd =
      ext === 'py' ? `python3 "${activeFile}"` :
      ext === 'js' || ext === 'mjs' ? `node "${activeFile}"` :
      ext === 'ts' ? `npx ts-node "${activeFile}"` :
      ext === 'sh' ? `bash "${activeFile}"` :
      ext === 'go' ? `go run "${activeFile}"` : null;
    if (termCmd && runCmdRef.current) {
      runCmdRef.current(termCmd);
    }

    try {
      const res = await fetch('/api/code/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: file.content, language: file.language }),
      });
      const data = await res.json();
      if (data.html) {
        // バックエンドがHTMLプレビューを返した（ブラウザJSを含むコードなど）
        setOutput({ status: 'html', html: data.html });
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

  /* ── Split drag ───────────────────────────────────────── */
  const handleSplitDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startRatio = splitRatio;
    const containerWidth = document.getElementById('main-area')?.offsetWidth || 1;
    const onMove = (ev) => setSplitRatio(Math.min(0.8, Math.max(0.2, startRatio + (ev.clientX - startX) / containerWidth)));
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [splitRatio]);

  /* ── File created by AI ───────────────────────────────── */
  const handleFileCreated = useCallback((path, content) => {
    fileStore.createFile(path);
    setTimeout(() => fileStore.updateFile(path, content), 50);
  }, [fileStore]);

  /* ── Command result from ChatPanel ───────────────────── */
  const handleCommandResult = useCallback((command, result) => {
    setOutput({
      status: result.exitCode === 0 ? 'success' : 'error',
      text: result.stdout || '',
      error: result.stderr || '',
      duration: null,
      exitCode: result.exitCode,
      label: command,
    });
    setActiveTab('run'); // コマンド実行も「実行」タブへ
  }, []);

  /* ── Panes (常にマウント、display:none で隠す → 状態保持) ─ */
  const isTerminal = activeTab === 'terminal';
  const isRun      = activeTab === 'run';
  const isChat     = activeTab === 'chat';
  const isEditor   = activeTab === 'editor';

  // PC幅: エディタとチャットは並列表示
  // narrow: タブで1枚ずつ
  const editorVisible  = narrowMode ? isEditor  : !isTerminal;
  const chatVisible    = narrowMode ? isChat    : !isTerminal && !isRun;
  const runVisible     = narrowMode ? isRun     : isRun;
  const termVisible    = isTerminal;

  /* ── render ───────────────────────────────────────────── */
  const renderContent = () => {
    if (narrowMode) {
      return (
        <div className={styles.singlePane}>
          {/* 全パネルを常にマウント、display:none で切り替え */}
          <div style={{ display: isEditor ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <EditorPanel
              files={fileStore.files}
              activeFile={fileStore.activeFile}
              onActiveFileChange={fileStore.setActiveFile}
              onFileUpdate={fileStore.updateFile}
              output={null}
              onClearOutput={() => {}}
              onRun={runCode}
              running={running}
            />
          </div>
          <div style={{ display: isChat ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <ChatPanel
              ws={ws}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              activeFile={fileStore.activeFile}
              activeFileContent={fileStore.files.get(fileStore.activeFile)?.content || ''}
              onInsertCode={(code, filename) => {
                if (filename) { fileStore.createFile(filename); setTimeout(() => fileStore.updateFile(filename, code), 50); }
                else if (fileStore.activeFile) fileStore.updateFile(fileStore.activeFile, code);
              }}
              onFileCreated={handleFileCreated}
              onCommandResult={handleCommandResult}
            />
          </div>
          <div style={{ display: isRun ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <RunOutput output={output} onClear={() => setOutput(null)} />
          </div>
          <div style={{ display: isTerminal ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <Terminal sessionId="main" height={9999} onHeightChange={setTerminalHeight} runCmdRef={runCmdRef} />
          </div>
        </div>
      );
    }

    // PC: 常にすべてマウント
    return (
      <>
        <div
          className={styles.mainArea}
          id="main-area"
          style={{ display: isTerminal ? 'none' : undefined }}
        >
          {/* エディタ */}
          <div
            className={styles.editorArea}
            style={{ width: `${splitRatio * 100}%` }}
          >
            <EditorPanel
              files={fileStore.files}
              activeFile={fileStore.activeFile}
              onActiveFileChange={fileStore.setActiveFile}
              onFileUpdate={fileStore.updateFile}
              output={null}
              onClearOutput={() => {}}
              onRun={runCode}
              running={running}
            />
          </div>

          <div className={styles.splitHandle} onMouseDown={handleSplitDrag} />

          {/* チャット (常にマウント、RunタブはRunOutputを重ねる) */}
          <div
            className={styles.chatArea}
            style={{ width: `${(1 - splitRatio) * 100}%`, position: 'relative' }}
          >
            {/* ChatPanel は常に存在 */}
            <div style={{ display: isRun ? 'none' : 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: '100%' }}>
              <ChatPanel
                ws={ws}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                activeFile={fileStore.activeFile}
                activeFileContent={fileStore.files.get(fileStore.activeFile)?.content || ''}
                onInsertCode={(code, filename) => {
                  if (filename) { fileStore.createFile(filename); setTimeout(() => fileStore.updateFile(filename, code), 50); }
                  else if (fileStore.activeFile) fileStore.updateFile(fileStore.activeFile, code);
                }}
                onFileCreated={handleFileCreated}
                onCommandResult={handleCommandResult}
              />
            </div>
            {/* RunOutput は実行タブのときだけ表示 */}
            <div style={{ display: isRun ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: '100%' }}>
              <RunOutput output={output} onClear={() => setOutput(null)} />
            </div>
          </div>
        </div>

        {/* ターミナル: 常にマウント */}
        {isTerminal
          ? <div className={styles.terminalFull}>
              <Terminal sessionId="main" height={9999} onHeightChange={setTerminalHeight} runCmdRef={runCmdRef} />
            </div>
          : <Terminal sessionId="main" height={terminalHeight} onHeightChange={setTerminalHeight} runCmdRef={runCmdRef} />
        }
      </>
    );
  };

  return (
    <div className={styles.app}>
      {/* ── Title bar ───────────────────────────────────── */}
      <div className={styles.titlebar}>
        <span className={styles.logo}>◈ AI IDE</span>

        {/* Browser-style tabs */}
        <div className={styles.panelTabs}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.panelTab} ${activeTab === tab.id ? styles.panelTabActive : ''} ${tab.id === 'run' && running ? styles.panelTabRunning : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.id === 'run' && output && output.status !== 'running' && (
                <span className={output.status === 'success' ? styles.tabDotOk : styles.tabDotErr} />
              )}
            </button>
          ))}
        </div>

        <div className={styles.titleRight}>
          {fileStore.activeFile && (
            <span className={styles.activeFilename}>{fileStore.activeFile}</span>
          )}
          <button className={styles.runBtn} onClick={runCode} disabled={running} title="実行 (Ctrl+Enter)">
            {running ? '⏳' : '▶ Run'}
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'ライトモード' : 'ダークモード'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className={styles.githubBtn} onClick={() => setShowGitHub(true)} title="Push to GitHub">
            ⬆ GitHub
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────── */}
      <div className={styles.body}>
        <Sidebar
          files={fileStore.files}
          activeFile={fileStore.activeFile}
          onSelectFile={fileStore.setActiveFile}
          onCreateFile={fileStore.createFile}
          onCreateFolder={fileStore.createFolder}
          onDeleteFile={fileStore.deleteFile}
          onRenameFile={fileStore.renameFile}
          onMoveFile={fileStore.moveFile}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
        <div className={styles.rightColumn}>
          {renderContent()}
        </div>
      </div>

      <Statusbar connected={ws.connected} model={selectedModel} activeFile={fileStore.activeFile} />

      {showGitHub && (
        <GitHubModal
          token={githubToken}
          onTokenChange={t => { setGithubToken(t); try { localStorage.setItem('gh_token', t); } catch {} }}
          getAllFiles={fileStore.getAllFilesForExport}
          onClose={() => setShowGitHub(false)}
        />
      )}
    </div>
  );
}
