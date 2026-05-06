/**
 * API 嗅探脚本
 * 注入到页面中，拦截并记录所有 fetch/XHR 请求
 * 帮助开发者识别 DeepSeek/ChatGPT 的内部 API
 */

interface ApiRecord {
  url: string;
  method: string;
  timestamp: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseStatus?: number;
  responsePreview?: unknown;
}

class ApiSniffer {
  private records: ApiRecord[] = [];
  private originalFetch: typeof fetch;
  private isEnabled = false;

  constructor() {
    this.originalFetch = window.fetch.bind(window);
  }

  enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;

    // 拦截 fetch
    window.fetch = async (...args) => {
      const [input, init] = args;
      const url = typeof input === 'string' ? input : input.url;
      const method = init?.method || 'GET';

      const record: ApiRecord = {
        url,
        method,
        timestamp: Date.now(),
        requestHeaders: init?.headers as Record<string, string>,
        requestBody: init?.body,
      };

      try {
        const response = await this.originalFetch(...args);
        record.responseStatus = response.status;

        // 尝试克隆并读取响应预览
        try {
          const clone = response.clone();
          const text = await clone.text();
          // 只保存前 500 字符作为预览
          record.responsePreview = text.substring(0, 500);
        } catch {
          // 忽略读取错误
        }

        this.records.push(record);
        this.logApi(record);

        return response;
      } catch (error) {
        record.responseStatus = 0;
        this.records.push(record);
        this.logApi(record);
        throw error;
      }
    };

    console.log('[API Sniffer] 已启用，开始拦截请求...');
    console.log('[API Sniffer] 提示：刷新页面或操作对话列表来触发 API 请求');
  }

  disable() {
    if (!this.isEnabled) return;
    window.fetch = this.originalFetch;
    this.isEnabled = false;
    console.log('[API Sniffer] 已禁用');
  }

  private logApi(record: ApiRecord) {
    const time = new Date(record.timestamp).toLocaleTimeString();
    const style = record.responseStatus && record.responseStatus < 400
      ? 'color: green'
      : 'color: red';

    console.group(`[${time}] ${record.method} ${record.url}`);
    console.log('状态:', record.responseStatus || '请求失败');
    if (record.requestBody) {
      console.log('请求体:', record.requestBody);
    }
    if (record.responsePreview) {
      console.log('响应预览:', record.responsePreview);
    }
    console.groupEnd();
  }

  /**
   * 获取所有记录
   */
  getRecords(): ApiRecord[] {
    return [...this.records];
  }

  /**
   * 按关键词筛选记录
   */
  filterByKeyword(keyword: string): ApiRecord[] {
    return this.records.filter(r =>
      r.url.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 获取可能的对话列表 API
   */
  getPossibleListApis(): ApiRecord[] {
    const keywords = ['session', 'chat', 'conversation', 'list', 'history', 'rooms'];
    return this.records.filter(r =>
      keywords.some(k => r.url.toLowerCase().includes(k))
    );
  }

  /**
   * 导出记录为 JSON
   */
  export(): string {
    return JSON.stringify(this.records, null, 2);
  }

  /**
   * 清空记录
   */
  clear() {
    this.records = [];
    console.log('[API Sniffer] 记录已清空');
  }
}

// 创建全局实例
const sniffer = new ApiSniffer();

// 暴露到全局，方便在控制台操作
(window as unknown as Record<string, unknown>).apiSniffer = sniffer;

// 自动启用
sniffer.enable();

console.log('%c[API Sniffer] 已加载!', 'color: blue; font-size: 14px; font-weight: bold');
console.log('可用命令：');
console.log('  apiSniffer.enable()     - 启用嗅探');
console.log('  apiSniffer.disable()    - 禁用嗅探');
console.log('  apiSniffer.getRecords() - 获取所有记录');
console.log('  apiSniffer.filterByKeyword("session") - 按关键词筛选');
console.log('  apiSniffer.getPossibleListApis() - 获取可能的列表 API');
console.log('  apiSniffer.export()     - 导出为 JSON');
console.log('  apiSniffer.clear()      - 清空记录');
