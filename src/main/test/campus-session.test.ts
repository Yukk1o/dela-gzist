import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  userData: '',
  changed: undefined as unknown as (...args: unknown[]) => void,
  restored: vi.fn(),
  savedCookies: [] as Record<string, unknown>[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => mock.userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: () => Buffer.from('encrypted-session-fixture'),
    decryptString: () => JSON.stringify(mock.savedCookies),
  },
  session: {
    fromPartition: () => ({
      cookies: {
        get: async () => [],
        set: mock.restored,
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

it('重启后恢复统一认证、教务和学工会话，保持各自 Cookie 域与路径', async () => {
  vi.resetModules();
  mock.userData = mkdtempSync(join(tmpdir(), 'gzist-session-restore-'));
  mock.savedCookies = ['ids', 'jw', 'xsfw', 'outside'].map((name) => ({
    domain: name === 'outside' ? 'example.com' : `${name}.gzist.edu.cn`,
    path: name === 'ids' ? '/lyuapServer' : '/',
    name: 'SESSION',
    value: 'private-fixture',
    session: true,
    secure: true,
    httpOnly: true,
    hostOnly: true,
  }));
  writeFileSync(join(mock.userData, 'campus-session.bin'), 'encrypted-session-fixture');
  try {
    const { getCampusSession: restore } = await import('../campus');
    await restore();
    expect(mock.restored).toHaveBeenCalledTimes(3);
    expect(mock.restored.mock.calls.map(([cookie]) => cookie.url)).toEqual([
      'https://ids.gzist.edu.cn/lyuapServer',
      'https://jw.gzist.edu.cn/',
      'https://xsfw.gzist.edu.cn/',
    ]);
    expect(mock.restored.mock.calls.every(([cookie]) => cookie.domain === undefined)).toBe(true);
  } finally {
    rmSync(mock.userData, { recursive: true, force: true });
  }
});
