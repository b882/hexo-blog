/**
 * 查询 GitHub Actions 部署状态（公开仓库只读，无需 Token）。
 */
const API = 'https://api.github.com';
const HEADERS = {
  'user-agent': 'hexo-blog-publisher',
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
};

export class GitHubError extends Error {}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(url) {
  let response;
  try {
    response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  } catch (error) {
    throw new GitHubError(`无法连接 GitHub API：${error.message}`);
  }
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (response.status === 403 || response.status === 429) {
      throw new GitHubError(
        `GitHub API 拒绝查询（HTTP ${response.status}，剩余额度 ${remaining ?? '未知'}）。` +
        '未登录状态下每小时只有 60 次查询额度。',
      );
    }
    throw new GitHubError(`GitHub API 返回 HTTP ${response.status}`);
  }
  return response.json();
}

function pickRun(run) {
  return {
    id: run.id,
    name: run.name,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    sha: run.head_sha,
    branch: run.head_branch,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
  };
}

/** 列出某个工作流的运行记录，可按提交 SHA 过滤。 */
export async function listWorkflowRuns(repo, { sha, workflow = 'deploy.yml', perPage = 10 } = {}) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (sha) query.set('head_sha', sha);
  const data = await request(`${API}/repos/${repo}/actions/workflows/${workflow}/runs?${query}`);
  return (data.workflow_runs || []).map(pickRun);
}

/**
 * 等待指定提交的部署运行结束。
 * 推送后 run 是异步创建的，所以先等出现，再等结束。
 */
export async function waitForDeploy(repo, sha, { timeoutMs = 300000, appearTimeoutMs = 90000, intervalMs = 10000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  const appearDeadline = Date.now() + Math.min(appearTimeoutMs, timeoutMs);
  let lastStatus = null;
  while (Date.now() < deadline) {
    let runs = [];
    try {
      runs = await listWorkflowRuns(repo, { sha });
    } catch (error) {
      if (error instanceof GitHubError) throw error;
      throw new GitHubError(error.message);
    }
    const run = runs.find(item => item.sha === sha) || null;
    if (!run && Date.now() > appearDeadline) {
      throw new GitHubError('没有找到这个提交对应的 deploy.yml 运行记录（可能被 paths/分支规则跳过，或推送未触发工作流）');
    }
    if (run && run.status !== lastStatus) {
      lastStatus = run.status;
      if (onTick) onTick(run);
    }
    if (run && run.status === 'completed') return run;
    await sleep(intervalMs);
  }
  throw new GitHubError(`等待 ${Math.round(timeoutMs / 1000)} 秒后仍未拿到部署结果`);
}
