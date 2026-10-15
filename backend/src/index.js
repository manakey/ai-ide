import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chatRouter } from './routes/chat.js';
import { codeRouter } from './routes/code.js';
import { githubRouter } from './routes/github.js';
import { filesRouter } from './routes/files.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// API Routes
app.use('/api/chat', chatRouter);
app.use('/api/code', codeRouter);
app.use('/api/github', githubRouter);
app.use('/api/files', filesRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', aiProvider: process.env.AI_PROVIDER || 'ollama' });
});

// Serve built frontend
// In Docker: PUBLIC_DIR env var is set to /app/public
// Locally: falls back to relative path
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(__dirname, '..', '..', 'public');
console.log(`Looking for frontend at: ${PUBLIC_DIR}`);

if (existsSync(PUBLIC_DIR)) {
  console.log('Serving frontend from', PUBLIC_DIR);
  app.use(express.static(PUBLIC_DIR));
  // SPA fallback — all non-API routes → index.html
  app.get('*', (req, res) => {
    res.sendFile(join(PUBLIC_DIR, 'index.html'));
  });
} else {
  console.warn('Frontend build not found at', PUBLIC_DIR);
  app.get('/', (req, res) => {
    res.json({ status: 'API only mode — frontend not built', api: '/api/health' });
  });
}

// WebSocket for streaming AI responses
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', async (data) => {
    try {
      const { type, payload } = JSON.parse(data.toString());
      if (type === 'chat') {
        await streamChat(ws, payload);
      } else if (type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => console.log('WebSocket client disconnected'));
});

async function streamChat(ws, { messages, model, context }) {
  const provider = process.env.AI_PROVIDER || 'ollama';
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const openaiUrl = process.env.OPENAI_COMPATIBLE_URL || 'http://localhost:11434/v1';

  try {
    ws.send(JSON.stringify({ type: 'start' }));

    if (provider === 'ollama') {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || process.env.DEFAULT_MODEL || 'llama3.2',
          messages: context ? [{ role: 'system', content: context }, ...messages] : messages,
          stream: true,
        }),
      });
      if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n').filter(Boolean)) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) ws.send(JSON.stringify({ type: 'chunk', content: json.message.content }));
            if (json.done) ws.send(JSON.stringify({ type: 'done' }));
          } catch (_) {}
        }
      }
    } else {
      // OpenAI-compatible (Groq, OpenRouter, Together, LM Studio, etc.)
      const response = await fetch(`${openaiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'local'}`,
        },
        body: JSON.stringify({
          model: model || process.env.DEFAULT_MODEL || 'local-model',
          messages: context ? [{ role: 'system', content: context }, ...messages] : messages,
          stream: true,
        }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') { ws.send(JSON.stringify({ type: 'done' })); continue; }
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) ws.send(JSON.stringify({ type: 'chunk', content }));
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`AI IDE Backend running on port ${PORT}`);
  console.log(`AI Provider: ${process.env.AI_PROVIDER || 'ollama'}`);
});
