// --- 配置区 ---
// 重要：将 YOUR_PAGES_DOMAIN.pages.dev 替换为您 Cloudflare Pages 的实际域名！
const ALLOWED_ORIGIN = 'https://config-ui.pages.dev'; 
const AUTH_TOKEN = '8ti2zSqm6Hna7xf4jUh7pcWc'; // 替换为您自己的强密码

// 辅助函数：创建带有 CORS 头的响应
function createCorsResponse(body, status, contentType = 'text/plain') {
  const response = new Response(body, { status: status, headers: { 'Content-Type': contentType } });
  response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

// 辅助函数：处理 OPTIONS 预检请求
function handleOptionsRequest() {
  const response = new Response(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return handleOptionsRequest();
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${AUTH_TOKEN}`) {
    return createCorsResponse('Unauthorized', 401);
  }

  // 路由逻辑
  const pathParts = path.split('/').filter(p => p); // e.g., ['config', 'my-key']

  // 确保请求的是 /config 或 /config/*
  if (pathParts.length === 0 || pathParts[0] !== 'config') {
      return createCorsResponse('Not Found', 404);
  }

  const configKey = pathParts[1]; // undefined if path is '/config'

  try {
    switch (method) {
      case 'GET':
        if (configKey) {
          // 获取单个配置
          const value = await env.CONFIG_KV.get(configKey);
          if (value === null) {
            return createCorsResponse(`Config '${configKey}' not found`, 404);
          }
          return createCorsResponse(value, 200, 'application/json');
        } else {
          // 获取所有配置列表
          const list = await env.CONFIG_KV.list();
          const promises = list.keys.map(key => env.CONFIG_KV.get(key.name));
          const values = await Promise.all(promises);
          
          const results = list.keys.map((key, index) => ({
            key: key.name,
            value: values[index]
          }));
          
          return createCorsResponse(JSON.stringify(results), 200, 'application/json');
        }

      case 'POST':
      case 'PUT':
        if (!configKey) return createCorsResponse('Config key is required', 400);
        const body = await request.text();
        // 允许非 JSON 字符串，例如 "true" 或 "false"
        await env.CONFIG_KV.put(configKey, body);
        return createCorsResponse(`Config '${configKey}' updated successfully`, 200);

      case 'DELETE':
        if (!configKey) return createCorsResponse('Config key is required', 400);
        await env.CONFIG_KV.delete(configKey);
        return createCorsResponse(`Config '${configKey}' deleted successfully`, 200);

      default:
        return createCorsResponse('Method Not Allowed', 405);
    }
  } catch (error) {
    console.error('Worker error:', error);
    return createCorsResponse(`Internal Server Error: ${error.message}`, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    // env.CONFIG_KV 会自动被 Cloudflare 注入
    return handleRequest(request, env);
  },
};
