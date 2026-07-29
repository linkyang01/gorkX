import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { MarkdownView } from './MarkdownView';
import { extractResponseChoices, ResponseChoices } from './ResponseChoices';
import { PlanCard } from './PlanCard';
import { WorkflowCard } from './WorkflowCard';
import { KernelScheduleCard } from './KernelScheduleCard';
import { AttachmentStrip } from './AttachmentStrip';
import type { KernelScheduledTaskUpdate, PlanEntry, WorkflowRunUpdate } from '../lib/acpClient';
import type { ComposerAttachment } from '../lib/attachments';
import {
  isInjectedUserPromptEcho,
  isNoiseSystem,
  sanitizeText,
  summarizeError,
  toolKindLabel,
  visibleUserPrompt,
} from '../lib/chatFormat';
import { humanToolTitle } from '../lib/toolHuman';
import { t } from '../lib/i18n';
import { IconThought, IconTool, IconSystem, IconWarning } from './UiIcons';

export interface ChatLine {
  id: string;
  role: 'user' | 'assistant' | 'thought' | 'tool' | 'system' | 'plan' | 'workflow' | 'scheduled';
  text: string;
  toolKey?: string;
  /** Native parent task id when Grok Build reports nested subagent work. */
  parentSubagentId?: string;
  planEntries?: PlanEntry[];
  toolStatus?: string;
  toolKind?: string;
  attachments?: ComposerAttachment[];
  /** Live workflow projection; restored snapshots retain the plain summary. */
  workflow?: WorkflowRunUpdate;
  /** Live scheduler projection; restored snapshots retain plain text only. */
  scheduledTask?: KernelScheduledTaskUpdate;
  /** Local receive time; absent for snapshots created before timestamp support. */
  at?: number;
}

interface Props {
  lines: ChatLine[];
  bottomRef: RefObject<HTMLDivElement | null>;
  onTogglePlanEntry: (lineId: string, entryId: string) => void;
  onToggleAllPlan: (lineId: string, checked: boolean) => void;
  onOpenAttachment?: (a: ComposerAttachment) => void;
  /** When false, hide thought/tool/system in main chat (use Process panel instead). */
  showProcessInChat?: boolean;
  /** Explicit user click on a model-provided quick-reply option. */
  onSelectChoice?: (value: string) => void;
  choiceDisabled?: boolean;
  /** Native, current-session action requested by the kernel. */
  footer?: ReactNode;
  /** Server-suggested next questions from the current Grok Build response. */
  followUps?: string[];
  onWorkflowAction?: (workflow: WorkflowRunUpdate, action: 'pause' | 'resume') => void;
  workflowActionDisabled?: boolean;
  onScheduledTaskDelete?: (task: KernelScheduledTaskUpdate) => void;
  scheduledTaskDeleteDisabled?: boolean;
  /** Explicit click copies only the rendered assistant text to the local clipboard. */
  onCopyAssistant?: (text: string) => void | Promise<void>;
  /** Display only locally-recorded times; missing historical values stay hidden. */
  showTimestamps?: boolean;
}

