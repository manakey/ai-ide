import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import styles from './ChatPanel.module.css';

const SYSTEM_PROMPT = `You are an expert programming assistant embedded in an AI IDE.
Help users write, debug, and improve code.
When providing code, always specify the language in markdown fences.
Be concise but thorough. If asked to create a complete file, provide the full content.`;

export default function ChatPanel({ ws, selectedModel, onModelChange, activeFile, activeFileContent, onInsertCode }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'こんにちは！コードを書くお手伝いをします。何か作りたいものや質問はありますか？' }
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState([]);
  const [includeContext, setIncludeContext] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const streamBuf = useRef('');
  const listenerId = useId();

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
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && last._streaming) {
            next[next.length - 1] = { ...last, content: streamBuf.current };
          }
          return next;
        });
      } else if (data.type === 'done') {
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?._streaming) {
            next[next.length - 1] = { role: 'assistant', content: streamBuf.current };
          }
          return next;
        });
        streamBuf.current = '';
        setStreaming(false);
      } else if (data.type === 'error') {
        setMessages(prev => [
          ...prev.filter(m => !m._streaming),
          { role: 'assistant', content: `⚠️ Error: ${data.message}` }
        ]);
        streamBuf.current = '';
        setStreaming(false);
      }
    });
    return unsub;
  }, [ws, listenerId]);

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
      // Fallback to REST
      try {
        const res = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            model: selectedModel,
            context: SYSTEM_PROMPT,
          }),
        });
        const data = await res.json();
        setMessages(prev => [
          ...prev.filter(m => !m._streaming),
          { role: 'assistant', content: data.content || 'No response' }
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

  // Extract code blocks from a message for the "insert" button
  const extractCodeBlocks = (content) => {
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push({ lang: match[1] || '', code: match[2] });
    }
    return blocks;
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: 'チャットをリセットしました。何でもお気軽に！' }]);
  };

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>AI Assistant</span>
        <div className={styles.controls}>
          <select
            className={styles.modelSelect}
            value={selectedModel}
            onChange={e => onModelChange(e.target.value)}
          >
            {models.length === 0 && <option value="">Loading...</option>}
            {models.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
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
                    {msg.content}
                  </ReactMarkdown>
                  {msg._streaming && <span className={styles.cursor}>▋</span>}
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
