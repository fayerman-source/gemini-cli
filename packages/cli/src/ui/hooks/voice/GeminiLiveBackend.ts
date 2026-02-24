/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, loadApiKey } from '@google/gemini-cli-core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { spawn } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { stat } from 'node:fs/promises';
import type { VoiceBackend, VoiceBackendOptions } from './types.js';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;

interface LiveSession {
  send: (data: object | object[]) => void;
  close: () => void;
  on: (event: string, callback: (data: unknown) => void) => void;
}

interface ServerContent {
  modelTurn?: {
    parts: Array<{ text?: string }>;
  };
}

function isLiveSession(session: unknown): session is LiveSession {
  return (
    typeof session === 'object' &&
    session !== null &&
    'send' in session &&
    'close' in session &&
    'on' in session
  );
}

function isServerContent(content: unknown): content is ServerContent {
  return (
    typeof content === 'object' && content !== null && 'modelTurn' in content
  );
}

export class GeminiLiveBackend implements VoiceBackend {
  private recordingProcess: ReturnType<typeof spawn> | null = null;
  private genAI: GoogleGenerativeAI | null = null;
  private session: LiveSession | null = null;
  private isStopping = false;
  private transcriptBuffer: string[] = [];

  constructor(private readonly options: VoiceBackendOptions) {}

  private async commandExists(cmd: string): Promise<boolean> {
    const pathEnv = process.env['PATH'] || '';
    const paths = pathEnv.split(delimiter);
    const extensions =
      process.platform === 'win32'
        ? (process.env['PATHEXT'] || '.EXE').split(';')
        : [''];

    for (const p of paths) {
      for (const ext of extensions) {
        const fullPath = join(p, cmd + ext);
        try {
          const s = await stat(fullPath);
          if (s.isFile()) return true;
        } catch {
          // ignore
        }
      }
    }
    return false;
  }

  async start(): Promise<void> {
    if (this.recordingProcess) return;

    try {
      this.isStopping = false;
      this.transcriptBuffer = [];
      this.options.onStateChange({
        isRecording: true,
        isTranscribing: false,
        error: null,
      });

      const apiKey = await loadApiKey();
      if (!apiKey) {
        throw new Error('API Key not found. Please log in using /login.');
      }

      this.genAI = new GoogleGenerativeAI(apiKey);
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
      });

      // Connect to Live API
      // @ts-expect-error - live might not be in types yet for this version
      const sessionResult: unknown = await model.live.connect({
        generationConfig: {
          responseModalities: ['text'],
        },
      });

      if (!isLiveSession(sessionResult)) {
        throw new Error('Failed to initialize Gemini Live session');
      }
      this.session = sessionResult;

      this.session.on('serverContent', (data: unknown) => {
        if (isServerContent(data)) {
          const content = data;
          if (content.modelTurn) {
            const parts = content.modelTurn.parts;
            for (const part of parts) {
              if (part.text) {
                this.transcriptBuffer.push(part.text);
              }
            }
          }
        }
      });

      this.session.on('error', (err: unknown) => {
        debugLogger.error('GeminiLiveBackend: session error', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.options.onStateChange({
          isRecording: false,
          isTranscribing: false,
          error: `Gemini API Error: ${errorMessage}`,
        });
      });

      // Start recording and pipe to session
      const soxExists = await this.commandExists('sox');
      if (soxExists) {
        this.recordingProcess = spawn('sox', [
          '-d',
          '-b',
          '16',
          '-r',
          SAMPLE_RATE.toString(),
          '-c',
          CHANNELS.toString(),
          '-e',
          'signed-integer',
          '-t',
          'raw',
          '-',
        ]);
      } else {
        const arecordExists = await this.commandExists('arecord');
        if (arecordExists) {
          this.recordingProcess = spawn('arecord', [
            '-f',
            'S16_LE',
            '-r',
            SAMPLE_RATE.toString(),
            '-c',
            CHANNELS.toString(),
            '-t',
            'raw',
            '-D',
            'default',
          ]);
        } else {
          throw new Error('Neither sox nor arecord found.');
        }
      }

      this.recordingProcess.stdout?.on('data', (chunk: Buffer) => {
        if (this.session && !this.isStopping) {
          this.session.send([
            {
              data: chunk.toString('base64'),
              mimeType: 'audio/pcm;rate=16000',
            },
          ]);
        }
      });

      this.recordingProcess.on('error', (err) => {
        this.options.onStateChange({
          isRecording: false,
          isTranscribing: false,
          error: `Recording error: ${err.message}`,
        });
      });
    } catch (err) {
      this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: err instanceof Error ? err.message : String(err),
      });
      await this.cleanup();
    }
  }

  async stop(): Promise<void> {
    if (!this.recordingProcess) return;

    this.isStopping = true;
    const proc = this.recordingProcess;
    this.recordingProcess = null;
    proc.kill('SIGINT');

    this.options.onStateChange({
      isRecording: false,
      isTranscribing: true,
      error: null,
    });

    // Wait a bit for final transcriptions
    await new Promise((r) => setTimeout(r, 1500));

    const finalTranscript = this.transcriptBuffer.join(' ').trim();
    if (finalTranscript) {
      this.options.onTranscript(finalTranscript);
    }

    this.options.onStateChange({
      isRecording: false,
      isTranscribing: false,
      error: null,
    });

    await this.cleanup();
  }

  async cleanup(): Promise<void> {
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGINT');
      this.recordingProcess = null;
    }
    if (this.session) {
      // @ts-expect-error - session might be null or type definition missing
      this.session.close();
      this.session = null;
    }
  }
}
