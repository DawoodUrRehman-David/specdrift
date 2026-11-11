import { useCallback, useEffect, useMemo, useState } from 'react';
import SpecEditor from './components/SpecEditor.jsx';
import ChangeList from './components/ChangeList.jsx';
import VerdictBar from './components/VerdictBar.jsx';
import Changelog from './components/Changelog.jsx';
import { getReport, listReports, postDiff, saveReport } from './lib/api.js';
import { localDiff } from './lib/local-engine.js';
import { sampleAfter, sampleBefore } from './lib/samples.js';

const STORAGE_KEY = 'specdrift:last-run';

function slugFromPath() {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]{6,24})$/);
  return match ? match[1] : null;
}

export default function App() {
  const [before, setBefore] = useState(sampleBefore);
  const [after, setAfter] = useState(sampleAfter);
  const [fromVersion, setFromVersion] = useState('1.4.0');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [share, setShare] = useState(null);
  const [copied, setCopied] = useState(null);
  const [fileError, setFileError] = useState({ before: null, after: null });
  const [recent, setRecent] = useState([]);

  const loadRecent = useCallback(async () => {
    try {
      const data = await listReports(5);
      setRecent(data.items ?? []);
    } catch {
      setRecent([]);
    }
  }, []);

  const runDiff = useCallback(
    async (payload) => {
      setStatus('running');
      setError(null);
      setShare(null);
      setCopied(null);
      const request = payload ?? { before, after, fromVersion: fromVersion || undefined };
      try {
        // Prefer the API (it persists and can share); fall back to the in-tab engine
        // so the static demo still works with no backend.
        const data = await postDiff(request).catch((apiError) => {
          if (apiError.code === 'network_error' || apiError.code === 'timeout') return localDiff(request);
          throw apiError;
        });
        setResult(data);
        setStatus('done');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ fromVersion }));
      } catch (apiError) {
        setError({ message: apiError.message, code: apiError.code, details: apiError.details });
        setStatus('error');
        setResult(null);
      }
    },
    [before, after, fromVersion],
  );

  // Deep link: /r/:slug loads a stored report straight into the viewer.
  useEffect(() => {
    const slug = slugFromPath();
    if (slug) {
      setStatus('running');
      getReport(slug)
        .then((report) => {
          setResult({ ...report, meta: report.meta });
          setStatus('done');
        })
        .catch((apiError) => {
          setError({ message: apiError.message, code: apiError.code });
          setStatus('error');
        });
    } else {
      runDiff();
    }
    loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onShare = async () => {
    setError(null);
    try {
      const data = await saveReport({ before, after, fromVersion: fromVersion || undefined });
      const url = `${window.location.origin}/r/${data.slug}`;
      setShare({ slug: data.slug, url });
      loadRecent();
      navigator.clipboard?.writeText(url).then(
        () => setCopied('link'),
        () => {},
      );
    } catch (apiError) {
      setError({ message: apiError.message, code: apiError.code });
    }
  };

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 1800);
      },
      () => setCopied(null),
    );
  };

  const onFile = async (which, file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setFileError((prev) => ({ ...prev, [which]: 'File is larger than 4 MB.' }));
      return;
    }
    const text = await file.text();
    setFileError((prev) => ({ ...prev, [which]: null }));
    if (which === 'before') setBefore(text);
    else setAfter(text);
  };

  const busy = status === 'running';

  const headerMeta = useMemo(() => {
    if (!result) return null;
    return {
      paths: result.meta?.pathsCompared ?? 0,
      version: result.meta?.afterVersion ?? '—',
      openapi: result.meta?.openapi ?? '3.x',
    };
  }, [result]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⇄</span>
          specdrift
        </div>
        <nav className="topbar-links">
          <a href="https://github.com/DawoodUrRehman-David/specdrift" target="_blank" rel="noreferrer">
            github
          </a>
          <span className="cli-hint">cli: npx specdrift</span>
        </nav>
      </header>

      <section className="hero">
        <div>
          <h1>
            Catch the <em>breaking</em> change
            <br />
            before your users do.
          </h1>
          <p>
            Paste two OpenAPI documents. SpecDrift classifies every change as breaking, additive or cosmetic, tells
            you which semver bump the release needs, and writes the changelog your reviewers will actually read.
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span>rules covered</span>
            <strong>38</strong>
          </div>
          <div className="hero-stat">
            <span>runtime deps</span>
            <strong>0</strong>
          </div>
          <div className="hero-stat">
            <span>input</span>
            <strong>JSON / YAML</strong>
          </div>
          <div className="hero-stat">
            <span>output</span>
            <strong>JSON + markdown</strong>
          </div>
        </div>
      </section>

      <div className="editors">
        <SpecEditor
          label="Before"
          tag="current contract"
          value={before}
          onChange={setBefore}
          error={fileError.before}
        />
        <SpecEditor
          label="After"
          tag="proposed contract"
          value={after}
          onChange={setAfter}
          error={fileError.after}
        />
      </div>

      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={() => runDiff()} disabled={busy}>
          {busy ? 'Comparing…' : 'Compare specs'}
        </button>
        <label className="btn btn-ghost">
          Load before file
          <input
            type="file"
            accept=".json,.yaml,.yml,application/json,text/yaml"
            hidden
            onChange={(event) => onFile('before', event.target.files?.[0])}
          />
        </label>
        <label className="btn btn-ghost">
          Load after file
          <input
            type="file"
            accept=".json,.yaml,.yml,application/json,text/yaml"
            hidden
            onChange={(event) => onFile('after', event.target.files?.[0])}
          />
        </label>
        <input
          className="btn btn-ghost"
          style={{ width: 150, fontFamily: 'var(--mono)' }}
          value={fromVersion}
          onChange={(event) => setFromVersion(event.target.value)}
          aria-label="Current released version"
          placeholder="1.4.0"
        />
        <span className="spacer" />
        <button
          className="btn"
          type="button"
          onClick={onShare}
          disabled={busy || Boolean(slugFromPath()) || result?.local === true}
          title={result?.local ? 'Share links need the API with MongoDB — run it locally to enable' : undefined}
        >
          Save &amp; share link
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            setBefore(sampleBefore);
            setAfter(sampleAfter);
            setFromVersion('1.4.0');
            setError(null);
          }}
        >
          Reset samples
        </button>
      </div>

      {share ? (
        <div className="alert" style={{ borderColor: 'rgba(61,220,151,.4)', background: 'rgba(61,220,151,.08)', color: '#9ff0cd' }}>
          <div>
            <div className="alert-title">Share link ready{copied === 'link' ? ' — copied to clipboard' : ''}</div>
            <a href={share.url} style={{ color: '#3ddc97', fontFamily: 'var(--mono)', fontSize: 12.5 }}>
              {share.url}
            </a>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="alert" role="alert">
          <div>
            <div className="alert-title">{error.code === 'invalid_spec' ? 'That document could not be parsed' : 'Something went wrong'}</div>
            {error.message}
            {error.details?.issues?.length ? (
              <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                {error.details.issues.map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    {issue.path}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {busy && !result ? (
        <div>
          <div className="skeleton" />
          <div className="skeleton" style={{ width: '82%' }} />
          <div className="skeleton" style={{ width: '64%' }} />
        </div>
      ) : null}

      {result ? (
        <section aria-live="polite">
          <VerdictBar result={result} />
          {headerMeta ? (
            <p className="hint" style={{ margin: '0 0 6px' }}>
              {headerMeta.paths} paths compared · API version {headerMeta.version} · OpenAPI {headerMeta.openapi}
            </p>
          ) : null}
          <ChangeList changes={result.changes} />

          <div className="changelog">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="section-title">Paste-ready changelog</p>
              <button className="btn btn-ghost" type="button" onClick={() => copy(result.changelog, 'changelog')}>
                {copied === 'changelog' ? 'Copied' : 'Copy markdown'}
              </button>
            </div>
            <div className="panel" style={{ padding: '6px 18px 16px' }}>
              <Changelog markdown={result.changelog} />
            </div>
          </div>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section style={{ marginTop: 30 }}>
          <p className="section-title">Recent reports</p>
          <div className="change-list">
            {recent.map((report) => (
              <div className="change-row" key={report.slug} style={{ gridTemplateColumns: '92px 1fr auto' }}>
                <div className={`sev sev-${report.verdict?.level === 'major' ? 'breaking' : report.verdict?.level === 'minor' ? 'additive' : 'cosmetic'}`}>
                  {report.verdict?.level ?? 'none'}
                </div>
                <div>
                  <div className="change-loc">{report.title}</div>
                  <div className="change-msg">
                    {report.summary?.breaking ?? 0} breaking · {report.summary?.additive ?? 0} additive ·{' '}
                    {report.summary?.cosmetic ?? 0} cosmetic
                  </div>
                </div>
                <a className="btn btn-ghost" href={`/r/${report.slug}`}>
                  open
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="footer">
        <span>
          SpecDrift · MIT · <code>npm i -D @specdrift/diff-core</code>
        </span>
        <span>built for APIs that outlive their docs</span>
      </footer>
    </div>
  );
}
