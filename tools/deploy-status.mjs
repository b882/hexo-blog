#!/usr/bin/env node
/**
 * 查看 GitHub Actions 部署状态（只读，公开仓库无需 Token）。
 *
 * 用法：
 *   node tools/deploy-status.mjs
 *   node tools/deploy-status.mjs --sha <commit>
 *   node tools/deploy-status.mjs --sha <commit> --wait --timeout 300
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readRemoteSlug, readRemoteUrl } from './lib/repo.mjs';
import { listWorkflowRuns, waitForDeploy } from './lib/github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXIT = { OK: 0, INPUT: 2, DEPLOY_FAILED: 5, UNKNOWN: 6 };

function parseArgs(argv) {
  const options = { sha: null, wait: false, timeout: 300, repo: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const eq = raw.indexOf('=');
    const key = eq === -1 ? raw : raw.slice(0, eq);
    const inline = eq === -1 ? null : raw.slice(eq + 1);
    const value = () => {
      if (inline !== null) return inline;
      index += 1;
      if (index >= argv.length) throw new Error(`参数 ${key} 缺少取值`);
      return argv[index];
    };
    switch (key) {
      case '--sha': options.sha = value(); break;
      case '--wait': options.wait = true; break;
      case '--timeout': options.timeout = Number(value()); break;
      case '--repo': options.repo = value(); break;
      case '--json': options.json = true; break;
      case '-h': case '--help':
        console.log('用法：node tools/deploy-status.mjs [--sha <提交>] [--wait] [--timeout 秒] [--repo owner/repo] [--json]');
        process.exit(EXIT.OK);
        break;
      default:
        throw new Error(`未知参数：${raw}`);
    }
  }
  return options;
}

function formatTime(iso) {
  if (!iso) return '-';
  return iso.replace('T', ' ').replace('Z', ' UTC');
}

function printRuns(runs) {
  if (runs.length === 0) {
    console.log('没有查询到 deploy.yml 的运行记录。');
    return;
  }
  console.log('运行编号\t创建时间\t\t\t状态\t\t结论\t\t提交\t标题');
  for (const run of runs) {
    console.log([
      run.id,
      formatTime(run.createdAt),
      run.status,
      run.conclusion || '-',
      (run.sha || '').slice(0, 7),
      run.event,
    ].join('\t'));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repo = options.repo || readRemoteSlug(ROOT);
  if (!repo) {
    console.error(`无法从 git remote 解析仓库名（origin = ${readRemoteUrl(ROOT) || '未配置'}）。`);
    console.error('可以用 --repo owner/repo 手动指定。');
    return EXIT.INPUT;
  }

  console.log(`仓库：${repo}`);
  console.log(`工作流：deploy.yml`);

  let run;
  if (options.wait && options.sha) {
    try {
      run = await waitForDeploy(repo, options.sha, {
        timeoutMs: options.timeout * 1000,
        onTick: info => console.log(`等待中：${info.status}`),
      });
    } catch (error) {
      console.error(`无法确认部署结果：${error.message}`);
      console.error('这不代表部署失败，只是当前环境拿不到状态，请到 GitHub Actions 页面人工确认。');
      return EXIT.UNKNOWN;
    }
  } else {
    const runs = await listWorkflowRuns(repo, { sha: options.sha || undefined, perPage: 5 });
    printRuns(runs);
    run = options.sha ? runs.find(item => item.sha === options.sha) : runs[0];
    if (!run) {
      console.error('没有找到符合条件的运行记录。');
      return EXIT.UNKNOWN;
    }
  }

  console.log('');
  console.log(`运行：${run.id}`);
  console.log(`提交：${run.sha}`);
  console.log(`状态：${run.status}${run.conclusion ? ` / ${run.conclusion}` : ''}`);
  console.log(`详情：${run.url}`);
  if (options.json) console.log('DEPLOY_RUN=' + JSON.stringify(run));

  if (run.status !== 'completed') return EXIT.UNKNOWN;
  return run.conclusion === 'success' ? EXIT.OK : EXIT.DEPLOY_FAILED;
}

main().then(code => {
  process.exitCode = code;
}).catch(error => {
  console.error(`查询失败：${error.message}`);
  process.exitCode = EXIT.UNKNOWN;
});
