import { getStorageConfig } from '@/lib/storage/config';

const FORM_BACKGROUND_KEY_PATTERN = /^[^/]+\/forms\/[^/]+\/branding\/background\.(png|jpg|jpeg|webp|gif)$/i;

export function isFormBackgroundStorageKey(value: string): boolean {
  return FORM_BACKGROUND_KEY_PATTERN.test(value);
}

export function getFormBackgroundPublicUrl(storageKey: string): string {
  return `/api/storage/${encodeURIComponent(storageKey)}`;
}

function storageKeyFromAppStorageUrl(pathname: string): string | null {
  if (!pathname.startsWith('/api/storage/')) return null;

  try {
    const key = decodeURIComponent(pathname.slice('/api/storage/'.length));
    return isFormBackgroundStorageKey(key) ? key : null;
  } catch {
    return null;
  }
}

function storageKeyFromS3Url(pathname: string): string | null {
  const bucket = getStorageConfig().s3Bucket;
  if (!bucket) return null;

  const bucketPrefix = `/${bucket}/`;
  if (!pathname.startsWith(bucketPrefix)) return null;

  try {
    const key = decodeURIComponent(pathname.slice(bucketPrefix.length));
    return isFormBackgroundStorageKey(key) ? key : null;
  } catch {
    return null;
  }
}

export function normalizeFormBackgroundUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (isFormBackgroundStorageKey(trimmed)) {
    return getFormBackgroundPublicUrl(trimmed);
  }

  try {
    const parsed = new URL(trimmed, 'http://app.local');
    const storageKey = storageKeyFromAppStorageUrl(parsed.pathname) ?? storageKeyFromS3Url(parsed.pathname);
    return storageKey ? getFormBackgroundPublicUrl(storageKey) : trimmed;
  } catch {
    return trimmed;
  }
}
