// @vitest-environment jsdom
import type { BrowserWindow } from 'electron';
import { runInNewContext } from 'node:vm';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('../../../main/settings/prefs', () => ({
  readSetting: (key: string) => settings.get(key),
  writeSetting: (key: string, value: string) => settings.set(key, value),
}));

import {
  initializeEnrollment,
  readEnrollment,
  readEnrollmentPlan,
  scheduleEnrollment,
  stopEnrollment,
} from '../../../main/campus-services/enrollment';

let schoolWindow: BrowserWindow;

let clicks: number;
beforeEach(() => {
  vi.useFakeTimers();
  settings.clear();
  clicks = 0;
  document.body.innerHTML = `<input id="iskxk" value="1"><table><tr><td>课程示例 教学班 A</td><td><button id="btn-xk-fixture" onclick="chooseCourseZzxk('fixture')">选课</button></td></tr></table>`;
  const row = document.querySelector('tr')!;
  Object.defineProperty(row, 'innerText', { value: row.textContent });
  document.querySelector('button')!.onclick = () => {
    clicks++;
  };
  schoolWindow = {
    isDestroyed: () => false,
    webContents: {
      getURL: () => 'https://jw.gzist.edu.cn/jwglxt/xsxk/zzxkyzb_cxZzxkYzbIndex.html',
      executeJavaScript: async (script: string) => runInNewContext(script, { document }),
    },
  } as unknown as BrowserWindow;
});
afterEach(() => {
  stopEnrollment();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

it('只对用户预选的教学班触发一次提交，不把点击按钮当作选课成功', async () => {
  const state = await readEnrollment(schoolWindow);
  expect(state.choices).toHaveLength(1);
  scheduleEnrollment(schoolWindow, ['btn-xk-fixture'], new Date(Date.now() + 1000).toISOString());
  expect(clicks).toBe(0);
  await vi.advanceTimersByTimeAsync(3000);
  expect(clicks).toBe(1);
  expect(readEnrollmentPlan()).toMatchObject({
    status: 'submitted',
    message: expect.stringContaining('核对结果'),
  });
});

it('停止计划后不再提交，重启不会恢复未确认的任务', async () => {
  await readEnrollment(schoolWindow);
  scheduleEnrollment(schoolWindow, ['btn-xk-fixture'], new Date(Date.now() + 1000).toISOString());
  stopEnrollment();
  await vi.advanceTimersByTimeAsync(3000);
  expect(clicks).toBe(0);
  scheduleEnrollment(schoolWindow, ['btn-xk-fixture'], new Date(Date.now() + 1000).toISOString());
  initializeEnrollment();
  stopEnrollment();
  await vi.advanceTimersByTimeAsync(3000);
  expect(clicks).toBe(0);
});

it('教学班变化或学校关闭选课时停止，不点击其他课程', async () => {
  await readEnrollment(schoolWindow);
  scheduleEnrollment(schoolWindow, ['btn-xk-fixture'], new Date(Date.now() + 1000).toISOString());
  document.querySelector('button')!.setAttribute('onclick', "chooseCourseZzxk('changed')");
  await vi.advanceTimersByTimeAsync(3000);
  expect(clicks).toBe(0);
  expect(readEnrollmentPlan()?.status).toBe('needs-attention');
  expect(() =>
    scheduleEnrollment(schoolWindow, ['not-selected'], new Date(Date.now() + 1000).toISOString()),
  ).toThrow('预选列表');
});

it('学校要求确认时提示本人处理', async () => {
  await readEnrollment(schoolWindow);
  document.querySelector('button')!.addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'bootbox modal show';
    document.body.append(modal);
  });
  scheduleEnrollment(schoolWindow, ['btn-xk-fixture'], new Date(Date.now() + 1000).toISOString());
  await vi.advanceTimersByTimeAsync(3000);
  expect(readEnrollmentPlan()).toMatchObject({
    status: 'needs-attention',
    message: expect.stringContaining('本人确认'),
  });
});
