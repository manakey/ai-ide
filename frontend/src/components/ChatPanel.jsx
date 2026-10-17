import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import styles from './ChatPanel.module.css';

const SYSTEM_PROMPT = `You are an expert programming assistant embedded in an AI IDE (similar to GitHub Codespaces / VS Code).

## Available Features in this IDE:
- **File Editor**: Monaco-based editor (VS Code engine). User can edit files directly.
- **File Sidebar**: Users can create files (📄), create folders (📁), rename, move (drag-and-drop), and delete files via right-click context menu.
- **AI Chat** (you): This panel. You can propose actions and the user approves them.
- **Run Output Tab (▶)**: Shows execution output when the user runs code. Appears as a browser-style tab.
- **Terminal Tab (⌨)**: Full interactive bash terminal. User can type commands directly. When code is run via the ▶ Run button, the command is also sent to the terminal automatically.
- **server.js auto-start**: If a file named \`server.js\` exists in the workspace, the backend auto-starts it in the background on port 4000. Writing a new server.js also triggers a restart.
- **GitHub Push**: Users can push their code to GitHub using the ⬆ GitHub button.
- **Light/Dark mode**: Toggle with ☀️/🌙 button.

## Your capabilities:
When you want to **CREATE or UPDATE a file**, use this exact format:
<create_file path="filename.ext">
file content here
</create_file>

When you want to **RUN a terminal command**, use this exact format:
<run_command>
command here
</run_command>

These will be shown to the user as approval cards. The user must approve before they execute.

## Tips:
- For web apps, suggest creating \`server.js\` (Express) — it auto-starts in background.
- For frontend projects, suggest \`index.html\` which can be previewed with the ▶ Run button.
- Use \`npm install <package>\` via run_command to add dependencies.
- The workspace is a persistent Linux environment. Files survive page refreshes.
- When providing code snippets inline (not as actions), use standard markdown fences with the language name.
- Be concise but thorough. Prefer showing working code over explanations.`;

// Parse AI response for action proposals
function parseActions(content) {
  const actions = [];
  const createFileRe = /<create_file\s+path="([^"]+)">([\s\S]*?)<\/create_file>/g;
  const runCommandRe = /<run_command>([\s\S]*?)<\/run_command>/g;

  let m;
  while ((m = createFileRe.exec(content)) !== null) {
    actions.push({ type: 'create_file', path: m[1].trim(), content: m[2].trim(), id: `cf_${Math.random().toString(36).slice(2)}` });
  }
  while ((m = runCommandRe.exec(content)) !== null) {
    actions.push({ type: 'run_command', command: m[1].trim(), id: `rc_${Math.random().toString(36).slice(2)}` });
  }
  return actions;
}

// Strip action tags from display content
function stripActions(content) {
  return content
    .replace(/<create_file\s+path="[^"]+">[\s\S]*?<\/create_file>/g, '')
    .replace(/<run_command>[\s\S]*?<\/run_command>/g, '')
    .trim();
}

function ActionCard({ action, onApprove, onReject, status }) {
  return (
    <div className={`${styles.actionCard} ${status === 'done' ? styles.actionDone : status === 'rejected' ? styles.actionRejected : ''}`}>
      <div className={styles.actionHeader}>
        {action.type === 'create_file' ? (
          <>
            <span className={styles.actionIcon}>📄</span>
            <span className={styles.actionLabel}>Create file</span>
            <code className={styles.actionPath}>{action.path}</code>
          </>
        ) : (
          <>
            <span className={styles.actionIcon}>⚡</span>
            <span className={styles.actionLabel}>Run command</span>
          </>
        )}
      </div>
      {action.type === 'run_command' && (
        <pre className={styles.actionCmd}>{action.command}</pre>
      )}
      {action.type === 'create_file' && (
        <pre className={styles.actionPreview}>{action.content.slice(0, 300)}{action.content.length > 300 ? '\n...' : ''}</pre>
      )}
      {status === 'pending' && (
        <div className={styles.actionBtns}>
          <button className={styles.approveBtn} onClick={() => onApprove(action)}>✓ Approve</button>
          <button className={styles.rejectBtn} onClick={() => onReject(action)}>✕ Reject</button>
        </div>
      )}
      {status === 'done' && <div className={styles.actionStatus}>✓ Executed</div>}
      {status === 'rejected' && <div className={styles.actionStatus}>✕ Rejected</div>}
      {status === 'running' && <div className={styles.actionStatus}>⏳ Running...</div>}
    </div>
  );
}

