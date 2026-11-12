# Dela GZIST

面向广州理工学院的本地 AI 与教务工作台，基于 [Chang-Yo/Dela](https://github.com/Chang-Yo/Dela) 开发。

**Windows 预览版：已用本机学校账号验证课表、成绩、考试同步与校历。作息采用本校社区验证记录，其他校区及 macOS 尚待验证。**

项目仓库：[Yukk1o/dela-gzist](https://github.com/Yukk1o/dela-gzist)。这是独立项目，与学校没有隶属或授权关系。

## 功能

- **教务**：在学校页面登录，按学期同步课表、成绩和考试安排。显示同步时间；失败时保留缓存。
- **AI 查询**：读取已同步的教务数据，明确数据时间和覆盖范围。成绩与考试数据只读，不计算学校未提供的绩点。
- **个人工作台**：保留上游的会话、项目、文件、笔记、终端、远程项目、通用邮箱、待办及个人日历。
- **独立分发**：独立应用标识、数据目录、安装包名称与更新来源。首次配置与主导航不展示交大专属社区和课堂视频入口。

接口来源、实现范围与待验收项目见[分叉说明](docs/gzist-fork.md)。使用前请阅读[使用条款](docs/terms.md)及[隐私条款](docs/privacy.md)。

## 技术栈

![Electron](https://img.shields.io/badge/Electron-v44-47848F?style=for-the-badge&logo=electron&logoColor=white&labelColor=1F2328)
![React](https://img.shields.io/badge/React-v19-087EA4?style=for-the-badge&logo=react&logoColor=white&labelColor=1F2328)
![TypeScript](https://img.shields.io/badge/TypeScript-v7-3178C6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=1F2328)
![Vite](https://img.shields.io/badge/Vite-v8-646CFF?style=for-the-badge&logo=vite&logoColor=white&labelColor=1F2328)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white&labelColor=1F2328)
![Pi](https://img.shields.io/badge/Pi-v1.1-1E293B?style=for-the-badge&logoColor=white&labelColor=1F2328)
![Go](https://img.shields.io/badge/Go-v1.22-00ADD8?style=for-the-badge&logo=go&logoColor=white&labelColor=1F2328)

## 下载安装

稳定安装包尚未发布。后续版本通过[本分叉 Releases](https://github.com/Yukk1o/dela-gzist/releases)分发；上游安装包不包含广州理工适配。

## 本地开发

广州理工适配维护在 `gzist` 分支。上游开发约定保留在[贡献指南](CONTRIBUTING.md)，提交前请确认目标是本分叉。

推荐使用 [`.node-version`](.node-version) 指定的 Node.js 与 [`package.json`](package.json) 的 `packageManager` 指定的 pnpm，兼容范围见 `engines`（本机可用 `. ./scripts/use-local-tools.ps1` 启用仓库内固定版本）：

```sh
pnpm install
pnpm dev
```

| 命令                | 用途                                                  |
| ------------------- | ----------------------------------------------------- |
| `pnpm dev`          | 启动开发服务器和窗口，监听主进程/preload 变更         |
| `pnpm build`        | 类型检查与 main/preload/renderer 三入口生产构建       |
| `pnpm test`         | Vitest 单元测试                                       |
| `pnpm smoke`        | Electron 内 SQLite、React 渲染与 preload 隔离冒烟检查 |
| `pnpm package:dist` | 生成 Windows 安装包                                   |

环境搭建细节、冒烟测试与代码组织约定见 [开发文档](docs/DEVELOPMENT.md)；版本与发布流程同样在其中。

## 文档

| 文档                               | 内容                               | 读者           |
| ---------------------------------- | ---------------------------------- | -------------- |
| [开发文档](docs/DEVELOPMENT.md)    | 架构、各子系统约定、构建与发布流程 | 贡献者（先读） |
| [使用条款](docs/terms.md)          | 软件性质、责任划分与免责范围       | 使用者         |
| [隐私条款](docs/privacy.md)        | 数据存放位置与联网去向             | 使用者         |
| [更新日志](CHANGELOG.md)           | 按版本分节的变更记录               | 贡献者         |
| [贡献指南](CONTRIBUTING.md)        | 环境准备、提交规范与协作方式       | 贡献者         |
| [功能边界](docs/what-we-not-do.md) | 明确不做与需先讨论的功能           | 贡献者         |
| [安全策略](SECURITY.md)            | 漏洞报告渠道、支持范围与安全边界   | 使用者、贡献者 |
| [校园接口资料](docs/sjtu-apis.md)  | Canvas 实测数据结构与交大接口索引  | 贡献者         |

## 上游贡献者

![Contributors](https://contrib.rocks/image?repo=Chang-Yo/Dela 'Contributors')

## 许可

本项目以 GNU General Public License v3.0（GPL-3.0-or-later）发布，全文见 [LICENSE](LICENSE)。代码与素材版权归原作者所有。

## 赞助鸣谢

您可以前往 “设置 > 关于” 页面为作者提供赞助 🙏

<table>
  <tr>
    <td width="80" align="center" valign="middle">
      <img src="assets/sponsors/FRAMENEO_logo_black.png" width="44" alt="FRAMENEO logo">
    </td>
    <td valign="middle">
      <a href="https://www.frameneo.com/"><strong>FRAMENEO</strong></a><br>
      为 Dela 的软件包分发提供免费的高速 CDN 服务。
    </td>
    <td valign="middle">
      <a href="https://www.frameneo.com/">FRAMENEO Website</a>
    </td>
  </tr>
</table>
