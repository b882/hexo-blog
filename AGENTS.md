# AGENTS.md — 算法题解自动发布操作规程

本仓库是一个 Hexo + Butterfly 博客（https://heyubin.top ，仓库 b882/hexo-blog）。
唯一的高频任务是：**接收题目 + C++ 代码，自动生成题解并发布上线**。
详细背景见 [`AUTOMATION.md`](AUTOMATION.md)，用户使用说明见 [`ALGORITHM-PUBLISH.md`](ALGORITHM-PUBLISH.md)。

## 何时使用

用户发来一道算法题（题目原文/题号）和一段 C++ 代码，并要求「发布」「写题解」「归档」时。

## 标准流程

1. **建工作目录**：`.algorithm-work/<题目短名>/`，写入：
   - `solution.cpp`：用户代码，逐字节保留，不重排不缩进不改；
   - `meta.json`：`{"title": "...", "tags": ["...", "..."], "description": "..."}`；
   - `body.md`：按 [`tools/solution-template.md`](tools/solution-template.md) 撰写，代码位置写 `{{CPP_CODE}}`。
2. **预演**：`node tools/publish-algorithm.mjs --from .algorithm-work/<题目短名> --preview`
   —— 必须通过（退出码 0）才继续。失败就按提示改 `body.md`，不要绕过校验。
3. **正式发布**：同样命令去掉 `--preview`。
4. **读结果**：终端 `PUBLISH_RESULT={...}` 或 `.algorithm-work/last-result.json`。
5. **如实报告**：文章地址、提交 SHA、Actions 结论、线上校验结论。

## 必须遵守

- 讲解必须与用户代码实际做法一致；**不编造**题目条件、样例、数据范围、复杂度、AC 结论。
- 无法确认的结论要写明「未验证 / 仅直觉说明」。
- 分类固定「算法题解」；标签由你推断（数据结构、DP、图论、字符串、数论、贪心……），写进 `meta.json`。
- 正文不写一级标题、不写 front-matter；章节用 `##`；`{{CPP_CODE}}` 只出现一次。
- 只有在**线上校验确认页面包含本文**或 **Actions 成功**时才可以说「已上线」。
  退出码 5 说「部署失败」，退出码 6 说「无法确认，请人工查看 Actions」。
- 推送失败时明确说「没有上线」，不要用「应该」「可能」模糊带过。

## 禁止

- 不修改 `themes/`、`_config.yml`、`_config.butterfly.yml` 的外观配置来「顺手优化」。
- 不删除或覆盖任何已有文章；同名文章会被脚本拒绝，这是预期行为。
- 不把 Token、私钥、服务器口令写进仓库或提交信息。
- 不用 `git push --force`，不手工改服务器目录。

## 环境提示

- 项目在 `D:\hexo-blog`，可能位于 Agent 工作区之外：读写、Hexo 构建、Git 推送都需要一次性放开沙箱
  （`danger-full-access` 审批）；受限模式下会 `EPERM`。
- 受限沙箱里 git 走 SSH 会报 `couldn't create signal pipe`，这不是仓库问题。
- 本机 `curl` 不可用，网络查询用 Node `fetch`（脚本已内置）。
- 临时文件只放在 `.algorithm-work/`（已 gitignore），不要留垃圾在 `source/`。
