import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './Terminal.module.css';

function ansiToHtml(text) {
  const colorMap = {
    30:'#4a5070',31:'#f75959',32:'#3dd68c',33:'#f7c948',
    34:'#4f8ef7',35:'#c8a4f0',36:'#5bc3eb',37:'#e2e6f0',
    90:'#6a7090',91:'#ff7070',92:'#5ef0a0',93:'#ffd060',
    94:'#70a8ff',95:'#d8b4ff',96:'#7bd3f0',97:'#ffffff',
  };
  let result = '', i = 0, inSpan = false;
  const close = () => { if (inSpan) { result += '</span>'; inSpan = false; } };
  while (i < text.length) {
    if (text[i] === '\x1b' && text[i+1] === '[') {
      const end = text.indexOf('m', i+2);
      if (end !== -1) {
        const codes = text.slice(i+2, end).split(';').map(Number);
        close();
        if (codes[0] !== 0) {
          const fg = codes.find(c => (c>=30&&c<=37)||(c>=90&&c<=97));
          if (fg) { result += `<span style="color:${colorMap[fg]};${codes.includes(1)?'font-weight:600':''}">`;  inSpan = true; }
        }
        i = end+1; continue;
      }
    }
    const ch = text[i];
    result += ch==='<'?'&lt;':ch==='>'?'&gt;':ch==='&'?'&amp;':ch;
    i++;
  }
  close();
  return result;
}

function getTheme() { return document.documentElement.getAttribute('data-theme') || 'dark'; }

export default function Terminal({ sessionId, height, onHeightChange, runCmdRef }) {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [theme, setTheme] = useState(getTheme);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(getTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?mode=terminal&session=${sessionId}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'output') {
          const parts = msg.data.split(/(\r\n|\r|\n)/);
          setLines(prev => {
            let next = [...prev];
            for (const part of parts) {
              if (part==='\r\n'||part==='\n'||part==='\r') next.push('');
              else if (part) { if (!next.length) next.push(''); next[next.length-1] += part; }
            }
            if (next.length > 2000) next = next.slice(-2000);
            return next;
          });
        } else if (msg.type === 'exit') {
          setLines(prev => [...prev, `\x1b[33m[Process exited: ${msg.code}]\x1b[0m`]);
          setConnected(false);
        }
      } catch(_) {}
    };
  }, [sessionId]);

  useEffect(() => { connect(); return () => wsRef.current?.close(); }, [connect]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'auto' }); }, [lines]);

  // Expose run-in-terminal to parent via ref
  useEffect(() => {
    if (runCmdRef) runCmdRef.current = (cmd) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\n' }));
      }
    };
  }, [runCmdRef]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: 'input', data }));
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = input;
      send(cmd + '\n');
      if (cmd.trim()) setHistory(prev => [cmd, ...prev.slice(0, 99)]);
      setInput(''); setHistIdx(-1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdx+1, history.length-1);
      setHistIdx(next); setInput(history[next]||'');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(histIdx-1, -1);
      setHistIdx(next); setInput(next===-1?'':history[next]||'');
    } else if (e.key==='c' && e.ctrlKey) {
      e.preventDefault(); wsRef.current?.send(JSON.stringify({ type: 'kill' }));
    } else if (e.key==='l' && e.ctrlKey) {
      e.preventDefault(); setLines([]);
    }
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY, startH = height;
    const onMove = (ev) => onHeightChange(Math.max(80, Math.min(600, startH-(ev.clientY-startY))));
    const onUp = () => { window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height, onHeightChange]);

  const isLight = theme === 'light';

  return (
    <div className={styles.terminal} style={{ height, background:'#0d1117', borderTop:`2px solid ${isLight?'#c8cce0':'#1e2335'}` }}>
      <div className={styles.dragHandle} onMouseDown={handleDrag} />
      <div className={styles.header} style={{ background: isLight?'#1a1e2e':'#161b22', borderBottom:`1px solid ${isLight?'#2a2e48':'#30363d'}` }}>
        <span className={styles.title}>Terminal</span>
        <span className={`${styles.dot} ${connected?styles.connected:styles.disconnected}`} />
        <span className={styles.hint}>{connected ? 'bash' : 'reconnecting...'}</span>
        <div className={styles.spacer} />
        <button className={styles.clearBtn} onClick={() => setLines([])}>⌫ Clear</button>
        {!connected && <button className={styles.clearBtn} onClick={connect}>↺ Reconnect</button>}
      </div>
      <div className={styles.output} onClick={() => inputRef.current?.focus()}>
        {lines.map((line, i) => (
          <div key={i} className={styles.line} dangerouslySetInnerHTML={{ __html: ansiToHtml(line)||'&nbsp;' }} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className={styles.inputRow}>
        <span className={styles.prompt}>$</span>
        <input
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          disabled={!connected}
          placeholder={connected ? '' : 'Connecting...'}
        />
      </div>
    </div>
  );
}
