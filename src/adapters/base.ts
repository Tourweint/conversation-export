import type { Conversation, DateRange } from '@/types';

/**
 * 平台适配器基类
 * 所有平台适配器必须继承此类
 */
export abstract class PlatformAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly hostname: string;

  /**
   * 检测当前页面是否匹配该平台
   */
  abstract isMatch(): boolean;

  /**
   * 获取对话列表
   * @param page 页码（从 1 开始）
   * @param pageSize 每页数量
   */
  abstract getConversations(page: number, pageSize: number): Promise<Conversation[]>;

  /**
   * 获取单个对话详情
   * @param id 对话 ID
   */
  abstract getConversationDetail(id: string): Promise<Conversation>;

  /**
   * 获取符合条件的对话总数
   * @param dateRange 日期范围筛选
   */
  abstract getTotalCount(dateRange: DateRange): Promise<number>;

  /**
   * 获取当前平台的认证信息（如 token）
   * 由子类实现具体的获取逻辑
   */
  protected abstract getAuthToken(): string | null;
}

/**
 * 适配器注册表
 */
class AdapterRegistry {
  private adapters: Map<string, PlatformAdapter> = new Map();

  register(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): PlatformAdapter | undefined {
    return this.adapters.get(id);
  }

  getAll(): PlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 根据当前页面自动检测匹配的适配器
   */
  detect(): PlatformAdapter | null {
    for (const adapter of this.adapters.values()) {
      if (adapter.isMatch()) {
        return adapter;
      }
    }
    return null;
  }
}

export const adapterRegistry = new AdapterRegistry();
