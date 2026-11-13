import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  settings: new Map<string, string>(),
  requests: [] as { options: Record<string, unknown>; body?: string }[],
  responses: [] as { status?: number; text?: string; location?: string }[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => '/fixture' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(text).reverse(),
    decryptString: (data: Buffer) => Buffer.from(data).reverse().toString(),
  },
}));
vi.mock('node:fs', () => ({
  existsSync: (path: string) => fixture.files.has(path),
  readFileSync: (path: string) => fixture.files.get(path),
  writeFileSync: (path: string, value: Buffer) => fixture.files.set(path, value),
}));
vi.mock('node:os', () => ({
  networkInterfaces: () => ({ ethernet: [{ address: '10.20.1.8', mac: 'aa:bb:cc:dd:ee:ff' }] }),
}));
vi.mock('../../settings/prefs', () => ({
  readSetting: (key: string) => fixture.settings.get(key),
  writeSetting: (key: string, value: string) => fixture.settings.set(key, value),
}));
vi.mock('node:http', () => ({
  request: (options: Record<string, unknown>, callback: (res: EventEmitter) => void) => {
    const req = new EventEmitter();
    Object.assign(req, {
      setTimeout: vi.fn(),
      end: (body?: string) => {
        fixture.requests.push({ options, body });
        const response = fixture.responses.shift();
        if (!response) throw new Error('Unexpected fixture request');
        queueMicrotask(() => {
          const res = Object.assign(new EventEmitter(), {
            statusCode: response.status ?? 200,
            headers: { location: response.location },
            resume: vi.fn(),
          });
          callback(res);
          res.emit('data', Buffer.from(response.text ?? ''));
          res.emit('end');
        });
      },
    });
    return req;
  },
}));

beforeEach(() => {
  vi.resetModules();
  fixture.files.clear();
  fixture.settings.clear();
  fixture.requests.length = 0;
  fixture.responses.length = 0;
});

it('保留 Clash TUN 配置，仅补充网关路由，并直接核验校园网状态', async () => {
  fixture.responses.push(
    {
      text: JSON.stringify({
        tun: { enable: true, device: 'Mihomo', 'route-exclude-address': ['192.168.1.0/24'] },
      }),
    },
    {},
    { text: `<!--Dr.COMWebLoginID_1.htm-->uid='fixture';` },
  );
  const { connectNetwork } = await import('../network');
  expect((await connectNetwork()).phase).toBe('online');
  expect(JSON.parse(fixture.requests[1]!.body!)).toEqual({
    tun: {
      enable: true,
      device: 'Mihomo',
      'route-exclude-address': ['192.168.1.0/24', '10.0.10.252/32'],
    },
  });
  expect(fixture.requests[2]!.options).toMatchObject({ hostname: '10.0.10.252', agent: false });
});

it('从网关重定向读取认证参数，加密保存密码且不经 IPC 返回，认证后再次核验', async () => {
  const { configureNetwork, connectNetwork } = await import('../network');
  const state = configureNetwork({
    account: 'fixture',
    password: 'fixture-password',
    enabled: true,
  });
  expect(JSON.stringify(state)).not.toContain('fixture-password');
  expect([...fixture.files.values()][0]!.toString()).not.toContain('fixture-password');
  fixture.responses.push(
    { text: JSON.stringify({ tun: { enable: false } }) },
    { status: 302, location: '/?wlanuserip=10.20.1.8&wlanacip=10.128.255.142' },
    { text: `uid='';` },
    { text: 'login result' },
    { text: `<!--Dr.COMWebLoginID_1.htm-->uid='fixture';` },
  );
  expect((await connectNetwork()).phase).toBe('online');
  const request = fixture.requests.find((entry) => entry.options.port === 801)!;
  const query = new URL(String(request.options.path), 'http://10.0.10.252:801').searchParams;
  expect(query.get('DDDDD')).toBe(',0,fixture');
  expect(query.get('wlanusermac')).toBe('AABBCCDDEEFF');
  expect(query.get('wlanacip')).toBe('10.128.255.142');
});

it('拒绝跳转到网关之外，错误消息不包含密码或认证地址', async () => {
  const { configureNetwork, connectNetwork } = await import('../network');
  configureNetwork({ account: 'fixture', password: 'fixture-password', enabled: false });
  fixture.responses.push(
    { text: JSON.stringify({ tun: { enable: false } }) },
    { status: 302, location: 'http://outside.example/?upass=fixture-password' },
  );
  const result = await connectNetwork();
  expect(result.phase).toBe('error');
  expect(JSON.stringify(result)).not.toMatch(/fixture-password|outside\.example/);
  expect(fixture.requests).toHaveLength(2);
});
