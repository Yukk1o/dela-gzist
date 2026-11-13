import { useEffect, useState } from 'react';
import type {
  AttendanceRecords,
  AttendanceStatus,
  AttendanceAutomation,
  CampusNetworkState,
  CampusPosition,
  EnrollmentState,
} from '../../../shared/campus-services';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { errorText } from '../../workspace/store';

export function CampusServicesView({ community = false }: { community?: boolean }) {
  const [tab, setTab] = useState<'attendance' | 'enrollment' | 'network'>('attendance');
  if (community) return <Community />;
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-4">
        <h1 className="sr-only">校园服务</h1>
        <nav aria-label="校园服务" className="mx-auto flex max-w-4xl gap-5">
          {(
            [
              ['attendance', '查寝'],
              ['enrollment', '自动选课'],
              ['network', '校园网'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`min-h-11 border-b-2 py-2 text-13 focus-visible:outline-2 focus-visible:outline-ring ${tab === id ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'attendance' ? (
          <Attendance />
        ) : tab === 'enrollment' ? (
          <Enrollment />
        ) : (
          <CampusNetwork />
        )}
      </div>
    </section>
  );
}

function Attendance() {
  const api = window.dela?.campusServices;
  const [month, setMonth] = useState(() =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date()),
  );
  const [records, setRecords] = useState<AttendanceRecords | null>(null);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [plan, setPlan] = useState<AttendanceAutomation | null>(null);
  const [position, setPosition] = useState<CampusPosition | null>(null);
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');
  const [time, setTime] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [confirm, setConfirm] = useState<'sign' | 'auto' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [yearValue, monthValue] = month.split('-').map(Number);
  useEffect(() => {
    let active = true;
    void api
      ?.attendance(yearValue!, monthValue!)
      .then((value) => {
        if (active) setRecords(value);
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    return () => {
      active = false;
    };
  }, [api, yearValue, monthValue]);
  useEffect(() => {
    let active = true;
    void api
      ?.attendanceStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    void api
      ?.attendanceAutomation()
      .then((value) => {
        if (!active) return;
        setPlan(value);
        setTime(value.time);
        setEnabled(value.enabled);
        setPosition(value.position);
        if (value.position) {
          setLongitude(String(value.position.longitude));
          setLatitude(String(value.position.latitude));
        }
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    const timer = setInterval(() => {
      void api
        ?.attendanceAutomation()
        .then((value) => {
          if (active) setPlan(value);
        })
        .catch((reason) => {
          if (active) setError(errorText(reason));
        });
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await action();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (plan?.result !== 'success' && plan?.result !== 'skipped') return;
    let active = true;
    void Promise.all([api!.attendanceStatus(), api!.attendance(yearValue!, monthValue!)])
      .then(([nextStatus, nextRecords]) => {
        if (active) {
          setStatus(nextStatus);
          setRecords(nextRecords);
        }
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    return () => {
      active = false;
    };
  }, [api, plan?.result, plan?.lastAttemptAt, yearValue, monthValue]);
  const positionLabel = position
    ? `${position.longitude.toFixed(6)}, ${position.latitude.toFixed(6)}（百度坐标）`
    : '签到时获取设备位置';
  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <header className="flex flex-wrap items-center justify-end gap-2">
        <Button
          disabled={!api || busy}
          variant="ghost"
          onClick={() => void run(() => api!.open('attendance'))}
        >
          学校登录
        </Button>
        <Button
          disabled={!api || busy}
          variant="outline"
          onClick={() =>
            void run(async () => {
              setStatus(await api!.attendanceStatus());
              setRecords(await api!.attendance(yearValue!, monthValue!));
            })
          }
        >
          刷新状态
        </Button>
      </header>
      {error && (
        <p role="alert" className="break-words text-13 text-red">
          {error}
        </p>
      )}
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">
          {status?.signed ? '今日已签到' : status && !status.required ? '今日无需签到' : '今日签到'}
        </h2>
        <p className="text-13 text-ink-2">
          {status
            ? `学校时段 ${status.startTime}–${status.endTime} · ${status.inTime ? '当前可登记' : '当前不在登记时段'}`
            : '正在读取学校状态'}
        </p>
        <p className="break-words text-xs text-ink-3">当前位置：{positionLabel}</p>
        <div className="flex flex-wrap items-center gap-3">
          {confirm === 'sign' ? (
            <>
              <span className="text-13">确认使用上述位置提交本次签到？</span>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await api!.signAttendance(position);
                    setMessage(result.message);
                    setConfirm(null);
                    setStatus(await api!.attendanceStatus());
                    setRecords(await api!.attendance(yearValue!, monthValue!));
                  })
                }
              >
                确认签到
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                取消
              </Button>
            </>
          ) : status?.signed ? null : (
            <Button
              disabled={
                !api ||
                busy ||
                !status ||
                status.signed ||
                !status.required ||
                !status.inTime ||
                status.mode !== 'location'
              }
              onClick={() => setConfirm('sign')}
            >
              立即签到
            </Button>
          )}
        </div>
        {status?.mode === 'qr' && (
          <p className="text-xs text-ink-3">学校当前要求扫码，请进入学校页面完成。</p>
        )}
        {message && (
          <p role="status" className="text-13 text-ink-2">
            {message}
          </p>
        )}
      </section>
      <details data-campus-settings className="border-y border-line py-3">
        <summary className="cursor-pointer text-13 text-ink-2">
          位置与自动签到
          <span className="ml-3 text-xs text-ink-3">
            {plan?.enabled ? `每天 ${plan.time}` : '自动签到未启用'}
          </span>
        </summary>
        <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
          <section className="grid min-w-0 gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium">签到位置</h2>
            <p className="text-xs text-ink-3">可使用设备定位，或选择你当前所在的学校登记地点。</p>
            <select
              aria-label="学校登记地点"
              className="h-10 w-full min-w-0 rounded-md border border-line bg-surface px-3 text-13 text-ink focus-visible:outline-2 focus-visible:outline-ring"
              defaultValue=""
              onChange={(event) => {
                const location = status?.locations[Number(event.target.value)];
                if (event.target.value === '' || !location) return;
                setLongitude(String(location.longitude));
                setLatitude(String(location.latitude));
                setConfirm(null);
              }}
            >
              <option value="">选择当前位置</option>
              {status?.locations.map((location, index) => (
                <option value={index} key={index}>
                  {location.name}
                </option>
              ))}
            </select>
            <details className="text-xs text-ink-3">
              <summary className="cursor-pointer py-2 hover:text-ink">手动输入百度坐标</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-xs text-ink-3">
                  经度（百度坐标）
                  <Input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => {
                      setLongitude(e.target.value);
                      setConfirm(null);
                    }}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-ink-3">
                  纬度（百度坐标）
                  <Input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => {
                      setLatitude(e.target.value);
                      setConfirm(null);
                    }}
                  />
                </label>
              </div>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !longitude || !latitude}
                variant="outline"
                onClick={() => {
                  const selected = { longitude: Number(longitude), latitude: Number(latitude) };
                  if (
                    !Number.isFinite(selected.longitude) ||
                    !Number.isFinite(selected.latitude) ||
                    Math.abs(selected.longitude) > 180 ||
                    Math.abs(selected.latitude) > 90
                  ) {
                    setError('请输入有效的百度经纬度');
                    return;
                  }
                  setPosition(selected);
                  setConfirm(null);
                  setMessage('当前位置已更新；自动签到的位置需点击保存计划更新');
                }}
              >
                使用此位置
              </Button>
              <Button
                disabled={busy || !position}
                variant="ghost"
                onClick={() => {
                  setPosition(null);
                  setConfirm(null);
                }}
              >
                使用设备定位
              </Button>
            </div>
          </section>
          <section className="grid min-w-0 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto flex items-center gap-2 text-sm font-medium">每日自动签到</h2>
              <span className="rounded-md bg-hover px-2 py-1 text-xs text-ink-2">
                {plan?.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <label className="grid max-w-sm gap-2 text-xs text-ink-3">
              每天时间（北京时间）
              <Input
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setConfirm(null);
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-13">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  setConfirm(null);
                }}
              />
              启用自动签到
            </label>
            <p className="text-xs text-ink-3">
              到点尝试一次，先核验学校时段、位置及今日状态。请保持 Dela
              运行；休眠或退出期间错过的计划不补交。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {confirm === 'auto' ? (
                <>
                  <span className="break-words text-13">
                    确认每天 {time} 使用 {positionLabel} 尝试签到？
                  </span>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setPlan(await api!.configureAttendance({ enabled, time, position }));
                        setConfirm(null);
                      })
                    }
                  >
                    确认启用
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirm(null)}>
                    取消
                  </Button>
                </>
              ) : (
                <Button
                  disabled={!api || busy || !time}
                  onClick={() => {
                    if (enabled) setConfirm('auto');
                    else
                      void run(async () =>
                        setPlan(await api!.configureAttendance({ enabled, time, position })),
                      );
                  }}
                >
                  保存计划
                </Button>
              )}
              <Button
                disabled={!api || busy || !plan?.enabled}
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    const value = await api!.configureAttendance({
                      enabled: false,
                      time: plan!.time,
                      position: plan!.position,
                    });
                    setPlan(value);
                    setEnabled(false);
                    setConfirm(null);
                  })
                }
              >
                停止自动签到
              </Button>
            </div>
            {plan && (
              <div role="status" className="grid gap-1 text-xs text-ink-3">
                <p>{plan.message}</p>
                {plan.enabled && (
                  <p>
                    已保存：每天 {plan.time} ·{' '}
                    {plan.position
                      ? `${plan.position.longitude.toFixed(6)}, ${plan.position.latitude.toFixed(6)}（百度坐标）`
                      : '设备定位'}
                  </p>
                )}
                {plan.lastAttemptAt && (
                  <p>
                    最近尝试：
                    {new Date(plan.lastAttemptAt).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                    })}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </details>
      <section className="grid min-w-0 gap-3">
        <header className="flex flex-wrap items-center justify-end gap-2">
          <h2 className="mr-auto text-sm font-medium">查寝记录</h2>
          <Input
            aria-label="考勤月份"
            type="month"
            value={month}
            className="w-auto"
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
                setRecords(null);
              }
            }}
          />
        </header>
        {records && records.year === yearValue && records.month === monthValue ? (
          <>
            <p className="text-13 text-ink-2">
              在寝 {records.inDays} 天 · 不在寝 {records.outDays} 天
            </p>
            <div className="overflow-auto">
              <table className="w-full text-left text-13">
                <thead className="text-xs text-ink-3">
                  <tr>
                    {['日期', '状态', '考勤时间', '宿舍'].map((label) => (
                      <th key={label} className="whitespace-nowrap px-3 py-2 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.records.map((record, index) => (
                    <tr key={`${record.date}:${index}`} className="border-t border-line">
                      {[record.date, record.status, record.time, record.dorm].map((cell, n) => (
                        <td key={n} className="whitespace-nowrap px-3 py-3">
                          {cell || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {records.records.length === 0 && (
                <p className="p-3 text-13 text-ink-3">学校尚未返回该月查寝记录。</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-13 text-ink-3">在学校登录后刷新，读取本月记录。</p>
        )}
      </section>
    </div>
  );
}
function Enrollment() {
  const api = window.dela?.campusServices;
  const [state, setState] = useState<EnrollmentState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [runAt, setRunAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void api
        ?.enrollment()
        .then((value) => {
          if (active) setState(value);
        })
        .catch((reason) => {
          if (active) setError(errorText(reason));
        });
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setState(await api!.enrollment());
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  const running = state?.plan?.status === 'scheduled' || state?.plan?.status === 'running';
  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!api || busy}
          variant="outline"
          onClick={() => void run(() => api!.open('enrollment'))}
        >
          学校选课页面
        </Button>
        <Button
          disabled={!api || busy}
          variant="outline"
          onClick={() =>
            void run(async () => {
              setSelected([]);
              setConfirm(false);
            })
          }
        >
          刷新课程
        </Button>
      </header>
      <div className="flex items-start gap-2">
        <p className="text-13 text-ink-2">{state?.message ?? '正在读取选课状态'}</p>
      </div>
      {error && (
        <p role="alert" className="break-words text-13 text-red">
          {error}
        </p>
      )}
      <section className="grid min-w-0 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">预选教学班</h3>
          <span className="text-xs tabular-nums text-ink-3">已选 {selected.length} 项</span>
        </div>
        {!state?.choices.length && (
          <div className="grid gap-1 py-2">
            <p className="text-13 text-ink-2">{state ? '暂无可选教学班' : '正在读取教学班'}</p>
            <p className="max-w-sm text-xs leading-relaxed text-ink-3">
              开放选课后展开目标教学班，再刷新列表。
            </p>
          </div>
        )}
        {state?.choices.map((choice) => (
          <label
            key={choice.id}
            className="flex items-start gap-3 rounded-card bg-hover p-3 text-13"
          >
            <input
              type="checkbox"
              disabled={running}
              checked={selected.includes(choice.id)}
              onChange={(e) => {
                setSelected((old) =>
                  e.target.checked ? [...old, choice.id] : old.filter((id) => id !== choice.id),
                );
                setConfirm(false);
              }}
            />
            <span className="min-w-0 break-words">{choice.label}</span>
          </label>
        ))}
      </section>
      <section className="grid gap-3">
        <h3 className="text-sm font-medium">提交计划</h3>
        <label className="grid max-w-sm gap-2 text-xs text-ink-3">
          提交时间（北京时间）
          <Input
            type="datetime-local"
            step="1"
            value={runAt}
            disabled={running}
            onChange={(e) => {
              setRunAt(e.target.value);
              setConfirm(false);
            }}
          />
        </label>
        <p className="text-xs text-ink-3">
          按清单各提交一次。请保持 Dela 与选课窗口开启；完成后在学校已选课程中核对结果。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {confirm ? (
            <>
              <span className="text-13">确认在上述时间提交 {selected.length} 个教学班？</span>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api!.scheduleEnrollment(
                      selected,
                      new Date(`${runAt}+08:00`).toISOString(),
                    );
                    setConfirm(false);
                  })
                }
              >
                确认启动
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                取消
              </Button>
            </>
          ) : (
            <Button
              disabled={!api || busy || !state?.available || !selected.length || !runAt || running}
              onClick={() => setConfirm(true)}
            >
              启动计划
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!api || busy || !running}
            onClick={() => void run(() => api!.stopEnrollment())}
          >
            停止计划
          </Button>
        </div>
        {state?.plan && (
          <section className="grid gap-2 bg-hover p-3" role="status">
            <p className="text-13">{state.plan.message}</p>
            <p className="text-xs text-ink-3">
              北京时间{' '}
              {new Date(state.plan.runAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
            </p>
            {state.plan.choices.map((choice) => (
              <p key={choice.id} className="break-words text-xs text-ink-3">
                {choice.label}
              </p>
            ))}
          </section>
        )}
      </section>
    </div>
  );
}

function CampusNetwork() {
  const api = window.dela?.campusServices;
  const [state, setState] = useState<CampusNetworkState | null>(null);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api
      ?.networkState()
      .then((value) => {
        if (active) {
          setState(value);
          setAccount(value.account);
          setEnabled(value.enabled);
        }
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    const timer = setInterval(() => {
      void api
        ?.networkState()
        .then((value) => {
          if (active) setState(value);
        })
        .catch((reason) => {
          if (active) setError(errorText(reason));
        });
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  async function run(save: boolean) {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      if (save) {
        setState(await api.configureNetwork({ account, password, enabled }));
        setPassword('');
      }
      setState(await api.connectNetwork());
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto grid max-w-lg gap-4">
      <header>
        <p className="mt-1 text-xs text-ink-3">白云校区 · 连接校园网后即可认证</p>
      </header>
      <p role="status" className="text-13 text-ink-2">
        {state?.message ?? '正在读取状态'}
      </p>
      {error && (
        <p role="alert" className="break-words text-13 text-red">
          {error}
        </p>
      )}
      <section className="grid gap-3">
        <label className="grid gap-2 text-xs text-ink-2">
          校园网账号
          <Input
            autoComplete="username"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
        </label>
        <label className="grid gap-2 text-xs text-ink-2">
          校园网密码
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            placeholder={state?.hasPassword ? '已保存，留空保留原密码' : ''}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-13">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          断线后自动登录
        </label>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={!api || busy || !account || (!password && !state?.hasPassword)}
            onClick={() => void run(true)}
          >
            {busy ? '连接中…' : '保存并连接'}
          </Button>
          <Button disabled={!api || busy} variant="outline" onClick={() => void run(false)}>
            连接校园网
          </Button>
        </div>
      </section>
      <div className="flex items-start gap-2 text-xs leading-relaxed text-ink-3">
        <p>密码在本机加密保存。支持 Clash Verge；TUN 模式仅为校园网关添加直连路由。</p>
      </div>
      <a
        href="http://10.0.10.252/"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-ink-3 underline underline-offset-4"
      >
        学校校园网认证页面
      </a>
    </div>
  );
}

function Community() {
  const [message, setMessage] = useState('');
  return (
    <section className="h-full overflow-y-auto p-4">
      <div className="mx-auto grid max-w-lg gap-4">
        <h1 className="text-sm font-medium">广小理</h1>
        <p className="text-13 text-ink-2">复制小程序口令，在微信中粘贴打开。</p>
        <div>
          <Button
            disabled={!window.dela?.campusServices}
            onClick={() => {
              void window
                .dela!.campusServices.copyCommunityLink()
                .then(() => setMessage('口令已复制，请在微信中粘贴打开广小理'))
                .catch(() => setMessage('口令已复制，请手动打开微信并粘贴'));
            }}
          >
            复制口令并打开微信
          </Button>
        </div>
        <details className="text-xs text-ink-3">
          <summary className="cursor-pointer py-1">查看口令</summary>
          <p className="mt-2 break-all">#小程序://广小理/rnmxRxSMjtqvTxp</p>
        </details>
        {message && (
          <p role="status" className="text-13 text-ink-3">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
