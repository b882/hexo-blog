#!/usr/bin/env node
/**
 * 算法题解自动发布器（AI 生成内容 + 确定性发布）
 *
 * 职责边界：
 *   - AI（Harness 会话）负责理解题目、分析算法、撰写正文；
 *   - 本脚本负责所有确定性步骤：front-matter、唯一文件名、重复检测、
 *     Hexo 构建校验、Git 提交推送、GitHub Actions 与线上页面校验。
 *
 * 用法：
 *   node tools/publish-algorithm.mjs --from .algorithm-work/leetcode-1 --preview
 *   node tools/publish-algorithm.mjs --from .algorithm-work/leetcode-1
 *   node tools/publish-algorithm.mjs --title "..." --body body.md --code a.cpp --tags "数组,哈希表"
 *
 * 说明见 ALGORITHM-PUBLISH.md，维护说明见 AUTOMATION.md。
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readRemoteSlug, readSiteUrl } from './lib/repo.mjs';
import { waitForDeploy } from './lib/github.mjs';
import { checkLivePage } from './lib/live.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const PUBLIC_DIR = path.join(ROOT, 'public');
const WORK_DIR = path.join(ROOT, '.algorithm-work');
const TEMP_DIR = path.join(WORK_DIR, 'tmp');
const SNAPSHOT_DIR = path.join(WORK_DIR, 'snapshots');
const HEXO_BIN = path.join(ROOT, 'node_modules', 'hexo', 'bin', 'hexo');

const CATEGORY = '算法题解';
const CODE_TOKEN = '{{CPP_CODE}}';
const MORE_TAG = '<!-- more -->';

const EXIT = { OK: 0, INPUT: 2, BUILD: 3, GIT: 4, DEPLOY_FAILED: 5, DEPLOY_UNKNOWN: 6 };

const DEFAULT_TAGS = ['算法', 'C++'];

const SECRET_RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'SSH/私钥内容'],
  [/\bghp_[A-Za-z0-9]{20,}/, 'GitHub Personal Access Token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'GitHub Token'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'API Key'],
  [/(api[_-]?key|access[_-]?token|secret[_-]?key|passwd|password)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, '疑似口令/密钥'],
];

class PublishError extends Error {
  constructor(stage, exitCode, message, detail = '') {
    super(message);
    this.name = 'PublishError';
    this.stage = stage;
    this.exitCode = exitCode;
    this.detail = detail;
  }
}

function normalizeNewlines(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function stripBom(text) {
  return String(text).replace(/^\uFEFF/, '');
}

function tailText(text, maxLines = 20) {
  const lines = String(text).trimEnd().split('\n');
  return lines.slice(-maxLines).join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printUsage() {
  console.log([
    '算法题解自动发布器',
    '',
    '输入（二选一）：',
    '  --from <目录>        目录内含 meta.json、body.md、solution.cpp',
    '  --title --body --code 分别指定标题、正文文件、代码文件',
    '',
    '可选参数：',
    '  --tags "数组,哈希表"  算法标签，逗号分隔；缺省时由正文/目录提供',
    '  --date "2026-10-31 08:00:00"  发布时间，默认上海时间当前时刻',
    '  --preview            只生成并构建校验，不提交、不推送',
    '  --no-push            提交到本地 main，不推送',
    '  --allow-duplicate    允许与已有文章同名',
    '  --skip-actions       推送后不查询 GitHub Actions',
    '  --actions-timeout <秒>  等待部署的超时，默认 300',
    '  --live-timeout <秒>     等待线上页面的超时，默认 120',
    '  -h, --help           显示本帮助',
    '',
    '正文约定了 {{CPP_CODE}} 占位符，脚本会把 solution.cpp 原样嵌入该位置。',
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {
    help: false,
    preview: false,
    noPush: false,
    allowDuplicate: false,
    skipActions: false,
    from: null,
    title: null,
    body: null,
    code: null,
    tags: null,
    date: null,
    actionsTimeout: 300,
    liveTimeout: 120,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const eq = raw.indexOf('=');
    const key = eq === -1 ? raw : raw.slice(0, eq);
    const inline = eq === -1 ? null : raw.slice(eq + 1);
    const value = () => {
      if (inline !== null) return inline;
      index += 1;
      if (index >= argv.length) {
        throw new PublishError('arguments', EXIT.INPUT, `参数 ${key} 缺少取值`);
      }
      return argv[index];
    };

    switch (key) {
      case '--help': case '-h': options.help = true; break;
      case '--preview': options.preview = true; break;
      case '--no-push': options.noPush = true; break;
      case '--allow-duplicate': options.allowDuplicate = true; break;
      case '--skip-actions': options.skipActions = true; break;
      case '--from': options.from = value(); break;
      case '--title': options.title = value(); break;
      case '--body': options.body = value(); break;
      case '--code': options.code = value(); break;
      case '--tags': options.tags = value(); break;
      case '--date': options.date = value(); break;
      case '--actions-timeout': options.actionsTimeout = Number(value()); break;
      case '--live-timeout': options.liveTimeout = Number(value()); break;
      default:
        throw new PublishError('arguments', EXIT.INPUT, `未知参数：${raw}`, '运行 node tools/publish-algorithm.mjs --help 查看用法');
    }
  }

  for (const key of ['actionsTimeout', 'liveTimeout']) {
    if (!Number.isFinite(options[key]) || options[key] < 0) {
      throw new PublishError('arguments', EXIT.INPUT, `--${key} 需要非负数字`);
    }
  }
  return options;
}

function readTextFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new PublishError('input', EXIT.INPUT, `找不到${label}：${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) {
    throw new PublishError('input', EXIT.INPUT, `${label}是空文件：${filePath}`);
  }
  return normalizeNewlines(text);
}

function loadInput(options) {
  const fromDir = options.from ? path.resolve(ROOT, options.from) : null;
  if (fromDir && !fs.existsSync(fromDir)) {
    throw new PublishError('input', EXIT.INPUT, `--from 目录不存在：${fromDir}`);
  }

  let meta = {};
  if (fromDir) {
    const metaPath = path.join(fromDir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(stripBom(fs.readFileSync(metaPath, 'utf8')));
      } catch (error) {
        throw new PublishError('input', EXIT.INPUT, `meta.json 不是合法 JSON：${error.message}`);
      }
    }
  }

  const bodyFile = options.body
    ? path.resolve(ROOT, options.body)
    : (fromDir ? path.join(fromDir, 'body.md') : null);
  const codeFile = options.code
    ? path.resolve(ROOT, options.code)
    : (fromDir ? path.join(fromDir, 'solution.cpp') : null);

  if (!bodyFile) {
    throw new PublishError('input', EXIT.INPUT, '缺少正文文件', '用 --body 指定，或用 --from 指定包含 body.md 的目录');
  }
  if (!codeFile) {
    throw new PublishError('input', EXIT.INPUT, '缺少 C++ 代码文件', '用 --code 指定，或用 --from 指定包含 solution.cpp 的目录');
  }

  return {
    title: String(options.title ?? meta.title ?? '').trim(),
    tags: options.tags ?? meta.tags ?? [],
    date: options.date ?? meta.date ?? null,
    description: meta.description ?? null,
    body: readTextFile(bodyFile, '正文'),
    code: readTextFile(codeFile, 'C++ 代码'),
    bodyFile,
    codeFile,
  };
}

function normalizeTagList(raw) {
  const list = Array.isArray(raw) ? raw.map(item => String(item)) : String(raw ?? '').split(/[,，、]/);
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const tag = item.trim().replace(/^["']|["']$/g, '').trim();
    if (!tag || tag.length > 24) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function buildTagList(raw, warnings) {
  const provided = normalizeTagList(raw);
  const tags = [...DEFAULT_TAGS];
  for (const tag of provided) {
    if (!tags.some(item => item.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  if (provided.length === 0) {
    warnings.push('没有提供算法标签，只使用默认标签「算法」「C++」；建议在 meta.json 里补充算法分类。');
  }
  if (tags.length > 10) {
    warnings.push(`标签数量 ${tags.length} 个偏多，只保留前 10 个。`);
  }
  return tags.slice(0, 10);
}

function scanSecrets(text) {
  const hits = [];
  for (const [pattern, label] of SECRET_RULES) {
    if (pattern.test(text)) hits.push(label);
  }
  return hits;
}

function validateInput(input, warnings) {
  const problems = [];

  if (!input.title) {
    problems.push('缺少标题（--title 或 meta.json 的 title）');
  } else {
    if (input.title.length > 120) problems.push('标题超过 120 个字符');
    if (/[\r\n]/.test(input.title)) problems.push('标题不能包含换行');
  }

  const body = input.body;
  const markerCount = body.split(CODE_TOKEN).length - 1;
  if (markerCount === 0) {
    problems.push(`正文缺少代码占位符 ${CODE_TOKEN}`);
  } else if (markerCount > 1) {
    problems.push(`正文里 ${CODE_TOKEN} 出现了 ${markerCount} 次，只允许一次`);
  }
  if (body.trimStart().startsWith('---')) {
    problems.push('正文不要自带 front-matter，脚本会统一生成');
  }
  if (/^#\s+\S/m.test(body)) {
    problems.push('正文不要写一级标题（# 标题），文章标题由 front-matter 提供，章节请用 ##');
  }
  const headingCount = (body.match(/^##\s+\S/gm) || []).length;
  if (headingCount < 3) {
    problems.push(`正文只有 ${headingCount} 个二级标题，至少需要 3 个（题意、思路、复杂度、代码等）`);
  }
  if (!/复杂度/.test(body)) {
    problems.push('正文缺少「复杂度」分析');
  }
  if (body.length < 300) {
    problems.push(`正文只有 ${body.length} 个字符，内容过短`);
  }
  const fenceCount = (body.match(/^`{3,}/gm) || []).length;
  if (fenceCount % 2 !== 0) {
    problems.push('正文里的代码围栏没有成对闭合');
  }
  if (/\{\{[A-Z_]+\}\}/.test(body.replace(CODE_TOKEN, ''))) {
    problems.push('正文里还有未替换的 {{...}} 占位符');
  }

  if (!input.code.trim()) {
    problems.push('C++ 代码为空');
  } else {
    if (input.code.length > 200000) problems.push('C++ 代码超过 200KB');
    if (!/#include|int\s+main|class\s+\w+|using\s+namespace/.test(input.code)) {
      warnings.push('代码里没有看到 #include / main / class，请确认贴的是完整可编译的 C++ 代码。');
    }
  }

  const secretHits = [...new Set([...scanSecrets(body), ...scanSecrets(input.code)])];
  if (secretHits.length > 0) {
    problems.push(`检测到敏感信息（${secretHits.join('、')}），请移除后再发布`);
  }

  if (problems.length > 0) {
    throw new PublishError('validate', EXIT.INPUT, '输入校验未通过', problems.map(item => `- ${item}`).join('\n'));
  }
}

function shanghaiNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return {
    text: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
    ymd: { year: parts.year, month: parts.month, day: parts.day },
  };
}

function normalizeDate(value) {
  if (!value) return shanghaiNow();
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    throw new PublishError('validate', EXIT.INPUT, `日期格式不正确：${value}`, '应形如 2026-10-31 08:00:00');
  }
  const [, year, month, day, hour, minute, second] = match;
  const now = shanghaiNow();
  return {
    text: `${year}-${month}-${day} ${hour ?? now.text.slice(11, 13)}:${minute ?? '00'}:${second ?? '00'}`,
    ymd: { year, month, day },
  };
}

function makeSlug(title) {
  let slug = title
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  const chars = [...slug];
  if (chars.length > 60) {
    slug = chars.slice(0, 60).join('').replace(/[-.]+$/g, '');
  }
  return slug || 'algorithm-post';
}

function normalizeTitleForCompare(title) {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function parseFrontMatterTitle(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return '';
  const line = match[1].match(/^title:\s*(.+)$/m);
  if (!line) return '';
  return line[1].trim().replace(/^["']|["']$/g, '');
}

function listPostFiles(dir = POSTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...listPostFiles(full));
    else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) result.push(full);
  }
  return result;
}

function findDuplicatePosts(title) {
  const target = normalizeTitleForCompare(title);
  const duplicates = [];
  for (const file of listPostFiles()) {
    const existing = parseFrontMatterTitle(fs.readFileSync(file, 'utf8'));
    if (existing && normalizeTitleForCompare(existing) === target) {
      duplicates.push(path.relative(ROOT, file).split(path.sep).join('/'));
    }
  }
  return duplicates;
}

function uniqueFileName(slug) {
  const taken = new Set(
    fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR).map(name => name.toLowerCase()) : [],
  );
  let candidate = `${slug}.md`;
  let index = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${slug}-${index}.md`;
    index += 1;
    if (index > 50) {
      throw new PublishError('validate', EXIT.INPUT, `文件名冲突过多：${slug}`);
    }
  }
  return candidate;
}

function codeFence(code) {
  const runs = code.match(/`+/g) || [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function ensureMoreTag(content, warnings) {
  if (content.includes(MORE_TAG)) return content;
  const lines = content.split('\n');
  const headings = [];
  lines.forEach((line, index) => {
    if (/^##\s+\S/.test(line)) headings.push(index);
  });
  if (headings.length >= 2) {
    lines.splice(headings[1], 0, MORE_TAG, '');
    warnings.push('正文没有 <!-- more --> 标记，已在第二个章节前自动补上（首页摘要分界）。');
  } else {
    lines.push('', MORE_TAG);
    warnings.push('正文没有 <!-- more --> 标记，已补在文末。');
  }
  return lines.join('\n');
}

function composeMarkdown({ title, dateInfo, tags, description, body, code, token, warnings }) {
  const fence = codeFence(code);
  const block = `${fence}cpp\n${code.trimEnd()}\n${fence}`;
  let content = body.trim();
  content = content.replace(CODE_TOKEN, () => block);
  content = ensureMoreTag(content, warnings);

  const head = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${dateInfo.text}`,
    ...(description ? [`description: ${JSON.stringify(String(description))}`] : []),
    'categories:',
    `  - ${CATEGORY}`,
    'tags:',
    ...tags.map(tag => `  - ${JSON.stringify(tag)}`),
    '---',
  ].join('\n');

  return `${head}\n\n${content}\n\n<!-- ${token} -->\n`;
}

function preparePost(input, options, warnings) {
  const dateInfo = normalizeDate(input.date);
  const tags = buildTagList(input.tags, warnings);
  const duplicates = findDuplicatePosts(input.title);
  if (duplicates.length > 0 && !options.allowDuplicate) {
    throw new PublishError(
      'validate',
      EXIT.INPUT,
      `已存在同名文章：${duplicates.join('、')}`,
      '如果确实要再发一篇同名文章，加 --allow-duplicate；如果要更新旧文章，请直接编辑旧文件。',
    );
  }

  const baseSlug = makeSlug(input.title);
  const fileName = uniqueFileName(baseSlug);
  const slug = path.basename(fileName, '.md');
  const token = `algopost-${crypto.randomBytes(4).toString('hex')}`;
  const markdown = composeMarkdown({
    title: input.title,
    dateInfo,
    tags,
    description: input.description,
    body: input.body,
    code: input.code,
    token,
    warnings,
  });

  return {
    title: input.title,
    slug,
    token,
    dateInfo,
    tags,
    markdown,
    fileName,
    filePath: path.join(POSTS_DIR, fileName),
    relPath: `source/_posts/${fileName}`,
    expectedPage: `${dateInfo.ymd.year}/${dateInfo.ymd.month}/${dateInfo.ymd.day}/${slug}/index.html`,
  };
}

function writePost(post) {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(post.filePath, post.markdown, { encoding: 'utf8', flag: 'wx' });
  fs.writeFileSync(path.join(SNAPSHOT_DIR, post.fileName), post.markdown, { encoding: 'utf8' });
}

function removeQuietly(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // 清理失败不影响主流程的错误报告
  }
}

/**
 * 预览回滚：删掉刚写的文章，并重建 public，让仓库和静态站点都回到发布前状态。
 * 这样 --preview 可以反复执行，不会留下同名文章挡住正式发布。
 */
