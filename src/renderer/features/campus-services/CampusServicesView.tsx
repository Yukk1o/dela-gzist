import { useEffect, useState } from 'react';
import { LogIn, RefreshCw } from 'lucide-react';
import { SettingRow } from '../settings/SettingRow';
import { SettingsGroup } from '../settings/SettingsGroup';
import { Switch } from '../../components/ui/beautifului/atoms/Switch';
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
      <nav className="flex flex-wrap gap-2 px-4 py-2" aria-label="校园服务">
        {(
          [
            ['attendance', '查寝'],
            ['enrollment', '自动选课'],
            ['network', '校园网'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={tab === id ? 'secondary' : 'ghost'}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
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
  const positionInputChanged =
    longitude !== '' &&
    latitude !== '' &&
    (!position ||
      Number(longitude) !== position.longitude ||
      Number(latitude) !== position.latitude);
  const planDirty =
    !!plan &&
    (enabled !== plan.enabled ||
      time !== plan.time ||
      position?.longitude !== plan.position?.longitude ||
      position?.latitude !== plan.position?.latitude);
  return (
    <div className="grid min-w-0 gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto grid gap-1">
          <h1 className="text-lg font-semibold">查寝</h1>
          <p className="text-xs text-ink-3">
            {status
              ? status.signed
                ? '今日已签到'
                : !status.required
                  ? '今日无需签到'
                  : `${status.startTime}–${status.endTime} · ${status.inTime ? '可签到' : '未到签到时段'}`
              : '正在读取状态'}
          </p>
        </div>
        <Button
          disabled={!api || busy}
          variant="outline"
          onClick={() => void run(() => api!.open('attendance'))}
        >
          <LogIn className="size-4" />
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
          <RefreshCw className="size-4" />
          {busy ? '处理中…' : '刷新状态'}
        </Button>
        {confirm === 'sign' ? (
          <>
            <span className="break-words text-13">确认提交本次签到？位置：{positionLabel}</span>
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
      </header>
      {error && (
        <p role="alert" className="break-words text-13 text-red">
          {error}
        </p>
      )}
      {(status?.mode === 'qr' || message) && (
        <section className="grid gap-2">
          {status?.mode === 'qr' && (
            <p className="text-xs text-ink-3">学校当前要求扫码，请进入学校页面完成。</p>
          )}
          {message && (
            <p role="status" className="text-13 text-ink-2">
              {message}
            </p>
          )}
        </section>
      )}
      <details data-campus-settings className="group">
        <summary className="cursor-pointer py-2 text-13 text-ink-2">
          签到设置
          <span className="ml-3 text-xs text-ink-3">
            {plan?.enabled ? `每天 ${plan.time}` : '自动签到关闭'}
          </span>
        </summary>
        <div className="mt-2 grid gap-3">
          <SettingsGroup>
            <SettingRow
              settingId="campus-sign-position"
              title="签到位置"
              description={positionLabel}
            >
              <div className="grid w-48 max-w-full gap-2">
                <select
                  aria-label="学校登记地点"
                  className="h-8 w-full min-w-0 rounded-control border border-line bg-surface px-2 text-13 text-ink focus-visible:outline-2 focus-visible:outline-ring"
                  defaultValue=""
                  disabled={busy}
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
                    <option key={index} value={index}>
                      {location.name}
                    </option>
                  ))}
                </select>
                <details className="text-xs text-ink-3">
                  <summary className="cursor-pointer py-1">手动输入百度坐标</summary>
                  <div className="mt-2 grid gap-2">
                    <Input
                      aria-label="经度（百度坐标）"
                      type="number"
                      step="any"
                      value={longitude}
                      disabled={busy}
                      placeholder="经度"
                      onChange={(e) => {
                        setLongitude(e.target.value);
                        setConfirm(null);
                      }}
                    />
                    <Input
                      aria-label="纬度（百度坐标）"
                      type="number"
                      step="any"
                      value={latitude}
                      disabled={busy}
                      placeholder="纬度"
                      onChange={(e) => {
                        setLatitude(e.target.value);
                        setConfirm(null);
                      }}
                    />
                  </div>
                </details>
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !positionInputChanged}
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
                      setMessage('当前位置已更新；自动计划需保存后生效');
                    }}
                  >
                    使用此位置
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || !position}
                    onClick={() => {
                      setPosition(null);
                      setLongitude('');
                      setLatitude('');
                      setConfirm(null);
                    }}
                  >
                    使用设备定位
                  </Button>
                </div>
                {positionInputChanged && (
                  <p className="text-right text-xs text-ink-3">位置尚未应用</p>
                )}
              </div>
            </SettingRow>
            <SettingRow
              settingId="campus-sign-enabled"
              title="每日自动签到"
              description="到点尝试一次，请保持 Dela 运行。错过时不补交。"
            >
              <Switch
                label="启用自动签到"
                checked={enabled}
                disabled={!api || busy || !plan}
                onChange={(value) => {
                  setEnabled(value);
                  setConfirm(null);
                }}
              />
            </SettingRow>
            <SettingRow settingId="campus-sign-time" title="签到时间" description="北京时间">
              <Input
                aria-label="每天时间（北京时间）"
                type="time"
                className="w-32"
                value={time}
                disabled={busy}
                onChange={(e) => {
                  setTime(e.target.value);
                  setConfirm(null);
                }}
              />
            </SettingRow>
          </SettingsGroup>
          <div className="flex flex-wrap items-center gap-2">
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
                disabled={!api || busy || !time || !planDirty}
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
            {plan?.enabled && (
              <Button
                variant="ghost"
                disabled={!api || busy}
                onClick={() =>
                  void run(async () => {
                    setPlan(
                      await api!.configureAttendance({
                        enabled: false,
                        time: plan!.time,
                        position: plan!.position,
                      }),
                    );
                    setEnabled(false);
                    setConfirm(null);
                  })
                }
              >
                停止自动签到
              </Button>
            )}
            {planDirty && <span className="text-xs text-ink-3">有未保存的修改</span>}
          </div>
          {plan && (
            <div role="status" className="grid gap-1 text-xs text-ink-3">
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
                  })}{' '}
                  · {plan.message}
                </p>
              )}
            </div>
          )}
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
    <div className="grid min-w-0 gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto grid gap-1">
          <h1 className="text-lg font-semibold">自动选课</h1>
          <p className="text-xs text-ink-3">{state?.message ?? '正在读取选课状态'}</p>
        </div>
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
  const networkDirty =
    !!state && (account !== state.account || password !== '' || enabled !== state.enabled);
  return (
    <div className="mx-auto grid max-w-lg gap-4">
      <header className="grid gap-1">
        <h1 className="text-lg font-semibold">校园网</h1>
        <p className="text-xs text-ink-3">白云校区</p>
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
        <SettingRow settingId="campus-network-auto" title="断线后自动登录">
          <Switch label="断线后自动登录" checked={enabled} disabled={busy} onChange={setEnabled} />
        </SettingRow>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={
              !api || busy || !networkDirty || !account || (!password && !state?.hasPassword)
            }
            onClick={() => void run(true)}
          >
            {busy ? '连接中…' : '保存并连接'}
          </Button>
          <Button disabled={!api || busy} variant="outline" onClick={() => void run(false)}>
            连接校园网
          </Button>
          {networkDirty && <span className="self-center text-xs text-ink-3">有未保存的修改</span>}
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
    <section className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid max-w-lg gap-4">
        <h1 className="text-lg font-semibold">广小理</h1>
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
