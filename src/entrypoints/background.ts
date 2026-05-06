import { defineBackground } from 'wxt/sandbox';

export default defineBackground(() => {
  console.log('Conversation Export 后台服务已启动');

  // 监听插件安装/更新
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      console.log('插件首次安装');
    } else if (details.reason === 'update') {
      console.log('插件已更新');
    }
  });

  // 监听来自 content script 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PLATFORM_INFO') {
      // 返回支持的域名列表
      sendResponse({
        platforms: [
          { id: 'deepseek', name: 'DeepSeek', hostname: 'chat.deepseek.com' },
          { id: 'chatgpt', name: 'ChatGPT', hostname: 'chat.openai.com' },
          { id: 'chatgpt2', name: 'ChatGPT', hostname: 'chatgpt.com' },
        ],
      });
    }
    return true;
  });
});