function rollbackPreview(post) {
  removeQuietly(post.filePath);
  const failure = { stage: 'build', exitCode: EXIT.BUILD };
  try {
    runCommand(process.execPath, [HEXO_BIN, 'clean'], 'hexo clean', failure);
    runCommand(process.execPath, [HEXO_BIN, 'generate'], 'hexo generate', failure);
  } catch (error) {
    console.log(`[提醒] 预览回滚没有完全成功：${error.message}`);
    console.log('       请手动执行 npm run clean 再重新生成，避免 public 里残留预览页面。');
  }
}

let commandSeq = 0;

function runCommand(command, args, label = command, failure = { stage: 'git', exitCode: EXIT.GIT }) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const logFile = path.join(TEMP_DIR, `cmd-${process.pid}-${commandSeq += 1}.log`);
  const fd = fs.openSync(logFile, 'w');
  let result;
  try {
    result = spawnSync(command, args, {
      cwd: ROOT,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    });
  } finally {
    fs.closeSync(fd);
  }
  const output = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
  if (result.error) {
    const code = result.error.code || '';
    throw new PublishError(failure.stage, failure.exitCode, `${label} 无法执行：${result.error.message}`,
      code === 'EPERM'
        ? '当前环境限制了子进程或文件访问权限，请在允许写入 D:\\hexo-blog 的终端中运行。'
        : '检查命令是否安装、路径是否正确。');
  }
  return { status: result.status, output, label };
}

function walkFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

function findPagesWithToken(token) {
  if (!fs.existsSync(PUBLIC_DIR)) return [];
  const hits = [];
  for (const file of walkFiles(PUBLIC_DIR)) {
    if (!file.endsWith('.html')) continue;
    if (fs.readFileSync(file, 'utf8').includes(token)) {
      hits.push(path.relative(PUBLIC_DIR, file).split(path.sep).join('/'));
    }
  }
  return hits;
}

function toUrlPath(page) {
  const normalized = page.replace(/\\/g, '/');
  if (normalized === 'index.html') return '/';
  return `/${normalized.replace(/index\.html$/, '')}`;
}

function buildAndVerify(post) {
  if (!fs.existsSync(HEXO_BIN)) {
    throw new PublishError('build', EXIT.BUILD, '找不到 Hexo', '请先在项目根目录执行 npm install');
  }
  const result = runCommand(process.execPath, [HEXO_BIN, 'generate'], 'hexo generate', {
    stage: 'build',
    exitCode: EXIT.BUILD,
  });
  if (result.status !== 0) {
    throw new PublishError('build', EXIT.BUILD, `Hexo 构建失败（退出码 ${result.status}）`, tailText(result.output));
  }
  if (/\bFATAL\b/.test(result.output)) {
    throw new PublishError('build', EXIT.BUILD, 'Hexo 构建输出里出现 FATAL', tailText(result.output));
  }
  if (/^\s*ERROR\s/m.test(result.output)) {
    throw new PublishError('build', EXIT.BUILD, 'Hexo 构建输出里出现 ERROR', tailText(result.output));
  }

  const hits = findPagesWithToken(post.token);
  if (hits.length === 0) {
    throw new PublishError(
      'build',
      EXIT.BUILD,
      '文章没有被 Hexo 渲染出来',
      '常见原因：front-matter 非法、文件不在 source/_posts 下、或文章被 ignore/exclude 规则排除。',
    );
  }
  if (hits.length > 1) {
    throw new PublishError('build', EXIT.BUILD, `文章标记出现在 ${hits.length} 个页面中`, hits.join('\n'));
  }

  const page = hits[0];
  if (page !== post.expectedPage) {
    console.log(`[提示] 实际生成的页面路径是 ${page}，与预期 ${post.expectedPage} 不同，以实际为准。`);
  }
  const html = fs.readFileSync(path.join(PUBLIC_DIR, page), 'utf8');
  const title = post.title;
  if (!html.includes(escapeHtml(title)) && !html.includes(title)) {
    console.log('[提示] 生成页面的 HTML 里没有直接找到标题文本，请人工确认标题渲染是否正常。');
  }
  return { page, urlPath: toUrlPath(page) };
}

