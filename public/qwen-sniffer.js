/**
 * 千问 API 请求拦截器
 * 用于提取签名信息，绕过签名验证
 */

// 存储最近捕获的请求信息
let capturedRequests = [];

/**
 * 拦截 fetch 请求
 */
function interceptFetch() {
  const originalFetch = window.fetch;

  window.fetch = async function (input, init) {
    const url = input.toString();

    // 只拦截千问的 msg/list 接口
    if (url.includes('chat2-api.qianwen.com') && url.includes('/msg/list')) {
      const headers = {};

      // 提取关键请求头
      if (init?.headers) {
        const headerEntries = init.headers instanceof Headers
          ? Array.from(init.headers.entries())
          : Object.entries(init.headers);

        for (const [key, value] of headerEntries) {
          // 只保存签名相关的头
          if (key.toLowerCase().includes('sign') ||
              key.toLowerCase().includes('acs') ||
              key.toLowerCase().includes('token') ||
              key.toLowerCase().startsWith('x-') ||
              key.toLowerCase().startsWith('eo-') ||
              key.toLowerCase().startsWith('clt-')) {
            headers[key] = value;
          }
        }
      }

      const requestInfo = {
        url,
        headers,
        timestamp: Date.now(),
      };

      // 保存到内存
      capturedRequests.push(requestInfo);

      // 只保留最近 10 个请求
      if (capturedRequests.length > 10) {
        capturedRequests = capturedRequests.slice(-10);
      }

      // 发送给 content script
      window.postMessage({
        type: 'CONVERSATION_EXPORT_QWEN_REQUEST',
        data: requestInfo,
      }, '*');

      console.log('[QwenSniffer] 捕获请求:', url, headers);
    }

    // 继续执行原始请求
    return originalFetch.apply(this, [input, init]);
  };
}

/**
 * 拦截 XMLHttpRequest
 */
function interceptXHR() {
  const OriginalXHR = window.XMLHttpRequest;

  window.XMLHttpRequest = function () {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open;
    const originalSetRequestHeader = xhr.setRequestHeader;

    let requestUrl = '';
    const requestHeaders = {};

    xhr.open = function (method, url, async, username, password) {
      requestUrl = url.toString();
      return originalOpen.apply(this, [method, url, async !== false, username, password]);
    };

    xhr.setRequestHeader = function (header, value) {
      requestHeaders[header] = value;
      return originalSetRequestHeader.apply(this, [header, value]);
    };

    xhr.addEventListener('loadstart', () => {
      // 只拦截千问的 msg/list 接口
      if (requestUrl.includes('chat2-api.qianwen.com') && requestUrl.includes('/msg/list')) {
        const headers = {};

        // 只保存签名相关的头
        for (const [key, value] of Object.entries(requestHeaders)) {
          if (key.toLowerCase().includes('sign') ||
              key.toLowerCase().includes('acs') ||
              key.toLowerCase().includes('token') ||
              key.toLowerCase().startsWith('x-') ||
              key.toLowerCase().startsWith('eo-') ||
              key.toLowerCase().startsWith('clt-')) {
            headers[key] = value;
          }
        }

        const requestInfo = {
          url: requestUrl,
          headers,
          timestamp: Date.now(),
        };

        capturedRequests.push(requestInfo);

        if (capturedRequests.length > 10) {
          capturedRequests = capturedRequests.slice(-10);
        }

        window.postMessage({
          type: 'CONVERSATION_EXPORT_QWEN_REQUEST',
          data: requestInfo,
        }, '*');

        console.log('[QwenSniffer] 捕获 XHR 请求:', requestUrl, headers);
      }
    });

    return xhr;
  };

  // 复制原型链
  window.XMLHttpRequest.prototype = OriginalXHR.prototype;
}

/**
 * 获取捕获的请求列表
 */
function getCapturedRequests() {
  return [...capturedRequests];
}

/**
 * 获取最新的可用签名
 */
function getLatestSignature() {
  // 过滤出 5 分钟内的请求
  const now = Date.now();
  const validRequests = capturedRequests.filter(
    req => now - req.timestamp < 5 * 60 * 1000
  );

  return validRequests.length > 0 ? validRequests[validRequests.length - 1] : null;
}

/**
 * 清空捕获的请求
 */
function clearCapturedRequests() {
  capturedRequests = [];
}

// 暴露到全局，方便调试
window.__QWEN_SNIFFER__ = {
  getCapturedRequests,
  getLatestSignature,
  clearCapturedRequests,
};

// 立即执行拦截
interceptFetch();
interceptXHR();

console.log('[QwenSniffer] 千问请求拦截器已加载');
