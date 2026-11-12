import { z } from 'zod';
import type { AcademicExam, AcademicGrade, AcademicSnapshot } from '../../shared/academics';
import { campus } from '../../shared/campus';
import type { TimetableResult } from '../../shared/timetable';
import { CampusAuthError, campusRequest, flushCampusSession, getCampusSession } from '../campus';
import { readSetting, writeSetting } from '../settings/prefs';
import { getDatabase } from '../database';

export const academicSemesterSchema = z
  .string()
  .regex(/^\d{4}-\d{4}-[123]$/)
  .refine((value) => {
    const [start, end] = value.split('-').map(Number);
    return end === start! + 1;
  }, '学年必须连续');
export const academicKindSchema = z.enum(['grades', 'exams']);

export function clearAcademicData(): void {
  const db = getDatabase();
  db.transaction(() => {
    db.prepare(
      "DELETE FROM workspace_settings WHERE key LIKE 'gzist-grades:%' OR key LIKE 'gzist-exams:%' OR key LIKE 'gzist-periods:%'",
    ).run();
    db.prepare('DELETE FROM timetable_lessons').run();
    db.prepare('DELETE FROM timetable_sync').run();
  })();
}

const text = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => String(value ?? '').trim());
const gradeSchema = z.object({
  kch: text,
  kcmc: z.string().trim().min(1),
  cj: text,
  xf: text,
  jd: text,
  ksxz: text,
  kcxzmc: text,
});
const examSchema = z.object({
  kch: text,
  kcmc: z.string().trim().min(1),
  kssj: text,
  cdmc: text,
  cdxqmc: text,
  zwh: text,
  ksfs: text,
});
const pageSchema = z.object({
  items: z.array(z.unknown()),
  total: z.coerce.number().int().nonnegative(),
});

export function academicSemesterParams(value: string): { xnm: string; xqm: string } {
  const semester = academicSemesterSchema.parse(value);
  const [year, , term] = semester.split('-');
  return {
    xnm: year!,
    xqm: ({ '1': '3', '2': '12', '3': '16' } as Record<string, string>)[term!]!,
  };
}

export function parseAcademicPage(value: string) {
  if (/^\s*(?:<!doctype|<html)/i.test(value)) {
    if (/login_slogin|lyuapServer|name=["']?(?:yhm|mm)\b/i.test(value))
      throw new CampusAuthError('教务登录已失效，请重新登录');
    throw new Error('教务系统返回了网页，请在学校教务页面确认查询是否开放');
  }
  return pageSchema.parse(JSON.parse(value));
}

export function parseGrades(items: unknown[]): AcademicGrade[] {
  return z
    .array(gradeSchema)
    .parse(items)
    .map((row) => ({
      courseCode: row.kch,
      courseName: row.kcmc,
      score: row.cj,
      credits: row.xf,
      gradePoint: row.jd,
      assessment: row.ksxz,
      courseType: row.kcxzmc,
    }));
}

export function parseExams(items: unknown[]): AcademicExam[] {
  return z
    .array(examSchema)
    .parse(items)
    .map((row) => ({
      courseCode: row.kch,
      courseName: row.kcmc,
      time: row.kssj,
      location: row.cdmc,
      campus: row.cdxqmc,
      seat: row.zwh,
      assessment: row.ksfs,
    }));
}

export function readGrades(semesterValue: unknown): AcademicSnapshot<AcademicGrade> {
  const semester = academicSemesterSchema.parse(semesterValue);
  const value = readSetting(`gzist-grades:${semester}`);
  return value ? JSON.parse(value) : { semester, syncedAt: null, items: [] };
}

export function readExams(semesterValue: unknown): AcademicSnapshot<AcademicExam> {
  const semester = academicSemesterSchema.parse(semesterValue);
  const value = readSetting(`gzist-exams:${semester}`);
  return value ? JSON.parse(value) : { semester, syncedAt: null, items: [] };
}

export async function syncAcademics(
  kindValue: unknown,
  semesterValue: unknown,
): Promise<TimetableResult> {
  const kind = academicKindSchema.parse(kindValue);
  const semester = academicSemesterSchema.parse(semesterValue);
  const { xnm, xqm } = academicSemesterParams(semester);
  const service = kind === 'grades' ? '成绩' : '考试安排';
  const path =
    kind === 'grades'
      ? '/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005'
      : '/kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105';
  try {
    const items: unknown[] = [];
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const body = new URLSearchParams({
        xnm,
        xqm,
        'queryModel.showCount': '100',
        'queryModel.currentPage': String(page),
        'queryModel.sortName': kind === 'grades' ? 'kcmc' : 'kssj',
        'queryModel.sortOrder': 'asc',
      });
      const response = parseAcademicPage(
        await campusRequest(await getCampusSession(), `${campus.academicBase}${path}`, {
          service,
          loginError: '教务登录已失效，请重新登录',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: `${campus.academicBase}${path.replace('doType=query&', '')}`,
          },
          body: body.toString(),
        }),
      );
      pages = response.total;
      if (pages > 100) throw new Error('教务查询页数异常，请到学校教务页面核对');
      if (page < pages && response.items.length === 0)
        throw new Error('教务分页结果不完整，请重试');
      items.push(...response.items);
    }
    const snapshot = {
      semester,
      syncedAt: new Date().toISOString(),
      items: kind === 'grades' ? parseGrades(items) : parseExams(items),
    };
    await flushCampusSession();
    writeSetting(`gzist-${kind}:${semester}`, JSON.stringify(snapshot));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof z.ZodError || error instanceof SyntaxError
          ? `${service}返回了无法识别的数据，原有缓存已保留`
          : error instanceof Error
            ? error.message
            : String(error),
      ...(error instanceof CampusAuthError ? { reason: 'auth' as const } : {}),
    };
  }
}
