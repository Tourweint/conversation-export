import { PlatformAdapter, adapterRegistry } from './base';
import type { Conversation, Message, DateRange } from '@/types';

/**
 * Kimi 平台适配器
 *
 * 架构说明：
 * - 平台检测：popup 通过 chrome.tabs.query 获取当前标签页 URL，用 detectByUrl() 匹配
 * - Token 获取：通过 chrome.cookies API 读取 HttpOnly 的 kimi-auth cookie
 * - API 请求：popup 直接 fetch（有 host_permissions，无 CORS 问题）
 *
 * Kimi API 特点：
 * - 对话列表：POST /apiv2/kimi.chat.v1.ChatService/ListChats，page_size 分页
 * - 对话详情：POST /apiv2/kimi.gateway.chat.v1.ChatService/ListMessages
 *   请求体: { chat_id, page_size }
 *   响应: { messages: [{ id, parentId, role, status, blocks }] }
 *   blocks 包含多种类型: text(正文), think(思考过程), multiStage/stage(阶段标记)
 * - 认证方式：Bearer JWT token，存储在 kimi-auth cookie 中
 * - 额外 Headers：x-msh-device-id, x-msh-platform, x-msh-session-id, x-msh-version, x-traffic-id
 *   这些值可从 JWT payload 中解码获取
 */
export class KimiAdapter extends PlatformAdapter {
  readonly id = 'kimi';
  readonly name = 'Kimi';
  readonly hostname = 'kimi.com';

  private readonly hostnames = ['kimi.com', 'www.kimi.com'];

  private baseUrl = 'https://www.kimi.com';

  private cachedToken: string | null = null;

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

  private async getTokenFromPage(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;

    const token = await this.getTokenViaChromeCookies();
    if (token) {
      this.cachedToken = token;
      return token;
    }

    throw new Error('未找到认证信息，请先登录 Kimi');
  }

  private async getTokenViaChromeCookies(): Promise<string | null> {
    try {
      const cookie = await chrome.cookies.get({
        url: 'https://www.kimi.com',
        name: 'kimi-auth',
      });
      return cookie?.value || null;
    } catch {
      return null;
    }
  }

