import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../campus', () => ({
  CampusAuthError: class CampusAuthError extends Error {},
  campusRequest: vi.fn(),
  flushCampusSession: vi.fn(),
  getCampusSession: vi.fn(async () => ({})),
}));
vi.mock('../../database', () => ({ getDatabase: vi.fn() }));

import { getDatabase } from '../../database';
import { campusRequest } from '../../campus';
import {
  academicSemesterParams,
  clearAcademicData,
  parseAcademicPage,
  parseExams,
  parseGrades,
  readGrades,
  syncAcademics,
} from '../api';
import { isAcademicPage } from '../../../shared/campus';

let db: Database.Database;

beforeEach(() => {
  vi.clearAllMocks();
  db = new Database(':memory:');
  db.exec(`CREATE TABLE workspace_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE timetable_lessons (semester TEXT);
    CREATE TABLE timetable_sync (semester TEXT);
    CREATE TABLE calendar_events (title TEXT);`);
  vi.mocked(getDatabase).mockReturnValue(db);
});
afterEach(() => db.close());

describe('广州理工学院教务', () => {
  it('只将教务域下的业务页面视为登录导航目标', () => {
    expect(isAcademicPage('https://jw.gzist.edu.cn/jwglxt/xtgl/index_initMenu.html')).toBe(true);
    expect(isAcademicPage('http://jw.gzist.edu.cn/jwglxt/xtgl/index_initMenu.html')).toBe(true);
    expect(isAcademicPage('https://jw.gzist.edu.cn:8443/jwglxt/')).toBe(false);
    expect(isAcademicPage('https://jw.gzist.edu.cn/jwglxt/xtgl/login_slogin.html')).toBe(false);
    expect(isAcademicPage('https://ids.gzist.edu.cn/lyuapServer/login')).toBe(false);
    expect(isAcademicPage('https://jw.gzist.edu.cn.attacker.test/jwglxt/')).toBe(false);
  });

  it('校验连续学年并转换正方学期编码', () => {
    expect(academicSemesterParams('2026-2027-1')).toEqual({ xnm: '2026', xqm: '3' });
    expect(academicSemesterParams('2026-2027-2')).toEqual({ xnm: '2026', xqm: '12' });
    expect(() => academicSemesterParams('2026-2029-1')).toThrow();
  });

  it('保留文字成绩和零分，缺少绩点时不推算', () => {
    expect(parseGrades([{ kcmc: '课程 A', cj: 0, xf: 3 }])[0]).toMatchObject({
      score: '0',
      credits: '3',
      gradePoint: '',
    });
    expect(parseGrades([{ kcmc: '课程 B', cj: '优秀' }])[0]?.score).toBe('优秀');
    expect(() => parseGrades([{}])).toThrow();
    expect(
      parseExams([{ kcmc: '课程 C', kssj: '待定', cdxqmc: '白云校区', zwh: 0 }])[0],
    ).toMatchObject({
      time: '待定',
      location: '',
      campus: '白云校区',
      seat: '0',
    });
  });

  it('完整抓取分页后才更新缓存，异常时保留上次数据', async () => {
    vi.mocked(campusRequest)
      .mockResolvedValueOnce(
        JSON.stringify({ totalPage: '2', items: [{ kcmc: '课程 A', cj: '80' }] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ totalPage: 2, items: [{ kcmc: '课程 B', cj: '合格' }] }),
      );
    expect(await syncAcademics('grades', '2026-2027-1')).toEqual({ ok: true });
    const first = readGrades('2026-2027-1');
    expect(first.items.map((item) => item.courseName)).toEqual(['课程 A', '课程 B']);
    expect(campusRequest).toHaveBeenNthCalledWith(
      2,
      {},
      expect.stringContaining('https://jw.gzist.edu.cn/jwglxt/cjcx/'),
      expect.objectContaining({ body: expect.stringContaining('queryModel.currentPage=2') }),
    );
    vi.mocked(campusRequest)
      .mockResolvedValueOnce(JSON.stringify({ totalPage: 2, items: [{ kcmc: '新数据' }] }))
      .mockRejectedValueOnce(new Error('网络失败'));
    expect(await syncAcademics('grades', '2026-2027-1')).toMatchObject({ ok: false });
    expect(readGrades('2026-2027-1')).toEqual(first);
  });

  it('区分未同步、有效空结果与登录失效，登录页不能覆盖缓存', async () => {
    expect(readGrades('2026-2027-1').syncedAt).toBeNull();
    vi.mocked(campusRequest).mockResolvedValueOnce('{"totalPage":0,"items":[]}');
    expect(await syncAcademics('grades', '2026-2027-1')).toEqual({ ok: true });
    const snapshot = readGrades('2026-2027-1');
    expect(snapshot.syncedAt).not.toBeNull();
    vi.mocked(campusRequest).mockResolvedValueOnce(
      '<!DOCTYPE html><html><form action="login_slogin.html"></form></html>',
    );
    expect(await syncAcademics('grades', '2026-2027-1')).toMatchObject({
      ok: false,
      reason: 'auth',
    });
    expect(readGrades('2026-2027-1')).toEqual(snapshot);
    expect(() => parseAcademicPage('{}')).toThrow();
  });

  it('切换或退出账号时清除教务缓存，保留个人日历和其他设置', () => {
    db.exec(`INSERT INTO workspace_settings VALUES ('gzist-grades:2026-2027-1', '{}'), ('gzist-exams:2026-2027-1', '{}'), ('gzist-periods:2026-2027-1', '{}'), ('theme', 'dark');
      INSERT INTO timetable_lessons VALUES ('2026-2027-1');
      INSERT INTO timetable_sync VALUES ('2026-2027-1');
      INSERT INTO calendar_events VALUES ('个人事件');`);
    clearAcademicData();
    expect(db.prepare('SELECT key FROM workspace_settings').all()).toEqual([{ key: 'theme' }]);
    expect(db.prepare('SELECT * FROM timetable_lessons').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM timetable_sync').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM calendar_events').all()).toHaveLength(1);
  });
});
