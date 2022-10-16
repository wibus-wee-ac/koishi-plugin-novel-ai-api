# koishi-plugin-novel-ai-api

[![npm](https://img.shields.io/npm/v/koishi-plugin-novel-ai-api?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-novel-ai-api)

Speical novel ai api version | NovelAI 画图接口特殊版本，非官方版本，仅在小部分群使用，目前实现功能如下：

- 自定义接口
- 绘制图片
- 更改模型、图片尺寸
- 高级请求语法
- 自定义违禁词表
- 发送一段时间后自动撤回
- img2img · 图片增强
- 从种子中生成图片

得益于 Koishi 的插件化机制，只需配合其他插件即可实现更多功能：

- 多平台支持 (QQ、Discord、Telegram、开黑啦等)
- 速率限制 (限制每个用户每天可以调用的次数和每次调用的间隔)
- 上下文管理 (限制在哪些群聊中哪些用户可以访问)
- 外来图片标签识别（使用 [koishi-plugin-deep-danbooru](https://github.com/wibus-wee/koishi-plugin-deep-danbooru))

## 使用方法

1. 访问 ip:5010/token 按操作获取 token
2. 在 koishi console 输入相关信息

## Author

koishi-plugin-novel-ai-api © Wibus, Released under AGPLv3. Created on Oct 16, 2022

> [Personal Website](http://iucky.cn/) · [Blog](https://blog.iucky.cn/) · GitHub [@wibus-wee](https://github.com/wibus-wee/) · Telegram [@wibus✪](https://t.me/wibus_wee)
