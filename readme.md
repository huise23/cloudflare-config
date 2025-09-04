
### 简介
基于cloudflare kv数据库及workers开发的配置中心, 可支持任意value写入

### 列表接口
> GET https://config.52mn.ru/config
Authorization: xxxxx

返回列表数据：
```
[
    {
        "key": "pve-test",
        "value": {
            "value": "true",
            "comment": "是否开启pve维护模式"
        }
    },
    {
        "key": "test",
        "value": {
            "value": "33",
            "comment": "测试"
        }
    }
]
```

### 单条数据接口

> GET https://config.52mn.ru/config/test
Authorization: xxxxx

返回列表数据：
```
{
    "value": "33",
    "comment": "测试"
}
```

### 单条数据value接口


> GET https://config.52mn.ru/config/test/value
Authorization: xxxxx

返回列表数据：
```
33
```

### 单条数据新增/修改接口


> PUT https://config.52mn.ru/config/xxxxxkey
Authorization: xxxxx
Content-Type: application/json

{
    "value":"123",
    "comment":"aaa"
}


### 单条数据删除接口


> DELETE https://config.52mn.ru/config/xxxxxkey
Authorization: xxxxx



