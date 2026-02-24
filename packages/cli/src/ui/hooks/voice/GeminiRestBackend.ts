/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { spawn } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import type { VoiceBackend, VoiceBackendOptions } from './types.js';
import type { GenerateContentParameters } from '@google/genai';
import { LlmRole } from '@google/gemini-cli-core';

function logToFile(msg: string) {
  try {
    appendFileSync(
      'VOICE_DEBUG.log',
      `[${new Date().toISOString()}] [GeminiREST] ${msg}\n`,
    );
  } catch {
    // ignore
  }
}

const SAMPLE_RATE = 16000;
const CHANNELS = 1;

export class GeminiRestBackend implements VoiceBackend {
  private recordingProcess: ReturnType<typeof spawn> | null = null;
  private audioChunks: Buffer[] = [];
  private isStopping = false;

  constructor(
    private readonly options: VoiceBackendOptions,
    private readonly config: Config,
    private readonly spawnFn: typeof spawn = spawn,
  ) {}

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
    logToFile('start() called');
    if (this.recordingProcess) return;

    try {
      this.isStopping = false;
      this.audioChunks = [];
      this.options.onStateChange({
        isRecording: true,
        isTranscribing: false,
        error: null,
      });

      const soxExists = await this.commandExists('sox');
      if (soxExists) {
        this.recordingProcess = this.spawnFn('sox', [
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
          this.recordingProcess = this.spawnFn('arecord', [
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
        if (!this.isStopping) {
          this.audioChunks.push(chunk);
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
    }
  }

  async stop(): Promise<void> {
    logToFile('stop() called');
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

    try {
      const audioBuffer = Buffer.concat(this.audioChunks);
      if (audioBuffer.length === 0) throw new Error('No audio captured');

      logToFile(
        `captured ${audioBuffer.length} bytes. Transcribing via ContentGenerator...`,
      );
      const transcript = await this.transcribe(audioBuffer);
      this.options.onTranscript(transcript);

      this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: null,
      });
    } catch (err) {
      logToFile(
        `TRANSCRIPTION ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await this.cleanup();
    }
  }

  private async transcribe(audioBuffer: Buffer): Promise<string> {
    const generator = this.config.getContentGenerator();
    if (!generator) throw new Error('Content generator not initialized');

    const prompt =
      'Transcribe the following audio exactly. Return only the transcription text.';
    const model = this.config.getModel();

    const request: GenerateContentParameters = {
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=16000',
                data: audioBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
    };

    const response = await generator.generateContent(
      request,
      'voice-transcription',
      LlmRole.UTILITY_TOOL,
    );

    const parts = response.candidates?.[0]?.content?.parts;
    const text = parts?.[0]?.text;
    return text?.trim() || '';
  }

  async cleanup(): Promise<void> {
    logToFile('cleanup() called');
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGINT');
      this.recordingProcess = null;
    }
    this.audioChunks = [];
  }
}
