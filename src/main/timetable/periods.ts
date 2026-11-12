import { z } from 'zod';

const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export function parsePeriodTimes(input: unknown): Record<string, [number, number]> {
  const rows = z
    .array(
      z.object({
        jcmc: z.coerce.number().int().min(1).max(20),
        qssj: clockSchema,
        jssj: clockSchema,
      }),
    )
    .min(1)
    .parse(input);
  const periods: Record<string, [number, number]> = {};
  for (const row of rows) {
    const [startHour, startMinute] = row.qssj.split(':').map(Number);
    const [endHour, endMinute] = row.jssj.split(':').map(Number);
    const start = startHour! * 60 + startMinute!;
    const end = endHour! * 60 + endMinute!;
    if (end <= start) throw new Error('学校节次时间无效');
    periods[row.jcmc] = [start, end];
  }
  return periods;
}
