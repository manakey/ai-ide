import React, { useState, useEffect } from 'react';
import styles from './GitHubModal.module.css';

export default function GitHubModal({ token, onTokenChange, getAllFiles, onClose }) {
  const [tokenInput, setTokenInput] = useState(token);
  const [user, setUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [createNew, setCreateNew] = useState(false);
  const [branch, setBranch] = useState('main');
  const [commitMsg, setCommitMsg] = useState('Update from AI IDE');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [privateRepo, setPrivateRepo] = useState(false);

  useEffect(() => {
    if (token) verifyToken(token);
  }, []);

  async function verifyToken(t) {
    if (!t) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/github/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        onTokenChange(t);
        loadRepos(t);
      } else {
        setUser(null);
        setStatus({ type: 'error', message: 'Token invalid. Use a Personal Access Token with repo scope.' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
    setVerifying(false);
  }

  async function loadRepos(t) {
    try {
      const res = await fetch('/api/github/repos', {
        headers: { Authorization: `Bearer ${t || token}` },
      });
      const data = await res.json();
      setRepos(data);
      if (data.length > 0 && !selectedRepo) setSelectedRepo(data[0].fullName);
    } catch (_) {}
  }

  async function handlePush() {
    const activeToken = tokenInput || token;
    if (!activeToken) return setStatus({ type: 'error', message: 'GitHub token required.' });

    setLoading(true);
    setStatus(null);

    try {
      let repoFullName = selectedRepo;

      // Create new repo if needed
      if (createNew) {
        if (!newRepoName.trim()) return setStatus({ type: 'error', message: 'Enter a repo name.' });
        const res = await fetch('/api/github/repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
          body: JSON.stringify({ name: newRepoName.trim(), private: privateRepo }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create repo');
        repoFullName = data.fullName;
        setStatus({ type: 'info', message: `Created: ${data.htmlUrl}` });
      }

      const files = getAllFiles();
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({ repoFullName, files, message: commitMsg, branch }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Push failed');

      setStatus({
        type: 'success',
        message: data.pushed
          ? `✓ Pushed ${data.filesChanged} file(s) to ${repoFullName}/${branch}`
          : 'No changes to commit.'
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
    setLoading(false);
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Push to GitHub</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Token */}
          <section className={styles.section}>
            <label className={styles.label}>Personal Access Token</label>
            <div className={styles.tokenRow}>
              <input
                className={styles.input}
                type="password"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="ghp_..."
              />
              <button
                className={styles.verifyBtn}
                onClick={() => verifyToken(tokenInput)}
                disabled={verifying || !tokenInput}
              >
                {verifying ? '...' : 'Verify'}
              </button>
            </div>
            {user && (
              <div className={styles.userBadge}>
                <img src={user.avatar} alt="" className={styles.avatar} />
                <span>{user.name || user.login} (@{user.login})</span>
              </div>
            )}
            <p className={styles.hint}>
              Generate at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">github.com/settings/tokens</a> — requires <code>repo</code> scope.
            </p>
          </section>

          {user && (
            <>
              {/* Repo selection */}
              <section className={styles.section}>
                <label className={styles.label}>Repository</label>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={createNew}
                    onChange={e => setCreateNew(e.target.checked)}
                  />
                  Create new repository
                </label>

                {createNew ? (
                  <div className={styles.newRepoRow}>
                    <input
                      className={styles.input}
                      value={newRepoName}
                      onChange={e => setNewRepoName(e.target.value)}
                      placeholder="my-project"
                    />
                    <label className={styles.toggleLabel}>
                      <input type="checkbox" checked={privateRepo} onChange={e => setPrivateRepo(e.target.checked)} />
                      Private
                    </label>
                  </div>
                ) : (
                  <select
                    className={`${styles.input} ${styles.select}`}
                    value={selectedRepo}
                    onChange={e => setSelectedRepo(e.target.value)}
                  >
                    {repos.map(r => (
                      <option key={r.id} value={r.fullName}>{r.fullName} {r.private ? '🔒' : ''}</option>
                    ))}
                  </select>
                )}
              </section>

              {/* Branch & commit */}
              <section className={styles.section}>
                <label className={styles.label}>Branch</label>
                <input
                  className={styles.input}
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="main"
                />
              </section>

              <section className={styles.section}>
                <label className={styles.label}>Commit message</label>
                <input
                  className={styles.input}
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  placeholder="Update from AI IDE"
                />
              </section>

              {/* Files summary */}
              <section className={styles.section}>
                <label className={styles.label}>Files to push ({getAllFiles().length})</label>
                <div className={styles.filesList}>
                  {getAllFiles().map(f => <span key={f.path} className={styles.fileChip}>{f.path}</span>)}
                </div>
              </section>
            </>
          )}

          {/* Status */}
          {status && (
            <div className={`${styles.status} ${styles[status.type]}`}>
              {status.message}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          {user && (
            <button
              className={styles.pushBtn}
              onClick={handlePush}
              disabled={loading || (!selectedRepo && !newRepoName)}
            >
              {loading ? 'Pushing...' : '⬆ Push'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
