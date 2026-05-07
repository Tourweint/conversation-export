import { PlatformAdapter, adapterRegistry } from './base';
import type { Conversation, Message, DateRange } from '@/types';

/**
 * ChatGPT 平台适配器
 *
 * 架构说明：
 * - 平台检测：popup 通过 chrome.tabs.query 获取当前标签页 URL，用 detectByUrl() 匹配
 * - Token 获取：通过 chrome.scripting.executeScript 在页面上下文中读取 accessToken
 *   优先从页面 JS 上下文提取，fallback 到 /api/auth/session 端点
 * - API 请求：popup 直接 fetch（有 host_permissions，无 CORS 问题）
 *
 * ChatGPT API 特点：
 * - 对话列表：offset/limit 分页，GET /backend-api/conversations
 * - 对话详情：树形结构 mapping，GET /backend-api/conversation/:id
 * - 消息结构：从 current_node 沿 parent 链遍历，提取 user/assistant 消息
 */
export class ChatGPTAdapter extends PlatformAdapter {
  readonly id = 'chatgpt';
  readonly name = 'ChatGPT';
  readonly hostname = 'chatgpt.com';

  /** ChatGPT 支持的域名列表（chat.openai.com 是旧域名，会重定向到 chatgpt.com） */
  private readonly hostnames = ['chatgpt.com', 'chat.openai.com'];

  private baseUrl = 'https://chatgpt.com';

  /** 缓存的 access token */
  private cachedToken: string | null = null;

  isMatch(): boolean {
    return this.hostnames.includes(window.location.hostname);
  }

