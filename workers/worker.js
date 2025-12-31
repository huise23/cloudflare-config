// --- 配置区 ---
const ALLOWED_ORIGINS = [
  'https://config-ui.pages.dev',     // Cloudflare Pages 默认域名
  'https://config-ui.52mn.ru', // 替换为您的自定义域名
  'http://localhost:3000',             // 本地开发
  'http://127.0.0.1:8080',             // 本地开发
];

// --- 辅助函数：CORS 处理 ---

/**
 * 根据请求的Origin动态创建CORS响应头。
 * @param {string|null} requestOrigin - 请求的Origin头。
 * @returns {Headers} 包含CORS头的Headers对象。
 */
function getCorsHeaders(requestOrigin) {
  const headers = new Headers();
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    headers.set('Access-Control-Allow-Origin', requestOrigin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Allow-Credentials', 'true'); // 如果需要支持凭据
  }
  return headers;
}

/**
 * 创建一个带有CORS头的Response对象。
 * @param {string|null} requestOrigin - 请求的Origin头。
 * @param {string} body - 响应体。
 * @param {number} status - HTTP状态码。
 * @param {string} [contentType='text/plain'] - Content-Type。
 * @returns {Response}
 */
function createResponse(requestOrigin, body, status, contentType = 'text/plain') {
  const headers = getCorsHeaders(requestOrigin);
  headers.set('Content-Type', contentType);
  return new Response(body, { status: status, headers: headers });
}

/**
 * 处理OPTIONS预检请求。
 * @param {string|null} requestOrigin - 请求的Origin头。
 * @returns {Response}
 */
function handlePreflight(requestOrigin) {
  const headers = getCorsHeaders(requestOrigin);
  headers.set('Access-Control-Max-Age', '86400'); // 缓存预检结果24小时
  return new Response(null, { status: 204, headers: headers });
}

// --- 认证处理 ---

/**
 * 检查请求是否包含有效的认证令牌。
 * @param {Request} request - 传入的请求对象。
 * @returns {boolean} 如果认证有效则返回true，否则返回false。
 */
function isAuthenticated(env,request) {
  const authHeader = request.headers.get('Authorization');
  return authHeader === `Bearer ${env.SECRET_TOKEN}`;
}

// --- KV 操作方法 ---

/**
 * 从KV存储中获取原始字符串值，并尝试解析为JSON。
 * @param {KVNamespace} kvNamespace - KV命名空间绑定。
 * @param {string} key - 配置项的键。
 * @returns {Promise<{rawValue: string|null, parsedValue: object|null}>} 包含原始值和尝试解析后的对象。
 */
async function getRawAndParsedConfig(kvNamespace, key) {
  const rawValue = await kvNamespace.get(key);
  let parsedValue = null;
  if (rawValue !== null) {
    try {
      parsedValue = JSON.parse(rawValue);
    } catch (e) {
      // 不是有效的JSON，parsedValue保持为null
    }
  }
  return { rawValue, parsedValue };
}

/**
 * 在KV存储中创建或更新一个配置项。
 * @param {KVNamespace} kvNamespace - KV命名空间绑定。
 * @param {string} key - 配置项的键。
 * @param {string} value - 配置项的值。
 * @returns {Promise<void>}
 */
async function putConfig(kvNamespace, key, value) {
  await kvNamespace.put(key, value);
}

/**
 * 从KV存储中删除一个配置项。
 * @param {KVNamespace} kvNamespace - KV命名空间绑定。
 * @param {string} key - 配置项的键。
 * @returns {Promise<void>}
 */
async function deleteConfig(kvNamespace, key) {
  await kvNamespace.delete(key);
}

// --- 代理 API 处理 ---

/**
 * 处理代理获取远程 URL 请求
 * 用于从远程获取 Clash 配置文件，解决 CORS 问题
 * @param {Request} request - 请求对象
 * @param {string} requestOrigin - 请求来源
 * @returns {Response}
 */
