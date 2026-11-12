import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  userData: '',
  changed: undefined as unknown as (...args: unknown[]) => void,
}));

vi.mock('electron', () => ({
  app: { getPath: () => mock.userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: () => Buffer.from('encrypted-session-fixture'),
  },
  session: {
    fromPartition: () => ({
      cookies: {
        get: async () => [],
        on: (_event: string, changed: typeof mock.changed) => {
          mock.changed = changed;
        },
        flushStore: async () => {},
      },
      flushStorageData: () => {},
    }),
  },
}));
vi.mock('../ipc', () => ({ attachContextMenu: () => {} }));

import { flushCampusSession, getCampusSession } from '../campus';

it('校园会话写入加密快照，更新 Cookie 后可完成同步', async () => {
  mock.userData = mkdtempSync(join(tmpdir(), 'gzist-session-'));
  try {
    await getCampusSession();
    mock.changed(
      {},
      {
        domain: 'jw.gzist.edu.cn',
        path: '/',
        name: 'fixture',
        value: 'private-fixture',
        session: true,
      },
      'explicit',
      false,
    );
    await expect(flushCampusSession()).resolves.toBeUndefined();
    expect(readFileSync(join(mock.userData, 'campus-session.bin'), 'utf8')).toBe(
      'encrypted-session-fixture',
    );
  } finally {
    rmSync(mock.userData, { recursive: true, force: true });
  }
});
