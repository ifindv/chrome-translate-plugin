# Contributing to QuickTranslate

感谢您对 QuickTranslate 项目的关注！我们欢迎任何形式的贡献。

## 如何贡献

### 报告问题

如果您发现了 bug 或有新的功能建议，请：

1. 检查 [Issues](https://github.com/yourusername/chrome-translate-plugin/issues) 页面，确认问题是否已被报告
2. 如果没有，创建新的 Issue，包含：
   - 清晰的标题
   - 详细的描述
   - 复现步骤（如果是 bug）
   - 预期行为 vs 实际行为
   - 截图（如果适用）
   - 环境信息（浏览器版本、操作系统等）

### 提交代码

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

### 代码规范

- 使用有意义的变量和函数名
- 添加必要的注释
- 遵循现有的代码风格
- 确保代码通过所有检查

### 提交信息规范

提交信息应该清晰描述更改内容：

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型(type)可以是：
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式（不影响代码运行的变动）
- refactor: 重构（既不是新增功能，也不是修改bug的代码变动）
- test: 增加测试
- chore: 构建过程或辅助工具的变动

## 开发指南

### 环境要求

- Node.js >= 14
- Chrome/Edge 浏览器（用于开发测试）

### 安装依赖

```bash
npm install
```

### 开发流程

1. 修改代码
2. 在浏览器中加载未打包的扩展进行测试
3. 确保所有功能正常工作
4. 提交 Pull Request

### 项目结构

```
chrome-translate-plugin/
├── background/       # 后台服务脚本
├── content/         # 内容脚本
├── popup/           # 弹出窗口界面
├── options/         # 选项页面
├── assets/          # 静态资源
├── scripts/         # 构建和工具脚本
└── docs/           # 项目文档
```

## 行为准则

参与本项目即表示您同意遵守我们的行为准则。请尊重所有贡献者，保持专业和友好的交流。

## 获取帮助

如果您有任何问题，可以：
- 查看 [README.md](README.md)
- 提交 [Issue](https://github.com/yourusername/chrome-translate-plugin/issues)
- 加入我们的讨论区

再次感谢您的贡献！
