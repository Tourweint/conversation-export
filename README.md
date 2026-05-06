# Conversation Export - AI 对话批量导出

一个浏览器插件，用于批量导出 DeepSeek、ChatGPT 等 AI 平台的对话记录。

## 功能特性

- **多平台支持**：DeepSeek、ChatGPT（可扩展）
- **日期筛选**：支持指定日期范围导出
- **批量导出**：一键导出所有符合条件的对话
- **多种格式**：支持 Markdown 和 JSON 格式
- **ZIP 打包**：批量导出自动打包为 ZIP 文件

## 项目结构

```
src/
├── adapters/          # 平台适配器
│   ├── base.ts        # 适配器基类
│   ├── deepseek.ts    # DeepSeek 适配器
│   └── index.ts       # 适配器注册
├── core/              # 核心引擎
│   ├── exporter.ts    # 导出调度器
│   ├── formatter.ts   # 格式转换
│   └── downloader.ts  # 文件下载
├── components/        # React 组件
│   ├── DateRangePicker.tsx
│   ├── FormatSelector.tsx
│   └── ExportProgress.tsx
├── stores/            # 状态管理
│   └── exportStore.ts
├── types/             # 类型定义
│   └── index.ts
├── utils/             # 工具函数
│   └── date.ts
└── entrypoints/       # 插件入口
    ├── popup/         # 弹出界面
    ├── content/       # 内容脚本
    └── background.ts  # 后台服务
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 打包为 ZIP
npm run zip
```

## 使用

1. 在浏览器中加载 `dist/` 目录作为未打包扩展
2. 打开 DeepSeek 或 ChatGPT 页面
3. 点击插件图标，选择日期范围和导出格式
4. 点击"开始导出"

## 注意事项

- 当前 DeepSeek 适配器中的 API 端点为占位符，需要根据实际抓包结果调整
- 导出过程中请保持页面打开
- 大量对话导出可能需要较长时间，请耐心等待