function assertGitReady() {
  const branch = runCommand('git', ['branch', '--show-current'], 'git branch');
  if (branch.status !== 0) {
    throw new PublishError('git', EXIT.GIT, '无法读取当前 Git 分支', tailText(branch.output));
  }
  const current = branch.output.trim();
  if (current !== 'main') {
    throw new PublishError('git', EXIT.GIT, `当前分支是「${current || '(空)'}」，发布只允许在 main 上进行`);
  }

  const staged = runCommand('git', ['diff', '--cached', '--name-only'], 'git diff --cached');
  if (staged.status !== 0) {
    throw new PublishError('git', EXIT.GIT, '无法读取 Git 暂存区', tailText(staged.output));
  }
  if (staged.output.trim()) {
    throw new PublishError('git', EXIT.GIT, '暂存区里已有其他改动', `${staged.output.trim()}\n请先提交或取消暂存，再发布文章。`);
  }

  const ident = runCommand('git', ['var', 'GIT_AUTHOR_IDENT'], 'git var GIT_AUTHOR_IDENT');
  if (ident.status !== 0) {
    throw new PublishError('git', EXIT.GIT, 'Git 提交身份未配置',
      '执行 git config user.name "你的名字" 和 git config user.email "你的邮箱"');
  }

  if (!readRemoteSlug(ROOT)) {
    throw new PublishError('git', EXIT.GIT, '无法从 origin 解析出 GitHub 仓库', '检查 git remote -v');
  }
}

