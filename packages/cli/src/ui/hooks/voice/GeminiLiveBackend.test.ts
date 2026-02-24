/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiLiveBackend } from './GeminiLiveBackend.js';
import { EventEmitter } from 'node:events';

// Mock dependencies
const mockLoadApiKey = vi.fn();
vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
  loadApiKey: () => mockLoadApiKey(),
}));

const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const mockStat = vi.fn();
vi.mock('node:fs/promises', () => ({
  stat: (...args: unknown[]) => mockStat(...args),
}));

// Mock GoogleGenerativeAI
const mockConnect = vi.fn();
const mockSend = vi.fn();
const mockClose = vi.fn();
const mockGetGenerativeModel = vi.fn();

vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
  }));

describe('GeminiLiveBackend', () => {
  let backend: GeminiLiveBackend;
  let mockOptions: VoiceBackendOptions;
  let mockSession: EventEmitter & {
    send: typeof mockSend;
    close: typeof mockClose;
  };
  let mockProcess: EventEmitter & { stdout: EventEmitter; kill: typeof vi.fn };

  beforeEach(() => {
    vi.clearAllMocks();

    mockOptions = {
      onStateChange: vi.fn(),
      onTranscript: vi.fn(),
    };

    mockSession = new EventEmitter() as EventEmitter & {
      send: typeof mockSend;
      close: typeof mockClose;
    };
    mockSession.send = mockSend;
    mockSession.close = mockClose;

    mockGetGenerativeModel.mockReturnValue({
      live: {
        connect: mockConnect.mockResolvedValue(mockSession),
      },
    });

    mockProcess = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      kill: typeof vi.fn;
    };
    mockProcess.stdout = new EventEmitter();
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    // Default to 'sox' existing
    mockStat.mockResolvedValue({ isFile: () => true });

    backend = new GeminiLiveBackend(mockOptions);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start recording successfully when API key exists', async () => {
    mockLoadApiKey.mockResolvedValue('test-api-key');

    await backend.start();

    expect(mockLoadApiKey).toHaveBeenCalled();
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({
      model: 'gemini-2.0-flash-exp',
    });
    expect(mockConnect).toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenCalledWith('sox', expect.any(Array));
    expect(mockOptions.onStateChange).toHaveBeenCalledWith({
      isRecording: true,
      isTranscribing: false,
      error: null,
    });
  });

  it('should error if API key is missing', async () => {
    mockLoadApiKey.mockResolvedValue(null);

    await backend.start();

    expect(mockOptions.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('API Key not found'),
      }),
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('should send audio chunks to the session', async () => {
    mockLoadApiKey.mockResolvedValue('test-api-key');
    await backend.start();

    const chunk = Buffer.from('audio-data');
    mockProcess.stdout.emit('data', chunk);

    expect(mockSend).toHaveBeenCalledWith([
      {
        data: chunk.toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      },
    ]);
  });

  it('should handle session errors', async () => {
    mockLoadApiKey.mockResolvedValue('test-api-key');
    await backend.start();

    mockSession.emit('error', new Error('Session connection lost'));

    expect(mockOptions.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('Session connection lost'),
      }),
    );
  });

  it('should stop recording and close session', async () => {
    vi.useFakeTimers();
    mockLoadApiKey.mockResolvedValue('test-api-key');
    await backend.start();

    const stopPromise = backend.stop();
    vi.advanceTimersByTime(2000); // Wait for transcript buffer timeout
    await stopPromise;

    expect(mockProcess.kill).toHaveBeenCalledWith('SIGINT');
    expect(mockClose).toHaveBeenCalled();
    expect(mockOptions.onStateChange).toHaveBeenCalledWith({
      isRecording: false,
      isTranscribing: false,
      error: null,
    });
  });

  it('should capture transcripts from serverContent', async () => {
    mockLoadApiKey.mockResolvedValue('test-api-key');
    await backend.start();

    // Simulate receiving a transcript
    mockSession.emit('serverContent', {
      modelTurn: {
        parts: [{ text: 'Hello world' }],
      },
    });

    vi.useFakeTimers();
    const stopPromise = backend.stop();
    vi.advanceTimersByTime(2000);
    await stopPromise;

    expect(mockOptions.onTranscript).toHaveBeenCalledWith('Hello world');
  });
});
