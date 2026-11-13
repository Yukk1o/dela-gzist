import { app, safeStorage } from 'electron';
import { request } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { isIPv4 } from 'node:net';
import { z } from 'zod';
import { readSetting, writeSetting } from '../settings/prefs';
import type { CampusNetworkState } from '../../shared/campus-services';

const gateway = '10.0.10.252';
const credentialsSchema = z.object({
  account: z.string().trim().min(1),
  password: z.string().min(1),
});
const configSchema = z.object({
  account: z.string().trim().min(1),
  password: z.string().optional(),
  enabled: z.boolean(),
});
let state: Pick<CampusNetworkState, 'phase' | 'message' | 'checkedAt'> = {
  phase: 'idle',
  message: '尚未检查校园网',
  checkedAt: null,
};
let pending: Promise<CampusNetworkState> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

function readCredentials() {
  const path = join(app.getPath('userData'), 'campus-network.bin');
  if (!existsSync(path)) return null;
  return credentialsSchema.parse(JSON.parse(safeStorage.decryptString(readFileSync(path))));
}

function directRequest(
  path: string,
  pipe = false,
  body?: unknown,
  redirects = 0,
  port = path.startsWith('/eportal/') ? 801 : 80,
): Promise<{ text: string; url: string }> {
  const url = `http://${gateway}:${port}${path}`;
  return new Promise((resolve, reject) => {
    const req = request(
      pipe
        ? {
            socketPath: '\\\\.\\pipe\\verge-mihomo',
            path,
            method: body === undefined ? 'GET' : 'PATCH',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            agent: false,
          }
        : { hostname: gateway, port, path, agent: false },
      (res) => {
        if (!pipe && res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          const location = new URL(res.headers.location ?? '/', url);
          if (
            redirects >= 3 ||
            location.protocol !== 'http:' ||
            location.hostname !== gateway ||
            !['', '80', '801'].includes(location.port)
          ) {
            reject(new Error('校园网认证重定向异常，请在学校认证页面核对'));
            return;
          }
          resolve(
            directRequest(
              location.pathname + location.search,
              false,
              undefined,
              redirects + 1,
              Number(location.port || 80),
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', () => reject(new Error('校园网响应中断，请重试')));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(
                pipe ? '无法设置 Clash 校园网直连' : '校园网关返回异常，请在学校认证页确认网络状态',
              ),
            );
            return;
          }
          const buffer = Buffer.concat(chunks);
          resolve({ text: new TextDecoder(pipe ? 'utf-8' : 'gb18030').decode(buffer), url });
        });
      },
    );
    req.on('error', () =>
      reject(new Error(pipe ? 'Clash Verge 控制接口不可用' : '校园网关不可达，请先连接本校校园网')),
    );
    req.setTimeout(5000, () => req.destroy());
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function bypassClash(): Promise<void> {
  if (process.platform !== 'win32') return;
  let text: string;
  try {
    text = (await directRequest('/configs', true)).text;
  } catch {
    return;
  }
  const config = z
    .object({
      tun: z
        .object({ enable: z.boolean(), 'route-exclude-address': z.array(z.string()).nullish() })
        .passthrough(),
    })
    .parse(JSON.parse(text));
  const excluded = config.tun['route-exclude-address'] ?? [];
  if (config.tun.enable && !excluded.includes(`${gateway}/32`)) {
    await directRequest('/configs', true, {
      tun: { ...config.tun, 'route-exclude-address': [...excluded, `${gateway}/32`] },
    });
  }
}

export function parsePortal(text: string, url = `http://${gateway}/`) {
  const query = new URL(url).searchParams;
  const ip = query.get('wlanuserip') || text.match(/\bv4ip\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
  const ac = query.get('wlanacip') || text.match(/\bAC\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
  return {
    online: /Dr\.COMWebLoginID_1\.htm/.test(text) && /\buid\s*=\s*['"][^'"]+['"]/.test(text),
    userIp: isIPv4(ip) ? ip : null,
    acIp: isIPv4(ac) ? ac : null,
  };
}

export function networkState(): CampusNetworkState {
  const credentials = readCredentials();
  return {
    ...state,
    enabled: readSetting('gzist-network-auto') === '1',
    account: credentials?.account ?? '',
    hasPassword: !!credentials,
  };
}

export function configureNetwork(value: unknown): CampusNetworkState {
  const config = configSchema.parse(value);
  const saved = readCredentials();
  const password = config.password || (saved?.account === config.account ? saved.password : '');
  const credentials = credentialsSchema.parse({ account: config.account, password });
  if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统不能加密保存校园网密码');
  writeFileSync(
    join(app.getPath('userData'), 'campus-network.bin'),
    safeStorage.encryptString(JSON.stringify(credentials)),
  );
  writeSetting('gzist-network-auto', config.enabled ? '1' : '0');
  return networkState();
}

async function checkNetwork(login: boolean): Promise<CampusNetworkState> {
  state = { phase: 'connecting', message: '正在检查校园网', checkedAt: state.checkedAt };
  try {
    await bypassClash();
    const response = await directRequest('/');
    const portal = parsePortal(response.text, response.url);
    if (!portal.online && login) {
      const credentials = readCredentials();
      if (!credentials) throw new Error('请先保存校园网账号和密码');
      if (!portal.userIp || !portal.acIp)
        throw new Error('未识别到本机认证参数，请先打开学校校园网认证页');
      const nic = Object.values(networkInterfaces())
        .flat()
        .find((n) => n?.address === portal.userIp);
      if (!nic) throw new Error('认证页面的地址与本机网卡不匹配，请重新连接校园网');
      const mac = nic.mac.replaceAll(':', '').toUpperCase();
      const query = new URLSearchParams({
        c: 'ACSetting',
        a: 'Login',
        DDDDD: `,0,${credentials.account}`,
        upass: credentials.password,
        '0MKKey': '123456',
        R1: '0',
        R2: '0',
        R3: '0',
        R6: '0',
        para: '00',
        cmd: 'Login',
        wlanuserip: portal.userIp,
        wlanusermac: mac,
        wlanacip: portal.acIp,
        wlan_user_ip: portal.userIp,
        wlan_user_mac: mac,
        wlan_ac_ip: portal.acIp,
      });
      await directRequest(`/eportal/?${query}`);
      const verification = await directRequest('/');
      const verified = parsePortal(verification.text, verification.url);
      if (!verified.online)
        throw new Error('校园网认证未成功，请在学校页面核对账号、密码和在线设备数量');
    }
    state = {
      phase: portal.online || login ? 'online' : 'offline',
      message: portal.online || login ? '校园网已连接' : '校园网尚未认证',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    state = {
      phase: 'error',
      message: error instanceof Error ? error.message : '校园网连接失败',
      checkedAt: new Date().toISOString(),
    };
  }
  return networkState();
}

export function connectNetwork(login = true): Promise<CampusNetworkState> {
  pending ??= checkNetwork(login).finally(() => {
    pending = undefined;
  });
  return pending;
}

export function startNetworkKeeper(): void {
  if (timer) return;
  const check = () => {
    if (readSetting('gzist-network-auto') === '1') void connectNetwork().catch(() => {});
  };
  timer = setInterval(check, 30000);
  timer.unref();
  check();
}
