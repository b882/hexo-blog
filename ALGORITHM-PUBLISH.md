# 算法题解自动发布

这个博客的题解发布已经不需要手工写 Markdown、执行 Hexo 或敲 Git 命令。
**把题目和你的 C++ 代码发给 Harness 会话，说一句「发布这道题」，剩下的事情由 AI 和脚本一起完成。**

## 一、你只需要提供两样东西

1. 题目原文（或题号 + 你能确认的题意、数据范围）；
2. 你的 C++ 代码（原样粘贴，不需要自己改格式）。

如果题目有来源链接，一并给出，脚本会把来源写进正文。

## 二、自动流程

| 步骤 | 谁来做 | 产物 |
| --- | --- | --- |
| 1. 理解题意、分析你的代码实际用的算法 | AI | 分析结论 |
| 2. 按固定结构撰写中文题解 | AI | `body.md` |
| 3. 推断算法标签、题目来源 | AI | `meta.json` |
| 4. 生成 front-matter、唯一文件名、重复检测 | 脚本 | `source/_posts/<标题>.md` |
| 5. 运行 `hexo generate` 并确认文章真的渲染出来 | 脚本 | 构建结果 |
| 6. `git add` / `commit` / `push origin main` | 脚本 | 远端提交 |
| 7. 查询 GitHub Actions、请求线上页面确认 | 脚本 | 上线结论 |

第 5 步不通过就不会提交，第 6 步失败会明确告诉你「没有上线」，
第 7 步会打开 `https://heyubin.top/...` 检查页面里是否真的有这篇文章。

## 三、文章固定包含

1. 题意概述（含题目来源）；
2. 核心性质与解题思路；
3. 算法设计与关键推导；
4. 正确性说明（无法严格证明时会明确标注）；
5. 时间复杂度与空间复杂度；
6. 完整 C++ 代码（原样嵌入，不改一个字符）；
7. 易错点（确实存在时才写）。

写作规则见 [`tools/solution-template.md`](tools/solution-template.md)。

## 四、三种使用方式

### 1. 对话式（推荐）

在 Harness 会话里直接发：

> 题目：……（原文）
> 代码：```cpp …… ```
> 发布这道题

AI 会把输入写进 `.algorithm-work/<任务名>/`，生成正文后调用发布脚本，最后报告文章地址、
提交 SHA、Actions 结论和线上校验结果。

### 2. 命令行（AI 已经生成好内容时）

```powershell
cd D:\hexo-blog
node tools\publish-algorithm.mjs --from .algorithm-work\poj-2955 --preview
node tools\publish-algorithm.mjs --from .algorithm-work\poj-2955
```

`--preview` 是一次完整预演：写入文章 → 执行 `hexo generate` → 确认文章真的被渲染出来
→ **回滚**（删掉文章文件、重建 `public`）。仓库和线上都不留痕迹，可以反复执行。
预演通过后去掉 `--preview` 正式发布。

### 3. 手工分段参数

```powershell
node tools\publish-algorithm.mjs `
  --title "POJ 2955：Brackets" `
  --body .algorithm-work\poj-2955\body.md `
  --code .algorithm-work\poj-2955\solution.cpp `
  --tags "动态规划,区间DP,括号序列"
```

## 五、输入目录约定

`--from` 目录里放三个文件：

```text
.algorithm-work/poj-2955/
├── meta.json       # 标题、标签、可选日期和描述
├── body.md         # 题解正文，代码位置写 {{CPP_CODE}}
└── solution.cpp    # 原始 C++ 代码，原样嵌入
```

`meta.json`：

```json
{
  "title": "POJ 2955：Brackets",
  "tags": ["POJ", "动态规划", "区间DP", "括号序列"],
  "date": "2026-10-31 08:00:00",
  "description": "区间 DP 求最长合法括号子序列"
}
```

`date`、`description` 可省略；`date` 省略时用上海时间当前时刻。

## 六、脚本替你挡掉的问题

| 情况 | 行为 |
| --- | --- |
| 正文没写 `{{CPP_CODE}}`、章节太少、没有复杂度分析 | 直接报错，不写文件 |
| 正文自带 front-matter 或一级标题 | 直接报错 |
| 已有同名文章 | 拒绝发布，并列出旧文件路径 |
| 文件名冲突 | 自动改用 `<标题>-2.md`，不覆盖任何旧文章 |
| 正文或代码里出现 Token / 私钥 / 口令 | 拒绝发布 |
| `hexo generate` 失败或文章没渲染出来 | 删除刚写的文章文件，保留快照，不提交 |
| `git push` 失败 | 明确报告「没有上线」，并给出补救命令 |
| Actions 失败 | 退出码 5，明确说明部署失败 |
| 当前环境查不到 Actions | 退出码 6，明确说明「无法确认，不代表已上线」 |

退出码：`0` 成功、`2` 输入/校验错误、`3` 构建失败、`4` Git 失败、`5` 部署失败、`6` 无法确认。

每次运行都会把结构化结果写到 `.algorithm-work/last-result.json`，并在终端打印
`PUBLISH_RESULT={...}`，方便 AI 直接读取。

## 七、单独查看部署状态

```powershell
cd D:\hexo-blog
node tools\deploy-status.mjs
node tools\deploy-status.mjs --sha <提交SHA> --wait
```

公开仓库的 Actions 是只读可查的，不需要 Token；未登录状态每小时有 60 次查询额度，
额度用尽时脚本会明确说明「无法查询」，不会假装成功。

## 八、安全

- 仓库里不保存任何 API Key、SSH 私钥、服务器密码；
- 部署密钥只存在于 GitHub 仓库的 Secrets 里；
- 发布脚本读取 `~/.ssh` 的既有配置，不会写入任何凭据；
- 脚本会扫描正文和代码里的敏感字符串并拒绝发布。

## 九、出问题怎么办

1. 构建失败：看终端最后 20 行 Hexo 输出，修 `body.md` 或 front-matter 后重跑；
2. Git 失败：按提示处理网络/认证；本地提交还在，修好后 `git push origin HEAD:main` 即可；
3. 远端 main 已前进（例如合并了 Dependabot PR）：`git pull --rebase origin main` 再推送；
4. Actions 失败：`node tools/deploy-status.mjs --sha <SHA>` 看运行详情；
5. 线上没更新：先确认 Actions 是否成功，再看 `AUTOMATION.md` 的排查一节。
