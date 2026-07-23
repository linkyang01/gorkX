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

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index];
  const divider = lines[index + 1];
  return Boolean(header?.includes('|') && divider?.includes('|') && isTableDivider(divider));
}

type ChartSpec = {
  type: 'bar' | 'line';
  title?: string;
  labels: string[];
  datasets: Array<{ label?: string; values: number[] }>;
};

const chartColors = ['#5e5ce6', '#0a7aff', '#34c759', '#ff9f0a'];

/**
 * A deliberately tiny, data-only chart dialect for agent answers. It accepts
 * no HTML, URLs, scripts, or arbitrary SVG — only numeric series inside a
 * `chart` fence — so rendering an answer never gives the model code execution.
 */
function parseChart(raw: string): ChartSpec | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const type = value.type;
    const labels = value.labels;
    const datasets = value.datasets;
    if ((type !== 'bar' && type !== 'line') || !Array.isArray(labels) || !Array.isArray(datasets)) return null;
    if (!labels.length || labels.length > 16 || !datasets.length || datasets.length > 4) return null;
    const parsedLabels = labels.map(String).map((label) => label.slice(0, 24));
    const parsedDatasets = datasets.map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      if (!Array.isArray(row.values) || row.values.length !== parsedLabels.length) return null;
      const values = row.values.map(Number);
      if (values.some((n) => !Number.isFinite(n))) return null;
      return { label: typeof row.label === 'string' ? row.label.slice(0, 40) : '', values };
    });
    if (parsedDatasets.some((item) => item === null)) return null;
    return {
      type,
      title: typeof value.title === 'string' ? value.title.slice(0, 80) : undefined,
      labels: parsedLabels,
      datasets: parsedDatasets as ChartSpec['datasets'],
    };
  } catch {
    return null;
  }
}

function renderChart(raw: string): string | null {
  const chart = parseChart(raw);
  if (!chart) return null;
  const width = 640;
  const height = 278;
  const left = 42;
  const right = 18;
  const top = 28;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = chart.datasets.flatMap((dataset) => dataset.values);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const y = (value: number) => top + ((max - value) / span) * plotHeight;
  const zeroY = y(0);
  const step = plotWidth / chart.labels.length;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = max - span * ratio;
    const cy = top + plotHeight * ratio;
    return `<line x1="${left}" y1="${cy}" x2="${width - right}" y2="${cy}" class="md-chart-grid" /><text x="${left - 7}" y="${cy + 4}" class="md-chart-axis" text-anchor="end">${escapeHtml(Number(value.toFixed(2)).toString())}</text>`;
  }).join('');
  const labels = chart.labels.map((label, index) => {
    const x = left + step * (index + 0.5);
    return `<text x="${x}" y="${height - 17}" class="md-chart-axis" text-anchor="middle">${escapeHtml(label)}</text>`;
  }).join('');
  const series = chart.type === 'bar'
    ? chart.datasets.map((dataset, seriesIndex) => dataset.values.map((value, index) => {
        const groupWidth = Math.min(step * 0.72, 44);
        const barWidth = groupWidth / chart.datasets.length;
        const x = left + step * index + (step - groupWidth) / 2 + seriesIndex * barWidth;
        const valueY = y(value);
        const rectY = Math.min(zeroY, valueY);
        const rectHeight = Math.max(1, Math.abs(zeroY - valueY));
        return `<rect x="${x}" y="${rectY}" width="${Math.max(2, barWidth - 2)}" height="${rectHeight}" rx="3" fill="${chartColors[seriesIndex]}" />`;
      }).join('')).join('')
    : chart.datasets.map((dataset, seriesIndex) => {
        const points = dataset.values.map((value, index) => `${left + step * (index + 0.5)},${y(value)}`).join(' ');
        const dots = dataset.values.map((value, index) => `<circle cx="${left + step * (index + 0.5)}" cy="${y(value)}" r="3.5" fill="${chartColors[seriesIndex]}" />`).join('');
        return `<polyline points="${points}" fill="none" stroke="${chartColors[seriesIndex]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />${dots}`;
      }).join('');
  const legend = chart.datasets.map((dataset, index) => dataset.label
    ? `<span><i style="background:${chartColors[index]}"></i>${escapeHtml(dataset.label)}</span>`
    : '').filter(Boolean).join('');
  return `<figure class="md-chart"><figcaption>${escapeHtml(chart.title || '数据图表')}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title || '数据图表')}">${grid}<line x1="${left}" y1="${zeroY}" x2="${width - right}" y2="${zeroY}" class="md-chart-zero" />${series}${labels}</svg>${legend ? `<div class="md-chart-legend">${legend}</div>` : ''}</figure>`;
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
      if (lang === 'chart' || lang === 'gorkx-chart') {
        const chart = renderChart(body.join('\n'));
        if (chart) {
          out.push(chart);
          continue;
        }
      }
      out.push(
        `<pre class="md-pre"><div class="md-pre-lang">${escapeHtml(lang || 'code')}</div><code>${escapeHtml(body.join('\n'))}</code></pre>`,
      );
      continue;
    }

    // GFM pipe table. Tables are rendered only when a delimiter row follows,
    // so ordinary prose containing a pipe remains ordinary prose.
    if (isTableStart(lines, i)) {
      closeList();
      const headers = tableCells(line);
      i += 2; // header + delimiter
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const row = tableCells(lines[i]);
        if (row.length !== headers.length) break;
        rows.push(row);
        i++;
      }
      out.push(
        `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headers.map((cell) => `<th>${inlineFormat(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineFormat(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
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
    while (i < lines.length && lines[i].trim() && !isTableStart(lines, i) && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('> ') && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])) {
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
