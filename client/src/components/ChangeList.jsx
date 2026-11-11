import { useMemo, useState } from 'react';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'breaking', label: 'Breaking' },
  { key: 'additive', label: 'Additive' },
  { key: 'cosmetic', label: 'Cosmetic' },
];

export default function ChangeList({ changes }) {
  const [filter, setFilter] = useState('all');

  const visible = useMemo(
    () => (filter === 'all' ? changes : changes.filter((change) => change.severity === filter)),
    [changes, filter],
  );

  const counts = useMemo(
    () =>
      changes.reduce(
        (acc, change) => ({ ...acc, [change.severity]: (acc[change.severity] ?? 0) + 1 }),
        { all: changes.length },
      ),
    [changes],
  );

  if (changes.length === 0) {
    return (
      <div className="empty">
        No changes found. The two documents are equivalent.
        <br />
        Try editing a property type or removing a required field to see a breaking change.
      </div>
    );
  }

  return (
    <>
      <div className="filters" role="group" aria-label="Filter changes by severity">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="chip"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            disabled={(counts[key] ?? 0) === 0 && key !== 'all'}
          >
            {label} {counts[key] ?? 0}
          </button>
        ))}
      </div>

      <div className="change-list">
        {visible.length === 0 ? (
          <div className="empty">Nothing at this severity level.</div>
        ) : (
          visible.map((change, index) => (
            <div className="change-row" key={`${change.rule}-${change.location}-${index}`}>
              <div className={`sev sev-${change.severity}`}>{change.severity}</div>
              <div>
                <div className="change-loc">{change.location}</div>
                <div className="change-msg">{change.message}</div>
                <div className="change-rule">{change.rule}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
