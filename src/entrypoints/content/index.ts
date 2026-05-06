export default defineContentScript({
  matches: ['*://chat.deepseek.com/*', '*://chat.openai.com/*', '*://chatgpt.com/*'],

  main() {
    console.log('Conversation Export: Content script 已加载');

    // 向页面注入 API 嗅探脚本
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('api-sniffer.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    // 监听来自页面的消息
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data.type?.startsWith('CONVERSATION_EXPORT_')) {
        chrome.runtime.sendMessage(event.data);
      }
    });

    // 响应 PING，让 popup/background 确认 content script 已注入
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'PING') {
        sendResponse({ platform: window.location.hostname });
        return true;
      }
      return false;
    });
  },
});
