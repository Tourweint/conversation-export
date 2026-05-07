import { PlatformAdapter, adapterRegistry } from './base';
import type { Conversation, Message, DateRange } from '@/types';

/**
 * 千问 (Qwen) 平台适配器
 *
 * 架构说明：
 * - 平台检测：popup 通过 chrome.tabs.query 获取当前标签页 URL，用 detectByUrl() 匹配
 * - Token 获取：通过 chrome.cookies API 读取 tongyi_sso_ticket 和 XSRF-TOKEN cookie
 * - API 请求：popup 直接 fetch（有 host_permissions，无 CORS 问题）
 *
 * 千问 API 特点：
 * - 对话列表：POST /api/v2/session/page/list，next_token 游标分页
 * - 对话详情：GET /api/v1/session/msg/list，page 分页
 * - 认证方式：Cookie + XSRF-Token
 * - 时间戳：毫秒级 Unix 时间戳
 */
export class QwenAdapter extends PlatformAdapter {
  readonly id = 'qwen';
  readonly name = '千问';
  readonly hostname = 'www.qianwen.com';

  private readonly hostnames = ['www.qianwen.com', 'qianwen.com'];

  private baseUrl = 'https://chat2-api.qianwen.com';

  /** 缓存的 cookies */
  private cachedCookies: { ssoTicket?: string; xsrfToken?: string } = {};

  isMatch(): boolean {
    return this.hostnames.includes(window.location.hostname);
  }

  isMatchUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.hostnames.includes(hostname);
    } catch {
      return false;
    }
  }

  /**
   * 从 Chrome cookies 获取认证信息
   */
  private async getCookiesFromChrome(): Promise<{ ssoTicket: string; xsrfToken: string }> {
    if (this.cachedCookies.ssoTicket && this.cachedCookies.xsrfToken) {
      return {
        ssoTicket: this.cachedCookies.ssoTicket,
        xsrfToken: this.cachedCookies.xsrfToken,
      };
    }

    const [ssoTicketCookie, xsrfTokenCookie] = await Promise.all([
      chrome.cookies.get({
        url: 'https://www.qianwen.com',
        name: 'tongyi_sso_ticket',
      }),
      chrome.cookies.get({
        url: 'https://www.qianwen.com',
        name: 'XSRF-TOKEN',
      }),
    ]);

    const ssoTicket = ssoTicketCookie?.value;
    const xsrfToken = xsrfTokenCookie?.value;

    if (!ssoTicket) {
      throw new Error('未找到认证信息 (tongyi_sso_ticket)，请先登录千问');
    }

    if (!xsrfToken) {
      throw new Error('未找到 XSRF Token，请先登录千问');
    }

    this.cachedCookies = { ssoTicket, xsrfToken };
    return { ssoTicket, xsrfToken };
  }

  /**
   * 构建请求头
   */
  private async buildHeaders(): Promise<Record<string, string>> {
    const { xsrfToken } = await this.getCookiesFromChrome();

    return {
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      'Content-Type': 'application/json',
      'Origin': 'https://www.qianwen.com',
      'Referer': 'https://www.qianwen.com/',
      'x-xsrf-token': xsrfToken,
      'x-deviceid': this.generateDeviceId(),
      'x-platform': 'pc_tongyi',
    };
  }

  /**
   * 生成设备 ID
   */
  private generateDeviceId(): string {
    return 'bec347e6-2140-e378-7fc6-57109983917c';
  }

  /**
   * 生成随机 nonce
   */
  private generateNonce(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 从 content script 获取捕获的签名信息
   */
  private async getSignHeadersFromPage(): Promise<Record<string, string>> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return {};

      // 先发送 PING 检查 content script 是否就绪
      try {
        const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        console.log('[Qwen] Content script 就绪:', pingResponse);
      } catch {
        console.warn('[Qwen] Content script 未就绪，请刷新页面后重试');
        return {};
      }

      // 向 content script 请求最新签名
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_QWEN_SIGNATURE',
      }) as { signature: { headers: Record<string, string> } | null };

      if (response?.signature?.headers) {
        console.log('[Qwen] 从 content script 获取到签名:', Object.keys(response.signature.headers));
        return response.signature.headers;
      }

      console.warn('[Qwen] Content script 中没有可用的签名，请先点击一个对话');
      return {};
    } catch (error) {
      console.warn('[Qwen] 获取签名失败:', error);
      return {};
    }
  }

  /**
   * 发送带认证的 API 请求
   */
  private async fetchWithAuth(url: string, options?: RequestInit): Promise<unknown> {
    const headers = await this.buildHeaders();

    // 尝试从页面获取签名头（用于详情 API）
    const signHeaders = await this.getSignHeadersFromPage();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...signHeaders,
        ...(options?.headers as Record<string, string> || {}),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.cachedCookies = {};
      }
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.code !== undefined && data.code !== 0) {
      console.warn(`[Qwen] API 返回错误: code=${data.code}, msg=${data.msg}`, url);
      throw new Error(`千问 API 错误: ${data.msg || data.code}`);
    }

    return data;
  }

  /**
   * 发送带认证的 GET 请求（用于消息列表）
   */
  private async fetchWithAuthGet(url: string, signal?: AbortSignal): Promise<unknown> {
    const headers = await this.buildHeaders();

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
      signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.cachedCookies = {};
      }
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.code !== undefined && data.code !== 0) {
      console.warn(`[Qwen] API 返回错误: code=${data.code}, msg=${data.msg}`, url);
      throw new Error(`千问 API 错误: ${data.msg || data.code}`);
    }

    return data;
  }

  /**
   * 获取对话列表（单页）
   */
  async getConversations(page: number, pageSize: number): Promise<Conversation[]> {
    const all = await this.getAllConversations();
    const offset = (page - 1) * pageSize;
    return all.slice(offset, offset + pageSize);
  }

  /**
   * 获取所有对话（自动翻页）
   */
  async getAllConversations(): Promise<Conversation[]> {
    const limit = 50;
    let allConversations: Conversation[] = [];
    let nextToken: string | undefined;

    while (true) {
      const url = new URL(`${this.baseUrl}/api/v2/session/page/list`);
      url.searchParams.set('biz_id', 'ai_qwen');
      url.searchParams.set('chat_client', 'h5');
      url.searchParams.set('device', 'pc');
      url.searchParams.set('fr', 'h5');
      url.searchParams.set('pr', 'qwen');
      url.searchParams.set('ut', this.generateDeviceId());
      url.searchParams.set('la', 'zh-CN');
      url.searchParams.set('tz', 'Asia/Shanghai');
      url.searchParams.set('wv', '2.6.1');
      url.searchParams.set('ve', '2.6.1');

      const body: Record<string, unknown> = {
        limit,
        next_token: nextToken || '',
        sort_field: 'modifiedTime',
        need_filter_tag: true,
      };

      const data = await this.fetchWithAuth(url.toString(), {
        method: 'POST',
        body: JSON.stringify(body),
      }) as QwenSessionListResponse;

      const conversations = this.parseSessionListResponse(data);
      if (conversations.length === 0) break;

      allConversations = allConversations.concat(conversations);

      if (!data.data?.have_next_page) break;

      nextToken = data.data?.next_token;
      if (!nextToken) break;

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return allConversations;
  }

  /**
   * 获取单个对话详情（含消息列表）
   * 
   * 使用从 content script 捕获的签名来绕过验证
   */
  async getConversationDetail(id: string): Promise<Conversation> {
    const allConversations = await this.getAllConversations();
    const conversation = allConversations.find(c => c.id === id);

    if (!conversation) {
      throw new Error(`未找到对话: ${id}`);
    }

    // 尝试使用捕获的签名获取消息
    const messages = await this.getAllMessagesWithCapturedSign(id);

    console.log(`[Qwen] getConversationDetail 完成: ${conversation.title}, 消息数: ${messages.length}`);

    return {
      ...conversation,
      messages,
    };
  }

  /**
   * 使用捕获的签名获取消息列表
   */
  private async getAllMessagesWithCapturedSign(sessionId: string): Promise<Message[]> {
    const pageSize = 10;
    let allMessages: Message[] = [];
    let page = 1;
    let hasMore = true;
    let retryCount = 0;
    const maxRetries = 2;
    const maxPages = 50; // 最多获取 50 页
    const seenContents = new Set<string>(); // 用于去重
    let lastPos: number | undefined = undefined; // 用于分页

    // 获取捕获的签名头
    const signHeaders = await this.getSignHeadersFromPage();

    if (Object.keys(signHeaders).length === 0) {
      console.warn('[Qwen] 没有可用的签名，无法获取消息详情');
      return [];
    }

    console.log(`[Qwen] 开始使用签名获取对话 ${sessionId} 的消息...`);

    while (hasMore && retryCount < maxRetries && page <= maxPages) {
      const url = new URL(`${this.baseUrl}/api/v1/session/msg/list`);
      url.searchParams.set('biz_id', 'ai_qwen');
      url.searchParams.set('chat_client', 'h5');
      url.searchParams.set('device', 'pc');
      url.searchParams.set('fr', 'h5');
      url.searchParams.set('pr', 'qwen');
      url.searchParams.set('ut', this.generateDeviceId());
      url.searchParams.set('la', 'zh-CN');
      url.searchParams.set('tz', 'Asia/Shanghai');
      url.searchParams.set('wv', '2.6.1');
      url.searchParams.set('ve', '2.6.1');
      url.searchParams.set('nonce', this.generateNonce());
      url.searchParams.set('timestamp', Date.now().toString());
      url.searchParams.set('session_id', sessionId);
      url.searchParams.set('page_size', pageSize.toString());
      url.searchParams.set('page', page.toString());
      // 使用 pos 参数实现真正的分页（如果有的话）
      if (lastPos !== undefined) {
        url.searchParams.set('pos', lastPos.toString());
      }
      url.searchParams.set('return_response_messages', 'true');
      url.searchParams.set('event_filter', 'all');
      url.searchParams.set('forward', 'false');
      url.searchParams.set('include_pos', 'true'); // 启用 pos 字段用于分页

      try {
        // 使用捕获的签名头
        const baseHeaders = await this.buildHeaders();

        // 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            ...baseHeaders,
            ...signHeaders,
          },
          credentials: 'include',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as QwenMessageListResponse;

        if (data.code !== undefined && data.code !== 0) {
          console.error(`[Qwen] API 错误: code=${data.code}, msg=${data.msg}`);
          throw new Error(`API error: ${data.msg || data.code}`);
        }

        console.log(`[Qwen] 第 ${page} 页获取成功，code=${data.code}`);

        retryCount = 0;
        const messages = this.parseMessagesFromResponse(data);

        console.log(`[Qwen] 解析到 ${messages.length} 条消息，have_next_page=${data.data?.have_next_page}`);

        if (messages.length === 0) {
          console.log('[Qwen] 没有解析到消息，停止获取');
          break;
        }

        // 去重检查：如果这页的所有消息都已经存在，说明是重复数据
        const newMessages = messages.filter(msg => {
          const key = `${msg.role}:${msg.content.substring(0, 100)}`;
          if (seenContents.has(key)) {
            return false;
          }
          seenContents.add(key);
          return true;
        });

        console.log(`[Qwen] 去重后新增 ${newMessages.length} 条消息`);

        if (newMessages.length === 0) {
          console.log('[Qwen] 本页消息全部重复，停止获取');
          break;
        }

        allMessages = allMessages.concat(newMessages);

        // 获取最后一个消息的 pos 用于下一页分页
        const lastItem = data.data?.list?.[data.data.list.length - 1];
        if (lastItem && 'pos' in lastItem) {
          lastPos = (lastItem as { pos: number }).pos;
          console.log(`[Qwen] 记录 lastPos=${lastPos} 用于下一页`);
        }

        // 检查是否还有更多页
        const hasNextPage = data.data?.have_next_page ?? false;
        console.log(`[Qwen] has_next_page=${hasNextPage}, 当前总消息数=${allMessages.length}, 已获取页数=${page}`);

        // 停止条件：
        // 1. API 说没有下一页
        // 2. 已获取超过 500 条消息
        // 3. 已达到最大页数限制
        if (!hasNextPage || allMessages.length >= 500 || page >= maxPages) {
          if (allMessages.length >= 500) {
            console.log('[Qwen] 已达到最大消息数限制 (500)，停止获取');
          } else if (page >= maxPages) {
            console.log('[Qwen] 已达到最大页数限制 (50)，停止获取');
          } else {
            console.log('[Qwen] 没有更多消息了，停止获取');
          }
          hasMore = false;
        } else {
          hasMore = true;
          page++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        retryCount++;
        console.warn(`[Qwen] 获取消息失败 (尝试 ${retryCount}/${maxRetries}): ${error}`);
        if (retryCount >= maxRetries) {
          console.error(`[Qwen] 获取消息失败次数过多，停止获取`);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[Qwen] 消息获取完成，共 ${allMessages.length} 条，共 ${page} 页`);
    return allMessages;
  }

  /**
   * 获取对话的所有消息
   */
  private async getAllMessages(sessionId: string): Promise<Message[]> {
    const pageSize = 10;
    let allMessages: Message[] = [];
    let page = 1;
    let hasMore = true;
    let retryCount = 0;
    const maxRetries = 2;

    while (hasMore && retryCount < maxRetries) {
      const url = new URL(`${this.baseUrl}/api/v1/session/msg/list`);
      url.searchParams.set('biz_id', 'ai_qwen');
      url.searchParams.set('chat_client', 'h5');
      url.searchParams.set('device', 'pc');
      url.searchParams.set('fr', 'h5');
      url.searchParams.set('pr', 'qwen');
      url.searchParams.set('ut', this.generateDeviceId());
      url.searchParams.set('la', 'zh-CN');
      url.searchParams.set('tz', 'Asia/Shanghai');
      url.searchParams.set('wv', '2.6.1');
      url.searchParams.set('ve', '2.6.1');
      url.searchParams.set('nonce', this.generateNonce());
      url.searchParams.set('timestamp', Date.now().toString());
      url.searchParams.set('session_id', sessionId);
      url.searchParams.set('page_size', pageSize.toString());
      url.searchParams.set('page', page.toString());
      url.searchParams.set('return_response_messages', 'true');
      url.searchParams.set('event_filter', 'all');
      url.searchParams.set('forward', 'false');
      url.searchParams.set('include_pos', 'false');

      try {
        // 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

        const data = await this.fetchWithAuthGet(url.toString(), controller.signal) as QwenMessageListResponse;

        clearTimeout(timeoutId);
        retryCount = 0; // 重置重试计数

        const messages = this.parseMessagesFromResponse(data);

        if (messages.length === 0) break;

        allMessages = allMessages.concat(messages);
        hasMore = data.data?.have_next_page ?? false;
        page++;

        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        retryCount++;
        console.warn(`[Qwen] 获取消息失败 (尝试 ${retryCount}/${maxRetries}): ${error}`);
        if (retryCount >= maxRetries) {
          console.error(`[Qwen] 获取消息失败次数过多，停止获取`);
          break;
        }
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return allMessages;
  }

  /**
   * 从响应中解析消息列表
   */
  private parseMessagesFromResponse(data: QwenMessageListResponse): Message[] {
    const list = data.data?.list;
    if (!Array.isArray(list) || list.length === 0) {
      return [];
    }

    const messages: Message[] = [];

    for (const item of list) {
      const itemMessages = this.parseMessageItem(item);
      messages.push(...itemMessages);
    }

    return messages;
  }

  /**
   * 解析单个消息项
   * 一个 item 包含用户的 request 和 AI 的 response
   */
  private parseMessageItem(item: QwenMessageItem): Message[] {
    const messages: Message[] = [];
    const timestamp = this.parseTimestamp(item.created_at);

    // 解析用户消息
    if (Array.isArray(item.request_messages)) {
      for (const req of item.request_messages) {
        if (req.mime_type === 'text/plain' && req.content) {
          messages.push({
            role: 'user',
            content: this.cleanContent(req.content),
            timestamp,
          });
        }
      }
    }

    // 解析 AI 回复
    if (Array.isArray(item.response_messages)) {
      let assistantContent = '';

      for (const resp of item.response_messages) {
        // 只保留 AI 的主要回复内容，跳过参考资料
        if (resp.content) {
          // text/plain: 纯文本
          // multi_load/iframe: 主要回复内容（核心答案）
          // thinking/iframe: 思考过程
          if (resp.mime_type === 'text/plain' ||
              resp.mime_type === 'multi_load/iframe' ||
              resp.mime_type === 'thinking/iframe') {
            assistantContent += (assistantContent ? '\n' : '') + resp.content;
          }
          // 注意：跳过 bar/iframe（参考资料/搜索结果）
        }
      }

      if (assistantContent) {
        messages.push({
          role: 'assistant',
          content: this.cleanContent(assistantContent),
          timestamp,
        });
      }
    }

    return messages;
  }

  /**
   * 清理内容，移除引用标记和多余格式
   */
  private cleanContent(content: string): string {
    return content
      // 移除引用标记，如 [^1^], [^2^] 等
      .replace(/\[\^\d+\^\]/g, '')
      // 移除多余的空行
      .replace(/\n{3,}/g, '\n\n')
      // 移除行首行尾空白
      .trim();
  }

  /**
   * 获取符合条件的对话总数
   */
  async getTotalCount(_dateRange: DateRange): Promise<number> {
    const allConversations = await this.getAllConversations();
    return allConversations.length;
  }

  protected getAuthToken(): string | null {
    return this.cachedCookies.ssoTicket || null;
  }

  /**
   * 解析对话列表响应
   */
  private parseSessionListResponse(data: QwenSessionListResponse): Conversation[] {
    const sessions = data.data?.list;
    if (!Array.isArray(sessions)) {
      console.warn('[Qwen] 对话列表数据格式异常:', JSON.stringify(data).substring(0, 300));
      return [];
    }

    return sessions.map((session) => this.parseSession(session));
  }

  /**
   * 解析单个对话
   */
  private parseSession(session: QwenSession): Conversation {
    return {
      id: session.session_id,
      title: session.title || '未命名对话',
      createdAt: this.parseTimestamp(session.created_at),
      updatedAt: this.parseTimestamp(session.updated_at),
      messages: [],
    };
  }

  /**
   * 解析时间戳（千问使用毫秒级 Unix 时间戳）
   */
  private parseTimestamp(ts: number | undefined): Date {
    if (!ts) return new Date();
    return new Date(ts);
  }
}

// ==================== 类型定义 ====================

interface QwenSessionListResponse {
  trace_id?: string;
  code: number;
  msg: string;
  data?: {
    have_next_page: boolean;
    next_token?: string;
    list?: QwenSession[];
  };
}

interface QwenSession {
  biz_id: string;
  session_id: string;
  created_at: number;
  updated_at: number;
  last_req_timestamp: number;
  title: string;
  read_at?: number;
  unread_cnt: number;
  top: boolean;
  qwen_session_type: string;
  can_share: boolean;
  topic_id?: string;
}

interface QwenMessageListResponse {
  trace_id?: string;
  code: number;
  msg: string;
  data?: {
    have_next_page: boolean;
    list?: QwenMessageItem[];
  };
}

interface QwenMessageItem {
  user_type: number;
  session_id: string;
  req_id: string;
  created_at: number;
  request_messages: QwenRequestMessage[];
  response_messages: QwenResponseMessage[];
}

interface QwenRequestMessage {
  content: string;
  mime_type: string;
  meta_data?: {
    ori_query?: string;
  };
}

interface QwenResponseMessage {
  mime_type: string;
  status: string;
  content?: string;
  meta_data?: {
    sources?: QwenSource[];
    [key: string]: unknown;
  };
}

interface QwenSource {
  type: string;
  content: {
    list?: QwenSourceItem[];
  };
}

interface QwenSourceItem {
  summary?: string;
  title?: string;
  url?: string;
  type?: string;
}

// 注册适配器
adapterRegistry.register(new QwenAdapter());
