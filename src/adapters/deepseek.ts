import { PlatformAdapter, adapterRegistry } from './base';
import type { Conversation, Message, DateRange } from '@/types';

/**
 * DeepSeek 平台适配器
 *
 * 架构说明：
 * - 平台检测：popup 通过 chrome.tabs.query 获取当前标签页 URL，用 detectByUrl() 匹配
 * - Token 获取：通过 chrome.scripting.executeScript 在页面上下文中读取 localStorage
 * - API 请求：popup 直接 fetch（有 host_permissions，无 CORS 问题）
 */
export class DeepSeekAdapter extends PlatformAdapter {
  readonly id = 'deepseek';
  readonly name = 'DeepSeek';
  readonly hostname = 'chat.deepseek.com';

  private baseUrl = 'https://chat.deepseek.com/api/v0';

  private extraHeaders: Record<string, string> = {
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://chat.deepseek.com/',
    'X-App-Version': '20241129.1',
    'X-Client-Locale': 'zh_CN',
    'X-Client-Platform': 'web',
    'X-Client-Version': '2.0.0',
    'X-Client-Timezone-Offset': '28800',
  };

  /** 缓存的 auth token */
  private cachedToken: string | null = null;

  isMatch(): boolean {
    return window.location.hostname === this.hostname;
  }

