function inline(text) {
  // Escape first, then apply the small subset of markdown we emit ourselves.
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/**
 * Minimal Markdown renderer for the exact output of diff-core's renderChangelog:
 * h2/h3 headings, bullet lists, and a trailing <sub> line. Not a general parser.
 */
export default function Changelog({ markdown }) {
  const lines = markdown.split('\n');
  const blocks = [];
  let list = null;

  const flush = () => {
    if (list) {
      blocks.push({ type: 'list', items: list });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith('### ')) {
      flush();
      blocks.push({ type: 'h3', text: line.slice(4) });
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h2', text: line.slice(3) });
    } else if (line.startsWith('- ')) {
      if (!list) list = [];
      list.push(line.slice(2));
    } else if (line.startsWith('<sub>')) {
      flush();
      blocks.push({ type: 'sub', text: line.replace(/<\/?sub>/g, '') });
    } else {
      flush();
      blocks.push({ type: 'p', text: line });
    }
  }
  flush();

  return (
    <div className="changelog-render">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'h2') return <h2 key={key}>{block.text}</h2>;
        if (block.type === 'h3') return <h3 key={key}>{block.text}</h3>;
        if (block.type === 'sub')
          return (
            <p key={key} className="changelog-sub">
              {block.text}
            </p>
          );
        if (block.type === 'list')
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} dangerouslySetInnerHTML={{ __html: inline(item) }} />
              ))}
            </ul>
          );
        return <p key={key} dangerouslySetInnerHTML={{ __html: inline(block.text) }} />;
      })}
    </div>
  );
}
