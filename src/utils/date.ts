import type { DateRange } from '@/types';

/**
 * 检查日期是否在范围内
 */
export function isInRange(date: Date | null, range: DateRange): boolean {
  // 没有日期信息的对话，默认包含在范围内（避免误过滤）
  if (!date) return true;
  
  // 只比较日期部分，忽略时间
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (range.start) {
    const startOnly = new Date(
      range.start.getFullYear(),
      range.start.getMonth(),
      range.start.getDate()
    );
    if (dateOnly < startOnly) return false;
  }
  
  if (range.end) {
    const endOnly = new Date(
      range.end.getFullYear(),
      range.end.getMonth(),
      range.end.getDate()
    );
    // 结束日期包含当天
    endOnly.setDate(endOnly.getDate() + 1);
    if (dateOnly >= endOnly) return false;
  }
  
  return true;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date | null): string {
  if (!date) return '未知日期';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 解析日期字符串为 Date 对象
 */
export function parseDate(dateString: string): Date | null {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  
  return date;
}

/**
 * 获取今天的 Date 对象（时间设为 23:59:59）
 */
export function getEndOfToday(): Date {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

/**
 * 获取 N 天前的 Date 对象（时间设为 00:00:00）
 */
export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}
