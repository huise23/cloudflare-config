// --- 配置区 ---
const ALLOWED_ORIGINS = [
  'https://config-ui.pages.dev',     // Cloudflare Pages 默认域名
  'https://config-ui.52mn.ru', // 替换为您的自定义域名
  'http://localhost:3000',             // 本地开发
  'http://127.0.0.1:8080',             // 本地开发
];

// --- 辅助函数 ---

/**
 * Clash 规则去重工具函数 (Last Write Wins)
 * @param {Object} newRule - 新规则 {type, value, policy, enabled}
 * @param {Array} existingRules - 现有规则数组
 * @returns {Array} 去重后的规则数组
 */
function deduplicateClashRule(newRule, existingRules) {
    // 查找是否存在相同 type+value 的规则
    const duplicateIndex = existingRules.findIndex(
        rule => rule.type === newRule.type && rule.value === newRule.value
    );

    if (duplicateIndex !== -1) {
        // 存在重复，创建新数组并替换旧规则
        const newRules = [...existingRules];
        newRules[duplicateIndex] = newRule;
        return newRules;
    } else {
        // 不存在重复，追加新规则
        return [...existingRules, newRule];
    }
}

/**
 * 对规则数组进行批量去重 (Last Write Wins)
 * 用于 PUT 请求时清理整个规则数组
 * @param {Array} rules - 可能包含重复的规则数组
 * @returns {Array} 去重后的规则数组
 */
function deduplicateClashRulesArray(rules) {
    const ruleMap = new Map(); // key: "type:value", value: rule

    for (const rule of rules) {
        const key = `${rule.type}:${rule.value}`;
        // 后添加的规则覆盖前面的规则
        ruleMap.set(key, rule);
    }

    return Array.from(ruleMap.values());
}

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
 * 支持 Authorization header 和 URL 参数两种方式。
 * @param {KVNamespace} env - 环境变量。
 * @param {Request} request - 传入的请求对象。
 * @param {URL} urlObj - 请求的 URL 对象。
 * @returns {boolean} 如果认证有效则返回true，否则返回false。
 */
function isAuthenticated(env, request, urlObj) {
  // 优先检查 Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader === `Bearer ${env.SECRET_TOKEN}`) {
    return true;
  }

  // 如果 header 中没有，检查 URL 参数 ?SECRET_TOKEN=xxx
  try {
    const tokenParam = urlObj.searchParams.get('SECRET_TOKEN');
    if (tokenParam === env.SECRET_TOKEN) {
      return true;
    }
  } catch (e) {
    // URL 参数解析失败，忽略
  }

  return false;
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

/**
 * 将 clash-yml 配置转换为 YAML 格式
 * @param {object} configValue - clash-yml 配置对象 {rules: [...]}
 * @returns {string} YAML 格式的规则字符串
 */
function formatClashRulesToYAML(configValue) {
  // 如果有 rules 数组，转换成 YAML
  if (configValue && configValue.rules && Array.isArray(configValue.rules)) {
    // 过滤出启用的规则
    const enabledRules = configValue.rules.filter(rule => rule.enabled !== false);

    if (enabledRules.length === 0) {
      // 如果没有启用的规则，返回默认示例
      return "+rules:\n  - 'DOMAIN-SUFFIX,test.com,DIRECT'";
    }

    // 生成 YAML 格式
    const yamlLines = enabledRules.map(rule => {
      const type = (rule.type || 'DOMAIN-SUFFIX').toUpperCase();
      const value = rule.value || '';
      const policy = rule.policy || 'DIRECT';
      return `  - '${type},${value},${policy}'`;
    });

    return "+rules:\n" + yamlLines.join('\n');
  }

  // 如果格式不对，返回默认示例
  return "+rules:\n  - 'DOMAIN-SUFFIX,test.com,DIRECT'";
}

/**
 * 处理增量追加规则
 * 第三方直接调用此接口，传入规则字符串，API ���动追加到现有配置中
 * @param {object} env - 环境变量
 * @param {Request} request - 请求对象
 * @param {string} requestOrigin - 请求来源
 * @param {string} configKey - 配置键
 * @returns {Response}
 */
