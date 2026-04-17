# Chrome扩展打包发布指南

## 打包准备

### 1. 文件清理

在打包前，确保排除以下文件和目录：

- 文档文件：README.md, CHANGELOG.md, CLAUDE.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md, SECURITY.md
- 开发配置：package.json, .git, node_modules
- 文档目录：docs/
- ECDICT完整源数据：ecdict/ECDICT/
- 构建脚本：scripts/
- IDE配置：.vscode/, .idea/

参考 `package-exclude.txt` 文件获取完整排除列表。

### 2. 必需文件清单

确保包含以下文件：

```
chrome-translate-plugin/
├── manifest.json              # 扩展清单文件
├── privacy.html               # 隐私政策页面
├── background/
│   └── service-worker.js      # 后台服务
├── content/
│   ├── content.js             # 内容脚本
│   └── content.css            # 样式文件
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
├── assets/
│   └── icons/                 # 图标文件
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── ecdict/
    └── ecdict.mini.csv        # 离线词典数据
```

## 打包方法

### 方法1：使用Chrome开发者工具

1. 打开Chrome浏览器
2. 访问 `chrome://extensions/`
3. 启用右上角的"开发者模式"
4. 点击"打包扩展程序"
5. 选择扩展根目录
6. 点击"打包扩展程序"按钮

### 方法2：手动打包（推荐）

1. 创建临时目录用于打包
2. 复制必需文件到临时目录（参考上面的文件清单）
3. 使用压缩工具（如7-Zip）将临时目录压缩为ZIP文件
4. 确保ZIP文件根目录包含manifest.json

### 方法3：使用命令行（Windows）

```powershell
# 创建临时目录
New-Item -ItemType Directory -Path "dist" -Force

# 复制必需文件
Copy-Item -Path "manifest.json" -Destination "dist" -Force
Copy-Item -Path "privacy.html" -Destination "dist" -Force
Copy-Item -Path "background" -Destination "dist" -Recurse -Force
Copy-Item -Path "content" -Destination "dist" -Recurse -Force
Copy-Item -Path "popup" -Destination "dist" -Recurse -Force
Copy-Item -Path "options" -Destination "dist" -Recurse -Force
Copy-Item -Path "assets" -Destination "dist" -Recurse -Force
Copy-Item -Path "ecdict\ecdict.mini.csv" -Destination "dist\ecdict" -Recurse -Force

# 压缩为ZIP
Compress-Archive -Path "dist\*" -DestinationPath "QuickTranslate-v1.0.0.zip"
```

## Chrome商店发布准备

### 1. 准备商店素材

- **商店图标**：128x128 PNG格式
- **商店截图**：至少1张，最多5张，1280x800或640x400 PNG格式
- **商店徽标**（可选）：440x280 JPEG格式
- **宣传横幅**（可选）：440x280 JPEG格式

### 2. 准备描述信息

- **简短描述**：最多132个字符
  ```
  智能翻译助手 - 支持中英划词翻译、语音朗读、音标显示
  ```

- **详细描述**：
  ```
  QuickTranslate 是一款简洁高效的Chrome浏览器翻译扩展，支持中英划词翻译、语音朗读和音标显示。

  主要功能：
  • 实时划词翻译，自动检测语言
  • 本地离线词典，使用ECDICT词库，收录词汇76w+
  • 支持语音朗读
  • 支持浅色/深色主题切换
  • 快捷键翻译，提高效率

  使用方法：
  1. 在网页上选中需要翻译的文本
  2. 自动显示翻译结果，或使用快捷键 Ctrl+Shift+T
  3. 点击扩展图标可手动输入文本翻译

  隐私政策：
  本扩展程序不收集任何用户数据，所有翻译和词典数据均存储在本地。
  详细信息请查看：https://github.com/ifindv/chrome-translate-plugin
  ```

### 3. 分类和标签

- **分类**：生产力工具
- **语言**：中文（简体）
- **标签**：翻译, 词典, 学习工具, 生产力

### 4. 隐私政策URL

- 使用GitHub Pages托管隐私政策页面
- 或在扩展程序中提供隐私政策链接

## 发布步骤

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 登录Google账户（需要支付5美元注册费）
3. 点击"新建项目"
4. 上传打包好的ZIP文件
5. 填写商店信息（名称、描述、分类等）
6. 上传图标和截图
7. 提供隐私政策URL
8. 提交审核

## 审核注意事项

1. **审核时间**：通常需要1-3个工作日
2. **审核要点**：
   - 功能描述与实际功能一致
   - 权限使用合理
   - 无恶意代码
   - 符合Chrome商店政策

3. **常见拒绝原因**：
   - 缺少隐私政策
   - 权限使用不当
   - 功能描述不准确
   - 包含恶意代码
   - 违反内容政策

## 更新维护

### 版本更新流程

1. 更新manifest.json中的版本号
2. 修改代码和功能
3. 更新CHANGELOG.md
4. 重新打包
5. 在开发者控制台上传新版本
6. 填写更新说明
7. 提交审核

### 版本号规范

遵循语义化版本（Semantic Versioning）：
- 主版本号.次版本号.修订号
- 例如：1.0.0 → 1.0.1 → 1.1.0 → 2.0.0

## 常见问题

### Q: 打包后文件太大怎么办？

A: 可以考虑：
- 优化ecdict.mini.csv文件大小
- 压缩图片资源
- 移除不必要的代码和资源

### Q: 如何测试打包后的扩展？

A:
1. 在Chrome中访问 chrome://extensions/
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择解压后的扩展目录

### Q: 审核被拒绝怎么办？

A:
1. 仔细阅读拒绝原因
2. 根据反馈修改代码
3. 重新打包提交
4. 如有疑问，可通过开发者支持联系Chrome商店团队

## 联系支持

- 项目主页：https://github.com/ifindv/chrome-translate-plugin
- 问题反馈：https://github.com/ifindv/chrome-translate-plugin/issues
- Chrome开发者文档：https://developer.chrome.com/docs/webstore/
