import { Router } from 'express';

export const chatRouter = Router();

// List available models
chatRouter.get('/models', async (req, res) => {
  const provider = process.env.AI_PROVIDER || 'ollama';
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const openaiUrl = process.env.OPENAI_COMPATIBLE_URL || 'http://localhost:11434/v1';

  try {
    if (provider === 'ollama') {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Failed to fetch Ollama models');
      const data = await response.json();
      const models = (data.models || []).map(m => ({
        id: m.name,
        name: m.name,
        size: m.size,
      }));
      res.json({ models, provider: 'ollama' });
    } else {
      const response = await fetch(`${openaiUrl}/models`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'local'}` },
      });
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const models = (data.data || []).map(m => ({ id: m.id, name: m.id }));
      res.json({ models, provider });
    }
  } catch (err) {
    // Return fallback
    res.json({
      models: [{ id: process.env.DEFAULT_MODEL || 'llama3.2', name: process.env.DEFAULT_MODEL || 'llama3.2' }],
      provider,
      error: err.message,
    });
  }
});

// One-shot chat (non-streaming fallback)
chatRouter.post('/send', async (req, res) => {
  const { messages, model, context } = req.body;
  const provider = process.env.AI_PROVIDER || 'ollama';
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const openaiUrl = process.env.OPENAI_COMPATIBLE_URL || 'http://localhost:11434/v1';

  try {
    if (provider === 'ollama') {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || process.env.DEFAULT_MODEL || 'llama3.2',
          messages: context
            ? [{ role: 'system', content: context }, ...messages]
            : messages,
          stream: false,
        }),
      });
      const data = await response.json();
      res.json({ content: data.message?.content || '', model: data.model });
    } else {
      const response = await fetch(`${openaiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'local'}`,
        },
        body: JSON.stringify({
          model: model || process.env.DEFAULT_MODEL || 'local-model',
          messages: context
            ? [{ role: 'system', content: context }, ...messages]
            : messages,
          stream: false,
        }),
      });
      const data = await response.json();
      res.json({ content: data.choices?.[0]?.message?.content || '', model: data.model });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
