import { z } from 'zod';
import { readSetting, writeSetting } from '../settings/prefs';
import { signAttendance } from './attendance';
import type { AttendanceAutomation, CampusPosition } from '../../shared/campus-services';

export const attendancePositionSchema = z
  .object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) })
  .strict();
const configSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  position: attendancePositionSchema.nullable(),
});
let timer: ReturnType<typeof setInterval> | undefined;
let pending = false;

export function readAttendanceAutomation(): AttendanceAutomation {
  const saved = readSetting('gzist-attendance-auto');
  return saved
    ? JSON.parse(saved)
    : {
        enabled: false,
        time: '',
        position: null,
        lastDate: null,
        lastAttemptAt: null,
        result: null,
        message: '尚未启用自动签到',
      };
}

export function configureAttendance(value: unknown): AttendanceAutomation {
  const config = configSchema.parse(value);
  const state = readAttendanceAutomation();
  const next = {
    ...state,
    ...config,
    message: config.enabled
      ? `每天北京时间 ${config.time} 尝试一次，请保持 Dela 运行`
      : '自动签到已关闭',
  };
  writeSetting('gzist-attendance-auto', JSON.stringify(next));
  return next;
}

export async function checkAttendanceSchedule(
  getPosition: () => Promise<CampusPosition>,
): Promise<void> {
  const plan = readAttendanceAutomation();
  if (!plan.enabled || pending) return;
  const now = new Date();
  const clock = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const date = clock.slice(0, 10);
  if (clock.slice(11, 16) !== plan.time || plan.lastDate === date) return;
  pending = true;
  const attempt: AttendanceAutomation = {
    ...plan,
    lastDate: date,
    lastAttemptAt: now.toISOString(),
    result: 'running',
    message: '正在按每日计划核验并签到',
  };
  writeSetting('gzist-attendance-auto', JSON.stringify(attempt));
  try {
    const result = await signAttendance(async () => plan.position ?? getPosition());
    const current = readAttendanceAutomation();
    writeSetting(
      'gzist-attendance-auto',
      JSON.stringify({
        ...current,
        result: result.outcome,
        message: result.message,
      }),
    );
  } catch (error) {
    const current = readAttendanceAutomation();
    writeSetting(
      'gzist-attendance-auto',
      JSON.stringify({
        ...current,
        result: 'error',
        message: error instanceof Error ? error.message : '签到失败，请核对学校状态',
      }),
    );
  } finally {
    pending = false;
  }
}

export function startAttendanceKeeper(getPosition: () => Promise<CampusPosition>): void {
  if (timer) return;
  const check = () => {
    void checkAttendanceSchedule(getPosition).catch(() => {});
  };
  timer = setInterval(check, 15000);
  timer.unref();
  check();
}
