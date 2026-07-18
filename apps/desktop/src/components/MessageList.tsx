import { useEffect, useRef, useState, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MarkdownView } from './MarkdownView';
import { PlanCard } from './PlanCard';
import type { PlanEntry } from '../lib/acpClient';
import {
  isNoiseSystem,
  sanitizeText,
  summarizeError,
  toolKindLabel,
  toolTitle,
} from '../lib/chatFormat';
import { t } from '../lib/i18n';

export interface ChatLine {
  id: string;
  role: 'user' | 'assistant' | 'thought' | 'tool' | 'system' | 'plan';
  text: string;
  toolKey?: string;
  planEntries?: PlanEntry[];
  toolStatus?: string;
  toolKind?: string;
}

interface Props {
  lines: ChatLine[];
  bottomRef: RefObject<HTMLDivElement | null>;
  onTogglePlanEntry: (lineId: string, entryId: string) => void;
  onToggleAllPlan: (lineId: string, checked: boolean) => void;
}

function estimateSize(line: ChatLine): number {
  switch (line.role) {
    case 'thought':
      return 28;
    case 'tool':
      return 30;
    case 'system':
      return isNoiseSystem(line.text) ? 0 : 28;
    case 'plan':
      return 72 + (line.planEntries?.length ?? 0) * 26;
    case 'user': {
      const n = Math.min(8, Math.ceil((line.text?.length || 0) / 40) || 1);
      return 40 + n * 18;
    }
    case 'assistant':
    default: {
      const n = Math.min(60, Math.ceil((line.text?.length || 0) / 52) || 1);
      return 36 + n * 20;
    }
  }
}

function ThoughtBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const clean = sanitizeText(text);
  if (!clean) return null;
  return (
    <div className="tl-row tl-meta">
      <button type="button" className="tl-meta-btn" onClick={() => setOpen((v) => !v)}>
        <span className="tl-ico">💭</span>
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
  const title = toolTitle(text, toolKindLabel(kind), undefined);
  const detail = failed ? summarizeError(text) : sanitizeText(text);
  return (
    <div className={`tl-row tl-meta${failed ? ' fail' : ''}`}>
      <button type="button" className="tl-meta-btn" onClick={() => setOpen((v) => !v)}>
        <span className="tl-ico">{failed ? '⚠' : '⟳'}</span>
        <span className="tl-meta-text">
          {failed ? detail.slice(0, 100) : title.slice(0, 100)}
          {(failed ? detail : title).length > 100 ? '…' : ''}
        </span>
      </button>
      {open ? <pre className="tl-thought-body">{sanitizeText(text)}</pre> : null}
    </div>
  );
}

function SystemRow({ text }: { text: string }) {
  if (isNoiseSystem(text)) return null;
  const clean = sanitizeText(text);
  if (!clean) return null;
  const short = clean.length > 120 ? summarizeError(clean) : clean;
  // compact events like "上下文已自动压缩"
  return (
    <div className="tl-row tl-meta">
      <span className="tl-ico">◇</span>
      <span className="tl-meta-text">{short}</span>
    </div>
  );
}

function LineView({
  line,
  onTogglePlanEntry,
  onToggleAllPlan,
}: {
  line: ChatLine;
  onTogglePlanEntry: (lineId: string, entryId: string) => void;
  onToggleAllPlan: (lineId: string, checked: boolean) => void;
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
    return (
      <div className="tl-row tl-user">
        <div className="tl-user-pill">{sanitizeText(line.text)}</div>
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

export function MessageList({
  lines,
  bottomRef,
  onTogglePlanEntry,
  onToggleAllPlan,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const prevLen = useRef(lines.length);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => estimateSize(lines[i]),
    overscan: 12,
    getItemKey: (i) => lines[i]?.id ?? i,
  });

  useEffect(() => {
    const grew = lines.length > prevLen.current;
    prevLen.current = lines.length;
    if (!grew) return;
    if (stickBottom.current) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(lines.length - 1, { align: 'end' });
      });
    }
  }, [lines.length, virtualizer, lines]);

  useEffect(() => {
    stickBottom.current = true;
    if (lines.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(lines.length - 1, { align: 'end' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines[0]?.id]);

  const onScroll = () => {
    const el = parentRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  return (
    <div className="messages messages-virtual messages-codex" ref={parentRef} onScroll={onScroll}>
      <div
        className="messages-virtual-inner"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const line = lines[vi.index];
          if (!line) return null;
          if (line.role === 'system' && isNoiseSystem(line.text)) {
            return (
              <div
                key={line.id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                  height: 0,
                }}
              />
            );
          }
          return (
            <div
              key={line.id}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="msg-virtual-item"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <LineView
                line={line}
                onTogglePlanEntry={onTogglePlanEntry}
                onToggleAllPlan={onToggleAllPlan}
              />
            </div>
          );
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
