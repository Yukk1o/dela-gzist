# 广州理工学院版

基于 [Chang-Yo/Dela](https://github.com/Chang-Yo/Dela) 开发的独立版本。第一版提供教务登录、课表、成绩、考试安排，以及 Agent 对本地缓存的只读查询。项目与学校没有隶属或授权关系。

## 数据与登录

用户在本机学校页面完成[统一认证](https://ids.gzist.edu.cn/lyuapServer/login)，教务服务来自 [jw.gzist.edu.cn](https://jw.gzist.edu.cn/)。已有教务会话有效时直接复用。密码、Cookie 与认证票据不进入 Agent 上下文或仓库；Cookie 使用系统加密保存。退出登录或重新完成交互登录后清除教务缓存，保留个人日历。

成绩、考试和课表缓存在本机数据库中，数据库本身未加密。让 Agent 查询记录时，结果会发送给用户配置的模型服务。同步失败保留上次成功结果，并显示同步时间。缺少的绩点、座位与时段不自行推算。

## 本机验证

2026-11-12 在 Windows 上使用用户本人于应用内完成的学校登录，验证了以下行为；仓库不保存个人记录或凭据：

- 当前学期课表、实践课、学校校历、考试安排，以及上一学期成绩均可真实同步。
- 当前学期暂无成绩时保存有效空结果，区别于未同步和登录失效。
- 学校分页使用 `totalPage`；脱敏回归用例覆盖跨页抓取与失败保留缓存。
- 当前学期第一周从 2026-08-31 开始，由学校校历接口提供；没有具体日期、节次的实践课单独列出，不添加到日历时段。
- 本机出现的文件重命名 `EXDEV` 已修正，会话快照可加密保存。重启后可继续使用教务会话。

课表入口及十二节作息参考[拾光课程表的本校适配](https://github.com/ShiGuangSchedule/shiguang_warehouse/blob/ccd43dd50fd01a3b87089d6e1b7b97fe93dff211/resources/GZIST/gzist_01.js)与[作者的学校会话验证](https://github.com/ShiGuangSchedule/shiguang_warehouse/pull/851)。该记录指出节次接口返回的行政作息与教学时间不同；前十节也与[广小课的本校作息](https://github.com/xfankang/guangxiaoke/blob/main/app/src/main/java/com/jianke/schedule/data/ClassTimes.kt)一致。作息尚未逐项对照学校当前页面，其他校区、其他账号与未来学期仍需验证；成绩和考试信息以学校网页为准。

自动检查覆盖四个 TypeScript 配置、静态检查、1458 项常规测试，以及真实 Electron 下的成绩零分、考试座位、失败保留缓存和四种窗口宽度。校园服务新增 18 项回归检查；常规套件首次运行有 5 项 Git 子进程用例因资源不足失败，所属文件的 14 项独立复跑通过。界面测试使用明确标注的测试数据，另行完成学校账号同步。Windows 目录包通过 SQLite、渲染、预加载隔离、Agent 运行时与 Bash PTY 检查。上游后台任务套件仍有一项 Windows 子进程停止测试失败，相关实现未改动；全量测试尚未全绿。macOS 安装、签名与运行尚未验证。

## 分叉范围

校园服务提供原生查寝记录、今日状态、当前位置选择、立即签到和每日自动签到，复用已有学校会话。自动签到默认关闭，每天北京时间到点尝试一次，核验学校时段、位置范围及今日状态后提交并回读结果；当日失败不自动重试，退出或休眠错过的时间不补交。学校要求扫码或登录失效时提示本人处理。设备定位在后台加载学校定位组件，手动位置由用户选择并在保存自动计划时持久化。选课按清单各触发一次，原生界面管理计划，学校页展开目标教学班一次；学校确认弹窗由本人处理，提交状态不代表选课成功。重启会停止未完成的选课计划。

本机已复用真实会话读取 2026 年 11 月的 11 条查寝记录、今日状态和学校签到范围，以及 Clash 开启时的校园网在线状态。用户选择今天不提交，自动签到保持关闭，真实签到与设备定位待验收；学校当前未开放选课，实际选课提交待开放后验证。校园网断线认证和 Clash TUN 路由仍需分别实测。签到校验、去重、每日调度、停止与失败结果已有脱敏回归测试。广小理通过复制口令并打开微信访问，未接入原生帖子列表。

校园服务主进程位于 `src/main/campus-services/`，预加载与共享契约分别位于 `src/preload/campus-services.ts`、`src/shared/campus-services.ts`，界面位于 `src/renderer/features/campus-services/`。

保留 Agent、项目、文件、会话、终端、远程项目、通用邮箱、待办及个人日历。首次配置与主导航移除交大 Canvas、水源和课堂视频连接入口，原有模块源码仍保留，未移植为广州理工功能。公开通知列表来自[广州理工学院教务处](https://jwc.gzist.edu.cn/jwgl.htm)。

教务模块位于 `src/main/academics/`，共享契约位于 `src/shared/academics.ts`，预加载接口位于 `src/preload/academics.ts`，成绩与考试界面位于 `src/renderer/features/timetable/AcademicRecords.tsx`；课表沿用 `src/main/timetable/`。

## 独立分发

仓库：[Yukk1o/dela-gzist](https://github.com/Yukk1o/dela-gzist)，维护分支为 `gzist`。应用名为 Dela GZIST，安装包名为 Dela-GZIST，应用标识为 `io.dela.gzist.desktop`。应用数据位于独立的 `Dela-GZIST` 目录，默认工作目录为「文档/Dela-GZIST」，Skills 位于 `~/.dela-gzist/skills`，更新来自本分叉的 GitHub Releases。

当前交付 Windows 预览安装包，未发布稳定版。保留原作者署名及 GPL-3.0-or-later 许可证。
