/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { EventEmitter } from 'node:events';
import type {
  VoiceBackend,
  VoiceInputState,
  VoiceInputReturn,
} from './voice/types.js';
import { LocalWhisperBackend } from './voice/LocalWhisperBackend.js';
import { GeminiLiveBackend } from './voice/GeminiLiveBackend.js';

export * from './voice/types.js';

// Event-based transcript delivery to avoid context re-renders
const transcriptEmitter = new EventEmitter();

/**
 * Subscribe to voice transcript events.
 * Use this instead of reading transcript from context to avoid re-renders.
 */
export function onVoiceTranscript(
  callback: (transcript: string) => void,
): () => void {
  transcriptEmitter.on('transcript', callback);
  return () => {
    transcriptEmitter.off('transcript', callback);
  };
}

export interface VoiceInputConfig {
  provider?: 'gemini' | 'whisper';
  whisperPath?: string;
}

/**
 * Hook for voice input using system audio recording and a pluggable backend
 */
export function useVoiceInput(config?: VoiceInputConfig): VoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isTranscribing: false,
    error: null,
  });

  const backendRef = useRef<VoiceBackend | null>(null);
  const isTogglingRef = useRef(false);

  // Initialize backend based on config
  useEffect(() => {
    const options = {
      onStateChange: (newState: VoiceInputState) => {
        setState(newState);
      },
      onTranscript: (transcript: string) => {
        transcriptEmitter.emit('transcript', transcript.trim());
      },
    };

    if (config?.provider === 'whisper') {
      backendRef.current = new LocalWhisperBackend(options, {
        whisperPath: config.whisperPath,
      });
    } else {
      // Default to Gemini backend
      backendRef.current = new GeminiLiveBackend(options);
    }

    return () => {
      if (backendRef.current) {
        void backendRef.current.cleanup();
      }
    };
  }, [config?.provider, config?.whisperPath]);

  const startRecording = useCallback(async () => {
    if (backendRef.current) {
      await backendRef.current.start();
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (backendRef.current) {
      await backendRef.current.stop();
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isTogglingRef.current) return;
    isTogglingRef.current = true;
    try {
      if (state.isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } finally {
      isTogglingRef.current = false;
    }
  }, [state.isRecording, startRecording, stopRecording]);

  return useMemo(
    () => ({
      state,
      startRecording,
      stopRecording,
      toggleRecording,
    }),
    [state, startRecording, stopRecording, toggleRecording],
  );
}
