import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Conversation Export - AI 对话批量导出',
    description: '批量导出 DeepSeek、ChatGPT 等平台的 AI 对话记录',
    version: '1.0.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://chat.deepseek.com/*',
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
    ],
    web_accessible_resources: [
      {
        resources: ['api-sniffer.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
  modules: ['@wxt-dev/module-react'],
});
