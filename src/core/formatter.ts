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
   * 转换为 Markdown 格式（匹配千问官方导出格式）
   */
  private toMarkdown(conversation: Conversation): string {
    const lines: string[] = [];

    for (const message of conversation.messages) {
      lines.push(
        `## ${message.role}`,
        '',
        message.content,
        '',
      );
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
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
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
  private formatDate(date: Date): string {
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
