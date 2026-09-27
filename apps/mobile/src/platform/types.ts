/**
 * Platform adapter interfaces (ADR 0006). This folder is the only place that knows iOS/Android/web differ.
 * Each adapter has `name.native.ts` (iOS/Android) and `name.web.ts`; `name.ts` re-exports the web version
 * so TypeScript has one module to type-check against. Metro picks the right file per platform.
 *
 * Implemented now: SecureSession, TextToSpeech.
 * Interfaces only (implemented in Phase 1+): LocalDb, Recorder, SpeechToText, BackgroundSync.
 */

/** Key-value store for the auth session. Keychain/Keystore on native; localStorage on the web. */
export interface SecureSession {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface TextToSpeech {
  /** True if a Spanish voice exists; if false the player falls back to server-generated audio. */
  hasSpanishVoice(): Promise<boolean>;
  speak(text: string, opts?: { language?: string; rate?: number }): void;
  stop(): Promise<void>;
}

/** Local database: SQLite on native, SQLite-WASM/OPFS on the web (a cache only — ADR 0006). */
export interface LocalDb {
  exec(sql: string, params?: readonly unknown[]): Promise<void>;
  query<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** False when the browser may evict data; the UI then warns about unsynced work. */
  readonly durable: boolean;
}

export interface Recording {
  uri: string;
  mime: string;
  durationMs: number;
  bytes: number;
}

/** Audio/video capture: expo-audio/expo-camera on native, MediaRecorder on the web. */
export interface Recorder {
  start(kind: 'audio' | 'video'): Promise<void>;
  stop(): Promise<Recording>;
  cancel(): Promise<void>;
}

export interface SpeechToText {
  /** 'device' = whisper on native; 'server' = the transcribe edge function (always on the web). */
  readonly engine: 'device' | 'server';
  transcribe(recording: Recording, language: string): Promise<{ text: string; confidence?: number }>;
}

/** Runs the upload outbox: OS background tasks on native, only while the tab is open on the web. */
export interface BackgroundSync {
  register(task: () => Promise<void>): Promise<void>;
  readonly runsInBackground: boolean;
}
