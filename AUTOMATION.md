# 博客自动化维护说明

给后续接手的 Agent / 未来的自己看的。目标是：任何一次新会话，读完本文件和 `AGENTS.md`
就能独立完成「题目 + 代码 → 自动发布题解」。

## 1. 项目结构

```text
D:\hexo-blog
├── _config.yml                     # Hexo 站点配置（url: https://heyubin.top，主题 butterfly）
├── _config.butterfly.yml           # Butterfly 覆盖配置（头像、公告等），不要动外观
├── package.json                    # 含 publish:algorithm / deploy:status / build / clean
├── source/_posts/                  # 文章目录，唯一会被发布的业务目录
├── themes/butterfly/               # Git submodule（5.7.0）
├── scripts/empty-home.js           # 无文章时保证生成首页，避免残留旧首页
├── tools/
│   ├── publish-algorithm.mjs       # 发布主入口：校验 → 生成 → 构建校验 → 提交 → 推送 → 上线校验
│   ├── deploy-status.mjs           # 只读查询 GitHub Actions 部署状态
│   ├── solution-template.md        # 题解正文结构与写作规则
│   └── lib/
│       ├── github.mjs              # GitHub Actions API（公开仓库只读，无需 Token）
│       ├── live.mjs                # 请求线上文章页并用唯一标记确认「真的上线」
│       └── repo.mjs                # 读取 .git/config 与 _config.yml（不调用 git）
├── .github/workflows/deploy.yml    # push main → 构建 → SCP → SSH 清空并替换站点目录
├── .algorithm-work/                # 发布工作区（gitignore）：草稿、命令日志、文章快照、last-result.json
├── public/、db.json                # 构建产物，已 gitignore，CI 每次从零生成
└── AGENTS.md / ALGORITHM-PUBLISH.md / AUTOMATION.md
```

## 2. 发布链路

```text
AI 写 body.md + meta.json + solution.cpp
        ↓  tools/publish-algorithm.mjs
source/_posts/<标题>.md（唯一文件名，不覆盖）
        ↓  hexo generate + 页面标记校验
git commit（只提交这一篇）
        ↓  git push origin HEAD:main
GitHub Actions: deploy.yml
        ↓  npm ci → hexo generate → SCP 到 /tmp → SSH 清空 /www/wwwroot/heyubin.top → 复制
https://heyubin.top 更新
        ↓  脚本回查 Actions + 请求线上文章页确认标记
报告：上线 / 失败 / 无法确认
```

## 3. 脚本行为与退出码

阶段：Git 预检 → 输入校验 → 写文章 → 构建校验 → 提交 → 推送 → Actions/线上校验。

| 退出码 | 含义 | 线上是否变化 |
| --- | --- | --- |
| 0 | 成功（预览通过 / 已上线 / 已确认线上） | 预览无，正式有 |
| 2 | 参数或内容校验失败 | 无（未写文件或未提交） |
| 3 | Hexo 构建失败或文章未渲染 | 无（文章文件已回滚） |
| 4 | Git 提交或推送失败 | 无（推送失败时明确说明未上线） |
| 5 | GitHub Actions 部署失败 | 未确认，按失败处理 |
| 6 | 无法查询 Actions 且线上未确认 | 未知，**不得声称已上线** |

结构化结果：终端 `PUBLISH_RESULT={...}`，文件 `.algorithm-work/last-result.json`。

预览模式会写入文章、构建、校验，然后执行 `hexo clean` + `hexo generate` 回滚，
保证可以反复预演且不挡住正式发布。

## 4. 部署工作流说明（含旧文件问题的结论）

### 现状

`.github/workflows/deploy.yml` 的部署步骤是：SCP 上传到服务器 `/tmp/hexo-blog-deploy-<run_id>`
→ SSH 检查 `index.html` → 清空 `/www/wwwroot/heyubin.top` → 复制 → 清理临时目录。
本次额外做了三件事：`concurrency` 防止并发部署互相覆盖、用 `find` 清空（连隐藏文件一起删）、
部署后请求站点确认返回 200。

### 「删文章后线上旧页面还在」的排查结论（有证据）

- `public/` 和 `db.json` 都在 `.gitignore` 里，CI 每次 checkout 后从零构建，旧文章不可能进入产物。
- 历史提交 `16943a3 删除全部已发布博客文章` → `b45ac34 清理服务器残留文章并生成空博客首页`
  → `5d545ba 在 Actions 构建并通过 SSH 部署静态站点`，说明问题出在「部署前没有清空服务器目录」，
  已在 `b45ac34` / `5d545ba` 修复；`b45ac34` 那次 Actions 运行（#11）是失败的，之后 #12–#15 均成功。
- 实测 `https://heyubin.top/` 返回 200，页面只有 1 篇文章，与仓库 `source/_posts` 完全一致；
  响应头 `last-modified: Tue, 13 Oct 2026 15:53:43 GMT` 与最后一次部署（15:53:15Z 开始）吻合，
  说明站点由 Nginx 直接读磁盘、没有反向代理缓存。

结论：当前链路能正确处理旧文件，不要再「凭感觉」重写部署方式。本次只做了低风险加固，
未改变部署拓扑。

