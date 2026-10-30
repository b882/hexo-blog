/**
 * 读取仓库自身的只读信息（不调用 git，避免依赖外部进程）。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 从 GitHub 远端地址解析 owner/repo。 */
export function githubSlugFromUrl(url) {
  if (!url) return null;
  let value = String(url).trim();
  value = value.replace(/^ssh:\/\//i, '');
  value = value.replace(/^git@[^:]+:/, '');
  value = value.replace(/^https?:\/\/[^/]+\//i, '');
  value = value.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  return /^[\w.-]+\/[\w.-]+$/.test(value) ? value : null;
}

/** 读取 .git/config 中 origin 的 URL。 */
export function readRemoteUrl(root) {
  const configPath = path.join(root, '.git', 'config');
  if (!fs.existsSync(configPath)) return null;
  const text = fs.readFileSync(configPath, 'utf8');
  const block = text.match(/\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/);
  if (!block) return null;
  const urlLine = block[1].match(/^\s*url\s*=\s*(.+)$/m);
  return urlLine ? urlLine[1].trim() : null;
}

/** 读取 origin 对应的 owner/repo。 */
export function readRemoteSlug(root) {
  return githubSlugFromUrl(readRemoteUrl(root));
}

/** 读取 _config.yml 中配置的站点地址（去掉末尾斜杠）。 */
export function readSiteUrl(root) {
  const configPath = path.join(root, '_config.yml');
  if (!fs.existsSync(configPath)) return null;
  const text = fs.readFileSync(configPath, 'utf8');
  const line = text.match(/^url:\s*(.+)$/m);
  if (!line) return null;
  const value = line[1].trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  return /^https?:\/\//i.test(value) ? value : null;
}