function commitPost(relPath, title) {
  const add = runCommand('git', ['add', '--', relPath], 'git add');
  if (add.status !== 0) {
    throw new PublishError('git', EXIT.GIT, 'git add 失败', tailText(add.output));
  }
  const commit = runCommand('git', ['commit', '--only', '-m', `新增算法题解：${title}`, '--', relPath], 'git commit');
  if (commit.status !== 0) {
    throw new PublishError('git', EXIT.GIT, 'git commit 失败', tailText(commit.output));
  }
  const head = runCommand('git', ['rev-parse', 'HEAD'], 'git rev-parse');
  if (head.status !== 0) {
    throw new PublishError('git', EXIT.GIT, '无法读取新的提交 SHA', tailText(head.output));
  }
  return head.output.trim();
}

function pushMain() {
  const push = runCommand('git', ['push', 'origin', 'HEAD:main'], 'git push');
  if (push.status !== 0) {
    throw new PublishError(
      'git',
      EXIT.GIT,
      'git push 失败，文章没有上线',
      `${tailText(push.output)}\n处理方式：修复网络或认证问题后执行 git push origin HEAD:main；` +
      '如果远端 main 已经前进（例如合并了 Dependabot PR），先执行 git pull --rebase origin main 再推送。',
    );
  }
  const local = runCommand('git', ['rev-parse', 'HEAD'], 'git rev-parse').output.trim();
  const remote = runCommand('git', ['ls-remote', 'origin', 'refs/heads/main'], 'git ls-remote');
  const remoteSha = remote.output.trim().split(/\s+/)[0] || '';
  if (remoteSha !== local) {
    throw new PublishError('git', EXIT.GIT, '推送后远端 main 与本地不一致', `本地 ${local}，远端 ${remoteSha}`);
  }
  return local;
}