async function handleFetchUrl(request, requestOrigin) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  // 参数验证
  if (!targetUrl) {
    return createResponse(requestOrigin, 'Missing URL parameter', 400);
  }

  // URL 白名单验证
  const allowedDomains = [
    'raw.githubusercontent.com',
    'github.com',
    'gitlab.com',
    'raw.githubusercontent.com.cn',
    'ghproxy.com',
    'gist.github.com',
    'raw.githubusercontentusercontent.com'
  ];

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (e) {
    return createResponse(requestOrigin, 'Invalid URL format', 400);
  }

  if (!allowedDomains.includes(parsedUrl.hostname)) {
    return createResponse(requestOrigin, `Domain not allowed: ${parsedUrl.hostname}`, 403);
  }

  // 请求远程内容
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Clash-Config-Center/1.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return createResponse(requestOrigin,
        `Failed to fetch: HTTP ${response.status}`,
        response.status);
    }

    const text = await response.text();

    // 限制响应大小（最大 5MB）
    if (text.length > 5 * 1024 * 1024) {
      return createResponse(requestOrigin, 'Response too large (max 5MB)', 413);
    }

    // 返回原始内容
    return createResponse(requestOrigin, text, 200, 'text/plain; charset=utf-8');
  } catch (error) {
    if (error.name === 'AbortError') {
      return createResponse(requestOrigin, 'Request timeout (10s)', 504);
    }
    return createResponse(requestOrigin, `Failed to fetch: ${error.message}`, 500);
  }
}

// --- 请求处理器 ---

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const requestOrigin = request.headers.get('Origin'); // 获取请求的 Origin 头

  // 1. 处理预检请求
  if (method === 'OPTIONS') {
    return handlePreflight(requestOrigin);
  }

  // 2. 认证检查（所有 API 都需要认证）
  if (!isAuthenticated(env,request)) {
    return createResponse(requestOrigin, 'Unauthorized', 401);
  }

  // 3. 路由解析
  const pathParts = path.split('/').filter(p => p); // e.g., ['config', 'my-key', 'value']

  // 4. 代理 API 路由（优先处理）
  if (pathParts[0] === 'api' && pathParts[1] === 'fetch-url') {
    return handleFetchUrl(request, requestOrigin);
  }

  // 5. 确保请求的是 /config 或 /config/*
  if (pathParts.length === 0 || pathParts[0] !== 'config') {
      return createResponse(requestOrigin, 'Not Found', 404);
  }

  const configKey = pathParts[1]; // e.g., 'my-key'
  const subPath = pathParts[2];   // e.g., 'value' for /config/my-key/value

  try {
    switch (method) {
      case 'GET':
        if (configKey) {
          const { rawValue, parsedValue } = await getRawAndParsedConfig(env.CONFIG_KV, configKey);

          if (rawValue === null) {
            return createResponse(requestOrigin, `Config '${configKey}' not found`, 404);
          }

          if (subPath === 'value') {
            // 请求 /config/my-key/value
            if (parsedValue && typeof parsedValue === 'object' && parsedValue.hasOwnProperty('value')) {
              // KV值是JSON，且包含'value'字段，返回其值
              return createResponse(requestOrigin, String(parsedValue.value), 200, 'text/plain');
            } else {
              // KV值不是JSON，或者JSON中不含'value'字段，返回原始值
              return createResponse(requestOrigin, rawValue, 200, 'text/plain');
            }
          } else {
            // 请求 /config/my-key (不带 /value)
            if (parsedValue) {
              // 如果是有效的JSON，返回整个JSON对象
              return createResponse(requestOrigin, JSON.stringify(parsedValue), 200, 'application/json');
            } else {
              // 如果不是有效的JSON，返回原始字符串
              return createResponse(requestOrigin, rawValue, 200, 'text/plain');
            }
          }
        } else {
          // 获取所有配置项列表 /config
          const list = await env.CONFIG_KV.list();
          const allConfigs = [];
          for (const key of list.keys) {
            const { rawValue, parsedValue } = await getRawAndParsedConfig(env.CONFIG_KV, key.name);
            allConfigs.push({ key: key.name, value: parsedValue || rawValue }); // 返回解析后的对象或原始字符串
          }
          return createResponse(requestOrigin, JSON.stringify(allConfigs), 200, 'application/json');
        }

      case 'POST':
      case 'PUT':
        if (!configKey) return createResponse(requestOrigin, 'Config key is required', 400);
        const body = await request.text();
        await putConfig(env.CONFIG_KV, configKey, body);
        return createResponse(requestOrigin, `Config '${configKey}' updated successfully`, 200);

      case 'DELETE':
        if (!configKey) return createResponse(requestOrigin, 'Config key is required', 400);
        await deleteConfig(env.CONFIG_KV, configKey);
        return createResponse(requestOrigin, `Config '${configKey}' deleted successfully`, 200);

      default:
        return createResponse(requestOrigin, 'Method Not Allowed', 405);
    }
  } catch (error) {
    console.error('Worker error:', error);
    return createResponse(requestOrigin, `Internal Server Error: ${error.message}`, 500);
  }
}

// --- Worker 入口 ---

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
