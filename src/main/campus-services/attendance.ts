import { z } from 'zod';
import { campusRequest, getCampusSession } from '../campus';
import type {
  AttendanceRecords,
  AttendanceStatus,
  CampusPosition,
} from '../../shared/campus-services';

const controller = 'https://xsfw.gzist.edu.cn/xsfw/sys/swmzncqapp/modules/studentCheckController/';

async function attendancePost(action: string): Promise<unknown> {
  const text = await campusRequest(await getCampusSession(), `${controller}${action}.do`, {
    service: '查寝',
    loginError: '学校登录已失效，请点击学校登录重新认证',
    method: 'POST',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'data=%7B%7D',
  });
  return JSON.parse(text);
}

export async function readAttendanceStatus(): Promise<AttendanceStatus> {
  const parsed = z
    .object({
      code: z.literal('0'),
      data: z.object({
        SFYQD: z.boolean(),
        TIME_INFO: z.object({
          IN_DATE: z.boolean(),
          IN_TIME: z.boolean(),
          CQKSSJ: z.string(),
          CQJSSJ: z.string(),
          ZNCQ_CQFS: z.string(),
        }),
        LOCATION_INFO: z.array(
          z.object({
            QDDD: z.string(),
            JDZB: z.coerce.number().min(-180).max(180),
            WDZB: z.coerce.number().min(-90).max(90),
            YXFW: z.coerce.number().nonnegative(),
          }),
        ),
      }),
    })
    .safeParse(await attendancePost('queryStudentClassInfo'));
  if (!parsed.success) throw new Error('未能读取查寝状态，请完成学校登录后重试');
  const data = parsed.data.data;
  return {
    signed: data.SFYQD,
    required: data.TIME_INFO.IN_DATE,
    inTime: data.TIME_INFO.IN_TIME,
    startTime: data.TIME_INFO.CQKSSJ,
    endTime: data.TIME_INFO.CQJSSJ,
    mode: data.TIME_INFO.ZNCQ_CQFS === '2' ? 'location' : 'qr',
    locations: data.LOCATION_INFO.map((location) => ({
      name: location.QDDD,
      longitude: location.JDZB,
      latitude: location.WDZB,
      radius: location.YXFW,
    })),
  };
}

let signing: Promise<{ message: string; outcome: 'success' | 'skipped' }> | undefined;

export function signAttendance(
  getPosition: () => Promise<CampusPosition>,
): Promise<{ message: string; outcome: 'success' | 'skipped' }> {
  signing ??= (async () => {
    const status = await readAttendanceStatus();
    if (status.signed)
      return { message: '学校已确认今日签到，无需重复提交', outcome: 'skipped' as const };
    if (!status.required) return { message: '学校当前无需签到', outcome: 'skipped' as const };
    if (!status.inTime)
      throw new Error(`当前不在学校签到时段（${status.startTime}–${status.endTime}）`);
    if (status.mode !== 'location') throw new Error('学校要求扫码，请进入学校页面由本人完成');
    const position = await getPosition();
    const radians = Math.PI / 180;
    const inside = status.locations.some((location) => {
      const latitude = (location.latitude - position.latitude) * radians;
      const longitude = (location.longitude - position.longitude) * radians;
      const chord =
        Math.sin(latitude / 2) ** 2 +
        Math.cos(location.latitude * radians) *
          Math.cos(position.latitude * radians) *
          Math.sin(longitude / 2) ** 2;
      return 2 * 6370996.81 * Math.asin(Math.sqrt(Math.min(1, chord))) <= location.radius;
    });
    if (!inside) throw new Error('当前位置不在学校签到范围内，请核对当前位置');
    const result = z
      .object({ code: z.literal('0') })
      .safeParse(await attendancePost('uniFormSignUp'));
    if (!result.success) throw new Error('学校未接受本次签到，请刷新状态核对');
    if (!(await readAttendanceStatus()).signed)
      throw new Error('已提交，但学校尚未确认签到成功，请刷新状态核对');
    return { message: '学校已确认签到成功', outcome: 'success' as const };
  })().finally(() => {
    signing = undefined;
  });
  return signing;
}

const responseSchema = z.object({
  code: z.literal('0'),
  data: z.object({
    inDays: z.number().int().nonnegative(),
    outDays: z.number().int().nonnegative(),
    recordList: z.array(
      z.object({
        RQ: z.string(),
        KQZT_DISPLAY: z.string(),
        KQSJ: z.string().nullish(),
        SSLDM_DISPLAY: z.string().nullish(),
        FJH: z.string().nullish(),
      }),
    ),
  }),
});

export async function readAttendance(
  yearValue: unknown,
  monthValue: unknown,
): Promise<AttendanceRecords> {
  const year = z.number().int().min(2000).max(2100).parse(yearValue);
  const month = z.number().int().min(1).max(12).parse(monthValue);
  const query = new URLSearchParams({
    data: encodeURI(JSON.stringify({ YEAR: year, MONTH: month })),
  });
  const text = await campusRequest(
    await getCampusSession(),
    `https://xsfw.gzist.edu.cn/xsfw/sys/swmzncqapp/modules/studentCheckController/queryStuDormSignRecords.do?${query}`,
    {
      service: '查寝记录',
      loginError: '请先打开查寝页面完成学校认证',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    },
  );
  const parsed = responseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('未能读取查寝记录，请在学校页面确认登录状态后重试');
  const { data } = parsed.data;
  return {
    year,
    month,
    fetchedAt: new Date().toISOString(),
    inDays: data.inDays,
    outDays: data.outDays,
    records: data.recordList.map((row) => ({
      date: row.RQ,
      status: row.KQZT_DISPLAY,
      time: row.KQSJ ?? '',
      dorm: [row.SSLDM_DISPLAY, row.FJH].filter(Boolean).join(' '),
    })),
  };
}
