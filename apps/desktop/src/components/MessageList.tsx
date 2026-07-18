import { useEffect, useRef, useState, type RefObject } from 'react';
import { MarkdownView } from './MarkdownView';
import { PlanCard } from './PlanCard';
import { AttachmentStrip } from './AttachmentStrip';
import type { PlanEntry } from '../lib/acpClient';
import type { ComposerAttachment } from '../lib/attachments';
import {
  isNoiseSystem,
  sanitizeText,
  summarizeError,
  toolKindLabel,
} from '../lib/chatFormat';
import { humanToolTitle } from '../lib/toolHuman';
import { t } from '../lib/i18n';
import { IconThought, IconTool, IconSystem, IconWarning } from './UiIcons';

export interface ChatLine {
  id: string;
  role: 'user' | 'assistant' | 'thought' | 'tool' | 'system' | 'plan';
  text: string;
  toolKey?: string;
  planEntries?: PlanEntry[];
  toolStatus?: string;
  toolKind?: string;
  attachments?: ComposerAttachment[];
}

interface Props {
  lines: ChatLine[];
  bottomRef: RefObject<HTMLDivElement | null>;
  onTogglePlanEntry: (lineId: string, entryId: string) => void;
  onToggleAllPlan: (lineId: string, checked: boolean) => void;
  onOpenAttachment?: (a: ComposerAttachment) => void;
  /** When false, hide thought/tool/system in main chat (use Process panel instead). */
  showProcessInChat?: boolean;
}

function ThoughtBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const clean = sanitizeText(text);
  if (!clean) return null;
  return (
    <div className="tl-row tl-meta">
      <button type="button" className="tl-meta-btn" onClick={() => setOpen((v) => !v)}>
        <span className="tl-ico">
          <IconThought size={14} />
        </span>
        <span>{t('thinking')}</span>
        <span className="tl-meta-hint">{open ? t('thinkingCollapse') : t('thinkingHint')}</span>
      </button>
      {open ? <pre className="tl-thought-body">{clean}</pre> : null}
    </div>
  );
}

function ToolRow({ text, status, kind }: { text: string; status?: string; kind?: string }) {
  const [open, setOpen] = useState(false);
  const st = (status || '').toLowerCase();
  const failed = /fail|error/.test(st);
  // Prefer human Chinese title (never show raw call- ids as primary)
  const title = humanToolTitle(text, kind || toolKindLabel(kind));
  const detail = failed ? summarizeError(text) : title;
  const showBody = sanitizeText(text);
  const bodyIsUseful =
    showBody &&
    !/^call-[0-9a-f-]+/i.test(showBody) &&
    showBody !== title;
  return (
    <div className={`tl-row tl-meta${failed ? ' fail' : ''}`}>
      <button type="button" className="tl-meta-btn" onClick={() => setOpen((v) => !v)}>
        <span className="tl-ico">
          {failed ? <IconWarning size={14} /> : <IconTool size={14} />}
        </span>
        <span className="tl-meta-text">
          {detail.slice(0, 100)}
          {detail.length > 100 ? '…' : ''}
        </span>
      </button>
      {open && bodyIsUseful ? <pre className="tl-thought-body">{showBody}</pre> : null}
    </div>
  );
}

function SystemRow({ text }: { text: string }) {
  if (isNoiseSystem(text)) return null;
  const clean = sanitizeText(text);
  if (!clean) return null;
  const short = clean.length > 120 ? summarizeError(clean) : clean;
  return (
    <div className="tl-row tl-meta">
      <span className="tl-ico">
        <IconSystem size={14} />
      </span>
      <span className="tl-meta-text">{short}</span>
    </div>
  );
}

function LineView({
  line,
  onTogglePlanEntry,
  onToggleAllPlan,
  onOpenAttachment,
}: {
  line: ChatLine;
  onTogglePlanEntry: (lineId: string, entryId: string) => void;
  onToggleAllPlan: (lineId: string, checked: boolean) => void;
  onOpenAttachment?: (a: ComposerAttachment) => void;
}) {
  if (line.role === 'plan' && line.planEntries && line.planEntries.length > 0) {
    return (
      <div className="tl-row tl-assistant">
        <PlanCard
          entries={line.planEntries}
          onToggle={(entryId) => onTogglePlanEntry(line.id, entryId)}
          onToggleAll={(checked) => onToggleAllPlan(line.id, checked)}
        />
      </div>
    );
  }
  if (line.role === 'thought') return <ThoughtBlock text={line.text} />;
  if (line.role === 'tool') {
    return <ToolRow text={line.text} status={line.toolStatus} kind={line.toolKind} />;
  }
  if (line.role === 'user') {
    const text = sanitizeText(line.text);
    const atts = line.attachments || [];
    return (
      <div className="tl-row tl-user">
        <div className="tl-user-stack">
          {atts.length && onOpenAttachment ? (
            <AttachmentStrip items={atts} onOpen={onOpenAttachment} compact />
          ) : null}
          {text ? <div className="tl-user-pill">{text}</div> : null}
        </div>
      </div>
    );
  }
  if (line.role === 'system') return <SystemRow text={line.text} />;
  const body = sanitizeText(line.text);
  if (!body) return null;
  return (
    <div className="tl-row tl-assistant">
      <div className="tl-assistant-body">
        <MarkdownView text={body} />
      </div>
    </div>
  );
}

/**
 * Simple document timeline (no virtual list).
 * Virtualization caused overlapping long markdown after image/tool turns.
 */
export function MessageList({
  lines,
  bottomRef,
  onTogglePlanEntry,
  onToggleAllPlan,
  onOpenAttachment,
  showProcessInChat = false,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const prevLen = useRef(lines.length);
  const prevLastId = useRef(lines[lines.length - 1]?.id);
  const visible = showProcessInChat
    ? lines
    : lines.filter(
        (l) => l.role === 'user' || l.role === 'assistant' || l.role === 'plan',
      );

  const onScroll = () => {
    const el = parentRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const grew = visible.length > prevLen.current;
    const lastId = visible[visible.length - 1]?.id;
    const lastChanged = lastId !== prevLastId.current;
    prevLen.current = visible.length;
    prevLastId.current = lastId;
    if ((grew || lastChanged) && stickBottom.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [visible]);

  useEffect(() => {
    stickBottom.current = true;
    const el = parentRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [visible[0]?.id]);

  return (
    <div
      className="messages messages-codex messages-flow"
      ref={parentRef}
      onScroll={onScroll}
    >
      <div className="messages-flow-inner">
        {visible.map((line) => {
          if (line.role === 'system' && isNoiseSystem(line.text)) return null;
          return (
            <div key={line.id} className="msg-flow-item">
              <LineView
                line={line}
                onTogglePlanEntry={onTogglePlanEntry}
                onToggleAllPlan={onToggleAllPlan}
                onOpenAttachment={onOpenAttachment}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
