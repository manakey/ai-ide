import { spawn } from 'child_process';
import os from 'os';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const WORK_DIR = process.env.TERMINAL_WORK_DIR || join(os.homedir(), 'workspace');

if (!existsSync(WORK_DIR)) {
  mkdirSync(WORK_DIR, { recursive: true });
}

// Map of sessionId -> { shell, listeners }
const shells = new Map();

export function handleTerminalWS(ws, sessionId) {
  // Kill old shell for this session if any
  if (shells.has(sessionId)) {
    try { shells.get(sessionId).shell.kill(); } catch (_) {}
  }

  // Spawn bash/sh
  const shell = spawn(process.env.SHELL || '/bin/bash', [], {
    cwd: WORK_DIR,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      HOME: os.homedir(),
      WORK_DIR,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  shells.set(sessionId, { shell });

  shell.stdout.on('data', (data) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    }
  });

  shell.stderr.on('data', (data) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    }
  });

  shell.on('close', (code) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'exit', code }));
    }
    shells.delete(sessionId);
  });

  shell.on('error', (err) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  // Send initial prompt hint
  ws.send(JSON.stringify({ type: 'output', data: `\x1b[32mWorkspace: ${WORK_DIR}\x1b[0m\r\n` }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && shell.stdin.writable) {
        shell.stdin.write(msg.data);
      } else if (msg.type === 'resize') {
        // PTY resize not available without node-pty, ignore gracefully
      } else if (msg.type === 'kill') {
        shell.kill('SIGINT');
      }
    } catch (_) {
      // Raw input fallback
      if (shell.stdin.writable) shell.stdin.write(raw.toString());
    }
  });

  ws.on('close', () => {
    try { shell.kill(); } catch (_) {}
    shells.delete(sessionId);
  });
}

export function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', command], {
      cwd: cwd || WORK_DIR,
      env: { ...process.env, HOME: os.homedir() },
      timeout: 30000,
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => resolve({ stdout, stderr, exitCode: code }));
    proc.on('error', err => resolve({ stdout: '', stderr: err.message, exitCode: -1 }));
  });
}

export { WORK_DIR };