### 2026-10-31 部署事故（已定位并修复）

把清空命令从 `rm -rf "$ROOT"/*`（glob 不匹配隐藏文件）改成
`find "$ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +` 后，部署失败、线上返回 403。

- 证据：运行 `41099320165` 的 `Deploy to Server` 步骤失败、`Verify site is live` 被跳过；
  随后 `https://heyubin.top/` 返回 `403 Forbidden`（目录被清空但新文件没有复制进去）。
- 原因：宝塔会在站点根目录放 `.user.ini`，通常带 `chattr +i`。`find` 把它也列入删除，
  `rm` 失败返回非 0，`set -e` 直接中断，`cp` 根本没执行。旧的 glob 写法之所以一直正常，
  正是因为它匹配不到 `.user.ini`。
- 修复（当前 `deploy.yml`）：删除时排除 `.user.ini`、删除失败不中断、复制前先备份旧站点，
  复制失败或首页缺失时自动回滚；修复后运行 `41099671196` 成功，首页与文章页恢复 200。

教训：服务器侧脚本无法在本地验证，涉及「清空目录」的改动必须保守，并且要有回滚路径。
另外服务器上会保留一份 `/www/wwwroot/.heyubin.top.bak` 备份目录，下次部署会被覆盖，属正常。

## 5. 运行环境限制（踩过的坑）

1. **`D:\hexo-blog` 在 Harness 会话工作区之外**：读写、构建、推送都需要一次性放开沙箱
   （`danger-full-access` 审批）。受限模式下写任意文件会 `EPERM`，Hexo 会报
   `EPERM: open 'D:\hexo-blog\public\...'`。
2. **Git 走 SSH 在受限沙箱里必失败**：git 用管道拉起 `ssh.exe`，msys 需要创建命名管道，
   报 `couldn't create signal pipe, Win32 error 5`。放开沙箱后 `git ls-remote` / `git push` 正常。
3. **Node 的 `spawnSync(..., {stdio: 'pipe'})` 在受限沙箱里会 `EPERM`**：所以发布脚本把子进程
   输出重定向到文件（`stdio: ['ignore', fd, fd]`），不依赖管道。
4. **本机 `curl` 访问外网会报 schannel 凭据错误**，但 Node 的 `fetch` 正常 —— 所以 Actions 查询
   和线上校验都用 Node `fetch`，不要用 curl。
5. 本机没有服务器 SSH 凭据，**服务器侧脚本无法在本地验证**；服务器部署只能通过 push 后观察
   Actions。修改 `deploy.yml` 的 shell 片段后，建议先在 Actions 页面手动 `Run workflow` 验证一次。
6. 查询 Actions 用的是未认证的公开 API，**每小时只有 60 次额度**。一次发布会轮询 10 次左右，
   连续发布会触发 403；脚本会把这种情况报成「无法确认」（退出码 6），不会假装成功。
   额度恢复后可用 `node tools/deploy-status.mjs --sha <SHA>` 复查。
7. 部署工作流里 `appleboy/ssh-action` 已设 `command_timeout: 5m`，curl 校验也带 `--max-time`，
   避免某一步卡住把部署队列占满。

## 6. 排查手册

| 现象 | 先查什么 |
| --- | --- |
| 发布脚本退出码 3 | Hexo 输出最后 20 行；多半是 front-matter 或正文结构问题，`body.md` 里是否误写 `---`、`#`、未闭合代码块 |
| 退出码 4 | `git status`、网络、SSH key；远端是否已前进需要 `git pull --rebase origin main` |
| 退出码 5 | `node tools/deploy-status.mjs --sha <SHA>`，或直接看 Actions 运行日志 |
| 退出码 6 | Actions 查询被限流或超时；用 `--sha` 手动查，或人工打开 Actions 页面 |
| 线上没更新但 Actions 成功 | 看 Actions 里 Deploy/Verify 步骤；确认 `/www/wwwroot/heyubin.top/index.html` 的 mtime |
| 旧文章还在 | 确认 Actions 是否真的执行了清空步骤；确认没有被 `exclude`/`ignore` 规则意外保留 |
| 首页空白 | `scripts/empty-home.js` 是否被删；`hexo generate` 是否生成 `public/index.html` |

## 7. 维护检查清单

- 改 `deploy.yml` 后：手动触发一次 workflow，确认站点 200、文章数正确。
- **不要删除或修改站点根目录的 `.user.ini`**（宝塔面板文件，带 `chattr +i`）；清空目录的脚本必须排除它。
- 部署脚本必须保留回滚路径：先备份旧站点，复制或校验失败时自动恢复。
- 改分类名：同步修改 `tools/publish-algorithm.mjs` 的 `CATEGORY` 和已有文章 front-matter。
- 不要把 `.algorithm-work/`、`public/`、`db.json` 提交进仓库。
- 不要提交任何 API Key / 私钥 / 服务器口令；部署密钥只在 GitHub Secrets。
- 升级 Butterfly 前先 `git submodule update`，升级后检查 `_config.butterfly.yml` 兼容性。
- 新增依赖后同步 `package-lock.json`，否则 CI 的 `npm ci` 会失败。
