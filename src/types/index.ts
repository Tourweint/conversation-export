/**
 * 核心类型定义
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
}

export interface DateRange {
  start?: Date;
  end?: Date;
}

export type ExportFormat = 'markdown' | 'json';

export interface ExportOptions {
  dateRange: DateRange;
  format: ExportFormat;
  includeMetadata: boolean;
}

export interface ExportProgress {
  current: number;
  total: number;
  status: 'idle' | 'fetching_list' | 'fetching_detail' | 'formatting' | 'packaging' | 'completed' | 'error';
  message?: string;
}

export interface PlatformInfo {
  id: string;
  name: string;
  hostname: string;
  icon?: string;
}
