import { Router } from 'express';
import { execSync, exec } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

export const codeRouter = Router();

const TIMEOUT_MS = 15000;
const SANDBOX_DIR = process.env.SANDBOX_DIR || join(os.tmpdir(), 'ai-ide-sandbox');

if (!existsSync(SANDBOX_DIR)) {
  mkdirSync(SANDBOX_DIR, { recursive: true });
}

// Run code in a sandbox
codeRouter.post('/run', async (req, res) => {
  const { code, language, stdin } = req.body;

  if (!code) return res.status(400).json({ error: 'No code provided' });

  const runId = uuidv4();
  const workDir = join(SANDBOX_DIR, runId);
  mkdirSync(workDir, { recursive: true });

  try {
    const result = await runCode({ code, language: language || 'javascript', stdin, workDir });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
  }
});

// List available languages
codeRouter.get('/languages', (req, res) => {
  const langs = [];

  const checks = [
    { lang: 'javascript', cmd: 'node --version' },
    { lang: 'python', cmd: 'python3 --version' },
    { lang: 'bash', cmd: 'bash --version' },
    { lang: 'typescript', cmd: 'npx --yes ts-node --version' },
    { lang: 'ruby', cmd: 'ruby --version' },
    { lang: 'go', cmd: 'go version' },
    { lang: 'rust', cmd: 'rustc --version' },
    { lang: 'java', cmd: 'java --version' },
    { lang: 'php', cmd: 'php --version' },
  ];

  for (const { lang, cmd } of checks) {
    try {
      execSync(cmd, { stdio: 'ignore', timeout: 2000 });
      langs.push(lang);
    } catch (_) {}
  }

  res.json({ languages: langs });
});

async function runCode({ code, language, stdin, workDir }) {
  return new Promise((resolve) => {
    let filename, command;

    switch (language) {
      case 'javascript':
      case 'js':
        filename = join(workDir, 'main.js');
        writeFileSync(filename, code);
        command = `node "${filename}"`;
        break;

      case 'typescript':
      case 'ts':
        filename = join(workDir, 'main.ts');
        writeFileSync(filename, code);
        command = `npx --yes tsx "${filename}"`;
        break;

      case 'python':
      case 'python3':
      case 'py':
        filename = join(workDir, 'main.py');
        writeFileSync(filename, code);
        command = `python3 "${filename}"`;
        break;

      case 'bash':
      case 'sh':
        filename = join(workDir, 'main.sh');
        writeFileSync(filename, code);
        command = `bash "${filename}"`;
        break;

      case 'ruby':
      case 'rb':
        filename = join(workDir, 'main.rb');
        writeFileSync(filename, code);
        command = `ruby "${filename}"`;
        break;

      case 'go':
        filename = join(workDir, 'main.go');
        writeFileSync(filename, code);
        command = `cd "${workDir}" && go run main.go`;
        break;

      case 'rust':
        filename = join(workDir, 'main.rs');
        writeFileSync(filename, code);
        command = `cd "${workDir}" && rustc main.rs -o main 2>&1 && ./main`;
        break;

      case 'php':
        filename = join(workDir, 'main.php');
        writeFileSync(filename, code);
        command = `php "${filename}"`;
        break;

      case 'html':
        // Return the HTML for preview
        return resolve({ output: '', html: code, language: 'html' });

      default:
        filename = join(workDir, 'main.js');
        writeFileSync(filename, code);
        command = `node "${filename}"`;
    }

    const startTime = Date.now();

    const child = exec(command, {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 512,
      env: {
        ...process.env,
        PATH: process.env.PATH,
        HOME: workDir,
        TMPDIR: workDir,
      },
    });

    let stdout = '';
    let stderr = '';

    if (stdin && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }

    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        output: stdout,
        error: stderr,
        exitCode: code,
        duration,
        language,
      });
    });

    child.on('error', (err) => {
      resolve({ output: '', error: err.message, exitCode: -1, duration: 0, language });
    });
  });
}
