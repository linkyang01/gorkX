/**
 * A small, non-command presentation contract for ordinary user turns.
 *
 * The agent still decides what is useful and owns its reasoning/tool loop.
 * This only tells it about native gorkX result surfaces so a comparison or a
 * decision does not need a user to know any special syntax.
 */
const PRESENTATION_GUIDE = `

---

gorkX 会把回答直接呈现为可阅读的桌面结果。请按内容需要选择合适形式：
- 比较、方案、责任分工或多项数据，优先用清晰的 Markdown 表格；不要为了排版编造数字或事实。
- 有步骤时使用短标题和编号步骤；代码、命令和原始材料保持代码块，不要强行做成图表。
- 当确实需要用户在 2–6 个互斥的下一步之间选择时，在正文结尾提供一个 choices 代码块，每行一项，例如：
\`\`\`choices
- 方案 A：先做小范围试点
- 方案 B：直接全面上线
\`\`\`
  只有在选择能推进任务时才这样做；普通解释、清单和开放式问题不要使用 choices。
- 数值对比表会由桌面端自动可视化；不必解释这些渲染约定，也不要要求用户输入斜杠命令。
- 当流程、依赖或分支关系比文字更清楚时，可以在正文后提供一个简短的 \`mermaid\` 代码块，只使用 \`flowchart TD\` 或 \`flowchart LR\`、节点和箭头；保持节点与边标签简短，不使用样式、链接、点击事件或子图。
- 当 3 项以上的直接数值数据确实适合趋势或柱状比较时，可以提供一个 \`chart\` 代码块，内容为 JSON：\`{"type":"bar" 或 "line","labels":[...],"datasets":[{"label":"…","values":[...]}]}\`。数值、单位或比较口径不明确时，保留表格，不要猜测或强行画图。
`;

/** Add the desktop presentation contract without changing the user's visible message. */
export function withConversationPresentation(prompt: string): string {
  const text = prompt.trim();
  return text ? `${text}${PRESENTATION_GUIDE}` : text;
}
