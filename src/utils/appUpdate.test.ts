import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UPDATE_CHECK_STORAGE_KEY,
  checkForUpdate,
  compareVersions,
  fetchLatestRelease,
  isNewerRelease,
  parseVersion,
  recordAutoCheck,
  shouldAutoCheck,
} from './appUpdate';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const API_URL = 'https://api.github.com/repos/alejocarabelli/Modelador-de-Sistemas/releases/latest';
const RELEASE_URL = 'https://github.com/alejocarabelli/Modelador-de-Sistemas/releases/tag/v2.6.0';
const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const releaseBody = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v2.6.0',
  html_url: RELEASE_URL,
  draft: false,
  prerelease: false,
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchJson = (body: unknown, status = 200) => vi.fn<FetchLike>(async () => jsonResponse(body, status));

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('parseVersion', () => {
  it.each([
    ['2.5.0', [2, 5, 0]],
    ['v2.5.0', [2, 5, 0]],
    ['V2.5', [2, 5, 0]],
    ['  2.5.0  ', [2, 5, 0]],
    ['2', [2, 0, 0]],
    ['2.5', [2, 5, 0]],
    ['2.5.0-beta.1', [2, 5, 0]],
    ['2.5.0+build.7', [2, 5, 0]],
  ] as const)('lee "%s" como %j', (text, expected) => {
    expect(parseVersion(text)).toEqual(expected);
  });

  it.each([
    '',
    '   ',
    'abc',
    'v',
    '-1.0.0',
    '2.-5',
    '2.',
    '2..5',
    '2.5.x',
    'vv2.5.0',
    '2.5.0.1',
    '2.5.0 beta',
    '99999999999999999999.0.0',
  ])('rechaza "%s"', (text) => {
    expect(parseVersion(text)).toBeNull();
  });
});

describe('compareVersions', () => {
  it.each([
    ['2.10.0', '2.9.9', 1],
    ['2.9.9', '2.10.0', -1],
    ['2.5', '2.5.0', 0],
    ['v2.5.0', '2.5.0', 0],
    ['2.5.1', '2.5', 1],
    ['2.4.9', '2.5.0', -1],
    ['3.0.0', '2.99.99', 1],
    ['2.5.0-beta.1', '2.5.0', 0],
  ] as const)('compara "%s" con "%s" y da %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it.each([
    ['abc', '2.5.0'],
    ['2.5.0', ''],
    ['', ''],
  ])('da 0 cuando alguna versión es inválida ("%s", "%s")', (a, b) => {
    expect(compareVersions(a, b)).toBe(0);
  });
});

describe('isNewerRelease', () => {
  it.each([
    ['v2.6.0', '2.5.9', true],
    ['2.10.0', '2.9.9', true],
    ['2.6.0+build.3', '2.5.0', true],
    ['2.5.0', '2.5.0', false],
    ['2.4.9', '2.5.0', false],
    ['2.6.0-beta.1', '2.5.0', false],
    ['2.6.0-rc', '2.5.0', false],
    ['latest', '2.5.0', false],
    ['', '2.5.0', false],
    ['2.6.0', 'abc', false],
    ['2.6.0', '', false],
    // Una prerelease instalada cuenta por su número, igual que en compareVersions.
    ['2.5.0', '2.5.0-beta.1', false],
  ] as const)('("%s", "%s") es %s', (latest, current, expected) => {
    expect(isNewerRelease(latest, current)).toBe(expected);
  });
});