function printResult(result) {
  console.log('\n================ 发布结果 ================');
  if (result.file) console.log(`文章文件：${result.file}`);
  if (result.snapshot) console.log(`文章快照：${result.snapshot}`);
  if (result.url) console.log(`文章地址：${result.url}`);
  if (result.commit) console.log(`提交：${result.commit.slice(0, 7)}`);

  if (result.error) {
    console.log(`状态：失败（阶段 ${result.stage}）：${result.error}`);
    if (result.commit && !result.pushed) {
      console.log('      本地已提交，但没有推送，线上没有变化。');
    } else {
      console.log('      没有提交、没有推送，线上没有变化。');
    }
  } else if (result.preview) {
    console.log('状态：预览通过（Hexo 已成功渲染该文章）。');
    console.log('      已回滚：文章文件已删除、public 已重建，仓库与线上都没有变化。');
  } else if (!result.pushed) {
    console.log(`状态：${result.note || '未推送'}；线上没有变化。`);
  } else {
    console.log(`推送：已推送到 origin/main`);
    if (result.deploy.state === 'completed') {
      const ok = result.deploy.conclusion === 'success';
      console.log(`GitHub Actions：${ok ? '成功' : `失败（${result.deploy.conclusion}）`}`);
      if (result.deploy.runUrl) console.log(`运行详情：${result.deploy.runUrl}`);
    } else if (result.deploy.state === 'skipped') {
      console.log('GitHub Actions：未查询（--skip-actions）');
    } else {
      console.log(`GitHub Actions：无法确认（${result.deploy.reason || '未知原因'}）`);
    }
    if (result.live.state === 'live') {
      console.log('线上校验：已在线上页面确认本文内容，确认上线。');
      if (result.deploy.state === 'completed' && result.deploy.conclusion !== 'success') {
        console.log('注意：Actions 报告失败，但线上页面已经包含本文，可能是部署后校验步骤误报，请查看运行日志。');
      }
    } else if (result.live.state === 'unknown') {
      console.log(`线上校验：未能在限定时间内确认${result.live.status ? `（HTTP ${result.live.status}）` : ''}。`);
    } else {
      console.log('线上校验：已跳过。');
    }
  }

  console.log('PUBLISH_RESULT=' + JSON.stringify(result));
}

