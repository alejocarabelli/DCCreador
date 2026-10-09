import { describe, expect, it } from 'vitest';
import packageInfo from '../../package.json';
import { APP_VERSION } from './appInfo';

describe('APP_VERSION', () => {
  it('coincide con la versión de package.json', () => {
    expect(APP_VERSION).toBe(packageInfo.version);
  });

  it('tiene formato x.y.z', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
