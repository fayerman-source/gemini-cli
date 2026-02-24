/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, type Config } from '@google/gemini-cli-core';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { EventEmitter } from 'node:events';
import { appendFileSync } from 'node:fs';
import type {
  VoiceBackend,
  VoiceInputState,
  VoiceInputReturn,
} from './voice/types.js';

function logToFile(msg: string) {
  try {
    appendFileSync('VOICE_DEBUG.log', `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // ignore
  }
}
import { LocalWhisperBackend } from './voice/LocalWhisperBackend.js';
import { GeminiRestBackend } from './voice/GeminiRestBackend.js';

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
  config: Config;
}

/**
 * Hook for voice input using system audio recording and a pluggable backend
 */
export function useVoiceInput(
  voiceConfig?: VoiceInputConfig,
): VoiceInputReturn {
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

    if (voiceConfig?.provider === 'whisper') {
      backendRef.current = new LocalWhisperBackend(options, {
        whisperPath: voiceConfig.whisperPath,
      });
    } else if (voiceConfig?.config) {
      // Default to stable Gemini REST backend using the app's config
      backendRef.current = new GeminiRestBackend(options, voiceConfig.config);
    }

    return () => {
      if (backendRef.current) {
        void backendRef.current.cleanup();
      }
    };
  }, [voiceConfig?.provider, voiceConfig?.whisperPath, voiceConfig?.config]);

  const startRecording = useCallback(async () => {
    logToFile('startRecording called');
    debugLogger.log('useVoiceInput: startRecording called');
    if (backendRef.current) {
      logToFile('backend exists, calling start()');
      debugLogger.log('useVoiceInput: backend exists, starting...');
      await backendRef.current.start();
    } else {
      logToFile('ERROR: backendRef is null');
      debugLogger.error('useVoiceInput: backendRef is null!');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    logToFile('stopRecording called');
    debugLogger.log('useVoiceInput: stopRecording called');
    if (backendRef.current) {
      await backendRef.current.stop();
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    logToFile('toggleRecording called');
    debugLogger.log('useVoiceInput: toggleRecording called');
    if (isTogglingRef.current) {
      logToFile('already toggling, ignored');
      debugLogger.log('useVoiceInput: already toggling, ignored');
      return;
    }
    isTogglingRef.current = true;
    try {
      if (state.isRecording) {
        logToFile('currently recording, stopping...');
        await stopRecording();
      } else {
        logToFile('currently idle, starting...');
        await startRecording();
      }
    } catch (e) {
      logToFile(`toggle error: ${e}`);
      debugLogger.error('useVoiceInput: toggle error', e);
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