function formatLineTime(at?: number): string | null {
  if (!at || !Number.isFinite(at)) return null;
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

function ThoughtBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const clean = sanitizeText(text);
  if (!clean) return null;
  return (
    <div className="tl-row tl-meta tl-tool" data-layer="tool">
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
    <div className={`tl-row tl-meta tl-tool${failed ? ' fail' : ''}`} data-layer="tool">
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
    <div className="tl-row tl-meta tl-decision" data-layer="decision">
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
  onSelectChoice,
  choiceDisabled,
  onWorkflowAction,
  workflowActionDisabled,
  onScheduledTaskDelete,
  scheduledTaskDeleteDisabled,
  onCopyAssistant,
  showTimestamps = false,
}: {
  line: ChatLine;
  onTogglePlanEntry: (lineId: string, entryId: string) => void;
  onToggleAllPlan: (lineId: string, checked: boolean) => void;
  onOpenAttachment?: (a: ComposerAttachment) => void;
  onSelectChoice?: (value: string) => void;
  choiceDisabled?: boolean;
  onWorkflowAction?: (workflow: WorkflowRunUpdate, action: 'pause' | 'resume') => void;
  workflowActionDisabled?: boolean;
  onScheduledTaskDelete?: (task: KernelScheduledTaskUpdate) => void;
  scheduledTaskDeleteDisabled?: boolean;
  onCopyAssistant?: (text: string) => void | Promise<void>;
  showTimestamps?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (line.role === 'plan' && line.planEntries && line.planEntries.length > 0) {
    return (
      <div className="tl-row tl-plan" data-layer="plan">
        <PlanCard
          entries={line.planEntries}
          onToggle={(entryId) => onTogglePlanEntry(line.id, entryId)}
          onToggleAll={(checked) => onToggleAllPlan(line.id, checked)}
        />
      </div>
    );
  }
  if (line.role === 'workflow') {
    return (
      <div className="tl-row tl-result" data-layer="result">
        <WorkflowCard
          workflow={line.workflow}
          fallback={line.text}
          onAction={line.workflow ? (action) => onWorkflowAction?.(line.workflow!, action) : undefined}
          actionDisabled={workflowActionDisabled}
        />
      </div>
    );
  }
  if (line.role === 'scheduled') {
    return (
      <div className="tl-row tl-result" data-layer="result">
        <KernelScheduleCard
          task={line.scheduledTask}
          onDelete={line.scheduledTask ? onScheduledTaskDelete : undefined}
          deleteDisabled={scheduledTaskDeleteDisabled}
        />
      </div>
    );
  }
  if (line.role === 'thought') return <ThoughtBlock text={line.text} />;
  if (line.role === 'tool') {
    return <ToolRow text={line.text} status={line.toolStatus} kind={line.toolKind} />;
  }
  if (line.role === 'user') {
    // Also clean an already-mounted historical task; snapshot cleanup covers
    // reloads, this path covers a task that stayed open across an upgrade.
    const text = visibleUserPrompt(line.text);
    const atts = line.attachments || [];
    return (
      <div className="tl-row tl-user" data-layer="message">
        <div className="tl-user-stack">
          {atts.length && onOpenAttachment ? (
            <AttachmentStrip items={atts} onOpen={onOpenAttachment} compact />
          ) : null}
          {text ? <div className="tl-user-pill">{text}</div> : null}
          {showTimestamps && formatLineTime(line.at) ? <span className="msg-time">{formatLineTime(line.at)}</span> : null}
        </div>
      </div>
    );
  }
  if (line.role === 'system') return <SystemRow text={line.text} />;
  // A legacy ACP restore can expose the engine-only first-turn envelope as
  // assistant text. Hide it even for a task that remained mounted across an
  // application upgrade; restored snapshots are cleaned separately.
  if (line.role === 'assistant' && isInjectedUserPromptEcho(line.text)) return null;
  const body = sanitizeText(line.text);
  const attachments = line.attachments || [];
  if (!body && !attachments.length) return null;
  const response = extractResponseChoices(body);
  return (
    <div className="tl-row tl-assistant tl-result" data-layer="result">
      <div className="tl-assistant-body">
        {attachments.length && onOpenAttachment ? (
          <AttachmentStrip items={attachments} onOpen={onOpenAttachment} variant="gallery" />
        ) : null}
        {response.text ? <MarkdownView text={response.text} /> : null}
        <ResponseChoices choices={response.choices} onSelect={onSelectChoice} disabled={choiceDisabled} />
        {response.text && onCopyAssistant ? (
          <button
            type="button"
            className="msg-copy-response"
            onClick={() => {
              void Promise.resolve(onCopyAssistant(response.text)).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }).catch(() => setCopied(false));
            }}
          >
            {copied ? t('copyDone') : t('copyResponse')}
          </button>
        ) : null}
        {showTimestamps && formatLineTime(line.at) ? <span className="msg-time">{formatLineTime(line.at)}</span> : null}
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
  onSelectChoice,
  choiceDisabled = false,
  footer,
  followUps = [],
  onWorkflowAction,
  workflowActionDisabled = false,
  onScheduledTaskDelete,
  scheduledTaskDeleteDisabled = false,
  onCopyAssistant,
  showTimestamps = false,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const prevLen = useRef(lines.length);
  const prevLastId = useRef(lines[lines.length - 1]?.id);
  const visible = showProcessInChat
    ? lines
    : lines.filter(
        (l) => l.role === 'user' || l.role === 'assistant' || l.role === 'plan' || l.role === 'workflow' || l.role === 'scheduled',
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
                onSelectChoice={onSelectChoice}
                choiceDisabled={choiceDisabled}
                onWorkflowAction={onWorkflowAction}
                workflowActionDisabled={workflowActionDisabled}
                onScheduledTaskDelete={onScheduledTaskDelete}
                scheduledTaskDeleteDisabled={scheduledTaskDeleteDisabled}
                onCopyAssistant={onCopyAssistant}
                showTimestamps={showTimestamps}
              />
            </div>
          );
        })}
        {footer}
        {followUps.length ? (
          <div className="msg-flow-item">
            <ResponseChoices
              choices={followUps.map((value) => ({ label: value, value }))}
              onSelect={onSelectChoice}
              disabled={choiceDisabled}
            />
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
