import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('../../settings/prefs', () => ({
  readSetting: (key: string) => settings.get(key),
  writeSetting: (key: string, value: string) => settings.set(key, value),
}));
vi.mock('../attendance', () => ({ signAttendance: vi.fn() }));
import { signAttendance } from '../attendance';
import {
  checkAttendanceSchedule,
  configureAttendance,
  readAttendanceAutomation,
} from '../attendance-auto';
beforeEach(() => {
  settings.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T14:00:00Z'));
  vi.mocked(signAttendance).mockReset();
});
afterEach(() => vi.useRealTimers());

it('按北京时间每日只尝试一次，重复检查或重载配置不重交，次日可再运行', async () => {
  configureAttendance({ enabled: true, time: '22:00', position: { longitude: 113, latitude: 23 } });
  const device = vi.fn();
  vi.mocked(signAttendance).mockImplementation(async (getPosition) => {
    expect(await getPosition()).toEqual({ longitude: 113, latitude: 23 });
    return { message: '学校已确认签到成功', outcome: 'success' };
  });
  await checkAttendanceSchedule(device);
  await checkAttendanceSchedule(device);
  configureAttendance({ enabled: true, time: '22:00', position: { longitude: 113, latitude: 23 } });
  await checkAttendanceSchedule(device);
  expect(signAttendance).toHaveBeenCalledTimes(1);
  expect(device).not.toHaveBeenCalled();
  expect(readAttendanceAutomation()).toMatchObject({ lastDate: '2026-11-12', result: 'success' });
  vi.setSystemTime(new Date('2026-11-13T14:00:00Z'));
  await checkAttendanceSchedule(device);
  expect(signAttendance).toHaveBeenCalledTimes(2);
});

it('不补交错过的分钟，关闭计划后不执行', async () => {
  configureAttendance({ enabled: true, time: '21:59', position: null });
  await checkAttendanceSchedule(vi.fn());
  configureAttendance({ enabled: false, time: '22:00', position: null });
  await checkAttendanceSchedule(vi.fn());
  expect(signAttendance).not.toHaveBeenCalled();
});

it('失败保存原因，当天不自动重试，设备定位仅在选择该模式后获取', async () => {
  configureAttendance({ enabled: true, time: '22:00', position: null });
  const device = vi.fn(async () => ({ longitude: 113, latitude: 23 }));
  vi.mocked(signAttendance).mockImplementation(async (getPosition) => {
    await getPosition();
    throw new Error('学校登录已失效');
  });
  await checkAttendanceSchedule(device);
  await checkAttendanceSchedule(device);
  expect(device).toHaveBeenCalledTimes(1);
  expect(signAttendance).toHaveBeenCalledTimes(1);
  expect(readAttendanceAutomation()).toMatchObject({ result: 'error', message: '学校登录已失效' });
});
