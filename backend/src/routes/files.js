import { Router } from 'express';

export const filesRouter = Router();

// In-memory file store per session (for Railway ephemeral storage)
// In production, you'd want Redis or a DB
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      files: new Map([
        ['main.js', { content: '// Start coding here!\nconsole.log("Hello, World!");', language: 'javascript' }],
      ]),
      activeFile: 'main.js',
    });
  }
  return sessions.get(sessionId);
}

// Get all files
filesRouter.get('/', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  const session = getSession(sessionId);

  const files = Array.from(session.files.entries()).map(([name, data]) => ({
    name,
    language: data.language || detectLanguage(name),
    size: data.content?.length || 0,
  }));

  res.json({ files, activeFile: session.activeFile });
});

// Get file content
filesRouter.get('/:filename', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  const session = getSession(sessionId);
  const { filename } = req.params;

  const file = session.files.get(decodeURIComponent(filename));
  if (!file) return res.status(404).json({ error: 'File not found' });

  res.json({ name: filename, content: file.content, language: file.language || detectLanguage(filename) });
});

// Save/create file
filesRouter.post('/', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  const session = getSession(sessionId);
  const { name, content, language } = req.body;

  if (!name) return res.status(400).json({ error: 'Filename required' });

  session.files.set(name, {
    content: content || '',
    language: language || detectLanguage(name),
  });
  session.activeFile = name;

  res.json({ saved: true, name });
});

// Update file content
filesRouter.put('/:filename', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  const session = getSession(sessionId);
  const { filename } = req.params;
  const { content } = req.body;

  const existing = session.files.get(decodeURIComponent(filename));
  if (!existing) return res.status(404).json({ error: 'File not found' });

  existing.content = content;
  res.json({ saved: true });
});

// Delete file
filesRouter.delete('/:filename', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  const session = getSession(sessionId);
  const { filename } = req.params;

  session.files.delete(decodeURIComponent(filename));
  if (session.activeFile === filename) {
    session.activeFile = session.files.keys().next().value || null;
  }

  res.json({ deleted: true });
});

// Set active file
filesRouter.post('/active', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  const session = getSession(sessionId);
  session.activeFile = req.body.filename;
  res.json({ activeFile: session.activeFile });
});

// Batch get all files (for GitHub push)
filesRouter.get('/export/all', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  const session = getSession(sessionId);

  const files = Array.from(session.files.entries()).map(([name, data]) => ({
    path: name,
    content: data.content || '',
  }));

  res.json({ files });
});

function detectLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript', ts: 'typescript', py: 'python', rb: 'ruby',
    go: 'go', rs: 'rust', java: 'java', php: 'php', html: 'html',
    css: 'css', json: 'json', md: 'markdown', sh: 'bash', yml: 'yaml',
    yaml: 'yaml', toml: 'toml', sql: 'sql', c: 'c', cpp: 'cpp',
  };
  return map[ext] || 'plaintext';
}
