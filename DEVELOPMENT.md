# QuickTranslate - 开发文档

本文档是给开发者的详细技术文档，帮助理解和参与QuickTranslate插件开发。

## 目录

- [架构设计](#架构设计)
- [核心模块](#核心模块)
- [API接口](#api接口)
- [开发规范](#开发规范)
- [调试指南](#调试指南)
- [发布流程](#发布流程)

## 架构设计

### 整体架构

QuickTranslate采用标准的Chrome Extension Manifest V3架构，包括三个主要部分：

```
┌─────────────────────────────────────────────────────────────┐
│                    用户使用的网页                               │
│  ┌─────────────────────┐    ┌─────────────────────────┐   │
│  │   Content Script    │    │   Shadow DOM Bubble     │   │
│  │  (content.js)       │◄──►│   (翻译结果显示)          │   │
│  └─────────────────────┘    └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↕ chrome.runtime
     ┌─────────────────────────────────────────────────────┐
     │        Background Service Worker                    │
     │  (service-worker.js)                                │
     │  • 翻译API调用                                        │
     │  • 缓存管理                                          │
     │  • TTS语音朗读                                       │
     │  • 消息路由处理                                       │
     └─────────────────────────────────────────────────────┘
                           ↕ chrome.storage
     ┌─────────────────────────────────────────────────────┐
     │        Chrome Storage (Local)                       │
     │  • qt_config (用户配置)                              │
     │  • qt_translation_cache (翻译缓存)                   │
     └─────────────────────────────────────────────────────┘
                           ↕
     ┌─────────────────────────────────────────────────────┐
     │   Popup / Options UI                                 │
     │  • popup.html/js/css (快捷翻译窗口)                   │
     │  • options.html/js/css (设置页面)                    │
     └─────────────────────────────────────────────────────┘
                           ↕ HTTP/HTTPS
     ┌─────────────────────────────────────────────────────┐
     │        外部API服务                                    │
     │  • 百度翻译API                                       │
     │  • MyMemory翻译API                                   │
     │  • 有道词典API                                       │
     └─────────────────────────────────────────────────────┘
```

### 模块职责

| 模块              | 职责                           | 技术实现                  |
| ----------------- | ------------------------------ | ------------------------- |
| Content Script    | 页面内容监听、划词检测、气泡UI | Shadow DOM、鼠标事件监听  |
| Background        | API调用、缓存管理、TTS服务     | Service Worker、Fetch API |
| Popup             | 快捷翻译界面                   | HTML/CSS/JS、防抖处理     |
| Options           | 配置管理界面                   | 表单、Storage API         |
| Translation Cache | 翻译结果缓存                   | Chrome Storage Local      |

## 核心模块

### 1. TranslationService (background/service-worker.js)

翻译服务核心类，负责所有翻译相关的业务逻辑。

**方法列表:**

```javascript
class TranslationService {
  constructor()                    // 构造函数
  async init()                     // 初始化服务
  async translate(text, from, to)  // 翻译文本
  async getConfig()                // 获取配置
  async clearCache()               // 清空缓存
}
```

**翻译流程:**

```
1. validate input (text not empty, length < 5000)
2. check cache → return if exists and not expired
3. get user config (engine selection)
4. call translation API (Baidu or MyMemory)
5. on success → save to cache
6. return result
```

### 2. TranslationCache (background/service-worker.js)

翻译缓存管理类，减少重复API调用。

**缓存策略:**

- 最大缓存条目: 1000
- 缓存有效期: 24小时
- 自动清理过期条目
- 超限时删除最旧条目

**缓存键格式:** `{from}-{to}-{text}`

### 3. Content Script (content/content.js)

注入到每个网页的脚本，负责用户交互。

**关键功能:**

```javascript
- handleSelection()     // 处理划词事件
- showBubble()          // 显示翻译气泡
- bindBubbleEvents()    // 绑定气泡内交互
- hideBubble()          // 隐藏气泡
- detectLanguage()      // 简单语言检测
```

**Shadow DOM隔离:**

避免与网页样式冲突，气泡使用Shadow DOM渲染：

```javascript
const container = document.createElement('div');
const shadow = container.attachShadow({ mode: 'open' });
```

## API接口

### 翻译API

#### 百度翻译API

**端点:** `https://fanyi-api.baidu.com/api/trans/vip/translate`

**参数:**

- `q`: 待翻译文本
- `from`: 源语言 (auto, zh, en, jp, kor等)
- `to`: 目标语言
- `appid`: 应用ID
- `salt`: 随机数
- `sign`: MD5签名 = md5(appid + q + salt + secretKey)

**错误处理:**

- 52000: 成功
- 52001: 请求超时
- 52002: 系统错误
- 52003: 未授权用户
- 54000: 必填参数为空
- 54001: 签名错误
- 58000: 客户端IP非法
- 58001: 语言不支持
- 58002: 服务当前已满

#### MyMemory翻译API

**端点:** `https://api.mymemory.translated.net/get`

**参数:**

- `q`: 待翻译文本
- `langpair`: 语言对，格式 `source|target` (如 `zh|en`)
- `email`: 邮箱（可选，提高配额）

**限制:**

- 免费: 每天最多1000次请求
- 每次请求最多500字符

### 音标API

#### 有道词典API

**端点:** `https://dict.youdao.com/jsonapi`

**参数:**

- `s`: 查询词
- `type`: 1 (查询)
- `version`: 2

**返回:**

```json
{
  "ec": {
    "word": [{
      "ukphone": "英式音标",
      "usphone": "美式音标",
      "trs": [{
        "tr": [{
          "l": {
            "i": ["释义内容"]
          }
        }]
      }]
    }]
  }
}
```

### 消息通信接口

| Action          | 参数                        | 返回值                               |
| --------------- | --------------------------- | ------------------------------------ |
| translate       | { text, from, to }          | { success, translated, source, ... } |
| getPhonetic     | { word }                    | { success, uk, us, definition }      |
| getConfig       | -                           | { success, config }                  |
| saveConfig      | { config }                  | { success }                          |
| clearCache      | -                           | { success }                          |
| speak           | { text, lang, rate, pitch } | { success }                          |
| stopSpeaking    | -                           | { success }                          |
| showTranslation | { result }                  | - (content script only)              |

## 开发规范

### 代码注释规范

所有函数必须包含JSDoc注释:

```javascript
/**
 * 函数功能简短描述
 *
 * 详细描述（如需要）
 *
 * @param {类型} 参数名 - 参数说明
 * @param {类型} 参数名2 - 参数说明
 * @returns {类型} 返回值说明
 * @throws {Error} 可能抛出的错误说明
 */
function exampleFunction(param1, param2) {
  // 实现
  return result;
}
```

### 命名规范

| 类型     | 规范             | 示例                   |
| -------- | ---------------- | ---------------------- |
| 常量     | UPPER_SNAKE_CASE | `MAX_TEXT_LENGTH`    |
| 变量     | camelCase        | `selectedText`       |
| 函数     | camelCase        | `translate()`        |
| 类名     | PascalCase       | `TranslationService` |
| 私有方法 | _camelCase       | `_internalMethod()`  |
| DOM元素  | qt-kebab-case    | `qt-translate-btn`   |

### CSS规范

- 使用CSS变量定义主题颜色
- 使用BEM命名法: `.qt-module__element--modifier`
- 支持明暗主题切换

## 调试指南

### Service Worker调试

1. 打开 `chrome://extensions/`
2. 找到QuickTranslate，点击"Service Worker"
3. 在打开的DevTools中查看日志

### Content Script调试

1. 在任意网页打开DevTools (F12)
2. Console标签中查看日志
3. 在Elements标签中查找 `#qt-bubble-container`

### Popup调试

1. 点击插件图标打开Popup
2. 右键点击Popup → "Inspect"
3. 在打开的DevTools中查看日志

### Options调试

1. 右键点击插件图标 → "选项"
2. 或访问 `chrome://extensions/` → "详细信息" → "扩展程序选项"
3. 打开DevTools (F12)

### 常见问题

**问题:** Content Script不执行

**解决:**

- 检查manifest.json中的content_scripts配置
- 确认网页URL匹配matches规则
- 刷新页面重新加载

**问题:** Service Worker不响应消息

**解决:**

- 检查chrome.runtime监听器是否正确返回true
- 确保消息action与处理逻辑匹配
- 查看Service Worker日志中的错误

**问题:** 样式冲突

**解决:**

- 确认使用Shadow DOM
- 检查CSS变量是否正确定义
- 清除浏览器缓存

## 发布流程

### 版本号规范

遵循语义化版本: `主版本.次版本.修订版本`

- 主版本: 不兼容的API修改
- 次版本: 向下兼容的功能新增
- 修订版本: 向下兼容的问题修复

### 打包步骤

1. 更新版本号: 修改 `manifest.json`中的 `version`
2. 更新CHANGELOG: 记录本次更改
3. 测试功能: 在测试环境验证核心功能
4. 打包: 将 `chrome-translate-plugin`目录压缩为zip
5. 审核: 上传到Chrome Web Store

### Chrome Web Store发布

1. 登录 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 创建新项目或更新现有项目
3. 填写应用信息:
   - 名称: QuickTranslate
   - 描述: 简短描述和详细描述
   - 分类: 生产力工具/工具
   - 语言: 中文、英文
4. 上传包文件: 选择打包的zip文件
5. 添加截图: 至少一张1280x800的截图
6. 提交审核: 等待Google审核（通常1-3天）

## 性能优化建议

### 已实现的优化

1. **翻译缓存**: 避免重复翻译相同内容
2. **防抖处理**: Popup输入500ms后才请求翻译
3. **延迟加载**: Shadow DOM按需创建
4. **API降级**: 百度API失败自动切换MyMemory

### 可优化的方向

1. **请求合并**: 多个翻译请求可以合并批处理
2. **IndexedDB**: 对于大量缓存数据，使用IndexedDB替代Storage
3. **Web Worker**: 音标查询等耗时操作移至Web Worker

## 安全注意事项

1. **API密钥保护**: 百度API密钥加密存储
2. **XSS防护**: 所有用户输入进行HTML转义
3. **CORS配置**: manifest.json中正确配置host_permissions
4. **内容安全策略**: 启用CSP头

## 技术债务

- [ ] 完善单元测试覆盖
- [ ] 实现IndexedDB缓存
- [ ] 支持更多翻译引擎
- [ ] 添加翻译历史记录功能
- [ ] 实现离线翻译（使用本地词库）
