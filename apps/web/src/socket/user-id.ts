import { isValidUserId } from '@zag/protocol';

const STORAGE_KEY = 'zag:userId:v1';

/** Secure context (https or localhost) is guaranteed for a PWA. */
const generateUserId = (): string => crypto.randomUUID();

const readStored = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const store = (userId: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, userId);
  } catch {
    // Private mode or storage disabled: the id lives for this page only.
  }
};

let cached: string | null = null;

/** Stable per-device id sent in the Socket.IO handshake (protocol § 4). */
export const getUserId = (): string => {
  if (cached) return cached;
  const stored = readStored();
  if (isValidUserId(stored)) {
    cached = stored;
    return stored;
  }
  const created = generateUserId();
  store(created);
  cached = created;
  return created;
};
