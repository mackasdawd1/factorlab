# FactorLab · 行业配置研究工作台

面向高端制造与尖端科技的交互式研究项目，探索长期定位与短期战术配置。通过证据阅读、多因子分析、回测、配置练习与复盘，把研究判断变成可以检查的过程。

**[打开在线网站](https://zhugeliang7512-eng.github.io/factorlab/research-studio/)** · **[查看完整源码](source/)** · **[报告问题 / 提改进建议](https://github.com/zhugeliang7512-eng/factorlab/issues/new/choose)**

## 怎么看这个项目

- 想体验：直接打开上面的在线网站，可以先以访客身份体验；云端账号支持保存进度和在线 AI。
- 想了解实现：从 `source/investigation-game/v3/` 和下方目录说明开始。
- 想提出意见：登录 GitHub，进入 **Issues → New issue**，选择“报告问题”或“改进建议”。可以附页面截图、复现步骤和期待的效果。
- 想修改代码：Fork 仓库，在自己的分支修改后提交 Pull Request；先用 Issue 讨论较大改动。
- 想下载：点击仓库上方 **Code → Download ZIP**，或使用下方克隆命令。查看公开源码、下载和浏览网站无需 GitHub 账号；提交反馈需要登录。

## 当前功能与边界

研究工作台包含证据阅读、因子研究与回测、行业配置、事件与风险分析、归因复盘、报告导出、中英文界面，以及云端登录、存档、邮件注册/密码找回和在线 AI 助手。

模拟价格、收益、冲击与策略结果是**合成教学数据**，不代表真实投资业绩、实时行情或经过验证的学习效果。AI 负责解释与辅助判断，不能替用户修改配置或执行真实交易。TypeSafe / Jev 接口保留规则降级，不能据此认为该服务当前在线可用。

在线网站的账号、存档与 AI 由 Supabase 和服务端模型接口提供；仅复制静态文件不会复制这些云端服务。本机启动使用独立的本机账号与 SQLite，与线上账号相互独立。注册已有用户成功反馈；密码找回的真实邮件与存档连续性仍需继续验收。

## 源码目录

| 目录 | 内容 |
| --- | --- |
| `source/investigation-game/v3/` | 当前界面、研究流程、账号与云端适配、图表、报告、素材、Pages 构建 |
| `source/investigation-game/v2/` | 每日模拟引擎、多因子/风险计算、国际化与前一版界面 |
| `source/investigation-game/server.cjs` | Node 本机服务与 AI 接口 |
| `source/investigation-game/accounts.cjs` | 本机账号和 SQLite 存档 |
| `source/investigation-game/supabase/` | 云端 AI、配额、存档表迁移准备与测试源码 |
| `source/investigation-game/deploy/` | Linux 服务、备份与部署打包工具 |
| `source/card-game/`、`source/full-game/` | 早期牌桌和六轮原型、合成数据、验证脚本 |
| `source/docs/` | 早期设计规则、教学 fixture 和原型构建依赖；历史文档不代表当前功能状态 |
| `source/deliverables/` | 配色和交互设计 demo、信息输出剧本、邮件模板 |
| `research-studio/` | 已部署的网站文件；当前线上构建 `3fbb93d4a73dcc73` |

此公开快照保留源码、合成数据、测试、设计 demo 和所需素材；不包含个人课程原件、内部运维记录、API 密钥、真实用户数据库、备份、录屏、机器运行环境或 Git 私有工作历史。重复的 Figma/HTML 导出包未收录，生成工具源码保留。

## 本机运行

需要 **Node.js 24 或更新版本**（使用内置 `node:sqlite`）。应用运行不需要安装 npm 包。

```sh
git clone https://github.com/zhugeliang7512-eng/factorlab.git
cd factorlab/source
node investigation-game/server.cjs --port 8881
```

打开 `http://127.0.0.1:8881/v3/`。停止时按 `Ctrl+C`。本机账号数据库会创建在 `source/.local/reuse-20261016/data/`；访客草稿保存在当前浏览器。

本机 AI 可选：把 `investigation-game/.env.example` 复制为同目录 `.env`，自行填写服务端密钥。未配置时使用明确标识的示例/规则响应。不要把 `.env` 或真实数据库提交到仓库。

## 验证与构建

以下命令均在 `source/` 执行。基础测试使用 Node 内置测试运行器，无需真实账号、模型密钥或云端写入：

```sh
node investigation-game/supabase/build-coach.cjs
node --test investigation-game/test-chapter.cjs investigation-game/test-research.cjs investigation-game/v2/test-simulation.cjs investigation-game/v3/test-report.cjs investigation-game/supabase/test-coach.cjs investigation-game/supabase/test-self-service.cjs investigation-game/supabase/test-browser-client.cjs
```

构建访客静态网站：

```sh
node investigation-game/v3/build-pages.cjs
```

结果位于 `source/.local/pages-20261020/site/research-studio/`。构建云端版本前，先配置自己的 Supabase 项目，再执行：

```sh
node -e "require('./investigation-game/v3/build-pages.cjs').build({cloud:true})"
```

浏览器测试和历史 Figma 导出工具保留了原工作环境路径，需要自行安装 Playwright 并调整路径；它们不在上述基础测试命令中。旧 `deploy/build-package.cjs` 还依赖未收录的 HTML/Figma 导出交付物，不能把它当作干净克隆的一键部署入口。运行当前本机应用和构建 Pages 不依赖这些历史导出物。

## 自建云服务

1. 创建自己的 Supabase 项目。`source/investigation-game/v3/cloud-config.js` 中是在线演示站已公开的 URL / publishable key；Fork 部署时替换为自己的项目配置，不要把 service-role 或模型密钥写进前端。
2. 阅读 `source/investigation-game/supabase/saves.sql` 与 `ai-quota.sql`，在自己的测试项目审核、执行并验证权限。`saves.sql` 是按当前前端合同补齐的公开部署迁移，尚未在 PostgreSQL 执行验证，不能当作线上数据库原始导出。
3. 将 `coach-handler.cjs` 中的允许来源改为自己网站的 origin，在服务端 Secrets 配置 `DEEPSEEK_API_KEY`，使用 `node investigation-game/supabase/build-coach.cjs` 生成可部署的 Edge Function。函数名称需与 `cloud-config.js` 一致。
4. 在 Supabase Auth 配置 Site URL、允许回跳地址、SMTP 和邮件模板。模板位于 `source/deliverables/supabase-20261021/`，使用验证码而不是把密钥放进邮件。
5. 验证两个不同用户无法互读存档、配额限制、注册和找回密码，再开启公开服务。

## 项目要求与研究方向

| 项目要求 | 对应工作 |
| --- | --- |
| 子项目 B：高端制造与尖端科技 | 比较长期行业定位与短期战术配置 |
| 多因子构建、回测、因子功效 | 模拟引擎、研究指标与回测界面 |
| 行业周期 | 证据、事件、周期判断与行业选择 |
| AI / 智能自动化 | 只读研究助手、可解释规则降级 |
| 实际交互练习 | 配置、确认、模拟、风险与复盘 |
| 时间安排、演示、反思、每周流程和最终交付 | 历史里程碑、研究流程和导出报告；课程交付须单独验收 |
| 伙伴期望与公司背景 | 保留研究约束；原材料机构名称存在差异，不声称已核实真实合作关系 |

## 反馈与素材说明

欢迎针对界面、流程、表达清晰度、可访问性、计算逻辑和代码结构提出意见。反馈里请写页面、操作步骤、实际结果和期望结果；不要附密码、验证码、API key 或真实用户存档。

第三方库 i18next、Supabase、Phosphor、Anime.js、lottie-web、Motion 的原许可证随文件保留在对应 `vendor/` 目录。trade-simulator、Stock-simulator、Vibe-Trading 为架构参考，未把其实现复制进本项目。

木刻图标和吉祥物属于用户提供素材，其使用不等于获得第三方库的 MIT 授权。项目尚未统一选择开放源代码许可证；公开源码用于查看、评审与 GitHub 协作，不额外授予素材再使用或商业分发许可。
