export default function SpecEditor({ label, tag, value, onChange, error, placeholder }) {
  const lines = value ? value.split('\n').length : 0;

  return (
    <div className="panel editor">
      <div className="editor-head">
        <span>{label}</span>
        <span className="tag">{tag}</span>
      </div>
      <textarea
        aria-label={`${label} OpenAPI document`}
        className={error ? 'is-invalid' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck="false"
        rows={14}
      />
      <div className="editor-foot">
        <span>{lines} lines</span>
        {error ? <span className="err">{error}</span> : <span>JSON or YAML</span>}
      </div>
    </div>
  );
}