function saveResult(result) {
  try {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(path.join(WORK_DIR, 'last-result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  } catch {
    // 结果文件写不了不影响退出码
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return EXIT.OK;
  }

  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const warnings = [];
  const result = {
    ok: false,
    preview: options.preview,
    title: '',
    file: '',
    url: '',
    commit: '',
    pushed: false,
    deploy: { state: 'skipped', reason: '尚未执行' },
    live: { state: 'skipped', url: '' },
    warnings,
    time: new Date().toISOString(),
  };

  try {
    const totalSteps = options.preview ? 4 : 7;
    const stepLabel = index => `[${index}/${totalSteps}]`;

    if (!options.preview) {
      console.log(`${stepLabel(1)} 检查 Git 工作区…`);
      assertGitReady();
    } else {
      console.log(`${stepLabel(1)} 预览模式：跳过 Git 检查`);
    }

    console.log(`${stepLabel(2)} 读取并校验输入…`);
    const input = loadInput(options);
    validateInput(input, warnings);
    const post = preparePost(input, options, warnings);
    result.title = post.title;
    result.tags = post.tags;
    result.date = post.dateInfo.text;

    console.log(`${stepLabel(3)} 生成并写入 Hexo Markdown…`);
    writePost(post);
    result.file = post.relPath;
    console.log(`      写入 ${post.relPath}`);

    console.log(`${stepLabel(4)} 运行 Hexo 构建并校验渲染结果…`);
    let rendered;
    try {
      rendered = buildAndVerify(post);
    } catch (error) {
      console.log(`      构建校验失败，已删除文章文件 ${post.relPath}（快照保留在 .algorithm-work/snapshots）。`);
      removeQuietly(post.filePath);
      result.file = '';
      throw error;
    }
    result.url = `${readSiteUrl(ROOT) || ''}${rendered.urlPath}`;

    for (const warning of warnings) console.log(`      [提醒] ${warning}`);

    if (options.preview) {
      rollbackPreview(post);
      result.ok = true;
      result.file = '';
      result.snapshot = path.relative(ROOT, path.join(SNAPSHOT_DIR, post.fileName)).split(path.sep).join('/');
      result.deploy = { state: 'skipped', reason: '预览模式' };
      printResult(result);
      saveResult(result);
      return EXIT.OK;
    }

    console.log(`${stepLabel(5)} 提交文章…`);
    result.commit = commitPost(post.relPath, post.title);

    console.log(`${stepLabel(6)} 推送到 origin/main…`);
    if (options.noPush) {
      result.ok = true;
      result.note = '只提交到本地 main，按 --no-push 跳过推送';
      printResult(result);
      saveResult(result);
      return EXIT.OK;
    }
    pushMain();
    result.pushed = true;

    console.log(`${stepLabel(7)} 检查 GitHub Actions 与线上页面…`);
    const siteUrl = readSiteUrl(ROOT);
    const repo = readRemoteSlug(ROOT);

    if (options.skipActions) {
      result.deploy = { state: 'skipped', reason: '--skip-actions' };
    } else {
      try {
        const runInfo = await waitForDeploy(repo, result.commit, {
          timeoutMs: options.actionsTimeout * 1000,
          intervalMs: 10000,
          onTick: info => console.log(`      Actions 状态：${info.status}`),
        });
        result.deploy = {
          state: 'completed',
          conclusion: runInfo.conclusion,
          runId: runInfo.id,
          runUrl: runInfo.url,
          status: runInfo.status,
        };
      } catch (error) {
        result.deploy = { state: 'unknown', reason: error.message };
      }
    }

    result.live = await checkLivePage(siteUrl, rendered.urlPath, post.token, options.liveTimeout * 1000);

    let exitCode;
    if (result.live.state === 'live') {
      exitCode = EXIT.OK;
    } else if (result.deploy.state === 'completed' && result.deploy.conclusion !== 'success') {
      exitCode = EXIT.DEPLOY_FAILED;
    } else if (result.deploy.state === 'completed' || result.deploy.state === 'skipped') {
      exitCode = EXIT.OK;
    } else {
      exitCode = EXIT.DEPLOY_UNKNOWN;
    }

    result.ok = exitCode === EXIT.OK;
    printResult(result);
    saveResult(result);
    return exitCode;
  } catch (error) {
    const exitCode = error instanceof PublishError ? error.exitCode : 1;
    result.ok = false;
    result.stage = error.stage || 'unknown';
    result.error = error.message;
    if (error.detail) result.detail = error.detail;

    console.error(`\n[失败] ${error.message}`);
    if (error.detail) console.error(error.detail);
    if (result.file && fs.existsSync(path.join(ROOT, result.file))) {
      console.error(`文章文件保留在 ${result.file}。`);
    }
    if (result.commit && !result.pushed) {
      console.error('本地提交已完成；处理问题后可执行 git push origin HEAD:main，无需重新生成文章。');
    }
    printResult(result);
    saveResult(result);
    return exitCode;
  }
}

run().then(code => {
  process.exitCode = code;
}).catch(error => {
  if (error instanceof PublishError) {
    console.error(`[失败] ${error.message}`);
    if (error.detail) console.error(error.detail);
    process.exitCode = error.exitCode;
  } else {
    console.error(error);
    process.exitCode = 1;
  }
});
