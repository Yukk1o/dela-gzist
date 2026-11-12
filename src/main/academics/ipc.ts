import { ipcMain } from 'electron';
import { checkWorkspaceSender } from '../ipc';
import { readExams, readGrades, syncAcademics } from './api';

export function registerAcademicsIpc(): void {
  ipcMain.handle('academics:grades', (event, semester: unknown) => {
    checkWorkspaceSender(event);
    return readGrades(semester);
  });
  ipcMain.handle('academics:exams', (event, semester: unknown) => {
    checkWorkspaceSender(event);
    return readExams(semester);
  });
  ipcMain.handle('academics:sync', (event, kind: unknown, semester: unknown) => {
    checkWorkspaceSender(event);
    return syncAcademics(kind, semester);
  });
}
