/** Lightweight markdown renderer (no heavy deps). Safe-ish for agent output. */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(raw: string): string {
  let s = escapeHtml(raw);
  // code
  s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  // bold / italic
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  // links [text](url)
  s = s.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a class="md-link" href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  return s;
}

function renderBlock(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let inList = false;
  let listTag = 'ul';

  const closeList = () => {
    if (inList) {
      out.push(`</${listTag}>`);
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.startsWith('```')) {
      closeList();
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip closing
      out.push(
        `<pre class="md-pre"><div class="md-pre-lang">${escapeHtml(lang || 'code')}</div><code>${escapeHtml(body.join('\n'))}</code></pre>`,
      );
      continue;
    }

    // headings
    const h = /^(#{1,4})\s+(.+)$/.exec(line);
    if (h) {
      closeList();
      const n = h[1].length;
      out.push(`<h${n} class="md-h">${inlineFormat(h[2])}</h${n}>`);
      i++;
      continue;
    }

    // hr
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeList();
      out.push('<hr class="md-hr" />');
      i++;
      continue;
    }

    // blockquote
    if (line.startsWith('> ')) {
      closeList();
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        q.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote class="md-quote">${inlineFormat(q.join(' '))}</blockquote>`);
      continue;
    }

    // lists
    const ul = /^[-*]\s+(.+)$/.exec(line);
    const ol = /^(\d+)\.\s+(.+)$/.exec(line);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (!inList || listTag !== tag) {
        closeList();
        listTag = tag;
        out.push(`<${tag} class="md-list">`);
        inList = true;
      }
      out.push(`<li>${inlineFormat((ul ? ul[1] : ol![2]) ?? '')}</li>`);
      i++;
      continue;
    }

    // blank
    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }

    // paragraph (merge consecutive)
    closeList();
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('> ') && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p class="md-p">${inlineFormat(para.join(' '))}</p>`);
  }
  closeList();
  return out.join('\n');
}

interface Props {
  text: string;
  className?: string;
}

export function MarkdownView({ text, className }: Props) {
  const html = renderBlock(text || '');
  return (
    <div
      className={`md-body ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
