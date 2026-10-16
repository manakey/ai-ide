import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import styles from './EditorPanel.module.css';

const LANG_MAP = {
  javascript: 'javascript', typescript: 'typescript', python: 'python',
  html: 'html', css: 'css', json: 'json', markdown: 'markdown',
  bash: 'shell', go: 'go', rust: 'rust', ruby: 'ruby', java: 'java',
  php: 'php', sql: 'sql', yaml: 'yaml', toml: 'ini', c: 'c', cpp: 'cpp',
  plaintext: 'plaintext',
};

function detectLang(filename) {
  if (!filename) return 'plaintext';
  const ext = filename.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown',
    sh: 'bash', go: 'go', rs: 'rust', rb: 'ruby', java: 'java', php: 'php',
    sql: 'sql', yml: 'yaml', yaml: 'yaml', toml: 'toml', c: 'c', cpp: 'cpp',
  };
  return map[ext] || 'plaintext';
}

export default function EditorPanel({ files, activeFile, onActiveFileChange, onFileUpdate, output, onClearOutput, onRun, running }) {
  const editorRef = useRef(null);
  const [outputHeight, setOutputHeight] = useState(160);
  const [draggingOutput, setDraggingOutput] = useState(false);
  const showOutput = output !== null;

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;

    // Dark theme
    monaco.editor.defineTheme('ai-ide-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '4a5570', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7ca8f7' },
        { token: 'string', foreground: '7dd3a8' },
        { token: 'number', foreground: 'f0c674' },
        { token: 'type', foreground: 'c8a4f0' },
        { token: 'function', foreground: '5bc3eb' },
      ],
      colors: {
        'editor.background': '#131720',
        'editor.foreground': '#e2e6f0',
        'editorLineNumber.foreground': '#3a4060',
        'editorLineNumber.activeForeground': '#7a8299',
        'editor.selectionBackground': '#2a3a5a',
        'editor.lineHighlightBackground': '#1a1f2e',
        'editorCursor.foreground': '#4f8ef7',
        'editorIndentGuide.background': '#1e2335',
        'editorIndentGuide.activeBackground': '#2a3050',
        'editor.findMatchBackground': '#3a4860',
        'editor.findMatchHighlightBackground': '#2a3555',
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#1e233540',
        'scrollbarSlider.hoverBackground': '#2a3050a0',
        'minimap.background': '#0f1117',
      },
    });

    // Light theme
    monaco.editor.defineTheme('ai-ide-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '7a8299', fontStyle: 'italic' },
        { token: 'keyword', foreground: '2c5fb5' },
        { token: 'string', foreground: '1a7a4e' },
        { token: 'number', foreground: '9c5d00' },
        { token: 'type', foreground: '7030a0' },
        { token: 'function', foreground: '0070a8' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#1a1e2e',
        'editorLineNumber.foreground': '#b0b8d0',
        'editorLineNumber.activeForeground': '#4a5278',
        'editor.selectionBackground': '#c5d4f0',
        'editor.lineHighlightBackground': '#f0f2f9',
        'editorCursor.foreground': '#2c6ef5',
        'editorIndentGuide.background': '#e0e4f0',
        'editorIndentGuide.activeBackground': '#c0c8e0',
        'editor.findMatchBackground': '#bdd4ff',
        'editor.findMatchHighlightBackground': '#d8e6ff',
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#c0c8e040',
        'scrollbarSlider.hoverBackground': '#b0b8d0a0',
        'minimap.background': '#f5f6fa',
      },
    });

    // Apply correct theme based on current data-theme attribute
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    monaco.editor.setTheme(currentTheme === 'light' ? 'ai-ide-light' : 'ai-ide-dark');

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme') || 'dark';
      monaco.editor.setTheme(t === 'light' ? 'ai-ide-light' : 'ai-ide-dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Ctrl+Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRun?.();
    });
  };

  const currentFile = activeFile ? files.get(activeFile) : null;
  const language = currentFile?.language || detectLang(activeFile || '');
  const monacoLang = LANG_MAP[language] || language;

  // Output panel drag resize
  const handleOutputDrag = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = outputHeight;
    const onMove = (ev) => {
      const newH = Math.max(60, Math.min(500, startH - (ev.clientY - startY)));
      setOutputHeight(newH);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [outputHeight]);

  return (
    <div className={styles.panel}>
      {/* Tabs */}
      <div className={styles.tabs}>
        {Array.from(files.keys()).map(name => (
          <button
            key={name}
            className={`${styles.tab} ${activeFile === name ? styles.activeTab : ''}`}
            onClick={() => onActiveFileChange(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className={styles.editorWrapper}>
        {currentFile ? (
          <Editor
            key={activeFile}
            value={currentFile.content || ''}
            language={monacoLang}
            theme="ai-ide-dark"
            onMount={handleEditorMount}
            onChange={(val) => {
              if (activeFile && val !== undefined) {
                onFileUpdate(activeFile, val);
              }
            }}
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              lineHeight: 1.65,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              renderLineHighlight: 'line',
              padding: { top: 12 },
            }}
          />
        ) : (
          <div className={styles.noFile}>
            <p>Select or create a file to get started.</p>
          </div>
        )}
      </div>

      {/* Output panel */}
      {showOutput && (
        <>
          <div className={styles.outputHandle} onMouseDown={handleOutputDrag} />
          <div className={styles.output} style={{ height: outputHeight }}>
            <div className={styles.outputHeader}>
              <span className={`${styles.outputStatus} ${styles[output.status]}`}>
                {output.status === 'running' && '⏳ Running...'}
                {output.status === 'success' && `✓ Done (${output.duration}ms)`}
                {output.status === 'error' && `✗ Error (exit ${output.exitCode})`}
                {output.status === 'html' && '🌐 Preview'}
              </span>
              <button className={styles.clearBtn} onClick={onClearOutput}>✕</button>
            </div>

            {output.status === 'html' ? (
              <iframe
                className={styles.preview}
                srcDoc={output.html}
                sandbox="allow-scripts"
                title="HTML Preview"
              />
            ) : (
              <div className={styles.outputContent}>
                {output.text && <pre className={styles.stdout}>{output.text}</pre>}
                {output.error && <pre className={styles.stderr}>{output.error}</pre>}
                {!output.text && !output.error && output.status !== 'running' && (
                  <pre className={styles.empty}>(no output)</pre>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