export default function ChatPanel({ ws, selectedModel, onModelChange, activeFile, activeFileContent, onInsertCode, onFileCreated }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'こんにちは！コードを書くお手伝いをします。ファイルを作ったりコマンドを実行することもできます。何か作りたいものや質問はありますか？' }
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState([]);
  const [includeContext, setIncludeContext] = useState(true);
  const [modelSearch, setModelSearch] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState({}); // id -> 'pending'|'running'|'done'|'rejected'
  const modelDropdownRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const streamBuf = useRef('');
  const listenerId = useId();

  // Close model dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredModels = models.filter(m =>
    (m.name || m.id).toLowerCase().includes(modelSearch.toLowerCase())
  );

  // Load models
  useEffect(() => {
    fetch('/api/chat/models')
      .then(r => r.json())
      .then(data => {
        setModels(data.models || []);
        if (!selectedModel && data.models?.length > 0) {
          onModelChange(data.models[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // WebSocket message handler
  useEffect(() => {
    const unsub = ws.addListener(listenerId, (data) => {
      if (data.type === 'chunk') {
        streamBuf.current += data.content;
        const buf = streamBuf.current;
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && last._streaming) {
            next[next.length - 1] = { ...last, content: buf };
            return next;
          }
          return prev;
        });
      } else if (data.type === 'done') {
        const finalContent = streamBuf.current;
        streamBuf.current = '';
        const actions = parseActions(finalContent);
        // Initialize action statuses
        if (actions.length > 0) {
          setActionStatus(prev => {
            const next = { ...prev };
            actions.forEach(a => { next[a.id] = 'pending'; });
            return next;
          });
        }
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?._streaming) {
            next[next.length - 1] = { role: 'assistant', content: finalContent || last.content, actions };
            return next;
          }
          return prev;
        });
        setStreaming(false);
      } else if (data.type === 'error') {
        const msg = data.message;
        streamBuf.current = '';
        setMessages(prev => [
          ...prev.filter(m => !m._streaming),
          { role: 'assistant', content: `⚠️ Error: ${msg}` }
        ]);
        setStreaming(false);
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const contextNote = includeContext && activeFile && activeFileContent
      ? `\n\n[Current file: ${activeFile}]\n\`\`\`\n${activeFileContent.slice(0, 3000)}\n\`\`\``
      : '';

    const userMsg = { role: 'user', content: text };
    const history = [...messages.filter(m => !m._streaming), userMsg];

    setMessages([...history, { role: 'assistant', content: '', _streaming: true }]);
    setInput('');
    setStreaming(true);
    streamBuf.current = '';

    const apiMessages = history.map(m => ({
      role: m.role,
      content: m.role === 'user' && m === userMsg && contextNote
        ? m.content + contextNote
        : m.content,
    }));

    const sent = ws.send({
      type: 'chat',
      payload: {
        messages: apiMessages,
        model: selectedModel,
        context: SYSTEM_PROMPT,
      },
    });

    if (!sent) {
      try {
        const res = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, model: selectedModel, context: SYSTEM_PROMPT }),
        });
        const data = await res.json();
        const content = data.content || 'No response';
        const actions = parseActions(content);
        if (actions.length > 0) {
          setActionStatus(prev => {
            const next = { ...prev };
            actions.forEach(a => { next[a.id] = 'pending'; });
            return next;
          });
        }
        setMessages(prev => [
          ...prev.filter(m => !m._streaming),
          { role: 'assistant', content, actions }
        ]);
      } catch (err) {
        setMessages(prev => [
          ...prev.filter(m => !m._streaming),
          { role: 'assistant', content: `Error: ${err.message}` }
        ]);
      }
      setStreaming(false);
    }
  }, [input, messages, streaming, ws, selectedModel, includeContext, activeFile, activeFileContent]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Execute an approved action
  const handleApprove = useCallback(async (action) => {
    setActionStatus(prev => ({ ...prev, [action.id]: 'running' }));
    try {
      const res = await fetch('/api/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: [
          action.type === 'create_file'
            ? { type: 'create_file', payload: { path: action.path, content: action.content } }
            : { type: 'run_command', payload: { command: action.command } }
        ]}),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (result?.ok === false) throw new Error(result.error || 'Failed');
      setActionStatus(prev => ({ ...prev, [action.id]: 'done' }));

      if (action.type === 'create_file') {
        onFileCreated?.(action.path, action.content);
      }
      if (action.type === 'run_command' && result?.stdout) {
        // Append command result as a system message
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**コマンド実行完了:** \`${action.command}\`\n\`\`\`\n${result.stdout}${result.stderr ? '\n' + result.stderr : ''}\`\`\``,
        }]);
      }
    } catch (err) {
      setActionStatus(prev => ({ ...prev, [action.id]: 'pending' })); // allow retry
      alert(`実行エラー: ${err.message}`);
    }
  }, [onFileCreated]);

  const handleReject = useCallback((action) => {
    setActionStatus(prev => ({ ...prev, [action.id]: 'rejected' }));
  }, []);

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: 'チャットをリセットしました。何でもお気軽に！' }]);
  };

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>AI Assistant</span>
        <div className={styles.controls}>
          <div className={styles.modelPicker} ref={modelDropdownRef}>
            <button
              className={styles.modelBtn}
              onClick={() => { setModelDropdownOpen(v => !v); setModelSearch(''); }}
              title="Select model"
            >
              <span className={styles.modelBtnLabel}>
                {selectedModel
                  ? (selectedModel.length > 22 ? '…' + selectedModel.slice(-20) : selectedModel)
                  : 'Select model'}
              </span>
              <span className={styles.modelBtnArrow}>{modelDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {modelDropdownOpen && (
              <div className={styles.modelDropdown}>
                <div className={styles.modelSearchWrap}>
                  <input
                    className={styles.modelSearchInput}
                    autoFocus
                    placeholder="Search models..."
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                  />
                </div>
                <div className={styles.modelList}>
                  {filteredModels.length === 0 && (
                    <div className={styles.modelEmpty}>No matches</div>
                  )}
                  {filteredModels.map(m => (
                    <button
                      key={m.id}
                      className={`${styles.modelOption} ${selectedModel === m.id ? styles.modelOptionActive : ''}`}
                      onClick={() => { onModelChange(m.id); setModelDropdownOpen(false); }}
                    >
                      {m.name || m.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className={styles.clearBtn} onClick={clearChat} title="Clear chat">↺</button>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} className={`${styles.message} ${styles[msg.role]}`}>
            <div className={styles.avatar}>
              {msg.role === 'user' ? '👤' : '◈'}
            </div>
            <div className={styles.bubble}>
              {msg.role === 'assistant' ? (
                <>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!inline && match) {
                          return (
                            <div className={styles.codeBlock}>
                              <div className={styles.codeHeader}>
                                <span className={styles.codeLang}>{match[1]}</span>
                                <button
                                  className={styles.insertBtn}
                                  onClick={() => onInsertCode?.(String(children).replace(/\n$/, ''))}
                                  title="Insert into editor"
                                >
                                  ← Insert
                                </button>
                              </div>
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{ margin: 0, borderRadius: '0 0 6px 6px', fontSize: '12px' }}
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            </div>
                          );
                        }
                        return <code className={styles.inlineCode} {...props}>{children}</code>;
                      },
                    }}
                  >
                    {stripActions(msg.content)}
                  </ReactMarkdown>
                  {msg._streaming && <span className={styles.cursor}>▋</span>}
                  {/* Action proposal cards */}
                  {msg.actions?.map(action => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      status={actionStatus[action.id] || 'pending'}
                      onApprove={handleApprove}
                      onReject={handleReject}
                    />
                  ))}
                </>
              ) : (
                <p className={styles.userText}>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Context toggle */}
      <div className={styles.contextBar}>
        <label className={styles.contextLabel}>
          <input
            type="checkbox"
            checked={includeContext}
            onChange={e => setIncludeContext(e.target.checked)}
          />
          <span>Include current file as context</span>
        </label>
        {activeFile && <span className={styles.contextFile}>{activeFile}</span>}
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI... (Enter to send, Shift+Enter for newline)"
          disabled={streaming}
          rows={3}
        />
        <button
          className={styles.sendBtn}
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
        >
          {streaming ? '⏳' : '↑ Send'}
        </button>
      </div>
    </div>
  );
}
