/**
 * Canonical client-side file validation utility for SkillSwap attachments.
 *
 * NOTE: Client-side validation is for UX hardening and fast user feedback only.
 * It is NOT an authoritative security boundary; server/database/storage controls
 * enforce authoritative security.
 */

export const MAX_ATTACHMENT_FILE_SIZE = 25 * 1024 * 1024; // 25 MiB / 26,214,400 bytes

export const CANONICAL_ATTACHMENT_MIME_TYPES = new Set<string>([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const CANONICAL_CHAT_MIME_TYPES = CANONICAL_ATTACHMENT_MIME_TYPES;

export const CANONICAL_ATTACHMENT_EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export const CANONICAL_CHAT_EXTENSION_TO_MIME = CANONICAL_ATTACHMENT_EXTENSION_TO_MIME;

const MIME_ALIAS_MAP: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/jfif': 'image/jpeg',
  'image/x-citrix-jpeg': 'image/jpeg',
  'text/jpg': 'image/jpeg',
  'text/jpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'application/x-zip-compressed': 'application/zip',
  'application/zip-compressed': 'application/zip',
  'application/x-pdf': 'application/pdf',
  'text/pdf': 'application/pdf',
};

export interface FileValidationInput {
  name?: string | null;
  size?: number | null;
  type?: string | null;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a file before upload across all attachment surfaces
 * (swap-attachments, swap-submissions, swap-chat-attachments).
 */
export function validateAttachmentFile(file?: FileValidationInput | null): FileValidationResult {
  if (!file || typeof file !== 'object') {
    return { valid: false, error: 'Attachment upload failed. Please try again.' };
  }

  const rawName = file.name;
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return { valid: false, error: 'Filename cannot be empty.' };
  }

  if (rawName.length > 255) {
    return { valid: false, error: 'Filename is too long.' };
  }

  if (rawName.includes('/') || rawName.includes('\\')) {
    return { valid: false, error: 'Filename cannot contain slashes.' };
  }

  if (typeof file.size !== 'number' || Number.isNaN(file.size) || file.size <= 0) {
    return { valid: false, error: 'File cannot be empty.' };
  }

  if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
    return { valid: false, error: 'File is too large. Maximum size is 25 MB.' };
  }

  const lastDot = rawName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0 || lastDot === rawName.length - 1) {
    return { valid: false, error: "This file type isn't supported." };
  }

  const ext = rawName.slice(lastDot + 1).toLowerCase();
  const expectedMime = CANONICAL_ATTACHMENT_EXTENSION_TO_MIME[ext];
  if (!expectedMime) {
    return { valid: false, error: "This file type isn't supported." };
  }

  const rawBrowserType = file.type ? file.type.trim().toLowerCase() : '';
  if (rawBrowserType && rawBrowserType !== 'application/octet-stream') {
    const normalizedBrowserType = MIME_ALIAS_MAP[rawBrowserType] || rawBrowserType;

    if (!CANONICAL_ATTACHMENT_MIME_TYPES.has(normalizedBrowserType) || normalizedBrowserType !== expectedMime) {
      return { valid: false, error: 'File extension and MIME type do not match.' };
    }
  }

  return { valid: true };
}

export const validateChatAttachmentFile = validateAttachmentFile;
