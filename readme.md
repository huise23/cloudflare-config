# Cloudflare Config Center

基于 Cloudflare KV 数据库及 Workers 开发的配置中心，支持多种配置类型和 Clash 规则管理。

## 功能特性

- ✅ **多类型配置支持**
  - 通用配置 (common) - 文本/JSON 配置
  - Clash YAML 规则 (clash-yml) - 可视化规则编辑
  - Clash 远程链接 (clash-github-url) - 远程配置代理

- ✅ **Clash 规则编辑器**
  - 可视化规则添加界面
  - 支持 6 种规则类型
  - 动态代理策略加载
  - 规则启用/禁用切换
  - 导出为 YAML 格式

- ✅ **安全���证**
  - Bearer Token 认证
  - CORS 域名白名单
  - Worker 代理 API（带认证）

## API 接口

所有请求需要携带认证头：
```
Authorization: Bearer YOUR_AUTH_TOKEN
```

### 配置管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/config` | 获取所有配置列表 |
| GET | `/config/{key}` | 获取单个配置 |
| GET | `/config/{key}/value` | 获取配置的原始值 |
| PUT | `/config/{key}` | 创建或更新配置 |
| DELETE | `/config/{key}` | 删除配置 |

### Worker 代理 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/fetch-url?url={url}` | 代理获取远程 URL（需认证） |

**代理 API 白名单域名**：
- `raw.githubusercontent.com`
- `github.com`
- `gitlab.com`
- `raw.githubusercontent.com.cn`
- `ghproxy.com`
- `gist.github.com`
- `raw.githubusercontentusercontent.com`

## 数据格式

### 通用配置 (common)
```json
{
  "type": "common",
  "value": "配置值",
  "comment": "配置说明"
}
```

### Clash 远程链接 (clash-github-url)
```json
{
  "type": "clash-github-url",
  "value": "https://raw.githubusercontent.com/xxx/config.yaml",
  "comment": "我的 Clash 配置链接"
}
```

### Clash YAML 规则 (clash-yml)
```json
{
  "type": "clash-yml",
  "value": {
    "rules": [
      {
        "type": "DOMAIN-SUFFIX",
        "value": "google.com",
        "policy": "Proxy",
        "enabled": true
      },
      {
        "type": "IP-CIDR",
        "value": "192.168.1.0/24",
        "policy": "Direct",
        "enabled": true
      }
    ]
  },
  "comment": "Clash 规则配置 (2 条)"
}
```

## 支持的 Clash 规则类型

| 类型 | 说明 | 示例 |
|------|------|------|
| DOMAIN | 精确域名匹配 | `google.com` |
| DOMAIN-SUFFIX | 域名后缀 | `google.com` |
| DOMAIN-KEYWORD | 域名关键字 | `google` |
| IP-CIDR | IP 段 | `192.168.1.0/24` |
| GEOIP | 国家代码 | `CN`, `US` |
| SRC-IP-CIDR | 源 IP | `192.168.1.0/24` |

## 部署指南

### 后端部署 (Workers)

1. 创建 Cloudflare KV 数据库
2. 修改 `workers/worker.js` 中的配置：
   ```javascript
   const ALLOWED_ORIGINS = [
     'https://config-ui.pages.dev', // 替换为你的前端域名
     'http://localhost:3000'
   ];
   const AUTH_TOKEN = 'your-strong-password'; // 替换为强密码
   ```
3. 在 Worker 中绑定 KV 命名空间为 `CONFIG_KV`
4. 部署 Worker 并配置自定义域名

### 前端部署 (Pages)

1. 修改 `config-ui/index.html` 中的 `WORKER_URL`
2. 将 `config-ui/` 目录部署到 Cloudflare Pages

## 使用示例

### 创建 Clash 远程配置

1. 点击"新增配置"
2. 选择类型：**Clash 远程链接**
3. 输入配置键：`my-clash-config`
4. 输入 URL：`https://raw.githubusercontent.com/xxx/config.yaml`
5. 保存

### 创建 Clash 规则配置

1. 点击"新增配置"
2. 选择类型：**Clash YAML 规则**
3. 输入配置键：`my-rules`
4. 规则编辑器自动显示
5. 点击 🔄 刷新策略（从远程配置加载）
6. 添加规则：
   - 规则类型：`DOMAIN-SUFFIX`
   - 规则内容：`google.com`
   - 代理策略：`Proxy`
   - 点击"添加规则"
7. 保存配置

### 导出规则为 YAML

1. 编辑 Clash 规则配置
2. 点击"导出 YAML"按钮
3. YAML 自动复制到剪贴板

## 技术栈

- **后端**: Cloudflare Workers (JavaScript)
- **前端**: 纯 HTML/CSS/JavaScript
- **存储**: Cloudflare KV
- **部署**: Cloudflare Pages / Workers

## 安全特性

- ✅ Bearer Token 认证（所有 API）
- ✅ CORS 域名白名单控制
- ✅ Worker 代理 URL 白名单
- ✅ 请求超时保护（10秒）
- ✅ 响应大小限制（5MB）

## 项目结构

```
cloudflare-config-center/
├── workers/
│   ├── worker.js       # Worker 后端服务
│   └── readme.md
├── config-ui/
│   ├── index.html      # 前端管理界面
│   ├── _header         # 自定义响应头
│   └── readme.md
├── .claude/
│   └── plan/           # 开发规划文档
├── CLAUDE.md           # 项目文档
└── readme.md           # 本文件
```

## 开发文档

- [主项目文档](./CLAUDE.md)
- [Workers 模块文档](./workers/CLAUDE.md)
- [Config UI 模块文档](./config-ui/CLAUDE.md)
- [开发规划](./.claude/plan/)

## 许可证

MIT License