describe('fetchLatestRelease', () => {
  it('pide la última release del repo y devuelve la versión sin «v» y la url', async () => {
    const fetchImpl = fetchJson(releaseBody());

    await expect(fetchLatestRelease(fetchImpl)).resolves.toEqual({ version: '2.6.0', url: RELEASE_URL });
    expect(fetchImpl).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } }),
    );
  });

  it('acepta un tag sin «v»', async () => {
    await expect(fetchLatestRelease(fetchJson(releaseBody({ tag_name: '2.6.1' })))).resolves.toEqual({
      version: '2.6.1',
      url: RELEASE_URL,
    });
  });

  it.each([404, 403, 500])('devuelve null si la respuesta no es ok (%s)', async (status) => {
    await expect(fetchLatestRelease(fetchJson(releaseBody(), status))).resolves.toBeNull();
  });

  it('devuelve null si la red falla o fetch lanza', async () => {
    const rejecting = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const throwing = (): Promise<Response> => {
      throw new TypeError('offline');
    };

    await expect(fetchLatestRelease(rejecting)).resolves.toBeNull();
    await expect(fetchLatestRelease(throwing)).resolves.toBeNull();
  });

  it('devuelve null si el cuerpo no es JSON', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response('<html>mantenimiento</html>', { status: 200 }));

    await expect(fetchLatestRelease(fetchImpl)).resolves.toBeNull();
  });

  it.each([null, 'texto', 42, []])('devuelve null si el JSON no es un objeto (%j)', async (body) => {
    await expect(fetchLatestRelease(fetchJson(body))).resolves.toBeNull();
  });

  it.each([
    ['falta tag_name', { tag_name: undefined }],
    ['tag_name no es texto', { tag_name: 262 }],
    ['falta html_url', { html_url: undefined }],
    ['html_url no es texto', { html_url: null }],
    ['tag que no es versión', { tag_name: 'latest' }],
  ])('devuelve null si %s', async (_label, overrides) => {
    await expect(fetchLatestRelease(fetchJson(releaseBody(overrides)))).resolves.toBeNull();
  });

  it.each([
    'https://evil.example.com/alejocarabelli/Modelador-de-Sistemas/releases/tag/v2.6.0',
    'https://github.com/otra-persona/Modelador-de-Sistemas/releases/tag/v2.6.0',
    'https://github.com/alejocarabelli/Modelador-de-Sistemas-fork/releases/tag/v2.6.0',
    'http://github.com/alejocarabelli/Modelador-de-Sistemas/releases/tag/v2.6.0',
    'javascript:alert(1)',
  ])('descarta una url ajena al repo: %s', async (url) => {
    await expect(fetchLatestRelease(fetchJson(releaseBody({ html_url: url })))).resolves.toBeNull();
  });

  it('descarta borradores y prereleases marcadas en GitHub', async () => {
    await expect(fetchLatestRelease(fetchJson(releaseBody({ draft: true })))).resolves.toBeNull();
    await expect(fetchLatestRelease(fetchJson(releaseBody({ prerelease: true })))).resolves.toBeNull();
  });

  it('corta la petición cuando se pasa el tiempo límite', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const hanging: FetchLike = (_input, init) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    };

    const pending = fetchLatestRelease(hanging, 1000);
    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
  });

  it('no deja temporizadores pendientes cuando responde a tiempo', async () => {
    vi.useFakeTimers();

    await expect(fetchLatestRelease(fetchJson(releaseBody()), 8000)).resolves.not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('shouldAutoCheck y recordAutoCheck', () => {
  it('pide si nunca se buscó', () => {
    expect(shouldAutoCheck(NOW, memoryStorage())).toBe(true);
  });

  it('no vuelve a pedir a las 23 h y sí a las 24 h', () => {
    const storage = memoryStorage();
    recordAutoCheck(NOW, storage);

    expect(shouldAutoCheck(NOW + 23 * HOUR, storage)).toBe(false);
    expect(shouldAutoCheck(NOW + DAY - 1, storage)).toBe(false);
    expect(shouldAutoCheck(NOW + DAY, storage)).toBe(true);
    expect(shouldAutoCheck(NOW + DAY + HOUR, storage)).toBe(true);
  });

  it('pide si el registro está en el futuro', () => {
    const storage = memoryStorage();
    recordAutoCheck(NOW + HOUR, storage);

    expect(shouldAutoCheck(NOW, storage)).toBe(true);
  });

  it.each(['ayer', '', '1e12', '-5'])('pide si el registro es ilegible (%j)', (raw) => {
    const storage = memoryStorage({ [UPDATE_CHECK_STORAGE_KEY]: raw });

    expect(shouldAutoCheck(NOW, storage)).toBe(true);
  });

  it('pide si no hay storage o no se puede leer', () => {
    const throwing = {
      getItem: () => {
        throw new Error('storage denied');
      },
    };

    expect(shouldAutoCheck(NOW, null)).toBe(true);
    expect(shouldAutoCheck(NOW, throwing)).toBe(true);
  });

  it('guarda el instante del intento con la clave fija', () => {
    const storage = memoryStorage();
    recordAutoCheck(NOW, storage);

    expect(UPDATE_CHECK_STORAGE_KEY).toBe('modelador.updateCheck.lastAttempt');
    expect(storage.data.get(UPDATE_CHECK_STORAGE_KEY)).toBe(String(NOW));
  });

  it('no hace nada sin storage ni si el storage lanza al escribir', () => {
    const throwing = {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };

    expect(() => recordAutoCheck(NOW, null)).not.toThrow();
    expect(() => recordAutoCheck(NOW, throwing)).not.toThrow();
  });
});

describe('checkForUpdate', () => {
  it('devuelve la release más nueva y registra el intento antes de pedirla', async () => {
    const storage = memoryStorage();
    let recordedWhileFetching: string | null = null;
    const fetchImpl = vi.fn<FetchLike>(async () => {
      recordedWhileFetching = storage.getItem(UPDATE_CHECK_STORAGE_KEY);
      return jsonResponse(releaseBody());
    });

    await expect(checkForUpdate('2.5.0', { fetchImpl, now: NOW, storage })).resolves.toEqual({
      version: '2.6.0',
      url: RELEASE_URL,
    });
    expect(recordedWhileFetching).toBe(String(NOW));
  });

  it('devuelve null si la release no es más nueva, pero igual registra el intento', async () => {
    const storage = memoryStorage();

    await expect(checkForUpdate('2.6.0', { fetchImpl: fetchJson(releaseBody()), now: NOW, storage })).resolves.toBeNull();
    expect(storage.data.get(UPDATE_CHECK_STORAGE_KEY)).toBe(String(NOW));
  });

  it('no pide nada dentro de las 24 h desde el último intento', async () => {
    const storage = memoryStorage({ [UPDATE_CHECK_STORAGE_KEY]: String(NOW - 23 * HOUR) });
    const fetchImpl = fetchJson(releaseBody());

    await expect(checkForUpdate('2.5.0', { fetchImpl, now: NOW, storage })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('vuelve a pedir pasadas las 24 h', async () => {
    const storage = memoryStorage({ [UPDATE_CHECK_STORAGE_KEY]: String(NOW - DAY) });
    const fetchImpl = fetchJson(releaseBody());

    await expect(checkForUpdate('2.5.0', { fetchImpl, now: NOW, storage })).resolves.not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('con force ignora la espera, pero también registra el intento', async () => {
    const storage = memoryStorage({ [UPDATE_CHECK_STORAGE_KEY]: String(NOW - HOUR) });
    const fetchImpl = fetchJson(releaseBody());

    await expect(checkForUpdate('2.5.0', { fetchImpl, now: NOW, storage, force: true })).resolves.not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(storage.data.get(UPDATE_CHECK_STORAGE_KEY)).toBe(String(NOW));
  });

  it('sin storage igual busca', async () => {
    const fetchImpl = fetchJson(releaseBody());

    await expect(checkForUpdate('2.5.0', { fetchImpl, now: NOW, storage: null })).resolves.not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('si la petición falla devuelve null y el intento queda registrado', async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(checkForUpdate('2.5.0', { fetchImpl, now: NOW, storage })).resolves.toBeNull();
    expect(storage.data.get(UPDATE_CHECK_STORAGE_KEY)).toBe(String(NOW));
  });

  it('devuelve null con una versión instalada inválida', async () => {
    await expect(
      checkForUpdate('no-version', { fetchImpl: fetchJson(releaseBody()), now: NOW, storage: null }),
    ).resolves.toBeNull();
  });

  it('no devuelve prereleases aunque sean más nuevas', async () => {
    const fetchImpl = fetchJson(releaseBody({ tag_name: 'v3.0.0-beta.1' }));

    await expect(checkForUpdate('2.5.0', { fetchImpl, now: NOW, storage: null })).resolves.toBeNull();
  });
});
