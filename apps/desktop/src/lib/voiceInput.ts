/**
 * Voice → text via Web Speech API (macOS WKWebView / Safari path).
 * Preflights microphone via getUserMedia so TCC can show a real prompt.
 *
 * Requires NSMicrophoneUsageDescription + NSSpeechRecognitionUsageDescription
 * embedded in the app Info.plist (rebuild Rust after changing Info.plist).
 */

export type VoiceInputCallbacks = {
  /** Called with full draft text to display (base + interim/final). */
  onDraft: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  onError: (message: string) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isVoiceInputSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function preferredVoiceLang(): string {
  try {
    const forced = localStorage.getItem('gorkx.locale');
    if (forced === 'zh') return 'zh-CN';
    if (forced === 'en') return 'en-US';
  } catch {
    /* */
  }
  const nav = (navigator.language || 'zh-CN').toLowerCase();
  if (nav.startsWith('zh')) return 'zh-CN';
  if (nav.startsWith('en')) return 'en-US';
  return navigator.language || 'zh-CN';
}

/**
 * Session controller: one recognition at a time.
 * `baseText` is draft content when recording starts; finals accumulate on it.
 */
export class VoiceInputSession {
  private rec: SpeechRecognitionLike | null = null;
  private micStream: MediaStream | null = null;
  private baseText = '';
  private finals = '';
  private intentionalStop = false;
  private listening = false;
  private startGen = 0;

  constructor(private cb: VoiceInputCallbacks) {}

  isListening(): boolean {
    return this.listening;
  }

  /** Start (or no-op if already listening). Pass current composer draft. */
  start(currentDraft: string): void {
    if (this.listening) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.cb.onError('unsupported');
      return;
    }

    this.intentionalStop = false;
    this.baseText = currentDraft.trimEnd();
    this.finals = '';
    const gen = ++this.startGen;
    void this.startAsync(Ctor, gen);
  }

  private async startAsync(Ctor: SpeechRecognitionCtor, gen: number): Promise<void> {
    // Microphone preflight — without NSMicrophoneUsageDescription, macOS
    // denies immediately (no prompt). With it, the system dialog appears here.
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.cb.onError('no-mediadevices');
        return;
      }
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.cb.onError('not-allowed');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this.cb.onError('no-device');
      } else {
        this.cb.onError(name || 'mic-failed');
      }
      this.releaseMic();
      return;
    }

    if (gen !== this.startGen || this.intentionalStop) {
      this.releaseMic();
      return;
    }

    const rec = new Ctor();
    rec.lang = preferredVoiceLang();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.listening = true;
      this.cb.onListeningChange(true);
    };

    rec.onresult = (ev) => {
      let interim = '';
      let newFinal = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const row = ev.results[i];
        const piece = row[0]?.transcript ?? '';
        if (row.isFinal) newFinal += piece;
        else interim += piece;
      }
      if (newFinal) {
        this.finals = joinVoice(this.finals, newFinal);
      }
      const body = joinVoice(this.baseText, joinVoice(this.finals, interim));
      this.cb.onDraft(body);
    };

    rec.onerror = (ev) => {
      const code = ev.error || 'error';
      if (code === 'aborted') return;
      this.cb.onError(code);
      if (code !== 'no-speech') {
        this.stop();
      }
    };

    rec.onend = () => {
      this.listening = false;
      this.cb.onListeningChange(false);
      this.rec = null;
      if (this.intentionalStop) {
        this.releaseMic();
      } else {
        // Engine ended (common after a pause). Release mic; user can click again.
        this.releaseMic();
      }
    };

    this.rec = rec;
    try {
      rec.start();
    } catch (e) {
      this.listening = false;
      this.cb.onListeningChange(false);
      this.releaseMic();
      this.cb.onError(e instanceof Error ? e.message : 'start-failed');
    }
  }

  stop(): void {
    this.intentionalStop = true;
    this.startGen += 1;
    try {
      this.rec?.stop();
    } catch {
      /* */
    }
    try {
      this.rec?.abort();
    } catch {
      /* */
    }
    this.rec = null;
    this.releaseMic();
    this.listening = false;
    this.cb.onListeningChange(false);
  }

  dispose(): void {
    this.stop();
  }

  private releaseMic(): void {
    if (this.micStream) {
      for (const t of this.micStream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* */
        }
      }
      this.micStream = null;
    }
  }
}

function joinVoice(a: string, b: string): string {
  const left = a.trimEnd();
  const right = b.trim();
  if (!left) return right;
  if (!right) return left;
  const needSpace = /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
  return needSpace ? `${left} ${right}` : `${left}${right}`;
}
