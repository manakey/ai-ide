import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const SESSION_ID = uuidv4();

const API = '/api/files';
const headers = () => ({
  'Content-Type': 'application/json',
  'x-session-id': SESSION_ID,
});

export function useFiles() {
  const [files, setFiles] = useState(new Map([
    ['main.js', { content: '// Start coding here!\nconsole.log("Hello, World!");', language: 'javascript' }],
  ]));
  const [activeFile, setActiveFile] = useState('main.js');

  const updateFile = useCallback((name, content) => {
    setFiles(prev => {
      const next = new Map(prev);
      const existing = next.get(name) || {};
      next.set(name, { ...existing, content });
      return next;
    });
    // Persist to backend (fire-and-forget)
    fetch(`${API}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content }),
    }).catch(() => {});
  }, []);

  const createFile = useCallback((name) => {
    const language = detectLanguage(name);
    const defaultContent = getDefaultContent(name, language);
    setFiles(prev => {
      const next = new Map(prev);
      next.set(name, { content: defaultContent, language });
      return next;
    });
    setActiveFile(name);
    fetch(API, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name, content: defaultContent, language }),
    }).catch(() => {});
  }, []);

  const deleteFile = useCallback((name) => {
    setFiles(prev => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
    setActiveFile(prev => {
      if (prev === name) {
        const remaining = [...files.keys()].filter(k => k !== name);
        return remaining[0] || null;
      }
      return prev;
    });
    fetch(`${API}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: headers(),
    }).catch(() => {});
  }, [files]);

  const renameFile = useCallback((oldName, newName) => {
    setFiles(prev => {
      const next = new Map(prev);
      const file = next.get(oldName);
      if (file) {
        next.delete(oldName);
        next.set(newName, { ...file, language: detectLanguage(newName) });
      }
      return next;
    });
    if (activeFile === oldName) setActiveFile(newName);
  }, [activeFile]);

  const getAllFilesForExport = useCallback(() => {
    return Array.from(files.entries()).map(([path, data]) => ({
      path,
      content: data.content || '',
    }));
  }, [files]);

  return {
    files,
    activeFile,
    setActiveFile,
    updateFile,
    createFile,
    deleteFile,
    renameFile,
    getAllFilesForExport,
  };
}

function detectLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    php: 'php', html: 'html', css: 'css', json: 'json', md: 'markdown',
    sh: 'bash', yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql',
    c: 'c', cpp: 'cpp', cs: 'csharp', swift: 'swift', kt: 'kotlin',
  };
  return map[ext] || 'plaintext';
}

function getDefaultContent(filename, language) {
  const defaults = {
    javascript: '// ' + filename + '\n\nconsole.log("Hello!");\n',
    typescript: '// ' + filename + '\n\nconst greeting: string = "Hello!";\nconsole.log(greeting);\n',
    python: '# ' + filename + '\n\nprint("Hello!")\n',
    html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n  <h1>Hello!</h1>\n</body>\n</html>\n',
    css: '/* ' + filename + ' */\n\nbody {\n  margin: 0;\n  padding: 0;\n}\n',
    json: '{\n  \n}\n',
    markdown: '# ' + filename.replace(/\.md$/, '') + '\n\n',
  };
  return defaults[language] || '';
}