  /**
   * 重写以支持多个 ChatGPT 域名
   */
  isMatchUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.hostnames.includes(hostname);
    } catch {
      return false;
    }
  }

  /**
   * 通过 chrome.scripting.executeScript 从页面获取 access token
   * 优先从页面 JS 上下文提取，fallback 到 session API
   */
  private async getTokenFromPage(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('无法获取当前标签页');
    }

    // 尝试从页面 JS 上下文直接提取 token
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          // 方法1: 从 remix context 提取（最可靠）
          const win = window as unknown as Record<string, unknown>;
          const remixContext = win.__remixContext as Record<string, unknown> | undefined;
          if (remixContext) {
            const state = remixContext.state as Record<string, unknown> | undefined;
            const loaderData = state?.loaderData as Record<string, unknown> | undefined;
            const root = loaderData?.root as Record<string, unknown> | undefined;
            const clientBootstrap = root?.clientBootstrap as Record<string, unknown> | undefined;
            const session = clientBootstrap?.session as Record<string, unknown> | undefined;
            const token = session?.accessToken as string | undefined;
            if (token) return token;
          }
          return null;
        } catch {
          return null;
        }
      },
    });

    const token = results?.[0]?.result as string | null;

    if (token) {
      this.cachedToken = token;
      return token;
    }

    // Fallback: 调用 session API 获取 token
    try {
      const sessionToken = await this.getTokenViaSessionApi();
      if (sessionToken) {
        this.cachedToken = sessionToken;
        return sessionToken;
      }
    } catch {
      // session API 也失败
    }

    throw new Error('未找到认证信息，请先登录 ChatGPT');
  }

  /**
   * 通过 /api/auth/session 端点获取 access token
   */
  private async getTokenViaSessionApi(): Promise<string | null> {
    const response = await fetch(`${this.baseUrl}/api/auth/session`, {
      credentials: 'include',
    });

    if (!response.ok) return null;

    const data = await response.json() as { accessToken?: string };
    return data.accessToken || null;
  }

  /**
   * 发送带认证的 API 请求
   */
  private async fetchWithAuth(url: string): Promise<unknown> {
    const token = await this.getTokenFromPage();

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': '*/*',
        'Content-Type': 'application/json',
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

  /**
   * 获取对话列表（单页）
   * ChatGPT 使用 offset/limit 分页
   */
  async getConversations(page: number, pageSize: number): Promise<Conversation[]> {
    const offset = (page - 1) * pageSize;
    const url = `${this.baseUrl}/backend-api/conversations?offset=${offset}&limit=${pageSize}&order=updated`;

    const data = await this.fetchWithAuth(url) as {
      items?: unknown[];
    };

    if (!Array.isArray(data.items)) {
      throw new Error('对话列表数据格式错误');
    }

    return data.items.map((item: unknown) => this.parseConversationListItem(item));
  }

  /**
   * 获取所有对话（自动翻页，含归档对话）
   */
  async getAllConversations(): Promise<Conversation[]> {
    const limit = 100;
    let allConversations: Conversation[] = [];

    // 分别获取活跃和归档对话
    for (const isArchived of [false, true]) {
      let offset = 0;

      while (true) {
        const url = `${this.baseUrl}/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated${isArchived ? '&is_archived=true' : ''}`;

        const data = await this.fetchWithAuth(url) as {
          items?: unknown[];
        };

        if (!Array.isArray(data.items) || data.items.length === 0) {
          break;
        }

        const conversations = data.items.map((item: unknown) => this.parseConversationListItem(item));
        allConversations = allConversations.concat(conversations);

        if (data.items.length < limit) {
          break;
        }

        offset += limit;
      }
    }

    return allConversations;
  }

  /**
   * 获取单个对话详情（含消息列表）
   * ChatGPT 返回树形 mapping 结构，需要遍历提取消息
   */
  async getConversationDetail(id: string): Promise<Conversation> {
    const data = await this.fetchWithAuth(
      `${this.baseUrl}/backend-api/conversation/${id}`
    );

    const result = this.parseConversationDetail(id, data);

    if (result.messages.length === 0) {
      console.warn(
        `[ChatGPT] 对话 "${result.title}" (${id}) 无消息。` +
        `原始数据 keys: ${Object.keys(data as Record<string, unknown>).join(', ')}`
      );
    } else {
      console.log(
        `[ChatGPT] 对话 "${result.title}" 获取成功, ${result.messages.length} 条消息`
      );
    }

    return result;
  }

  /**
   * 获取符合条件的对话总数
   */
  async getTotalCount(_dateRange: DateRange): Promise<number> {
    const limit = 100;
    let count = 0;

    for (const isArchived of [false, true]) {
      let offset = 0;

      while (true) {
        const url = `${this.baseUrl}/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated${isArchived ? '&is_archived=true' : ''}`;

        const data = await this.fetchWithAuth(url) as {
          items?: unknown[];
        };

        if (!Array.isArray(data.items) || data.items.length === 0) {
          break;
        }

        count += data.items.length;

        if (data.items.length < limit) {
          break;
        }

        offset += limit;
      }
    }

    return count;
  }

  protected getAuthToken(): string | null {
    return this.cachedToken;
  }

  /**
   * 解析对话列表项
   */
  private parseConversationListItem(item: unknown): Conversation {
    const i = item as {
      id: string;
      title?: string;
      create_time?: number;
      update_time?: number;
    };

    return {
      id: i.id,
      title: i.title || '未命名对话',
      createdAt: this.parseTimestamp(i.create_time),
      updatedAt: this.parseTimestamp(i.update_time),
      messages: [],
    };
  }

  /**
   * 解析对话详情（含 mapping 树结构）
   */
  private parseConversationDetail(id: string, data: unknown): Conversation {
    const d = data as {
      title?: string;
      create_time?: number;
      update_time?: number;
      current_node?: string;
      mapping?: Record<string, ConversationNode>;
    };

    const messages = this.extractMessagesFromMapping(d.mapping, d.current_node);

    return {
      id,
      title: d.title || '未命名对话',
      createdAt: this.parseTimestamp(d.create_time),
      updatedAt: this.parseTimestamp(d.update_time),
      messages,
    };
  }

  /**
   * 从 mapping 树结构中提取线性消息列表
   * 算法：从 current_node 沿 parent 链向上遍历到根，再反转得到时间顺序
   */
  private extractMessagesFromMapping(
    mapping: Record<string, ConversationNode> | undefined,
    currentNodeId: string | undefined
  ): Message[] {
    if (!mapping || !currentNodeId) return [];

    // 从 current_node 向上遍历，构建有序路径
    const path: ConversationNode[] = [];
    let nodeId: string | null | undefined = currentNodeId;
    const visited = new Set<string>();

    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      path.push(mapping[nodeId]);
      nodeId = mapping[nodeId].parent;
    }

    // 反转得到时间顺序（从根到叶）
    path.reverse();

    // 提取并过滤消息
    const messages: Message[] = [];
    let lastAssistantContent = '';

    for (const node of path) {
      if (!node.message) continue;

      const msg = node.message;
      const role = msg.author?.role;

      // 跳过 system/tool 消息
      if (role !== 'user' && role !== 'assistant') continue;

      // 跳过隐藏的节点
      if (msg.is_visually_hidden_from_conversation) continue;

      // 提取内容
      let content = this.extractMessageContent(msg);

      // 跳过特定 content_type
      const contentType = msg.content?.content_type;
      if (contentType === 'model_editable_context' || contentType === 'user_editable_context') {
        continue;
      }

      if (!content) continue;

      // ChatGPT 特性：长回复可能被拆分为多个连续 assistant 消息
      // 合并连续的 assistant 消息
      if (role === 'assistant' && messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
        // 追加到上一条 assistant 消息
        lastAssistantContent += '\n' + content;
        messages[messages.length - 1].content = lastAssistantContent;
        continue;
      }

      if (role === 'assistant') {
        lastAssistantContent = content;
      } else {
        lastAssistantContent = '';
      }

      messages.push({
        role,
        content,
        timestamp: this.parseTimestamp(msg.create_time),
      });
    }

    return messages;
  }

  /**
   * 从消息对象中提取文本内容
   */
  private extractMessageContent(msg: ConversationMessage): string {
    if (!msg.content) return '';

    // content.parts 是最常见格式
    if (Array.isArray(msg.content.parts)) {
      return msg.content.parts
        .map((part: unknown) => {
          if (typeof part === 'string') return part;
          // 多模态内容可能包含对象（图片等）
          if (typeof part === 'object' && part !== null) {
            const p = part as Record<string, unknown>;
            // 图片等资源，暂时跳过
            if (p.asset_pointer || p.content_type === 'image_asset_pointer') {
              return '[图片]';
            }
            return p.text || '';
          }
          return '';
        })
        .filter(c => c.length > 0)
        .join('\n');
    }

    // content.text 格式（部分版本）
    if (typeof msg.content.text === 'string') {
      return msg.content.text;
    }

    return '';
  }

  /**
   * 解析时间戳（ChatGPT 使用浮点数 Unix 时间戳，秒级）
   */
  private parseTimestamp(ts: number | undefined): Date {
    if (!ts) return new Date();
    // 浮点数时间戳，秒级
    return new Date(ts > 1e12 ? ts : ts * 1000);
  }
}

/**
 * ChatGPT mapping 树中的节点
 */
interface ConversationNode {
  id: string;
  parent: string | null;
  children: string[];
  message: ConversationMessage | null;
}

/**
 * ChatGPT 消息对象
 */
interface ConversationMessage {
  id: string;
  author: {
    role: 'user' | 'assistant' | 'system' | 'tool';
  };
  content: {
    content_type?: string;
    parts?: unknown[];
    text?: string;
  };
  create_time?: number;
  is_visually_hidden_from_conversation?: boolean;
  metadata?: {
    model_slug?: string;
  };
}

// 注册适配器
adapterRegistry.register(new ChatGPTAdapter());
