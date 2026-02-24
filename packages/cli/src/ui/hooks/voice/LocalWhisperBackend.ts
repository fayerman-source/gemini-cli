/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, tmpdir } from '@google/gemini-cli-core';
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, stat, readFile, rm } from 'node:fs/promises';
import { join, delimiter } from 'node:path';
import type { VoiceBackend, VoiceBackendOptions } from './types.js';

const RECORDING_FORMAT = 'wav';
const SAMPLE_RATE = 16000;
const CHANNELS = 1;

export class LocalWhisperBackend implements VoiceBackend {
  private recordingProcess: ReturnType<typeof spawn> | null = null;
  private tempDir: string | null = null;
  private audioFile: string | null = null;

  constructor(
    private readonly options: VoiceBackendOptions,
    private readonly config: { whisperPath?: string } = {},
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
    if (this.recordingProcess) {
      debugLogger.log('LocalWhisperBackend: already recording');
      return;
    }

    try {
      this.options.onStateChange({
        isRecording: true,
        isTranscribing: false,
        error: null,
      });

      this.tempDir = await mkdtemp(join(tmpdir(), 'gemini-voice-'));
      this.audioFile = join(this.tempDir, `recording.${RECORDING_FORMAT}`);

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
          RECORDING_FORMAT,
          this.audioFile,
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
            '-D',
            'default',
            this.audioFile,
          ]);
        } else {
          throw new Error('Neither sox nor arecord found.');
        }
      }

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
    if (!this.recordingProcess) return;

    const proc = this.recordingProcess;
    this.recordingProcess = null;
    proc.kill('SIGINT');

    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
      setTimeout(resolve, 2000);
    });

    this.options.onStateChange({
      isRecording: false,
      isTranscribing: true,
      error: null,
    });

    try {
      if (!this.audioFile) throw new Error('No audio file');

      // Wait for file
      let stats;
      for (let i = 0; i < 20; i++) {
        try {
          stats = await stat(this.audioFile);
          if (stats.size > 0) break;
        } catch {
          /* ignore */
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      if (!stats || stats.size === 0) throw new Error('Recording failed');

      const transcript = await this.transcribe(this.audioFile);
      this.options.onTranscript(transcript);
      this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: null,
      });
    } catch (err) {
      this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await this.cleanup();
    }
  }

  private async transcribe(audioFile: string): Promise<string> {
    const execFileAsync = (file: string, args: string[]) =>
      new Promise<void>((resolve, reject) => {
        execFile(file, args, (err) => (err ? reject(err) : resolve()));
      });

    const validatePath = (path: string) => {
      if (/[;&|`$(){}[\]<>!]/.test(path)) throw new Error('Invalid path');
      return path.replace(/['"]/g, '');
    };

    const transcriptFile = audioFile.replace('.wav', '.txt');
    const args = [
      audioFile,
      '--model',
      'tiny',
      '--output_format',
      'txt',
      '--output_dir',
      this.tempDir!,
    ];

    if (this.config.whisperPath) {
      await execFileAsync(validatePath(this.config.whisperPath), args);
    } else {
      try {
        await execFileAsync('whisper-faster', args);
      } catch {
        try {
          await execFileAsync('whisper', args);
        } catch {
          throw new Error('Whisper not found');
        }
      }
    }

    const raw = await readFile(transcriptFile, 'utf-8');
    return raw
      .split('\n')
      .map((l) =>
        l
          .replace(/^\[\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}\]\s*/, '')
          .trim(),
      )
      .filter(Boolean)
      .join(' ');
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
      this.tempDir = null;
      this.audioFile = null;
    }
  }
}
