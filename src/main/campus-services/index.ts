import { BrowserWindow, clipboard, ipcMain, shell, type WebContents } from 'electron';
import { z } from 'zod';
import {
  CAMPUS_PARTITION,
  CampusAuthError,
  campusRequest,
  flushCampusSession,
  getCampusSession,
  openCampusLoginWindow,
} from '../campus';
import { attachContextMenu, checkWorkspaceSender } from '../ipc';
import { campus, isAcademicPage } from '../../shared/campus';
import type { CampusService } from '../../shared/campus-services';
import { readAttendance, readAttendanceStatus, signAttendance } from './attendance';
import {
  attendancePositionSchema,
  configureAttendance,
  readAttendanceAutomation,
  startAttendanceKeeper,
} from './attendance-auto';
import { configureNetwork, connectNetwork, networkState, startNetworkKeeper } from './network';
import {
  initializeEnrollment,
  readEnrollment,
  scheduleEnrollment,
  stopEnrollment,
} from './enrollment';

const windows = new Map<CampusService, BrowserWindow>();
const services = {
  attendance: {
    title: '广州理工学院 · 查寝与考勤',
    url: campus.attendanceUrl,
  },
  enrollment: {
    title: '广州理工学院 · 选课',
    url: `${campus.academicBase}/xsxk/zzxkyzb_cxZzxkYzbIndex.html?gnmkdm=N253512&layout=default`,
  },
} as const;

async function ensureAcademicSession(): Promise<void> {
  await campusRequest(await getCampusSession(), `${campus.academicBase}/xtgl/index_initMenu.html`, {
    service: '教务',
    loginError: '学校统一认证已失效，请点击学校选课页面重新认证',
    ssoUrl: campus.loginUrl,
  });
}

async function openService(
  sender: WebContents | undefined,
  service: CampusService,
  show = true,
): Promise<BrowserWindow> {
  const existing = windows.get(service);
  if (existing && !existing.isDestroyed()) {
    if (show) {
      existing.show();
      existing.focus();
    }
    return existing;
  }
  await getCampusSession();
  const window = new BrowserWindow({
    title: services[service].title,
    width: 1100,
    height: 800,
    parent: sender ? (BrowserWindow.fromWebContents(sender) ?? undefined) : undefined,
    show,
    autoHideMenuBar: true,
    webPreferences: {
      partition: CAMPUS_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windows.set(service, window);
  attachContextMenu(window.webContents);
  window.on('closed', () => windows.delete(service));
  await window.loadURL(services[service].url);
  return window;
}

async function devicePosition() {
  const window = await openService(undefined, 'attendance', false);
  if (new URL(window.webContents.getURL()).origin !== 'https://xsfw.gzist.edu.cn')
    throw new Error('学校登录已失效，请点击学校登录重新认证');
  const position: unknown = await window.webContents
    .executeJavaScript(`new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('未能获取当前位置，请在 Dela 中核对并选择当前位置')), 15000);
    if (!window.MAPUTIL) { clearTimeout(timer); reject(new Error('学校定位尚未就绪，请稍后重试')); return; }
    window.curlng = undefined; window.curlat = undefined;
    MAPUTIL.getCurrentPosition(() => { clearTimeout(timer); resolve({ longitude: window.curlng, latitude: window.curlat }); });
  })`);
  return attendancePositionSchema.parse(position);
}

export function registerCampusServicesIpc(): void {
  ipcMain.handle('campus-services:open', async (event, service: unknown) => {
    checkWorkspaceSender(event);
    const target = z.enum(['attendance', 'enrollment']).parse(service);
    const options = {
      sender: event.sender,
      title: '广州理工学院 · 统一认证',
      url: target === 'attendance' ? campus.attendanceUrl : campus.loginUrl,
      reached: (value: string) =>
        target === 'attendance'
          ? new URL(value).origin === 'https://xsfw.gzist.edu.cn'
          : isAcademicPage(value),
      retryProbe: true,
      probe: async () => {
        if (target === 'attendance') await readAttendanceStatus();
        else await ensureAcademicSession();
        await flushCampusSession();
      },
    };
    try {
      await options.probe();
    } catch (error) {
      if (!(error instanceof CampusAuthError)) throw error;
      const result = await openCampusLoginWindow(options);
      if (!result.ok) throw new Error(result.error);
    }
    if (target === 'enrollment') {
      const window = await openService(event.sender, target);
      if (!isAcademicPage(window.webContents.getURL()))
        await window.loadURL(services.enrollment.url);
    }
  });
  ipcMain.handle('campus-services:attendance', (event, year: unknown, month: unknown) => {
    checkWorkspaceSender(event);
    return readAttendance(year, month);
  });
  ipcMain.handle('campus-services:attendance-status', (event) => {
    checkWorkspaceSender(event);
    return readAttendanceStatus();
  });
  ipcMain.handle('campus-services:attendance-automation', (event) => {
    checkWorkspaceSender(event);
    return readAttendanceAutomation();
  });
  ipcMain.handle('campus-services:configure-attendance', (event, config: unknown) => {
    checkWorkspaceSender(event);
    return configureAttendance(config);
  });
  ipcMain.handle('campus-services:sign-attendance', (event, value: unknown) => {
    checkWorkspaceSender(event);
    const position = attendancePositionSchema.nullable().parse(value);
    return signAttendance(async () => position ?? devicePosition());
  });
  ipcMain.handle('campus-services:network-state', (event) => {
    checkWorkspaceSender(event);
    return networkState();
  });
  ipcMain.handle('campus-services:configure-network', (event, config: unknown) => {
    checkWorkspaceSender(event);
    return configureNetwork(config);
  });
  ipcMain.handle('campus-services:connect-network', (event) => {
    checkWorkspaceSender(event);
    return connectNetwork();
  });
  ipcMain.handle('campus-services:community', async (event) => {
    checkWorkspaceSender(event);
    clipboard.writeText('#小程序://广小理/rnmxRxSMjtqvTxp');
    await shell.openExternal('weixin://');
  });
  ipcMain.handle('campus-services:enrollment', async (event) => {
    checkWorkspaceSender(event);
    const window = await openService(event.sender, 'enrollment', false);
    if (!isAcademicPage(window.webContents.getURL())) {
      await ensureAcademicSession();
      await window.loadURL(services.enrollment.url);
    }
    return readEnrollment(window);
  });
  ipcMain.handle('campus-services:schedule-enrollment', (event, ids: unknown, runAt: unknown) => {
    checkWorkspaceSender(event);
    return scheduleEnrollment(windows.get('enrollment'), ids, runAt);
  });
  ipcMain.handle('campus-services:stop-enrollment', (event) => {
    checkWorkspaceSender(event);
    return stopEnrollment();
  });
  initializeEnrollment();
  startNetworkKeeper();
  startAttendanceKeeper(devicePosition);
}