  /**
   * 通过 chrome.scripting.executeScript 从页面 localStorage 读取 token
   * 不依赖 content script 是否已注入
   */
  private async getTokenFromPage(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('无法获取当前标签页');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          const raw = localStorage.getItem('userToken');
          if (!raw) return null;
          const parsed = JSON.parse(raw) as { value?: string };
          return parsed.value || null;
        } catch {
          return null;
        }
      },
    });

    const token = results?.[0]?.result as string | null;
    if (!token) {
      throw new Error('未找到认证信息，请先登录 DeepSeek');
    }

    this.cachedToken = token;
    return token;
  }

  /**
   * 直接从 popup 发送带认证的 API 请求
   * popup 有 host_permissions，可以跨域访问 DeepSeek API
   */
  private async fetchWithAuth(url: string): Promise<unknown> {
    const token = await this.getTokenFromPage();

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': '*/*',
        ...this.extraHeaders,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      // 如果是认证失败，清除缓存 token
      if (response.status === 401 || response.status === 403) {
        this.cachedToken = null;
      }
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // DeepSeek API 在 code 字段返回错误码
    if (data.code !== undefined && data.code !== 0) {
      console.warn(`[DeepSeek] API 返回错误: code=${data.code}, msg=${data.msg}`, url);
      throw new Error(`DeepSeek API 错误: ${data.msg || data.code}`);
    }

    return data;
  }

  /**
   * 获取对话列表（单页）
   * DeepSeek 使用游标分页: GET /chat_session/fetch_page
   */
  async getConversations(page: number, _pageSize: number): Promise<Conversation[]> {
    let cursor: number | undefined;

    for (let currentPage = 1; currentPage <= page; currentPage++) {
      const url = cursor
        ? `${this.baseUrl}/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=${cursor}`
        : `${this.baseUrl}/chat_session/fetch_page?lte_cursor.pinned=false`;

      const data = await this.fetchWithAuth(url) as {
        code: number;
        msg?: string;
        data?: { biz_data?: { chat_sessions?: unknown[]; has_more?: boolean } };
      };

      if (data.code !== 0) {
        throw new Error(`获取对话列表失败: ${data.msg || data.code}`);
      }

      const sessions = data.data?.biz_data?.chat_sessions;
      if (!Array.isArray(sessions)) {
        throw new Error('对话列表数据格式错误');
      }

      const conversations = sessions.map((s: unknown) => this.parseConversation(s));

      if (currentPage === page) {
        return conversations;
      }

      if (!data.data?.biz_data?.has_more || conversations.length === 0) {
        return [];
      }

      const lastSession = sessions[sessions.length - 1] as { updated_at?: number };
      cursor = lastSession.updated_at;
    }

    return [];
  }

  /**
   * 获取所有对话（自动翻页）
   */
  async getAllConversations(): Promise<Conversation[]> {
    let cursor: number | undefined;
    let allConversations: Conversation[] = [];

    while (true) {
      const url = cursor
        ? `${this.baseUrl}/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=${cursor}`
        : `${this.baseUrl}/chat_session/fetch_page?lte_cursor.pinned=false`;

      const data = await this.fetchWithAuth(url) as {
        code: number;
        msg?: string;
        data?: { biz_data?: { chat_sessions?: unknown[]; has_more?: boolean } };
      };

      if (data.code !== 0) {
        throw new Error(`获取对话列表失败: ${data.msg || data.code}`);
      }

      const sessions = data.data?.biz_data?.chat_sessions;
      if (!Array.isArray(sessions) || sessions.length === 0) {
        break;
      }

      const conversations = sessions.map((s: unknown) => this.parseConversation(s));
      allConversations = allConversations.concat(conversations);

      if (!data.data?.biz_data?.has_more) {
        break;
      }

      const lastSession = sessions[sessions.length - 1] as { updated_at?: number };
      cursor = lastSession.updated_at;
    }

    return allConversations;
  }

  /**
   * 获取单个对话详情（含消息列表）
   */
  async getConversationDetail(id: string): Promise<Conversation> {
    // 注意：不要传 cache_version 和 cache_reset_at 参数
    // 带 cache 参数时，DeepSeek 会返回 chat_messages:[] + cache_control:"MERGE"
    // 表示"用你的本地缓存合并"，但扩展没有缓存，结果就是空消息
    const data = await this.fetchWithAuth(
      `${this.baseUrl}/chat/history_messages?chat_session_id=${id}`
    );

    const result = this.parseConversationWithMessages(id, data);

    // 诊断日志：记录解析结果
    if (result.messages.length === 0) {
      const rawMessages = (data as Record<string, unknown>)?.data
        ? ((data as { data?: { biz_data?: { chat_messages?: unknown[] } } }).data?.biz_data?.chat_messages)
        : ((data as { biz_data?: { chat_messages?: unknown[] } })?.biz_data?.chat_messages);
      console.warn(
        `[DeepSeek] 对话 "${result.title}" (${id}) 无消息。` +
        `原始 chat_messages: ${JSON.stringify(rawMessages)?.substring(0, 200) || 'undefined'}\n` +
        `完整响应: ${JSON.stringify(data).substring(0, 500)}`
      );
    } else {
      console.log(
        `[DeepSeek] 对话 "${result.title}" 获取成功, ${result.messages.length} 条消息`
      );
    }

    return result;
  }

  /**
   * 获取符合条件的对话总数
   */
  async getTotalCount(_dateRange: DateRange): Promise<number> {
    let cursor: number | undefined;
    let count = 0;

    while (true) {
      const url = cursor
        ? `${this.baseUrl}/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=${cursor}`
        : `${this.baseUrl}/chat_session/fetch_page?lte_cursor.pinned=false`;

      const data = await this.fetchWithAuth(url) as {
        code: number;
        msg?: string;
        data?: { biz_data?: { chat_sessions?: unknown[]; has_more?: boolean } };
      };

      if (data.code !== 0) {
        throw new Error(`获取对话总数失败: ${data.msg || data.code}`);
      }

      const sessions = data.data?.biz_data?.chat_sessions;
      if (!Array.isArray(sessions) || sessions.length === 0) {
        break;
      }

      count += sessions.length;

      if (!data.data?.biz_data?.has_more) {
        break;
      }

      const lastSession = sessions[sessions.length - 1] as { updated_at?: number };
      cursor = lastSession.updated_at;
    }

    return count;
  }

  protected getAuthToken(): string | null {
    return this.cachedToken;
  }

  private parseConversation(session: unknown): Conversation {
    const s = session as {
      id: string;
      title?: string;
      title_type?: string;
      pinned?: boolean;
      model_type?: string;
      updated_at?: number;
    };

    return {
      id: s.id,
      title: s.title || '未命名对话',
      createdAt: new Date((s.updated_at || Date.now()) * 1000),
      updatedAt: new Date((s.updated_at || Date.now()) * 1000),
      messages: [],
    };
  }

  private parseConversationWithMessages(sessionId: string, data: unknown): Conversation {
    const d = data as Record<string, unknown>;

    // DeepSeek API 可能返回两种结构：
    // 1. { code: 0, data: { biz_data: { chat_session, chat_messages } } }
    // 2. { biz_data: { chat_session, chat_messages } } （不含 data 包装）
    let bizData: {
      chat_session?: {
        title?: string;
        created_at?: number;
        updated_at?: number;
      };
      chat_messages?: unknown[];
    } | undefined;

    if (d.data && typeof d.data === 'object') {
      bizData = (d.data as { biz_data?: typeof bizData }).biz_data;
    } else {
      bizData = (d as { biz_data?: typeof bizData }).biz_data;
    }

    const session = bizData?.chat_session || {};
    const messages = bizData?.chat_messages || [];

    // 如果 biz_data 不存在，记录原始结构帮助排查
    if (!bizData) {
      console.warn(
        `[DeepSeek] 对话 ${sessionId} 响应中未找到 biz_data，` +
        `顶层 keys: ${Object.keys(d).join(', ')}`
      );
    }

    return {
      id: sessionId,
      title: session.title || '未命名对话',
      createdAt: new Date((session.created_at || session.updated_at || Date.now()) * 1000),
      updatedAt: new Date((session.updated_at || Date.now()) * 1000),
      messages: messages.map((msg: unknown) => this.parseMessage(msg)),
    };
  }

  private parseMessage(msg: unknown): Message {
    const m = msg as Record<string, unknown>;

    // 提取内容：
    // 无 cache 参数时，消息直接有 content 字段
    // 有 cache 参数时，消息可能在 fragments 数组中
    let content = '';
    if (typeof m.content === 'string' && m.content.length > 0) {
      content = m.content;
    } else if (Array.isArray(m.fragments)) {
      content = (m.fragments as Array<{ content?: string; type?: string }>)
        .map(f => f.content || '')
        .filter(c => c.length > 0)
        .join('\n');
    }

    // 如果内容为空，记录诊断信息
    if (!content) {
      console.warn(
        `[DeepSeek] 消息内容为空, role=${m.role}, keys=${Object.keys(m).join(',')}`,
        `fragments: ${JSON.stringify(m.fragments)?.substring(0, 100) || 'undefined'}`
      );
    }

    // 映射 role 为小写
    const roleStr = String(m.role || '');
    const role = roleStr === 'USER' ? 'user' : roleStr === 'ASSISTANT' ? 'assistant' : 'assistant';

    // 解析时间戳（秒级浮点数）
    let timestamp = Date.now();
    const insertedAt = m.inserted_at as number | undefined;
    if (insertedAt) {
      timestamp = insertedAt > 1e12 ? insertedAt : insertedAt * 1000;
    }

    return {
      role,
      content,
      timestamp: new Date(timestamp),
    };
  }
}

// 注册适配器
adapterRegistry.register(new DeepSeekAdapter());
