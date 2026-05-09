import type { Conversation, ExportFormat } from '@/types';

/**
 * 格式转换器
 * 负责将对话数据转换为不同格式
 */
export class Formatter {
  /**
   * 格式化对话为指定格式
   */
  format(conversation: Conversation, format: ExportFormat): string {
    switch (format) {
      case 'markdown':
        return this.toMarkdown(conversation);
      case 'json':
        return this.toJSON(conversation);
      default:
        throw new Error(`不支持的格式: ${format}`);
    }
  }

  /**
   * 转换为 Markdown 格式
   */
  private toMarkdown(conversation: Conversation): string {
    const lines: string[] = [];

    // 对话标题
    lines.push(`# ${conversation.title}`);
    lines.push('');

    // 对话元信息
    if (conversation.createdAt) {
      lines.push(`> 创建时间: ${this.formatDate(conversation.createdAt)}`);
    }
    if (conversation.updatedAt) {
      lines.push(`> 更新时间: ${this.formatDate(conversation.updatedAt)}`);
    }
    if (conversation.createdAt || conversation.updatedAt) {
      lines.push('');
    }

    lines.push('---');
    lines.push('');

    for (const message of conversation.messages) {
      const roleLabel = this.getRoleLabel(message.role);
      const timeStr = message.timestamp ? ` (${this.formatDate(message.timestamp)})` : '';
      lines.push(`### ${roleLabel}${timeStr}`);
      lines.push('');
      lines.push(message.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 转换为 JSON 格式
   */
  private toJSON(conversation: Conversation): string {
    const data = {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt ? conversation.createdAt.toISOString() : null,
      updatedAt: conversation.updatedAt ? conversation.updatedAt.toISOString() : null,
      messages: conversation.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp ? msg.timestamp.toISOString() : null,
      })),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * 获取角色显示名称
   */
  private getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      user: '👤 用户',
      assistant: '🤖 助手',
      system: '⚙️ 系统',
    };
    return labels[role] || role;
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date | null): string {
    if (!date) return '未知时间';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}

export const formatter = new Formatter();
