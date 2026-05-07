export default defineContentScript({
  matches: [
    '*://chat.deepseek.com/*',
    '*://chat.openai.com/*',
    '*://chatgpt.com/*',
    '*://kimi.com/*',
    '*://www.kimi.com/*',
    '*://www.qianwen.com/*',
    '*://qianwen.com/*',
  ],

  main() {
    console.log('Conversation Export: Content script 已加载');

    const hostname = window.location.hostname;

    // 存储捕获的千问签名（用于响应 popup 请求）
    let capturedQwenSignatures: Array<{ url: string; headers: Record<string, string>; timestamp: number }> = [];

    // 根据平台注入不同的嗅探脚本
    if (hostname.includes('qianwen.com')) {
      // 千问平台：注入专门的签名拦截器
      injectQwenSniffer();
    } else {
      // 其他平台：注入通用 API 嗅探器
      injectGenericSniffer();
    }

    // 监听来自页面的消息
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      // 处理千问请求捕获 - 保存签名到 content script 内存
      if (event.data.type === 'CONVERSATION_EXPORT_QWEN_REQUEST') {
        const requestInfo = event.data.data as { url: string; headers: Record<string, string>; timestamp: number };

        // 保存到 content script 的内存中
        capturedQwenSignatures.push(requestInfo);

        // 只保留最近 10 个请求
        if (capturedQwenSignatures.length > 10) {
          capturedQwenSignatures = capturedQwenSignatures.slice(-10);
        }

        console.log('[ContentScript] 保存签名:', requestInfo.url, Object.keys(requestInfo.headers));

        // 转发给 background/popup（用于调试）
        chrome.runtime.sendMessage({
          type: 'QWEN_REQUEST_CAPTURED',
          data: requestInfo,
        });
      }

      // 处理其他平台的消息
      if (event.data.type?.startsWith('CONVERSATION_EXPORT_')) {
        chrome.runtime.sendMessage(event.data);
      }
    });

    // 响应 PING，让 popup/background 确认 content script 已注入
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'PING') {
        sendResponse({ platform: hostname });
        return true;
      }

      // 响应获取最新签名请求
      if (message.type === 'GET_QWEN_SIGNATURE') {
        // 过滤出 5 分钟内的请求
        const now = Date.now();
        const validSignatures = capturedQwenSignatures.filter(
          req => now - req.timestamp < 5 * 60 * 1000
        );

        if (validSignatures.length > 0) {
          const latest = validSignatures[validSignatures.length - 1];
          console.log('[ContentScript] 返回签名:', latest.url, Object.keys(latest.headers));
          sendResponse({ signature: latest });
        } else {
          console.log('[ContentScript] 没有可用的签名');
          sendResponse({ signature: null });
        }
        return true;
      }

      return false;
    });
  },
});

/**
 * 注入千问专用嗅探器
 */
function injectQwenSniffer() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('qwen-sniffer.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
  console.log('[ContentScript] 千问嗅探器已注入');
}

/**
 * 注入通用 API 嗅探器
 */
function injectGenericSniffer() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('api-sniffer.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}
