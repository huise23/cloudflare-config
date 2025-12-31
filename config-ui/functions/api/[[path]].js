// /pages/functions/api/[[path]].js

export async function onRequest(context) {
  try {
    // 1. 从 context.env 中获取绑定的 Worker。
    //    'WORKER' 是你在 Cloudflare Pages 设置中为绑定起的名字。
    const worker = context.env.WORKER;

    if (!worker) {
      return new Response("Worker binding not found.", { status: 500 });
    }

    // 2. 使用 worker.fetch() 将原始请求直接转发给绑定的 Worker。
    //    这会原封不动地传递方法(GET/POST)、Headers、Body等。
    const response = await worker.fetch(context.request);

    // 3. 将 Worker 返回的响应直接返回给最初的调用方（浏览器）。
    return response;

  } catch (error) {
    console.error("Error forwarding request to worker:", error);
    return new Response("An error occurred while forwarding the request.", { status: 500 });
  }
}
