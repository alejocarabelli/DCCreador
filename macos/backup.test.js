import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { describe, expect, it } from 'vitest';

describe.skipIf(platform !== 'darwin')('macOS backup bridge on disk', () => {
  it('deduplicates against existing files and always preserves originals', () => {
    const directory = mkdtempSync(join(tmpdir(), 'modelador-backup-test-'));
    const binary = join(directory, 'backup-test');
    try {
      execFileSync('clang', ['-fobjc-arc', '-Wno-nullability-completeness', '-Wno-nullability-completeness-on-arrays', '-framework', 'Cocoa', '-framework', 'WebKit', 'macos/BackupBridge.test.m', '-o', binary]);
      const output = execFileSync(binary, [directory], { encoding: 'utf8' });
      expect(output).toContain('identical, changed, deleted, moved and preserve checks passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
