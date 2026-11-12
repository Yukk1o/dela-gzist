import type { AcademicsApi, AcademicKind } from '../shared/academics';
import { invoke } from './lib';

export const academics = {
  grades: (semester: string) => invoke('academics:grades', semester),
  exams: (semester: string) => invoke('academics:exams', semester),
  sync: (kind: AcademicKind, semester: string) => invoke('academics:sync', kind, semester),
} satisfies AcademicsApi;
