import { beforeEach, expect, it, vi } from 'vitest';
import { campus } from '../../../shared/campus';

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[],
  landedUrl: '',
}));

vi.mock('electron', () => ({
  BrowserWindow: class {
    static fromWebContents = () => undefined;
    url = '';
    webContents = { getURL: () => this.url };
    show = vi.fn();
    focus = vi.fn();
    isDestroyed = () => false;
    on = vi.fn();
    loadURL = vi.fn(async (url: string) => {
      this.url = mock.landedUrl || url;
      mock.landedUrl = '';
    });
    constructor(readonly options: unknown) {
      mock.windows.push(this);
    }
  },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) => mock.handlers.set(name, handler),
  },
}));
vi.mock('../../campus', () => ({
  CAMPUS_PARTITION: 'persist:dela-gzist-campus',
  CampusAuthError: class CampusAuthError extends Error {},
  getCampusSession: vi.fn(async () => ({})),
  campusRequest: vi.fn(async () => '<html>教务首页</html>'),
  flushCampusSession: vi.fn(),
  openCampusLoginWindow: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../ipc', () => ({ attachContextMenu: vi.fn(), checkWorkspaceSender: vi.fn() }));
vi.mock('../attendance', () => ({
  readAttendanceStatus: vi.fn(async () => ({ signed: false })),
  readAttendance: vi.fn(),
  signAttendance: vi.fn(),
}));
vi.mock('../attendance-auto', () => ({ startAttendanceKeeper: vi.fn() }));
vi.mock('../network', () => ({ startNetworkKeeper: vi.fn() }));
vi.mock('../enrollment', () => ({
  initializeEnrollment: vi.fn(),
  readEnrollment: vi.fn(async () => ({ available: false })),
}));

import { CampusAuthError, campusRequest, openCampusLoginWindow } from '../../campus';
import { readAttendanceStatus } from '../attendance';
import { readEnrollment } from '../enrollment';

const event = { sender: { id: 1 } };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mock.windows = [];
  mock.handlers.clear();
  mock.landedUrl = '';
  const { registerCampusServicesIpc } = await import('../index');
  registerCampusServicesIpc();
});

it('查寝会话有效时直接复用，不打开学校窗口', async () => {
  await mock.handlers.get('campus-services:open')!(event, 'attendance');
  expect(readAttendanceStatus).toHaveBeenCalledOnce();
  expect(openCampusLoginWindow).not.toHaveBeenCalled();
  expect(mock.windows).toHaveLength(0);
});

it('查寝统一认证失效时才打开共用认证窗口', async () => {
  vi.mocked(readAttendanceStatus).mockRejectedValueOnce(new CampusAuthError('统一认证已失效'));
  await mock.handlers.get('campus-services:open')!(event, 'attendance');
  expect(openCampusLoginWindow).toHaveBeenCalledWith(
    expect.objectContaining({ url: campus.attendanceUrl, title: '广州理工学院 · 统一认证' }),
  );
});

it('选课停在旧登录页时先用教务 SSO 恢复，再加载选课而非要求另一套登录', async () => {
  mock.landedUrl = `${campus.academicBase}/xtgl/login_slogin.html`;
  const read = mock.handlers.get('campus-services:enrollment')!;
  await read(event);
  expect(campusRequest).toHaveBeenCalledWith(
    expect.anything(),
    `${campus.academicBase}/xtgl/index_initMenu.html`,
    expect.objectContaining({ ssoUrl: campus.loginUrl }),
  );
  expect(mock.windows[0].loadURL).toHaveBeenCalledTimes(2);
  expect(mock.windows[0].url).toContain('/xsxk/');
  expect(mock.windows[0].options.webPreferences.partition).toBe('persist:dela-gzist-campus');
  expect(readEnrollment).toHaveBeenCalledWith(mock.windows[0]);
  await read(event);
  expect(campusRequest).toHaveBeenCalledOnce();
  expect(openCampusLoginWindow).not.toHaveBeenCalled();
});

it('选课统一认证过期时使用统一入口，完成后打开选课页面', async () => {
  vi.mocked(campusRequest).mockRejectedValueOnce(new CampusAuthError('统一认证已失效'));
  await mock.handlers.get('campus-services:open')!(event, 'enrollment');
  expect(openCampusLoginWindow).toHaveBeenCalledWith(
    expect.objectContaining({ url: campus.loginUrl, title: '广州理工学院 · 统一认证' }),
  );
  expect(mock.windows[0].url).toContain('/xsxk/');
});
