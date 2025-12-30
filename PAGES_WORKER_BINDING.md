# Cloudflare Pages Worker 绑定配置指南

本指南说明如何在 Cloudflare Pages 中绑定 Worker，使 Pages 前端可以调用 Worker API。

## 📋 前提条件

1. ✅ 已部署 Worker (`config-center`)
2. ✅ 已部署 Pages (`config-ui`)
3. ✅ Worker 名称：`config-center`

## 🔗 方法 1：使用 Pages Functions + Worker 绑定（推荐）

### 步骤 1：在 Pages 中绑定 Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择 **Pages** → **config-ui** 项目
3. 进入 **Settings** → **Functions**
4. 在 **Bindings** 部分点击 **Add binding**
5. 配置如下：
   - **Variable**: `WORKER`
   - **Worker**: 选择 `config-center`
   - **Environment**: `Production`

### 步骤 2：更新 Worker URL

编辑 `config-ui/_functions.js`，修改 Worker URL：

```javascript
// 如果 Worker 使用自定义域名：
const workerUrl = `https://your-worker-domain.com${url.pathname}${url.search}`;

// 如果使用 workers.dev 域名：
const workerUrl = `https://config-center.YOUR_SUBDOMAIN.workers.dev${url.pathname}${url.search}`;
```

### 步骤 3：更新 Worker CORS 配置

编辑 `workers/worker.js`，添加 Pages 域名到白名单：

```javascript
const ALLOWED_ORIGINS = [
  'https://config-ui.pages.dev',              // Pages 默认域名
  'https://your-custom-domain.pages.dev',   // 你的 Pages 自定义域名
  'http://localhost:3000',                     // 本地开发
];
```

### 步骤 4：重新部署

```bash
# 重新部��� Pages Functions
cd config-ui
npx wrangler pages deployment create --project-name=config-ui
```

或通过 Git 推送自动部署。

---

## 🔗 方法 2：使用环境变量

### 步骤 1：在 Pages 中设置环境变量

1. 进入 Pages 项目 → **Settings** → **Environment variables**
2. 添加环境变量：
   - **Variable**: `WORKER_URL`
   - **Value**: `https://config-center.YOUR_SUBDOMAIN.workers.dev`
   - **Environment**: Production

### 步骤 2：更新 Functions 代码

修改 `config-ui/_functions.js` 使用环境变量：

```javascript
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    const workerUrl = `${env.WORKER_URL || 'https://config-center.YOUR_SUBDOMAIN.workers.dev'}${url.pathname}${url.search}`;

    // 如果有 WORKER 绑定，优先使用
    if (env.WORKER) {
      const workerRequest = new Request(workerUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      return await env.WORKER.fetch(workerRequest);
    }

    // 否则直接 fetch（需要在 Worker CORS 中允许 Pages 域名）
    return fetch(workerUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
  }

  return env.ASSETS.fetch(request);
}
```

---

## 🔗 方法 3：使用 Worker 作为反向代理（高级）

创建一个专用的 `gateway` Worker 来路由请求：

```javascript
// gateway-worker.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API 请求转发到 config-center Worker
    if (url.pathname.startsWith('/api/')) {
      const targetUrl = new URL(url.pathname + url.search, 'https://config-center.YOUR_SUBDOMAIN.workers.dev');
      return fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
    }

    // 其他请求转发到 Pages
    return fetch(request);
  }
}
```

---

## ✅ 验证配置

### 测试 API 连接

1. 访问 Pages 前端
2. 输入认证令牌
3. 尝试创建配置
4. 检查浏览器 Network 面板：
   - API 请求应该发送到 `/api/config`
   - 响应应该返回配置数据

### 常见错误排查

**错误**: `Worker binding not configured`
- **解决**: 检查 Pages Functions 设置中的 Worker 绑定

**错误**: `CORS error`
- **解决**: 确保 Worker 的 `ALLOWED_ORIGINS` 包含 Pages 域名

**错误**: `404 Not Found`
- **解决**: 检查 Functions 代码中的 Worker URL 是否正确

---

## 📊 架构对比

### 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **Functions + 绑定** | 简单、无需硬编码、安全 | 需要 Pages 绑定 | ⭐⭐⭐⭐⭐ |
| **环境变量** | 灵活、易于管理 | 需要手动更新 | ⭐⭐⭐⭐ |
| **反向代理 Worker** | 完全控制、统一入口 | 增加额外 Worker | ⭐⭐⭐ |

---

## 🎯 推荐配置

**Pages 配置**:
- Worker 绑定变量名：`WORKER`
- 绑定 Worker：`config-center`
- 环境：`Production`

**Worker CORS 配置**:
```javascript
const ALLOWED_ORIGINS = [
  'https://config-ui.pages.dev',           // ✅ Pages 域名
  'https://your-app.pages.dev',            // ✅ 你的域名
  'http://localhost:3000',                 // ✅ 本地开发
];
```

**前端 API 配置**:
```javascript
const WORKER_URL = '/api/config';  // 相对路径，由 Functions 处理
```

---

## 🔧 快速配置步骤

### 5 分钟快速配置

1. **Pages 设置** → **Functions** → **Bindings**
   - 添加：`WORKER` → `config-center`

2. **Pages 设置** → **Environment variables**（可选）
   - 添加：`WORKER_URL` → Worker URL

3. **Worker CORS** → 添加 Pages 域名到白名单

4. **重新部署** Pages 和 Worker

5. **测试** → 访问 Pages，测试配置功能