  private decodeJwtPayload(token: string): KimiJwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('无效的 JWT token 格式');
    }
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as KimiJwtPayload;
  }

  private async buildAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getTokenFromPage();
    const payload = this.decodeJwtPayload(token);

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'x-msh-device-id': payload.device_id || '',
      'x-msh-platform': 'web',
      'x-msh-session-id': payload.ssid || '',
      'x-msh-version': '1.0.0',
      'x-traffic-id': payload.sub || '',
      'x-language': 'zh-CN',
      'r-timezone': 'Asia/Shanghai',
      'Origin': 'https://www.kimi.com',
      'Referer': 'https://www.kimi.com/',
    };
  }

  private async fetchWithAuth(url: string, options?: RequestInit): Promise<unknown> {
    const headers = await this.buildAuthHeaders();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options?.headers as Record<string, string> || {}),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.cachedToken = null;
      }
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private cachedAllConversations: Conversation[] | null = null;

  async getConversations(page: number, pageSize: number): Promise<Conversation[]> {
    const all = await this.getAllConversations();
    const offset = (page - 1) * pageSize;
    return all.slice(offset, offset + pageSize);
  }

  async getAllConversations(): Promise<Conversation[]> {
    if (this.cachedAllConversations) {
      return this.cachedAllConversations;
    }

    const pageSize = 50;
    let allConversations: Conversation[] = [];
    let cursor: string | undefined;
    let previousCount = 0;

    while (true) {
      const body: Record<string, unknown> = {
        project_id: '',
        page_size: pageSize,
        query: '',
      };

      if (cursor) {
        body.cursor = cursor;
      }

      const data = await this.fetchWithAuth(
        `${this.baseUrl}/apiv2/kimi.chat.v1.ChatService/ListChats`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );

      const conversations = this.parseChatListResponse(data);
      if (conversations.length === 0) break;

      allConversations = allConversations.concat(conversations);

      if (allConversations.length === previousCount) break;
      previousCount = allConversations.length;

      const hasMore = this.extractHasMore(data);
      if (!hasMore) break;

      const nextCursor = this.extractCursor(data);
      if (nextCursor) {
        cursor = nextCursor;
      } else if (conversations.length < pageSize) {
        break;
      } else {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    this.cachedAllConversations = allConversations;
    return allConversations;
  }

  async getConversationDetail(id: string): Promise<Conversation> {
    const [chatMeta, messagesData] = await Promise.all([
      this.fetchWithAuth(
        `${this.baseUrl}/apiv2/kimi.gateway.chat.v1.ChatService/GetChat`,
        {
          method: 'POST',
          body: JSON.stringify({ chat_id: id }),
        }
      ) as Promise<KimiChatMeta>,
      this.fetchWithAuth(
        `${this.baseUrl}/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages`,
        {
          method: 'POST',
          body: JSON.stringify({
            chat_id: id,
            page_size: 100,
          }),
        }
      ),
    ]);

    const result = this.parseConversationDetail(id, chatMeta, messagesData);

    if (result.messages.length === 0) {
      console.warn(
        `[Kimi] 对话 "${result.title}" (${id}) 无消息。` +
        `原始数据 keys: ${Object.keys(messagesData as Record<string, unknown>).join(', ')}`
      );
    } else {
      console.log(
        `[Kimi] 对话 "${result.title}" 获取成功, ${result.messages.length} 条消息`
      );
    }

    return result;
  }

  async getTotalCount(_dateRange: DateRange): Promise<number> {
    const allConversations = await this.getAllConversations();
    return allConversations.length;
  }

  protected getAuthToken(): string | null {
    return this.cachedToken;
  }

  private parseChatListResponse(data: unknown): Conversation[] {
    const d = data as { chats?: unknown[] };

    if (!Array.isArray(d.chats)) {
      console.warn('[Kimi] 对话列表数据格式异常:', JSON.stringify(data).substring(0, 300));
      return [];
    }

    return d.chats.map((chat: unknown) => this.parseConversation(chat));
  }

  private parseConversation(chat: unknown): Conversation {
    const c = chat as {
      id?: string;
      name?: string;
      messageContent?: string;
      createTime?: string;
      updateTime?: string;
    };

    return {
      id: c.id || '',
      title: c.name || '未命名对话',
      createdAt: this.parseIsoTimestamp(c.createTime),
      updatedAt: this.parseIsoTimestamp(c.updateTime),
      messages: [],
    };
  }

  private extractHasMore(data: unknown): boolean {
    const d = data as Record<string, unknown>;
    if (typeof d.has_more === 'boolean') return d.has_more;
    if (typeof d.hasMore === 'boolean') return d.hasMore;
    return false;
  }

  private extractCursor(data: unknown): string | undefined {
    const d = data as Record<string, unknown>;
    return (d.cursor || d.next_cursor || d.page_token) as string | undefined;
  }

  private parseConversationDetail(id: string, chatMeta: KimiChatMeta, data: unknown): Conversation {
    const d = data as {
      messages?: unknown[];
    };

    const rawMessages = Array.isArray(d.messages) ? d.messages : [];
    const messages = rawMessages
      .map((msg: unknown) => this.parseMessage(msg))
      .filter((m): m is Message => m !== null)
      .reverse();

    const chat = chatMeta.chat;

    return {
      id,
      title: chat?.name || '',
      createdAt: this.parseIsoTimestamp(chat?.createTime),
      updatedAt: this.parseIsoTimestamp(chat?.updateTime),
      messages,
    };
  }

  private parseMessage(msg: unknown): Message | null {
    const m = msg as {
      id?: string;
      role?: string;
      status?: string;
      blocks?: unknown[];
      createTime?: string;
    };

    const role = this.normalizeRole(m.role);
    if (!role) return null;

    if (m.status && m.status !== 'MESSAGE_STATUS_COMPLETED') {
      return null;
    }

    const { text, thinking } = this.extractBlocksContent(m.blocks);

    if (!text && !thinking) return null;

    let content = '';
    const thinkOpen = '<think' + '>';
    const thinkClose = '</think' + '>';
    if (thinking && text) {
      content = `${thinkOpen}\n${thinking}\n${thinkClose}\n\n${text}`;
    } else if (thinking) {
      content = `${thinkOpen}\n${thinking}\n${thinkClose}`;
    } else {
      content = text;
    }

    return {
      role,
      content,
      timestamp: this.parseIsoTimestamp(m.createTime),
    };
  }

  private normalizeRole(role: string | undefined): 'user' | 'assistant' | null {
    if (!role) return null;
    const r = role.toLowerCase();
    if (r === 'user') return 'user';
    if (r === 'assistant') return 'assistant';
    return null;
  }

  private extractBlocksContent(blocks: unknown[] | undefined): { text: string; thinking: string } {
    let text = '';
    let thinking = '';

    if (!Array.isArray(blocks)) return { text, thinking };

    for (const block of blocks) {
      const b = block as Record<string, unknown>;

      if (b.text && typeof b.text === 'object') {
        const t = b.text as { content?: string };
        if (t.content) {
          text += (text ? '\n' : '') + t.content;
        }
      }

      if (b.think && typeof b.think === 'object') {
        const t = b.think as { content?: string };
        if (t.content) {
          thinking += (thinking ? '\n' : '') + t.content;
        }
      }
    }

    return { text, thinking };
  }

  private parseIsoTimestamp(ts: string | undefined): Date {
    if (!ts) return new Date();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? new Date() : d;
  }
}

interface KimiJwtPayload {
  iss: string;
  exp: number;
  iat: number;
  jti: string;
  typ: string;
  app_id: string;
  sub: string;
  space_id: string;
  abstract_user_id: string;
  ssid: string;
  device_id: string;
  region: string;
  membership: {
    level: number;
  };
}

interface KimiChatMeta {
  chat?: {
    id?: string;
    name?: string;
    createTime?: string;
    updateTime?: string;
  };
}

adapterRegistry.register(new KimiAdapter());
