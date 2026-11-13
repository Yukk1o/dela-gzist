import type { BrowserWindow } from 'electron';
import { z } from 'zod';
import { readSetting, writeSetting } from '../settings/prefs';
import type {
  EnrollmentChoice,
  EnrollmentPlan,
  EnrollmentState,
} from '../../shared/campus-services';

let timer: ReturnType<typeof setTimeout> | undefined;
let choices: EnrollmentChoice[] = [];

export function readEnrollmentPlan(): EnrollmentPlan | null {
  const saved = readSetting('gzist-enrollment-plan');
  return saved ? JSON.parse(saved) : null;
}

function savePlan(plan: EnrollmentPlan): EnrollmentPlan {
  writeSetting('gzist-enrollment-plan', JSON.stringify(plan));
  return plan;
}

export function stopEnrollment(): EnrollmentPlan | null {
  clearTimeout(timer);
  timer = undefined;
  const plan = readEnrollmentPlan();
  return plan ? savePlan({ ...plan, status: 'stopped', message: '计划已停止' }) : null;
}

export async function readEnrollment(window: BrowserWindow | undefined): Promise<EnrollmentState> {
  const plan = readEnrollmentPlan();
  if (!window || window.isDestroyed())
    return { available: false, message: '请先打开学校选课页面', choices: [], plan };
  const url = new URL(window.webContents.getURL());
  if (url.hostname !== 'jw.gzist.edu.cn' || !url.pathname.includes('/xsxk/'))
    return { available: false, message: '请在学校窗口完成登录并进入自主选课', choices: [], plan };
  const result: unknown = await window.webContents.executeJavaScript(String.raw`(() => {
    const choices = [];
    for (const button of document.querySelectorAll('button[id^="btn-xk-"]')) {
      const handler = button.getAttribute('onclick') || '';
      if (!handler.startsWith('chooseCourseZzxk(') || button.disabled) continue;
      const row = button.closest('tr');
      if (!row) continue;
      choices.push({ id: button.id, label: row.innerText.replace(/\s+/g, ' ').trim(), handler });
    }
    return { available: document.getElementById('iskxk')?.value === '1', choices };
  })()`);
  const parsed = z
    .object({
      available: z.boolean(),
      choices: z.array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          handler: z.string().min(1),
        }),
      ),
    })
    .parse(result);
  choices = parsed.choices;
  return {
    ...parsed,
    message: parsed.available
      ? '请先在学校页面展开目标课程的教学班，再刷新列表'
      : '学校当前未开放选课',
    plan,
  };
}

export function scheduleEnrollment(
  window: BrowserWindow | undefined,
  idsValue: unknown,
  timeValue: unknown,
): EnrollmentPlan {
  const ids = z.array(z.string()).min(1).max(20).parse(idsValue);
  const runAt = z.string().datetime().parse(timeValue);
  const delay = Date.parse(runAt) - Date.now();
  if (delay < 0 || delay > 7 * 86400000) throw new Error('请选择未来七天内的提交时间');
  if (!window || window.isDestroyed()) throw new Error('请先打开学校选课窗口');
  const selected = [...new Set(ids)].map((id) => choices.find((choice) => choice.id === id));
  if (selected.some((choice) => !choice)) throw new Error('预选列表已变化，请刷新后重新选择');
  clearTimeout(timer);
  const plan = savePlan({
    runAt,
    choices: selected as EnrollmentChoice[],
    status: 'scheduled',
    message: '等待提交；请保持 Dela 和学校选课窗口开启',
  });
  timer = setTimeout(() => {
    void submit(window, plan);
  }, delay);
  return plan;
}

async function submit(window: BrowserWindow, plan: EnrollmentPlan): Promise<void> {
  savePlan({ ...plan, status: 'running', message: '正在按预选清单提交' });
  try {
    for (const choice of plan.choices) {
      if (readEnrollmentPlan()?.status === 'stopped') return;
      if (window.isDestroyed()) throw new Error('学校选课窗口已关闭，请重新启动计划');
      const url = new URL(window.webContents.getURL());
      if (url.hostname !== 'jw.gzist.edu.cn' || !url.pathname.includes('/xsxk/'))
        throw new Error('学校选课页面已离开或登录失效');
      const result: unknown = await window.webContents.executeJavaScript(`(() => {
        const choice = ${JSON.stringify(choice)};
        if (document.getElementById('iskxk')?.value !== '1') return 'closed';
        const button = document.getElementById(choice.id);
        if (!button || button.disabled || button.getAttribute('onclick') !== choice.handler) return 'changed';
        button.click();
        return 'submitted';
      })()`);
      if (result !== 'submitted') throw new Error('课程不可提交或页面已变化，请到学校窗口核对');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (window.isDestroyed()) throw new Error('学校选课窗口已关闭，请核对提交结果');
      const confirmation: unknown = await window.webContents.executeJavaScript(
        `!!document.querySelector('.bootbox.modal.show, .bootbox.modal.in')`,
      );
      if (confirmation) throw new Error('学校页面需要本人确认，请打开选课窗口处理');
    }
    if (readEnrollmentPlan()?.status !== 'stopped')
      savePlan({
        ...plan,
        status: 'submitted',
        message: '已按清单触发提交，请在学校已选课程中核对结果',
      });
  } catch (error) {
    if (readEnrollmentPlan()?.status !== 'stopped')
      savePlan({
        ...plan,
        status: 'needs-attention',
        message: error instanceof Error ? error.message : '选课提交失败，请在学校页面核对',
      });
  }
}

export function initializeEnrollment(): void {
  const plan = readEnrollmentPlan();
  if (plan?.status === 'scheduled' || plan?.status === 'running')
    savePlan({ ...plan, status: 'stopped', message: '应用已重启，请核对课程后重新启动计划' });
}
