export type AcademicKind = 'grades' | 'exams';

export interface AcademicGrade {
  courseCode: string;
  courseName: string;
  score: string;
  credits: string;
  gradePoint: string;
  assessment: string;
  courseType: string;
}

export interface AcademicExam {
  courseCode: string;
  courseName: string;
  time: string;
  location: string;
  campus: string;
  seat: string;
  assessment: string;
}

export interface AcademicSnapshot<T> {
  semester: string;
  syncedAt: string | null;
  items: T[];
}

export interface AcademicsApi {
  grades(semester: string): Promise<AcademicSnapshot<AcademicGrade>>;
  exams(semester: string): Promise<AcademicSnapshot<AcademicExam>>;
  sync(kind: AcademicKind, semester: string): Promise<import('./timetable').TimetableResult>;
}
