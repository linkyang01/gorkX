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

type DiagramDirection = 'TD' | 'LR';
type DiagramNode = { id: string; label: string };
type DiagramEdge = { from: string; to: string; label?: string };
type DiagramSpec = { direction: DiagramDirection; nodes: DiagramNode[]; edges: DiagramEdge[] };

/**
 * A deliberately small Mermaid-compatible flowchart reader. It understands
 * the common graph / flowchart TD and LR node-and-arrow syntax, but never
 * evaluates Mermaid, CSS, callbacks, links, or arbitrary SVG from the model.
 */
function parseDiagramNode(raw: string): DiagramNode | null {
  const match = /^\s*([A-Za-z][A-Za-z0-9_-]{0,31})(?:\s*(?:\[([^\]]{1,80})\]|\{([^}]{1,80})\}|\(([^)]{1,80})\)))?\s*$/.exec(raw);
  if (!match) return null;
  const label = (match[2] ?? match[3] ?? match[4] ?? match[1]).replace(/^['"]|['"]$/g, '').trim();
  return label ? { id: match[1], label } : null;
}

function parseMermaidFlowchart(raw: string): DiagramSpec | null {
  const lines = raw.replace(/\r\n/g, '\n').split(/\n|;/).map((line) => line.trim()).filter(Boolean);
  const header = /^(?:flowchart|graph)\s+(TD|TB|LR|RL)\b/i.exec(lines.shift() ?? '');
  if (!header || !lines.length || lines.length > 40) return null;
  const direction: DiagramDirection = /^(LR|RL)$/i.test(header[1]) ? 'LR' : 'TD';
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const addNode = (node: DiagramNode) => {
    const prior = nodes.get(node.id);
    if (!prior || prior.label === prior.id) nodes.set(node.id, node);
  };

  for (const line of lines) {
    // Styling, links, subgraphs, click handlers and other Mermaid directives
    // intentionally remain code: gorkX renders data only.
    if (/^(?:classDef|class\s|style\s|linkStyle|click\s|subgraph\b|end\b)/i.test(line)) return null;
    const edge = /^(.*?)\s*(?:-->|==>|-.->)\s*(?:\|([^|]{1,60})\|\s*)?(.*?)$/.exec(line);
    if (edge) {
      const from = parseDiagramNode(edge[1]);
      const to = parseDiagramNode(edge[3]);
      if (!from || !to) return null;
      addNode(from);
      addNode(to);
      edges.push({ from: from.id, to: to.id, label: edge[2]?.trim() || undefined });
      continue;
    }
    const node = parseDiagramNode(line);
    if (!node) return null;
    addNode(node);
  }
  if (!nodes.size || nodes.size > 12 || !edges.length || edges.length > 16) return null;
  return { direction, nodes: [...nodes.values()], edges };
}

function renderMermaidFlowchart(raw: string): string | null {
  const diagram = parseMermaidFlowchart(raw);
  if (!diagram) return null;
  let markerHash = 0;
  for (let index = 0; index < raw.length; index++) markerHash = (markerHash * 31 + raw.charCodeAt(index)) >>> 0;
  const markerId = `gorkx-arrow-${markerHash.toString(36)}`;
  const incoming = new Map(diagram.nodes.map((node) => [node.id, 0]));
  const rank = new Map(diagram.nodes.map((node) => [node.id, 0]));
  for (const edge of diagram.edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  const queue = diagram.nodes.filter((node) => !incoming.get(node.id)).map((node) => node.id);
  while (queue.length) {
    const from = queue.shift()!;
    for (const edge of diagram.edges.filter((item) => item.from === from)) {
      rank.set(edge.to, Math.max(rank.get(edge.to) ?? 0, (rank.get(from) ?? 0) + 1));
      const remaining = (incoming.get(edge.to) ?? 1) - 1;
      incoming.set(edge.to, remaining);
      if (!remaining) queue.push(edge.to);
    }
  }
  const groups = new Map<number, DiagramNode[]>();
  for (const node of diagram.nodes) (groups.get(rank.get(node.id) ?? 0) ?? groups.set(rank.get(node.id) ?? 0, []).get(rank.get(node.id) ?? 0)!).push(node);
  const levels = [...groups.keys()].sort((a, b) => a - b);
  const horizontal = diagram.direction === 'LR';
  const lane = horizontal ? 180 : 104;
  const cross = horizontal ? 96 : 170;
  const maxPerLevel = Math.max(...levels.map((level) => groups.get(level)!.length));
  const width = horizontal ? Math.max(520, 92 + levels.length * lane) : Math.max(520, 100 + maxPerLevel * cross);
  const height = horizontal ? Math.max(190, 74 + maxPerLevel * cross) : Math.max(190, 74 + levels.length * lane);
  const positions = new Map<string, { x: number; y: number }>();
  for (const level of levels) {
    const group = groups.get(level)!;
    group.forEach((node, index) => {
      const along = horizontal ? 56 + level * lane : 52 + index * cross + (maxPerLevel - group.length) * cross / 2;
      const across = horizontal ? 48 + index * cross + (maxPerLevel - group.length) * cross / 2 : 48 + level * lane;
      positions.set(node.id, horizontal ? { x: along, y: across } : { x: along, y: across });
    });
  }
  const nodeWidth = 132;
  const nodeHeight = 46;
  const edgeMarkup = diagram.edges.map((edge) => {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    const x1 = horizontal ? from.x + nodeWidth : from.x + nodeWidth / 2;
    const y1 = horizontal ? from.y + nodeHeight / 2 : from.y + nodeHeight;
    const x2 = horizontal ? to.x : to.x + nodeWidth / 2;
    const y2 = horizontal ? to.y + nodeHeight / 2 : to.y;
    const labelX = (x1 + x2) / 2;
    const labelY = (y1 + y2) / 2 - 5;
    return `<path d="M ${x1} ${y1} L ${x2} ${y2}" class="md-diagram-edge" marker-end="url(#${markerId})" />${edge.label ? `<text x="${labelX}" y="${labelY}" class="md-diagram-edge-label" text-anchor="middle">${escapeHtml(edge.label)}</text>` : ''}`;
  }).join('');
  const nodesMarkup = diagram.nodes.map((node) => {
    const pos = positions.get(node.id)!;
    const label = node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label;
    return `<g><rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}" rx="9" class="md-diagram-node" /><text x="${pos.x + nodeWidth / 2}" y="${pos.y + 28}" class="md-diagram-node-label" text-anchor="middle">${escapeHtml(label)}</text></g>`;
  }).join('');
  return `<figure class="md-diagram"><figcaption>流程图</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="流程图"><defs><marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="md-diagram-arrow" /></marker></defs>${edgeMarkup}${nodesMarkup}</svg></figure>`;
}

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

/**
 * Turn a compact two-column numeric comparison table into a chart without the
 * model having to know a special gorkX command. The original table remains
 * below it, so precision and units are never lost. Ambiguous tables stay text.
 */
function renderTableComparisonChart(headers: string[], rows: string[][]): string | null {
  if (headers.length !== 2 || rows.length < 2 || rows.length > 10) return null;
  const values = rows.map((row) => {
    const raw = row[1]?.trim() ?? '';
    // Accept displayed quantities such as 1,250 / 12.5% / ¥98. For any other
    // representation, preserve the table only rather than inventing data.
    const normalized = raw.replace(/[,$¥€£]/g, '').replace(/%$/, '').trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  });
  if (values.some((value) => value === null)) return null;
  const labels = rows.map((row) => row[0]?.replace(/[*`]/g, '').trim() ?? '');
  if (labels.some((label) => !label || label.length > 24)) return null;
  return renderChart(JSON.stringify({
    type: 'bar',
    title: `${headers[1]} · ${headers[0]}`,
    labels,
    datasets: [{ label: headers[1], values }],
  }));
}

function renderBlock(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let inList = false;
  let listTag = 'ul';
  let listClass = 'md-list';

  const closeList = () => {
      if (inList) {
        out.push(`</${listTag}>`);
        inList = false;
        listClass = 'md-list';
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
      if (lang === 'mermaid') {
        const diagram = renderMermaidFlowchart(body.join('\n'));
        if (diagram) {
          out.push(diagram);
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
      const comparisonChart = renderTableComparisonChart(headers, rows);
      if (comparisonChart) out.push(`<div class="md-auto-chart">${comparisonChart}</div>`);
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
      const itemText = (ul ? ul[1] : ol![2]) ?? '';
      const checklist = /^\[[ xX]\]\s+/.test(itemText);
      if (!inList || listTag !== tag) {
        closeList();
        listTag = tag;
        listClass = checklist ? 'md-list md-checklist' : tag === 'ol' ? 'md-list md-steps' : 'md-list';
        out.push(`<${tag} class="${listClass}">`);
        inList = true;
      }
      const done = /^\[[xX]\]\s+/.exec(itemText);
      const open = /^\[ \]\s+/.exec(itemText);
      if (done || open) {
        const content = itemText.slice((done ?? open)![0].length);
        out.push(`<li class="md-check-item${done ? ' done' : ''}"><span class="md-check-mark" aria-hidden="true">${done ? '✓' : ''}</span><span>${inlineFormat(content)}</span></li>`);
      } else {
        out.push(`<li class="${listTag === 'ol' ? 'md-step-item' : ''}">${inlineFormat(itemText)}</li>`);
      }
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
