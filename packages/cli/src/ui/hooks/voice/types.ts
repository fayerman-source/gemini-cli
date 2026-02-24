/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VoiceInputState {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
}

export interface VoiceBackend {
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface VoiceBackendOptions {
  onStateChange: (state: VoiceInputState) => void;
  onTranscript: (transcript: string) => void;
}

export interface VoiceInputReturn {
  state: VoiceInputState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleRecording: () => Promise<void>;
}
