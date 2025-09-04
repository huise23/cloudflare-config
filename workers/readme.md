
# 配置
1. 创建kv数据库
2. js头部内容修改
```
const ALLOWED_ORIGIN = 'https://config-ui.pages.dev'; 
const AUTH_TOKEN = '8ti2zSqm6Hna7xf4jUh7pcWc'; // 替换为您自己的强密码
```

3. worker添加kv数据库绑定: CONFIG_KV
4. 添加自定义域, 现在的workers域名, 基本上被墙