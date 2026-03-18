# QuickTranslate - 智能翻译助手

一款简洁高效的Chrome浏览器翻译插件，支持中英划词翻译、语音朗读和音标显示。

## 功能特性

### 核心翻译功能

- **划词翻译**: 在任意网页上选中文本，自动检测语言并翻译
- **自动语言检测**: 智能识别中文和英文，自动选择翻译方向
- **中英对照**: 支持原文和译文对照显示模式
- **语音朗读**: 集成Chrome TTS，支持朗读原文和译文
- **音标显示**: 查询英文单词时显示英式和美式音标
- **气泡显示**: 翻译结果以悬浮气泡形式展示，不影响页面布局

### 配置功能

- **快捷键设置**: 自定义划词翻译快捷键（默认 Ctrl+Shift+T）
- **主题切换**: 支持浅色和深色两种主题模式
- **字体设置**: 可调整翻译结果的字体大小和类型
- **翻译引擎**: 支持百度翻译API和MyMemory免费API
- **缓存管理**: 智能翻译缓存，加速重复翻译

## 快速开始

### 安装方法

1. 将插件源代码下载到本地
2. 打开Chrome浏览器，访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `chrome-translate-plugin` 文件夹
6. 安装完成！

### 使用方法

#### 方法一：划词翻译

1. 在任意网页上用鼠标选中要翻译的文本
2. 松开鼠标后，翻译结果会自动以气泡形式显示

#### 方法二：快捷键翻译

1. 在网页上选中要翻译的文本
2. 按下快捷键 `Ctrl+Shift+T`（Mac: `Cmd+Shift+T`）
3. 查看翻译结果

#### 方法三：Popup翻译

1. 点击浏览器工具栏的插件图标
2. 在弹出的窗口中输入或粘贴要翻译的文本
3. 点击"翻译"按钮

## 项目结构

```
chrome-translate-plugin/
├── manifest.json              # 扩展清单文件
├── background/                # 后台服务
│   └── service-worker.js      # Service Worker（API调用、状态管理）
├── content/                   # 内容脚本
│   ├── content.js             # 页面注入脚本
│   └── content.css            # 样式文件
├── popup/                     # 弹出窗口
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/                   # 设置页面
│   ├── options.html
│   ├── options.js
│   └── options.css
├── assets/                    # 资源文件
│   ├── icons/
│   │   ├── icon.svg           # 图标源文件
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── audio/                 # 音频播放相关
└── README.md                  # 项目说明
```

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **扩展规范**: Chrome Extension Manifest V3
- **翻译API**: 百度翻译API + MyMemory API
- **语音合成**: Chrome TTS API
- **音标查询**: 有道词典API
- **本地存储**: Chrome Storage API

## 配置说明

### 百度翻译API

如需使用百度翻译API（翻译质量更好，需要免费注册）：

1. 访问 [百度翻译开放平台](https://fanyi-api.baidu.com/)
2. 注册账号并创建通用翻译应用
3. 获取 App ID 和密钥 (Secret Key)
4. 打开插件设置页面
5. 在"翻译设置"中填入 App ID 和密钥
6. 启用百度翻译

### 快捷键设置

默认快捷键为 `Ctrl+Shift+T`，可在设置中修改为：
- `Ctrl+Shift+X`
- `Alt+Shift+T`

## 开发指南

### 开发环境

- Chrome浏览器（最新版本）
- 代码编辑器（推荐 VS Code）

### 构建和调试

1. 加载插件：`chrome://extensions/` → "加载已解压的扩展程序"
2. 修改代码后，在扩展页面点击刷新按钮
3. Service Worker日志：点击"Service Worker"查看
4. Popup和Content Script日志：打开开发者工具查看

### 代码规范

- 所有函数包含JSDoc注释说明功能、参数和返回值
- 使用ES6+语法
- 变量和函数使用驼峰命名法
- 常量使用大写下划线分隔命名法

## 常见问题

### Q: 翻译结果不准确怎么办？

A: 可以在设置中切换翻译引擎，或者配置百度翻译API以获得更好的翻译质量。

### Q: 音标不显示？

A: 确保在设置中已启用"显示音标"选项，且查询的是英文单词（不是长句子）。

### Q: 快捷键不生效？

A: 检查快捷键是否与其他软件冲突，可以在设置中更换快捷键。

### Q: 气泡自动关闭太快？

A: 可以在设置中调整"气泡自动关闭"的延迟时间。

## 更新日志

### v1.0.0 (2024-03-17)

- 首次发布
- 支持中英划词翻译
- 支持语音朗读
- 支持音标显示
- 支持主题切换
- 支持百度翻译API和MyMemory API

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

- 项目主页: [GitHub](https://github.com/your-username/QuickTranslate)
- 问题反馈: [Issues](https://github.com/your-username/QuickTranslate/issues)

---

**QuickTranslate Team** © 2024
