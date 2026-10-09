/** Pure helpers to find out whether a newer release of the app is published. No UI, never throws. */

const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/alejocarabelli/Modelador-de-Sistemas/releases/latest';
const RELEASE_PAGE_PREFIX = 'https://github.com/alejocarabelli/Modelador-de-Sistemas/';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch in ms of the last automatic check attempt. */
export const UPDATE_CHECK_STORAGE_KEY = 'modelador.updateCheck.lastAttempt';

export type LatestRelease = { version: string; url: string };

type VersionParts = [number, number, number];
type ParsedVersion = { parts: VersionParts; prerelease: boolean };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// One to three numeric parts, an optional «v», and an optional «-» (prerelease) or «+» (build) suffix.
const VERSION_PATTERN = /^[vV]?(\d+(?:\.\d+){0,2})(?:([-+])\S*)?$/;

const parseDetailed = (text: string): ParsedVersion | null => {
  const match = VERSION_PATTERN.exec(text.trim());
  if (!match) return null;
  const numbers = match[1].split('.').map(Number);
  if (!numbers.every((part) => Number.isSafeInteger(part))) return null;
  const [major = 0, minor = 0, patch = 0] = numbers;
  return { parts: [major, minor, patch], prerelease: match[2] === '-' };
};

const compareParts = (a: VersionParts, b: VersionParts): number => {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
};

/** `[mayor, menor, parche]`, or null when the text is not a version. A prerelease or build suffix is ignored. */
export const parseVersion = (text: string): VersionParts | null => {
  const parsed = parseDetailed(text);
  return parsed ? parsed.parts : null;
};

/** Numeric order of two versions: negative, 0 or positive. An invalid version compares as 0. */
export const compareVersions = (a: string, b: string): number => {
  const left = parseDetailed(a);
  const right = parseDetailed(b);
  return left && right ? compareParts(left.parts, right.parts) : 0;
};

/** True for a stable tag (no «-» prerelease suffix) that is strictly greater than the installed version. */
export const isNewerRelease = (latestTag: string, current: string): boolean => {
  const latest = parseDetailed(latestTag);
  const installed = parseVersion(current);
  return latest !== null && !latest.prerelease && installed !== null && compareParts(latest.parts, installed) > 0;
};

/** Asks GitHub for the latest release. Any problem (network, timeout, odd response) gives null. */
export const fetchLatestRelease = async (fetchImpl: FetchLike = fetch, timeoutMs = 8000): Promise<LatestRelease | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LATEST_RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null) return null;
    const { tag_name: tagName, html_url: url, draft, prerelease } = data as Record<string, unknown>;
    if (typeof tagName !== 'string' || typeof url !== 'string') return null;
    if (draft === true || prerelease === true || !url.startsWith(RELEASE_PAGE_PREFIX)) return null;
    if (parseVersion(tagName) === null) return null;
    return { version: tagName.trim().replace(/^v/i, ''), url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const defaultStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** True when there is no record, the record is unreadable or in the future, or 24 h have passed. */
export const shouldAutoCheck = (now: number, storage: Pick<Storage, 'getItem'> | null): boolean => {
  if (storage === null) return true;
  try {
    const raw = storage.getItem(UPDATE_CHECK_STORAGE_KEY);
    if (raw === null) return true;
    const last = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    const elapsed = now - last;
    return !(elapsed >= 0 && elapsed < DAY_MS);
  } catch {
    return true;
  }
};

/** Notes an attempt so the next automatic check waits 24 h. Without storage it is a no-op. */
export const recordAutoCheck = (now: number, storage: Pick<Storage, 'setItem'> | null): void => {
  if (storage === null) return;
  try {
    storage.setItem(UPDATE_CHECK_STORAGE_KEY, String(now));
  } catch {
    // Without storage (private mode, full quota) the check simply runs again next time.
  }
};

type CheckOptions = {
  fetchImpl?: FetchLike;
  now?: number;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  force?: boolean;
};

/** Looks for a release newer than `current`. Respects the 24 h wait unless `force` is set. */
export const checkForUpdate = async (current: string, options: CheckOptions = {}): Promise<LatestRelease | null> => {
  const { fetchImpl = fetch, now = Date.now(), force = false } = options;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!force && !shouldAutoCheck(now, storage)) return null;
  recordAutoCheck(now, storage);
  const release = await fetchLatestRelease(fetchImpl);
  return release && isNewerRelease(release.version, current) ? release : null;
};
