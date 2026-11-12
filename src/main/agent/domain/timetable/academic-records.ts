import { z } from 'zod';
import { academicSemesterSchema, readExams, readGrades } from '../../../academics/api';
import { coverage, freshness, tool } from '../shared';

const input = z.object({ semester: academicSemesterSchema }).strict();

export const queryGradesTool = tool(
  '按学期读取广州理工学院成绩缓存；包含原始成绩与学校提供的绩点，不自行推算绩点。未同步时请用户到教务页同步。',
  input,
  ({ semester }) => {
    const result = readGrades(semester);
    return {
      ...result,
      freshness: freshness('cached', result.syncedAt),
      coverage: coverage(
        `gzist_grades:${semester}`,
        Boolean(result.syncedAt),
        result.syncedAt ? [] : ['该学期成绩尚未同步，请到教务页同步'],
      ),
    };
  },
);

export const queryExamsTool = tool(
  '按学期读取广州理工学院考试安排缓存。考试时间、地点和座位以学校公布的内容为准；空结果不表示无需考试。',
  input,
  ({ semester }) => {
    const result = readExams(semester);
    return {
      ...result,
      freshness: freshness('cached', result.syncedAt),
      coverage: coverage(
        `gzist_exams:${semester}`,
        Boolean(result.syncedAt),
        result.syncedAt ? [] : ['该学期考试安排尚未同步，请到教务页同步'],
      ),
    };
  },
);
