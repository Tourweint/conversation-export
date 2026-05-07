import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Conversation Export - AI 对话批量导出',
    description: '批量导出 DeepSeek、ChatGPT、Kimi 等平台的 AI 对话记录',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'scripting', 'cookies'],
    host_permissions: [
      'https://chat.deepseek.com/*',
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
      'https://kimi.com/*',
      'https://www.kimi.com/*',
      'https://www.qianwen.com/*',
      'https://qianwen.com/*',
      'https://chat2-api.qianwen.com/*',
    ],
    web_accessible_resources: [
      {
        resources: ['api-sniffer.js', 'qwen-sniffer.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
  modules: ['@wxt-dev/module-react'],
});
