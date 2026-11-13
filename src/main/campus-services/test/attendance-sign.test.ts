import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../campus', () => ({ getCampusSession: async () => ({}), campusRequest: vi.fn() }));
import { campusRequest } from '../../campus';
import { readAttendanceStatus, signAttendance } from '../attendance';

const state = (overrides = {}) => ({
  code: '0',
  data: {
    SFYQD: false,
    TIME_INFO: { IN_DATE: true, IN_TIME: true, CQKSSJ: '21:00', CQJSSJ: '23:00', ZNCQ_CQFS: '2' },
    LOCATION_INFO: [{ QDDD: '示例位置', JDZB: '113', WDZB: '23', YXFW: 100 }],
    CHARGE_PERSON: { name: 'private-fixture' },
    ...overrides,
  },
});
const mock = vi.mocked(campusRequest);
beforeEach(() => mock.mockReset());

it('只返回签到状态与学校登记范围，不传递管理人员或学生身份字段', async () => {
  mock.mockResolvedValue(JSON.stringify(state()));
  const result = await readAttendanceStatus();
  expect(result).toMatchObject({
    signed: false,
    inTime: true,
    mode: 'location',
    locations: [{ longitude: 113, latitude: 23, radius: 100 }],
  });
  expect(JSON.stringify(result)).not.toContain('private-fixture');
});

it('在时段和位置均有效时只提交一次，并以学校回读状态确认成功', async () => {
  mock
    .mockResolvedValueOnce(JSON.stringify(state()))
    .mockResolvedValueOnce('{"code":"0"}')
    .mockResolvedValueOnce(JSON.stringify(state({ SFYQD: true })));
  const getPosition = vi.fn(async () => ({ longitude: 113, latitude: 23 }));
  const first = signAttendance(getPosition);
  const second = signAttendance(getPosition);
  expect(await first).toMatchObject({ outcome: 'success' });
  await second;
  expect(mock.mock.calls.filter((call) => call[1].includes('/uniFormSignUp.do'))).toHaveLength(1);
  expect(mock.mock.calls[1]![2]).toMatchObject({ method: 'POST', body: 'data=%7B%7D' });
});

it('已签到时跳过提交，也不获取位置', async () => {
  mock.mockResolvedValue(JSON.stringify(state({ SFYQD: true })));
  const position = vi.fn();
  expect((await signAttendance(position)).outcome).toBe('skipped');
  expect(position).not.toHaveBeenCalled();
  expect(mock).toHaveBeenCalledTimes(1);
});

it('超出位置范围、非学校时段或要求扫码时不提交', async () => {
  mock.mockResolvedValue(JSON.stringify(state()));
  await expect(signAttendance(async () => ({ longitude: 114, latitude: 24 }))).rejects.toThrow(
    '范围',
  );
  mock.mockResolvedValue(
    JSON.stringify(state({ TIME_INFO: { ...state().data.TIME_INFO, IN_TIME: false } })),
  );
  await expect(signAttendance(vi.fn())).rejects.toThrow('时段');
  mock.mockResolvedValue(
    JSON.stringify(state({ TIME_INFO: { ...state().data.TIME_INFO, ZNCQ_CQFS: '1' } })),
  );
  await expect(signAttendance(vi.fn())).rejects.toThrow('扫码');
  expect(mock.mock.calls.some((call) => call[1].includes('/uniFormSignUp.do'))).toBe(false);
});

it('学校没有确认结果时不把提交成功当作签到成功', async () => {
  mock
    .mockResolvedValueOnce(JSON.stringify(state()))
    .mockResolvedValueOnce('{"code":"0"}')
    .mockResolvedValueOnce(JSON.stringify(state()));
  await expect(signAttendance(async () => ({ longitude: 113, latitude: 23 }))).rejects.toThrow(
    '尚未确认',
  );
});
