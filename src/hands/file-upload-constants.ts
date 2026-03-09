/**
 * File Upload Constants (Fase 8)
 */

/**
 * Maximum file size: 20MB
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Supported file types
 */
export const SUPPORTED_FILE_TYPES = {
  photo: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'],
  video: ['mp4', 'avi', 'mov', 'mkv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a']
};

/**
 * Upload path template
 */
export const UPLOADS_PATH_TEMPLATE = (userId: string): string => `uploads/${userId}`;

/**
 * File timestamp format: file_<timestamp>.ext
 */
export function generateUniqueFilename(
  originalName: string,
  timestamp: number = Date.now()
): string {
  if (!originalName.includes('.')) {
    return `${originalName}_${timestamp}`;
  }

  const lastDotIndex = originalName.lastIndexOf('.');
  const baseName = originalName.substring(0, lastDotIndex);
  const extension = originalName.substring(lastDotIndex);

  return `${baseName}_${timestamp}${extension}`;
}

/**
 * File size formatter
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate file size
 */
export function isValidFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_FILE_SIZE;
}

/**
 * Get file size error message
 */
export function getFileSizeErrorMessage(bytes: number): string {
  if (bytes <= 0) {
    return 'El archivo está vacío';
  }

  if (bytes > MAX_FILE_SIZE) {
    const maxSizeMb = MAX_FILE_SIZE / 1024 / 1024;
    return `Archivo demasiado grande (máx ${maxSizeMb}MB)`;
  }

  return 'Tamaño de archivo inválido';
}
