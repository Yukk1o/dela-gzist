import { useEffect, useState } from 'react';
import { LogIn, RefreshCw } from 'lucide-react';
import type {
  AcademicExam,
  AcademicGrade,
  AcademicKind,
  AcademicSnapshot,
} from '../../../shared/academics';
import { campus, currentAcademicSemester } from '../../../shared/campus';
import { Button } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { semesterLabel, semesterOptions, formatSyncTime } from './timetable-format';
import { errorText } from '../../workspace/store';

export function AcademicRecords({ kind }: { kind: AcademicKind }) {
  const [semester, setSemester] = useState(() => currentAcademicSemester());
  return (
    <AcademicSemesterRecords
      key={`${kind}:${semester}`}
      kind={kind}
      semester={semester}
      onSemesterChange={setSemester}
    />
  );
}

function AcademicSemesterRecords({
  kind,
  semester,
  onSemesterChange,
}: {
  kind: AcademicKind;
  semester: string;
  onSemesterChange: (semester: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<AcademicSnapshot<AcademicGrade | AcademicExam> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = window.dela?.academics;
  const label = kind === 'grades' ? '成绩' : '考试安排';

  useEffect(() => {
    let active = true;
    const request = kind === 'grades' ? api?.grades(semester) : api?.exams(semester);
    void request
      ?.then((value) => {
        if (active) setSnapshot(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason));
      });
    return () => {
      active = false;
    };
  }, [api, kind, semester]);

  async function sync(login: boolean) {
    if (!api || !window.dela) return;
    setBusy(true);
    setError(null);
    try {
      if (login) {
        const result = await window.dela.timetable.connect();
        if (!result.ok) {
          setError(result.error ?? '未完成登录');
          return;
        }
        setSnapshot(null);
      }
      const result = await api.sync(kind, semester);
      if (!result.ok) {
        setError(result.error ?? '同步失败');
        return;
      }
      setSnapshot(kind === 'grades' ? await api.grades(semester) : await api.exams(semester));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const columns =
    kind === 'grades'
      ? ['课程', '课程代码', '成绩', '学分', '绩点', '考试性质', '课程性质']
      : ['课程', '课程代码', '考试时间', '地点', '校区', '座位', '考试方式'];

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6"
      aria-label={label}
    >
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto grid gap-1">
          <h1 className="text-lg font-semibold">{label}</h1>
          <p className="text-xs text-ink-3">{formatSyncTime(snapshot?.syncedAt ?? null)}</p>
        </div>
        <Select value={semester} onValueChange={onSemesterChange} disabled={busy}>
          <SelectTrigger aria-label="查询学期" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {semesterOptions(currentAcademicSemester(), 24).map((value) => (
              <SelectItem key={value} value={value}>
                {semesterLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={!api || busy} onClick={() => void sync(true)} variant="outline">
          <LogIn className="size-4" />
          登录
        </Button>
        <Button disabled={!api || busy} onClick={() => void sync(false)}>
          <RefreshCw className="size-4" />
          {busy ? '同步中…' : '同步'}
        </Button>
      </header>
      {error && (
        <p className="text-13 text-red" role="alert">
          {error}
        </p>
      )}
      {!api ? (
        <p className="text-13 text-ink-3">请在 Dela GZIST 桌面端查询教务数据。</p>
      ) : snapshot?.items.length ? (
        <div className="min-h-0 overflow-auto">
          <table className="w-full min-w-[44rem] text-left text-13">
            <caption className="sr-only">
              {semesterLabel(semester)}
              {label}
            </caption>
            <thead className="text-xs text-ink-3">
              <tr>
                {columns.map((column) => (
                  <th className="whitespace-nowrap px-3 py-3 font-medium" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.items.map((item, index) => {
                const cells =
                  'score' in item
                    ? [
                        item.courseName,
                        item.courseCode,
                        item.score,
                        item.credits,
                        item.gradePoint,
                        item.assessment,
                        item.courseType,
                      ]
                    : [
                        item.courseName,
                        item.courseCode,
                        item.time,
                        item.location,
                        item.campus,
                        item.seat,
                        item.assessment,
                      ];
                return (
                  <tr className="border-t border-line" key={`${item.courseCode}:${index}`}>
                    {cells.map((value, cell) => (
                      <td className="px-3 py-3" key={cell}>
                        {value || '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-13 text-ink-3">
          {snapshot?.syncedAt
            ? `教务系统尚未返回该学期${label}。`
            : '登录后点击同步，读取学校公布的数据。'}
        </p>
      )}
      <a
        className="text-xs text-ink-3 underline underline-offset-4"
        href={`${campus.academicBase}/`}
        target="_blank"
        rel="noreferrer"
      >
        打开学校教务系统
      </a>
    </section>
  );
}
