/**
 * Cloudflare Pages Functions
 * 将 API 请求代理到 Cloudflare Worker
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 代理 /api/* 请求到 Worker
  if (url.pathname.startsWith('/api/')) {
    // 检查是否有 WORKER 绑定
    if (env.WORKER) {
      // 构造 Worker URL
      const workerUrl = `https://config-center.YOUR_SUBDOMAIN.workers.dev${url.pathname}${url.search}`;
      const workerRequest = new Request(workerUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });

      return await env.WORKER.fetch(workerRequest);
    } else {
      return new Response('Worker binding not configured. Please bind "config-center" Worker in Pages settings.', {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      });
    }
  }

  // 其他请求返回静态文件
  return env.ASSETS.fetch(request);
}
