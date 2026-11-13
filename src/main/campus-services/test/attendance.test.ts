import { expect, it, vi } from 'vitest';

vi.mock('../../campus', () => ({ getCampusSession: async () => ({}), campusRequest: vi.fn() }));
import { campusRequest } from '../../campus';
import { readAttendance } from '../attendance';

it('按学校 data 参数编码读取本人月份记录，不向界面传递学生标识', async () => {
  vi.mocked(campusRequest).mockResolvedValue(
    JSON.stringify({
      code: '0',
      data: {
        inDays: 1,
        outDays: 0,
        recordList: [
          {
            RQ: '2026-11-01',
            KQZT_DISPLAY: '在寝',
            KQSJ: '2026-11-01 22:00:00',
            SSLDM_DISPLAY: '示例楼',
            FJH: '示例房间',
            XSBH: 'private-fixture',
          },
        ],
      },
    }),
  );
  const result = await readAttendance(2026, 11);
  expect(result.records).toEqual([
    { date: '2026-11-01', status: '在寝', time: '2026-11-01 22:00:00', dorm: '示例楼 示例房间' },
  ]);
  const url = new URL(vi.mocked(campusRequest).mock.calls[0]![1]);
  expect(JSON.parse(decodeURI(url.searchParams.get('data')!))).toEqual({ YEAR: 2026, MONTH: 11 });
  expect(JSON.stringify(result)).not.toContain('private-fixture');
});

it('学校拒绝查询时不把空数据当作成功', async () => {
  vi.mocked(campusRequest).mockResolvedValue('{"code":"1","msg":"fixture"}');
  await expect(readAttendance(2026, 11)).rejects.toThrow('未能读取');
});
