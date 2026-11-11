export default function VerdictBar({ result }) {
  const { verdict, summary } = result;
  const level = verdict.level ?? 'none';
  const label =
    level === 'none' ? 'no change' : level === 'major' ? 'major bump' : level === 'minor' ? 'minor bump' : 'patch bump';

  return (
    <div className={`verdict verdict-${level}`}>
      <div className="verdict-badge">{label}</div>
      <div className="verdict-body">
        <strong>
          {level === 'none' ? 'Compatible: nothing to release' : `Suggested release: ${level}`}
          {verdict.next ? ` — ${verdict.current ?? ''} → ${verdict.next}` : ''}
        </strong>
        <span>{verdict.reason}</span>
      </div>
      <div className="counts">
        <div>
          <span>breaking</span>
          <b className="n-breaking">{summary.breaking}</b>
        </div>
        <div>
          <span>additive</span>
          <b className="n-additive">{summary.additive}</b>
        </div>
        <div>
          <span>cosmetic</span>
          <b className="n-cosmetic">{summary.cosmetic}</b>
        </div>
      </div>
    </div>
  );
}
