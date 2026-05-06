import { PlatformAdapter, adapterRegistry } from './base';
import type { Conversation, Message, DateRange } from '@/types';

/**
 * DeepSeek 平台适配器
 * 
 * 注意：以下 API 端点需要通过浏览器 DevTools 抓包获取实际地址
 * 当前为占位符实现，需要根据实际情况调整
 */
export class DeepSeekAdapter extends PlatformAdapter {
  readonly id = 'deepseek';
  readonly name = 'DeepSeek';
  readonly hostname = 'chat.deepseek.com';

  private baseUrl = 'https://chat.deepseek.com/api/v0';

  isMatch(): boolean {
    return window.location.hostname === this.hostname;
  }

  protected getAuthToken(): string | null {
    // 尝试从 localStorage 或 cookie 获取 token
    // 实际实现需要根据 DeepSeek 的存储方式调整
    const token = localStorage.getItem('deepseek_token') || 
                  document.cookie.match(/token=([^;]+)/)?.[1];
    return token || null;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('未找到认证信息，请先登录 DeepSeek');
    }

    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }

  async getConversations(page: number, pageSize: number): Promise<Conversation[]> {
    // TODO: 根据实际 API 调整端点和参数
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/chat_session?page=${page}&page_size=${pageSize}`
    );

    if (!response.ok) {
      throw new Error(`获取对话列表失败: ${response.status}`);
    }

    const data = await response.json();
    
    // TODO: 根据实际响应结构调整
    return data.sessions.map((session: unknown) => this.parseConversation(session));
  }

  async getConversationDetail(id: string): Promise<Conversation> {
    // TODO: 根据实际 API 调整端点
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/chat_session/${id}/messages`
    );

    if (!response.ok) {
      throw new Error(`获取对话详情失败: ${response.status}`);
    }

    const data = await response.json();
    return this.parseConversationWithMessages(data);
  }

  async getTotalCount(dateRange: DateRange): Promise<number> {
    // TODO: 实现获取总数的逻辑
    // 可能需要先获取第一页，从响应中提取总数
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/chat_session?page=1&page_size=1`
    );
    
    if (!response.ok) {
      throw new Error(`获取对话总数失败: ${response.status}`);
    }

    const data = await response.json();
    // TODO: 根据实际响应结构调整
    return data.total || 0;
  }

  /**
   * 解析对话列表项
   */
  private parseConversation(session: unknown): Conversation {
    // TODO: 根据实际响应结构调整
    return {
      id: (session as { id: string }).id || '',
      title: (session as { title: string }).title || '未命名对话',
      createdAt: new Date((session as { created_at: string }).created_at || Date.now()),
      updatedAt: new Date((session as { updated_at: string }).updated_at || Date.now()),
      messages: [], // 列表接口不返回消息详情
    };
  }

  /**
   * 解析带消息详情的对话
   */
  private parseConversationWithMessages(data: unknown): Conversation {
    // TODO: 根据实际响应结构调整
    const session = (data as { session?: unknown }).session || data;
    const messages = (data as { messages?: unknown[] }).messages || [];

    return {
      id: (session as { id: string }).id || '',
      title: (session as { title: string }).title || '未命名对话',
      createdAt: new Date((session as { created_at: string }).created_at || Date.now()),
      updatedAt: new Date((session as { updated_at: string }).updated_at || Date.now()),
      messages: messages.map((msg: unknown) => this.parseMessage(msg)),
    };
  }

  /**
   * 解析单条消息
   */
  private parseMessage(msg: unknown): Message {
    // TODO: 根据实际响应结构调整
    const role = (msg as { role?: string }).role || 'assistant';
    return {
      role: role as 'user' | 'assistant' | 'system',
      content: (msg as { content?: string }).content || '',
      timestamp: new Date((msg as { created_at?: string }).created_at || Date.now()),
    };
  }
}

// 注册适配器
adapterRegistry.register(new DeepSeekAdapter());
