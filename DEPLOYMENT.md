# Cloudflare 部署指南

本文档说明如何将 Cloudflare Config Center 部署到 Cloudflare Workers 和 Pages。

## 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare 部署架构                      │
├─────────────────────────────────────────────────────────┤
│                                                            │
│  ┌────────────────────┐         ┌────────────────────┐  │
│  │   Cloudflare Pages   │         │  Cloudflare Workers │  │
│  │   (config-ui)        │◄──────►│   (config-center)  │  │
│  │                     │  API    │                     │  │
│  │  index.html         │         │  worker.js          │  │
│  │  _functions.js      │         │  wrangler.toml       │  │
│  └────────────────────┘         └────────────────────┘  │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Cloudflare KV (CONFIG_KV)               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
└─────────────────────────────────────────────────────────┘
```

## 前置准备

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

## 步骤 1: 创建 KV 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择 **Workers & Pages**
3. 点击 **KV** → **Create a namespace**
4. 命名为 `CONFIG_KV`（或自定义名称）
5. 记录 KV Namespace ID

## 步骤 2: 部署 Worker

### 2.1 安全配置 KV Namespace ID

⚠️ **重要安全提示**：不要将真实的 KV Namespace ID 提交到 Git 仓库！

#### 方式 1：使用 Wrangler Secret（推荐）

```bash
# 设置 KV ID 为环境变量
wrangler secret put KV_ID "your_actual_kv_namespace_id"

# 验证
wrangler secret list
```

然后在 `wrangler.toml` 中使用：

```toml
[[kv_namespaces]]
binding = "CONFIG_KV"
id = "${KV_ID}"
```

#### 方式 2：手动配置（部署时填入）

1. 复制示例配置：
   ```bash
   cp workers/wrangler.toml.example workers/wrangler.toml
   ```

2. 编辑 `wrangler.toml`，手动填入 KV ID：
   ```toml
   [[kv_namespaces]]
   binding = "CONFIG_KV"
   id = "your_actual_kv_namespace_id"  # 手动填入
   ```

3. 确认 `wrangler.toml` 已添加到 `.gitignore`

### 2.2 更新认证令牌

编辑 `workers/worker.js`，修改 `AUTH_TOKEN`：

```javascript
const AUTH_TOKEN = 'your-strong-password-here'; // 使用强密码
```

### 2.3 更新 CORS 允许域名

编辑 `workers/worker.js`，添加你的 Pages 域名：

```javascript
const ALLOWED_ORIGINS = [
  'https://config-ui.pages.dev',      // 默认域名
  'https://your-custom-domain.com',   // 你的自定义域名
];
```

### 2.4 部署

```bash
cd workers
wrangler deploy
```

部署成功后，Worker 将可通过以下方式访问：
- 默认：`https://config-center.YOUR_SUBDOMAIN.workers.dev`
- 自定义域名：在 Worker 设置中配置

## 步骤 3: 部署 Pages

### 3.1 更新 API 端点（如果使用自定义域名）

编辑 `config-ui/index.html`，修改 WORKER_URL：

```javascript
// 如果 Worker 使用自定义域名：
const WORKER_URL = 'https://config-center.your-domain.com/api/config';

// 如果使用相对路径（需要在 Pages 设置中配置 Worker 绑定）：
const WORKER_URL = '/api/config';
```

### 3.2 通过 Git 部署

将仓库推送到 Git 提供商（GitHub/GitLab），然后在 Cloudflare Pages 中连接。

### 3.3 直接上传部署

```bash
# 安装 Wrangler（如果没有安装）
npm install -g wrangler

# 部署到 Pages
cd config-ui
wrangler pages deploy . --project-name=config-ui
```

### 3.4 配置自定义域名（可选）

1. 在 Pages 项目中，进入 **Custom domains**
2. 添加自定义域名
3. 配置 DNS 记录

## 步骤 4: 绑定 Worker 到 Pages（可选）

如果你希望 Pages 通过 Worker 代理 API 请求：

### 方案 A：使用 Pages Functions

1. 在 Pages 项目设置中，进入 **Settings** → **Functions**
2. 添加 Worker 绑定：
   - Variable: `WORKER`
   - Worker: `config-center`
   - Environment: `production`

### 方案 B：使用相对路径

直接使用相对路径 API，前端会通过 Pages Functions 自动代理。

## 步骤 5: 配置环境变量

### Worker 环境变量

在 `wrangler.toml` 中添加：

```toml
[vars]
ENVIRONMENT = "production"
```

### Pages 环境变量

在 Pages Dashboard → **Settings** → **Environment variables** 中添加。

## 验证部署

### 1. 测试 Worker API

```bash
# 获取配置列表
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://config-center.YOUR_SUBDOMAIN.workers.dev/config

# 创建配置
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"common","value":"test","comment":"测试"}' \
  https://config-center.YOUR_SUBDOMAIN.workers.dev/config/test
```

### 2. 测试 Pages 前端

1. 访问 Pages URL
2. 输入认证令牌
3. 测试创建/编辑/删除配置

## 域名配置建议

### Worker 域名
- **开发**: `config-center-dev.workers.dev`
- **生产**: `api.your-domain.com`

### Pages 域名
- **开发**: `config-ui-dev.pages.dev`
- **生产**: `config.your-domain.com`

## 安全建议

1. **强密码**: 使用至少 32 位随机字符串作为 AUTH_TOKEN
2. **HTTPS**: 确保所有域名使用 HTTPS
3. **CORS**: 严格限制 ALLOWED_ORIGINS
4. **KV 访问**: 定期审查 KV 数据访问权限

## 常见问题

### Q1: CORS 错误
**A**: 检查 Worker 的 ALLOWED_ORIGINS 是否包含 Pages 域名

### Q2: 401 Unauthorized
**A**: 检查 Authorization 头中的 Token 是否正确

### Q3: Worker 绑定失败
**A**: 确保 Worker 已部署且名称正确

### Q4: KV 数据未找到
**A**: 检查 KV Namespace ID 是否正确配置

## 更新部署

### 更新 Worker

```bash
cd workers
wrangler deploy
```

### 更新 Pages

```bash
cd config-ui
wrangler pages deploy . --project-name=config-ui
```

或通过 Git 推送自动触发部署。

## 监控和日志

- **Worker 日志**: Cloudflare Dashboard → Workers → Logs
- **Pages 日志**: Cloudflare Dashboard → Pages → Deployment logs

## 相关文档

- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Workers KV 文档](https://developers.cloudflare.com/workers/runtime-apis/)
- [Pages Functions 文档](https://developers.cloudflare.com/pages/functions/)
- [项目 README](../readme.md)
