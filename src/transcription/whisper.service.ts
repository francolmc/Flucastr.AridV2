/**
 * Whisper Speech-to-Text Service
 *
 * Transcribe audio files using Whisper ASR service
 * Basado en STTService de Flucastr.Arid, adaptado para AridV2
 */

import { tmpdir } from 'os';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export class WhisperService {
  private whisperUrl: string;
  private whisperModel: string;
  private whisperLanguage: string;

  constructor(
    whisperUrl: string = 'http://localhost:9000',
    whisperModel: string = 'base',
    whisperLanguage: string = 'es'
  ) {
    this.whisperUrl = whisperUrl;
    this.whisperModel = whisperModel;
    this.whisperLanguage = whisperLanguage;

    logger.info(`WhisperService initialized: ${whisperUrl}, model=${whisperModel}, lang=${whisperLanguage}`);
  }

  /**
   * Transcribe audio buffer to text
   * @param audioBuffer - Audio file as Buffer (OGG from Telegram)
   * @param filename - Original filename (for logging)
   * @returns Transcribed text or error message
   */
  async transcribe(audioBuffer: Buffer, filename: string = 'audio.ogg'): Promise<string> {
    const timestamp = Date.now();
    const tempFilePath = join(tmpdir(), `arid-${timestamp}-${filename}`);

    try {
      // Save to temp file
      writeFileSync(tempFilePath, audioBuffer);
      logger.info(`Audio saved to temp: ${tempFilePath} (${audioBuffer.length} bytes)`);

      // Create Blob for upload (convert Buffer to Uint8Array)
      const uint8Array = new Uint8Array(audioBuffer);
      const blob = new Blob([uint8Array], { type: 'audio/ogg' });

      // Try primary endpoint: /asr
      try {
        const formData = new FormData();
        formData.append('audio_file', blob, filename);
        formData.append('task', 'transcribe');
        formData.append('language', this.whisperLanguage);
        formData.append('output', 'text');

        const response = await fetch(`${this.whisperUrl}/asr`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Whisper responded with ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        let transcription = '';

        if (contentType.includes('application/json')) {
          const result = await response.json() as { text?: string; transcription?: string };
          transcription = result.text || result.transcription || '';
        } else {
          // Plain text response
          transcription = await response.text();
        }

        logger.info(`Transcription successful: "${transcription.substring(0, 50)}..."`);
        return transcription.trim();

      } catch (error: any) {
        // Fallback to OpenAI-compatible endpoint
        if (error.message.includes('404') || error.message.includes('JSON')) {
          logger.warn('Primary endpoint /asr failed, trying fallback /v1/audio/transcriptions');

          const formData = new FormData();
          formData.append('file', blob, filename);
          formData.append('model', this.whisperModel);
          formData.append('language', this.whisperLanguage);

          const response = await fetch(`${this.whisperUrl}/v1/audio/transcriptions`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Fallback endpoint responded with ${response.status}`);
          }

          const contentType = response.headers.get('content-type') || '';
          let transcription = '';

          if (contentType.includes('application/json')) {
            const result = await response.json() as { text?: string };
            transcription = result.text || '';
          } else {
            // Plain text response
            transcription = await response.text();
          }

          logger.info(`Transcription successful (fallback): "${transcription.substring(0, 50)}..."`);
          return transcription.trim();
        }
        throw error;
      }

    } catch (error: any) {
      logger.error('Transcription error:', error);

      // Check if Whisper is unavailable
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        return `[Audio recibido - Whisper no disponible. Inicia el servicio en ${this.whisperUrl}]`;
      }

      return `[Error transcribiendo audio: ${error.message}]`;

    } finally {
      // Cleanup temp file
      try {
        unlinkSync(tempFilePath);
        logger.debug(`Temp file cleaned: ${tempFilePath}`);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temp file:', cleanupError);
      }
    }
  }

  /**
   * Check if Whisper service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.whisperUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
