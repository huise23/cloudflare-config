/**
 * Cloudflare Pages Functions
 * 将 API 请求代理到 Cloudflare Worker
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  console.log('[Functions] Request:', pathname, request.method); // 调试日志

  // 代理 /api/* 请求到 Worker
  if (pathname.startsWith('/api/')) {
    console.log('[Functions] API 请求检测到'); // 调试日志

    // 检查是否有 WORKER 绑定
    if (env.WORKER) {
      console.log('[Functions] Worker 绑定存在'); // 调试日志

      try {
        // 创建新的请求对象，复制原始请求的所有内容
        const workerRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });

        // 通过绑定的 Worker 发送请求
        const workerResponse = await env.WORKER.fetch(workerRequest);

        // 复制响应状态和头
        const responseHeaders = new Headers();
        workerResponse.headers.forEach((value, key) => {
          responseHeaders.set(key, value);
        });

        console.log('[Functions] Worker 响应状态:', workerResponse.status); // 调试日志

        return new Response(workerResponse.body, {
          status: workerResponse.status,
          headers: responseHeaders
        });
      } catch (error) {
        console.error('[Functions] Worker 请求错误:', error);
        return new Response(`Worker 请求失败: ${error.message}`, {
          status: 502,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      }
    } else {
      // 没有 WORKER 绑定
      console.error('[Functions] 未找到 WORKER 绑定');
      return new Response('Worker 绑定未配置\n\n配置步骤：\n1. Pages → Settings → Functions\n2 → Bindings → Add binding\n3. Variable: WORKER\n4. Worker: config-center\n5. Environment: Production\n\n然后重新部署', {
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
