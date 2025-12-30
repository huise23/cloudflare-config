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
      // 从绑定的 Worker 构造请求
      // 使用相同的 URL 路径和查询参���
      const workerRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });

      return await env.WORKER.fetch(workerRequest);
    } else {
      // 没有绑定 Worker，返回错误提示
      return new Response('Worker binding not configured.\n\n请配置步骤：\n1. Pages → Settings → Functions → Bindings\n2. Add binding: Variable: WORKER, Worker: config-center\n3. 保存并重新部署', {
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
