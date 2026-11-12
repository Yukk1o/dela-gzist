import { describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import Sqlite from 'better-sqlite3';
import {
  deleteCalendarEvent,
  listLessons,
  getTimetableState,
  openLoginWindow,
  parseSemesterStart,
  parseWeekNumbers,
  syncTimetable,
} from '../api';
import { campusRequest, getCampusSession, openCampusLoginWindow } from '../../campus';
import { getDatabase } from '../../database';

vi.mock('electron', () => ({
  BrowserWindow: {},
  ipcMain: {},
  session: {},
  net: { request: vi.fn() },
}));
vi.mock('../../database', () => ({ getDatabase: vi.fn() }));
vi.mock('../../campus', () => ({
  CampusAuthError: class CampusAuthError extends Error {},
  campusRequest: vi.fn(),
  flushCampusSession: vi.fn(),
  getCampusSession: vi.fn(),
  openCampusLoginWindow: vi.fn(),
}));
vi.mock('../graduate', () => ({
  fetchGraduateTimetable: vi.fn(),
  GRADUATE_CAMPUS_ORIGIN: 'https://yjs.sjtu.edu.cn',
  GRADUATE_LOGIN_URL: 'https://yjs.sjtu.edu.cn/gsapp/sys/wdkbapp/*default/index.do#/xskcb',
}));

describe('parseWeekNumbers', () => {
  it('expands ranges and comma-separated weeks', () => {
    expect(parseWeekNumbers('1-4,7周')).toEqual([1, 2, 3, 4, 7]);
  });

  it('respects odd and even week markers', () => {
    expect(parseWeekNumbers('1-8周(单)')).toEqual([1, 3, 5, 7]);
    expect(parseWeekNumbers('2-8周(双)')).toEqual([2, 4, 6, 8]);
  });

  it('单双周只限制所在段，保留其他正常教学周', () => {
    expect(parseWeekNumbers('4-5周,7-9周(单),10-12周')).toEqual([4, 5, 7, 9, 10, 11, 12]);
    expect(parseWeekNumbers('1-4周(双)；第7周')).toEqual([2, 4, 7]);
  });
});

describe('parseSemesterStart', () => {
  it('finds the earliest valid date in the weekly date labels', () => {
    expect(parseSemesterStart(['第2周 2026/09/21', '第1周 2026-09-14'])).toBe('2026-09-14');
  });

  it('ignores malformed dates', () => {
    expect(parseSemesterStart(['第1周', '2026-02-30'])).toBeNull();
  });
});

describe('deleteCalendarEvent', () => {
  it('deletes only from calendar_events with a validated id', () => {
    const run = vi.fn();
    const prepare = vi.fn(() => ({ run }));
    vi.mocked(getDatabase).mockReturnValue({ prepare } as unknown as Database);
    deleteCalendarEvent(7);
    expect(prepare).toHaveBeenCalledWith('DELETE FROM calendar_events WHERE id = ?');
    expect(run).toHaveBeenCalledWith(7);
    expect(() => deleteCalendarEvent(0)).toThrow();
    expect(() => deleteCalendarEvent(2.5)).toThrow();
    expect(() => deleteCalendarEvent('3')).toThrow();
    expect(prepare).toHaveBeenCalledOnce();
  });
});

describe('syncTimetable', () => {
  it('有效的教务会话可直接复用，无需再次进入统一认证', async () => {
    vi.clearAllMocks();
    vi.mocked(getCampusSession).mockResolvedValue({} as never);
    vi.mocked(campusRequest).mockResolvedValueOnce(JSON.stringify({ kbList: [] }));
    expect(await openLoginWindow({} as never)).toEqual({ ok: true });
    expect(openCampusLoginWindow).not.toHaveBeenCalled();
  });
  it('按本校课表入口同步晚课，不采用节次接口的行政作息', async () => {
    vi.clearAllMocks();
    const db = new Sqlite(':memory:');
    db.exec(`CREATE TABLE workspace_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE timetable_lessons (id INTEGER PRIMARY KEY, semester TEXT, source_id TEXT,
        course_code TEXT, course_name TEXT, class_name TEXT, teacher TEXT, campus TEXT,
        classroom TEXT, weekday INTEGER, start_period INTEGER, end_period INTEGER,
        periods_text TEXT, weeks_text TEXT, week_numbers TEXT, credits REAL, note TEXT);
      CREATE TABLE timetable_sync (semester TEXT PRIMARY KEY, last_synced_at TEXT, semester_start TEXT);`);
    vi.mocked(getDatabase).mockReturnValue(db);
    vi.mocked(getCampusSession).mockResolvedValue({} as never);
    vi.mocked(campusRequest)
      .mockResolvedValueOnce(
        JSON.stringify({
          kbList: [{ kcmc: '晚课示例', xqj: '1', jcs: '9-10', zcd: '4-5周,7-9周(单),10-12周' }],
          rqazcList: [],
          sjkList: [{ kcmc: '&ldquo;实践课&rdquo;示例', qsjsz: '1-4周' }],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify([{ zs: '1', rq: '2026-08-31/2026-09-06' }]));
    try {
      expect(await syncTimetable('2026-2027-1')).toEqual({ ok: true });
      expect(campusRequest).toHaveBeenNthCalledWith(
        1,
        {},
        'https://jw.gzist.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151',
        expect.objectContaining({
          headers: expect.objectContaining({
            Referer:
              'https://jw.gzist.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default',
          }),
        }),
      );
      expect(getTimetableState('2026-2027-1')).toMatchObject({
        semesterStart: '2026-08-31',
        unscheduledCourses: [{ courseName: '“实践课”示例', weeksText: '1-4周' }],
      });
      expect(listLessons('2026-2027-1')).toMatchObject([
        {
          courseName: '晚课示例',
          startMinute: 1120,
          endMinute: 1200,
          weekNumbers: [4, 5, 7, 9, 10, 11, 12],
        },
      ]);
    } finally {
      db.close();
    }
  });

  it('keeps cached lessons when the requested semester is empty', async () => {
    vi.clearAllMocks();
    vi.mocked(getCampusSession).mockResolvedValue({} as never);
    vi.mocked(campusRequest).mockResolvedValue(JSON.stringify({ kbList: [] }));

    await expect(syncTimetable('2026-2027-1')).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('原有课表不会被清除'),
    });
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
