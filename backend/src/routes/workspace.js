/**
 * workspace.js — file/folder CRUD in WORK_DIR + auto-run server.js
 */
import { Router } from 'express';
import {
  existsSync, mkdirSync, writeFileSync, readFileSync,
  renameSync, rmSync, readdirSync, statSync,
} from 'fs';
import { join, dirname, basename, relative } from 'path';
import os from 'os';
import { spawn } from 'child_process';

export const workspaceRouter = Router();

export const WORK_DIR = process.env.TERMINAL_WORK_DIR || join(os.homedir(), 'workspace');

// ensure workspace exists
if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true });

// server.js がなければデフォルトを作成
const DEFAULT_SERVER_JS = `// Auto-generated server.js — edit freely!
import express from 'express';
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static('public'));

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from your AI IDE server!', time: new Date().toISOString() });
});

app.listen(PORT, () => console.log(\`Server running at http://localhost:\${PORT}\`));
`;

const defaultServerPath = join(WORK_DIR, 'server.js');
if (!existsSync(defaultServerPath)) {
  try { writeFileSync(defaultServerPath, DEFAULT_SERVER_JS, 'utf8'); } catch(_) {}
}

// ── auto-server: runs node server.js when found ──────────
let autoServer = null;
let autoServerLog = [];

export function tryStartAutoServer() {
  const serverPath = join(WORK_DIR, 'server.js');
  if (!existsSync(serverPath)) return;
  if (autoServer) return; // already running

  console.log('[auto-server] Starting', serverPath);
  autoServer = spawn('node', [serverPath], {
    cwd: WORK_DIR,
    env: { ...process.env, PORT: process.env.USER_SERVER_PORT || '4000' },
  });
  autoServer.stdout.on('data', d => {
    autoServerLog.push({ t: Date.now(), s: 'out', m: d.toString().slice(0, 200) });
    if (autoServerLog.length > 100) autoServerLog.shift();
  });
  autoServer.stderr.on('data', d => {
    autoServerLog.push({ t: Date.now(), s: 'err', m: d.toString().slice(0, 200) });
    if (autoServerLog.length > 100) autoServerLog.shift();
  });
  autoServer.on('close', () => { autoServer = null; });
  autoServer.on('error', () => { autoServer = null; });
}

export function stopAutoServer() {
  if (autoServer) { try { autoServer.kill(); } catch(_) {} autoServer = null; }
}

workspaceRouter.get('/autoserver', (req, res) => {
  res.json({
    running: !!autoServer,
    log: autoServerLog.slice(-30),
    serverFile: existsSync(join(WORK_DIR, 'server.js')),
  });
});

workspaceRouter.post('/autoserver/restart', (req, res) => {
  stopAutoServer();
  tryStartAutoServer();
  res.json({ started: !!autoServer });
});

// ── file tree ────────────────────────────────────────────
function buildTree(dir, depth = 0) {
  if (depth > 8) return [];
  const entries = [];
  try {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue;
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        entries.push({ type: 'dir', name, path: relative(WORK_DIR, abs), children: buildTree(abs, depth+1) });
      } else {
        entries.push({ type: 'file', name, path: relative(WORK_DIR, abs), size: st.size });
      }
    }
  } catch(_) {}
  return entries;
}

workspaceRouter.get('/tree', (req, res) => {
  res.json({ tree: buildTree(WORK_DIR), workDir: WORK_DIR });
});

// ── read file ────────────────────────────────────────────
workspaceRouter.get('/file', (req, res) => {
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: 'path required' });
  const abs = join(WORK_DIR, rel);
  if (!abs.startsWith(WORK_DIR)) return res.status(403).json({ error: 'Forbidden' });
  if (!existsSync(abs)) return res.status(404).json({ error: 'Not found' });
  try {
    const content = readFileSync(abs, 'utf8');
    res.json({ path: rel, content });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── write / create file ──────────────────────────────────
workspaceRouter.post('/file', (req, res) => {
  const { path: rel, content = '' } = req.body;
  if (!rel) return res.status(400).json({ error: 'path required' });
  const abs = join(WORK_DIR, rel);
  if (!abs.startsWith(WORK_DIR)) return res.status(403).json({ error: 'Forbidden' });
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    // If server.js just got written, (re)start auto server
    if (basename(rel) === 'server.js') { stopAutoServer(); tryStartAutoServer(); }
    res.json({ ok: true, path: rel });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── create folder ────────────────────────────────────────
workspaceRouter.post('/folder', (req, res) => {
  const { path: rel } = req.body;
  if (!rel) return res.status(400).json({ error: 'path required' });
  const abs = join(WORK_DIR, rel);
  if (!abs.startsWith(WORK_DIR)) return res.status(403).json({ error: 'Forbidden' });
  try {
    mkdirSync(abs, { recursive: true });
    res.json({ ok: true, path: rel });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── rename / move ────────────────────────────────────────
workspaceRouter.post('/move', (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const absFrom = join(WORK_DIR, from);
  const absTo   = join(WORK_DIR, to);
  if (!absFrom.startsWith(WORK_DIR) || !absTo.startsWith(WORK_DIR))
    return res.status(403).json({ error: 'Forbidden' });
  try {
    mkdirSync(dirname(absTo), { recursive: true });
    renameSync(absFrom, absTo);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── delete ───────────────────────────────────────────────
workspaceRouter.delete('/file', (req, res) => {
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: 'path required' });
  const abs = join(WORK_DIR, rel);
  if (!abs.startsWith(WORK_DIR)) return res.status(403).json({ error: 'Forbidden' });
  try {
    rmSync(abs, { recursive: true, force: true });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
