import { SESSION_PATH, type SessionSnapshot } from '@zag/protocol';

const isSnapshot = (value: unknown): value is SessionSnapshot => {
  if (typeof value !== 'object' || value === null) return false;
  const { step } = value as { step?: unknown };
  return step === 'waiting' || step === 'active';
};

/**
 * `GET /session/:userId` (shared-modules.md § 4): the turn the server still
 * holds for this phone, for a page that was reloaded while in the queue.
 * `null` when there is none, the server is unreachable or the answer is
 * not a snapshot; the caller treats every `null` the same way.
 */
export const fetchTurn = async (
  url: string,
  userId: string,
): Promise<SessionSnapshot | null> => {
  const target = `${url}${SESSION_PATH}/${encodeURIComponent(userId)}`;
  try {
    const response = await fetch(target, { cache: 'no-store' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isSnapshot(body) ? body : null;
  } catch {
    return null;
  }
};
