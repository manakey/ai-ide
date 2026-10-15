import { Router } from 'express';
import simpleGit from 'simple-git';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

export const githubRouter = Router();

const REPOS_DIR = process.env.REPOS_DIR || join(os.tmpdir(), 'ai-ide-repos');

if (!existsSync(REPOS_DIR)) {
  mkdirSync(REPOS_DIR, { recursive: true });
}

// Verify GitHub token
githubRouter.post('/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'AI-IDE/1.0',
      },
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await response.json();
    res.json({ login: user.login, name: user.name, avatar: user.avatar_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List user repos
githubRouter.get('/repos', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const response = await fetch('https://api.github.com/user/repos?per_page=50&sort=updated', {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'AI-IDE/1.0',
      },
    });

    const repos = await response.json();
    res.json(repos.map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      url: r.clone_url,
      defaultBranch: r.default_branch,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new repo
githubRouter.post('/repos', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { name, description, private: isPrivate } = req.body;

  if (!token) return res.status(401).json({ error: 'Token required' });
  if (!name) return res.status(400).json({ error: 'Repo name required' });

  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AI-IDE/1.0',
      },
      body: JSON.stringify({ name, description, private: isPrivate || false, auto_init: true }),
    });

    const repo = await response.json();
    if (!response.ok) return res.status(400).json({ error: repo.message });

    res.json({ name: repo.name, fullName: repo.full_name, url: repo.clone_url, htmlUrl: repo.html_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push files to repo
githubRouter.post('/push', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { repoFullName, files, message, branch } = req.body;

  if (!token) return res.status(401).json({ error: 'Token required' });
  if (!repoFullName || !files) return res.status(400).json({ error: 'Missing required fields' });

  const repoDir = join(REPOS_DIR, repoFullName.replace('/', '_'));

  try {
    // Clone or pull repo
    const cloneUrl = `https://${token}@github.com/${repoFullName}.git`;

    let git;
    if (existsSync(join(repoDir, '.git'))) {
      git = simpleGit(repoDir);
      await git.pull('origin', branch || 'main').catch(() => {});
    } else {
      mkdirSync(repoDir, { recursive: true });
      git = simpleGit();
      await git.clone(cloneUrl, repoDir);
      git = simpleGit(repoDir);
    }

    // Configure git
    await git.addConfig('user.email', 'ai-ide@example.com');
    await git.addConfig('user.name', 'AI IDE');

    // Write files
    for (const { path, content } of files) {
      const filePath = join(repoDir, path);
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dir !== repoDir) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, content, 'utf8');
    }

    // Stage, commit, push
    await git.add('.');
    const status = await git.status();

    if (status.files.length === 0) {
      return res.json({ message: 'No changes to commit', pushed: false });
    }

    await git.commit(message || 'Update from AI IDE');

    const targetBranch = branch || 'main';
    await git.push('origin', targetBranch);

    res.json({ pushed: true, branch: targetBranch, filesChanged: status.files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get branches
githubRouter.get('/branches/:owner/:repo', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { owner, repo } = req.params;

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'AI-IDE/1.0',
      },
    });

    const branches = await response.json();
    res.json(branches.map(b => b.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
