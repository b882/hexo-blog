/**
 * 线上页面校验：确认新文章真的出现在 heyubin.top 上。
 *
 * 用随机查询串绕过可能的缓存，并要求返回的 HTML 里包含本次发布的唯一标记，
 * 避免「站点 200 但其实是旧页面」这种假成功。
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function checkLivePage(siteUrl, urlPath, token, timeoutMs, { intervalMs = 5000 } = {}) {
  if (!siteUrl || timeoutMs <= 0) return { state: 'skipped', url: '' };
  const clean = `${siteUrl}${urlPath}`;
  const target = `${clean}?v=${encodeURIComponent(token)}`;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(target, {
        headers: { 'user-agent': 'hexo-blog-publisher', 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(15000),
      });
      lastStatus = response.status;
      if (response.ok) {
        const html = await response.text();
        if (html.includes(token)) return { state: 'live', url: clean };
      }
    } catch {
      lastStatus = 0;
    }
    await sleep(intervalMs);
  }
  return { state: 'unknown', url: clean, status: lastStatus };
}
