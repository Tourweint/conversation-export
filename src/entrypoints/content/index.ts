import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['*://chat.deepseek.com/*', '*://chat.openai.com/*', '*://chatgpt.com/*'],
  
  main() {
    console.log('Conversation Export: Content script 已加载');

    // 向页面注入脚本以访问页面内部的变量
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    // 监听来自页面的消息
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data.type?.startsWith('CONVERSATION_EXPORT_')) {
        // 转发到 background
        chrome.runtime.sendMessage(event.data);
      }
    });
  },
});