async function handleAppendRule(env, request, requestOrigin, configKey) {
  try {
    // 获取请求体（规则字符串）
    const ruleString = await request.text();

    if (!ruleString || ruleString.trim() === '') {
      return createResponse(requestOrigin, 'Rule string is required', 400);
    }

    // 解析规则字符串：TYPE,value,policy
    // 支持格式：DOMAIN-SUFFIX,kyland.com,"🐬 自定义直连"
    const parts = ruleString.split(',').map(p => p.trim());

    if (parts.length < 3) {
      return createResponse(requestOrigin, 'Invalid rule format. Expected: TYPE,value,policy', 400);
    }

    // 提取类型、值和策略
    const type = parts[0].trim().toUpperCase();
    // 重新组合中间部分（可能包含逗号的策略名称）
    const value = parts.slice(1, parts.length - 1).join(',').trim();
    const policy = parts[parts.length - 1].trim();

    // 验证类型
    const validTypes = ['DOMAIN-SUFFIX', 'DOMAIN', 'DOMAIN-KEYWORD', 'IP-CIDR', 'GEOIP', 'SRC-IP-CIDR'];
    if (!validTypes.includes(type)) {
      return createResponse(requestOrigin, `Invalid rule type: ${type}`, 400);
    }

    // 获取现有配置
    const { rawValue, parsedValue } = await getRawAndParsedConfig(env.CONFIG_KV, configKey);

    if (rawValue === null) {
      return createResponse(requestOrigin, `Config '${configKey}' not found`, 404);
    }

    // 检查配置类型是否为 clash-yml
    let configData;
    if (parsedValue && typeof parsedValue === 'object') {
      if (parsedValue.type === 'clash-yml') {
        configData = parsedValue;
      } else if (parsedValue.value && parsedValue.value.type === 'clash-yml') {
        configData = parsedValue.value;
      } else {
        return createResponse(requestOrigin, `Config '${configKey}' is not a clash-yml type`, 400);
      }
    } else {
      return createResponse(requestOrigin, `Config '${configKey}' is not a valid clash-yml config`, 400);
    }

    // 获取或初始化规则数组
    let rules = [];
    if (configData.value && configData.value.rules && Array.isArray(configData.value.rules)) {
      rules = configData.value.rules;
    }

    // 创建新规则对象
    const newRule = {
      type: type,
      value: value,
      policy: policy,
      enabled: true
    };

    // 使用去重工具函数 (Last Write Wins)
    rules = deduplicateClashRule(newRule, rules);

    // 更新配置
    const updatedConfig = {
      type: 'clash-yml',
      value: {
        rules: rules
      },
      comment: `Clash 规则配置 (${rules.length} 条)`
    };

    await putConfig(env.CONFIG_KV, configKey, JSON.stringify(updatedConfig));

    return createResponse(requestOrigin, 'Rule appended successfully (duplicates removed)', 200);

  } catch (error) {
    console.error('Append rule error:', error);
    return createResponse(requestOrigin, `Internal Server Error: ${error.message}`, 500);
  }
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
    'api.github.com',
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

    // 流式透传上游内容，避免大文件被本地响应体大小限制拦截
    const headers = getCorsHeaders(requestOrigin);
    headers.set('Content-Type', response.headers.get('Content-Type') || 'text/plain; charset=utf-8');
    const cacheControl = response.headers.get('Cache-Control');
    if (cacheControl) {
      headers.set('Cache-Control', cacheControl);
    }

    return new Response(response.body, {
      status: response.status,
      headers
    });
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
  if (!isAuthenticated(env, request, url)) {
    return createResponse(requestOrigin, 'Unauthorized', 401);
  }

  // 3. 路由解析
  const pathParts = path.split('/').filter(p => p); // e.g., ['config', 'my-key', 'value']

  if (pathParts.length === 0 || pathParts[0] !== 'api') {
      return createResponse(requestOrigin, 'Not Found', 404);
  }

  // 4. 代理 API 路由（优先处理）
  if (pathParts[1] === 'fetch-url') {
    return handleFetchUrl(request, requestOrigin);
  }

  // 5. 确保请求的是 /config 或 /config/*
  if (pathParts[1] !== 'config') {
      return createResponse(requestOrigin, 'Not Found', 404);
  }

  const configKey = pathParts[2]; // e.g., 'my-key'
  const subPath = pathParts[3];   // e.g., 'value' for /config/my-key/value

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
            // 检查 Accept header 来决定返回格式
            const acceptHeader = request.headers.get('Accept') || '';

            if (parsedValue && typeof parsedValue === 'object') {
              // 检查是否为 clash-yml 类型，且请求方不接受 JSON
              const isClashYml = parsedValue.type === 'clash-yml' || parsedValue.value?.type === 'clash-yml';
              const wantsYaml = !acceptHeader.includes('application/json');

              if (isClashYml && wantsYaml) {
                // clash-yml 类型且请求方不接受 JSON，返回 YAML 格式
                const configValue = parsedValue.value || parsedValue;
                const yamlContent = formatClashRulesToYAML(configValue);
                return createResponse(requestOrigin, yamlContent, 200, 'text/plain; charset=utf-8');
              }

              // 其他情况返回 JSON（前端配置页面）
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
            // 过滤掉已删除的 key（rawValue 为 null 表示 key 不存在）
            if (rawValue !== null) {
              allConfigs.push({ key: key.name, value: parsedValue || rawValue }); // 返回解析后的对象或原始字符串
            }
          }
          return createResponse(requestOrigin, JSON.stringify(allConfigs), 200, 'application/json');
        }

      case 'POST':
      case 'PUT':
        if (!configKey) return createResponse(requestOrigin, 'Config key is required', 400);

        // 检查是否为增量追加操作
        const actionParam = url.searchParams.get('action');

        if (actionParam === 'append') {
          // 增量追加规则
          return await handleAppendRule(env, request, requestOrigin, configKey);
        } else {
          // 普通更新配置
          const body = await request.text();

          // 如果是 clash-yml 类型,对规则数组进行去重
          try {
            const parsedBody = JSON.parse(body);

            // 检查是否为 clash-yml 类型且包含规则数组
            const isClashYml = parsedBody.type === 'clash-yml' ||
                              (parsedBody.value && parsedBody.value.type === 'clash-yml');

            let rulesArray = null;
            if (isClashYml) {
              if (parsedBody.value && parsedBody.value.rules && Array.isArray(parsedBody.value.rules)) {
                rulesArray = parsedBody.value.rules;
              } else if (parsedBody.value && parsedBody.value.value && parsedBody.value.value.rules && Array.isArray(parsedBody.value.value.rules)) {
                rulesArray = parsedBody.value.value.rules;
              }
            }

            // 如果找到规则数组,进行去重
            if (rulesArray) {
              const originalLength = rulesArray.length;
              const deduplicatedRules = deduplicateClashRulesArray(rulesArray);
              const duplicateCount = originalLength - deduplicatedRules.length;

              // 更新规则数组
              if (parsedBody.value && parsedBody.value.rules && Array.isArray(parsedBody.value.rules)) {
                parsedBody.value.rules = deduplicatedRules;
              } else if (parsedBody.value && parsedBody.value.value && parsedBody.value.value.rules && Array.isArray(parsedBody.value.value.rules)) {
                parsedBody.value.value.rules = deduplicatedRules;
              }

              // 保存去重后的配置
              await putConfig(env.CONFIG_KV, configKey, JSON.stringify(parsedBody));

              const msg = duplicateCount > 0
                ? `Config '${configKey}' updated successfully (removed ${duplicateCount} duplicate rules)`
                : `Config '${configKey}' updated successfully`;

              return createResponse(requestOrigin, msg, 200);
            } else {
              // 不是 clash-yml 或没有规则数组,直接保存
              await putConfig(env.CONFIG_KV, configKey, body);
              return createResponse(requestOrigin, `Config '${configKey}' updated successfully`, 200);
            }
          } catch (parseError) {
            // JSON 解析失败,保存原始文本
            await putConfig(env.CONFIG_KV, configKey, body);
            return createResponse(requestOrigin, `Config '${configKey}' updated successfully`, 200);
          }
        }
        break;

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


// --- Pages Function 入口 (CHANGED) ---

export async function onRequest(context) {
  // context 对象包含了 request, env, next 等所有信息
  // 我们直接调用你已经写好的 handleRequest 函数，把上下文里的 request 和 env 传进去
  return handleRequest(context.request, context.env);
}

