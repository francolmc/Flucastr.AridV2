/**
 * MIME Types - Centralized constants (Fase 8)
 */

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export const ALLOWED_IMAGE_MIMES: Record<string, ImageMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
};

export const DOCUMENT_MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv'
};

export const VIDEO_MIMES: Record<string, string> = {
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska'
};

export const AUDIO_MIMES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4'
};

/**
 * Detect MIME type from file extension
 */
export function detectMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';

  return (
    ALLOWED_IMAGE_MIMES[ext] ||
    DOCUMENT_MIMES[ext] ||
    VIDEO_MIMES[ext] ||
    AUDIO_MIMES[ext] ||
    'application/octet-stream'
  );
}

/**
 * Detect image MIME type (strict for vision APIs)
 */
export function detectImageMimeType(filename: string): ImageMimeType {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ALLOWED_IMAGE_MIMES[ext] || 'image/jpeg';
}

/**
 * Check if filename is an image
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ext in ALLOWED_IMAGE_MIMES;
}

/**
 * Check if filename is a document
 */
export function isDocumentFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ext in DOCUMENT_MIMES;
}

/**
 * Check if filename is a video
 */
export function isVideoFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ext in VIDEO_MIMES;
}
