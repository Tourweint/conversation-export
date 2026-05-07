import type { Conversation, DateRange, ExportFormat, ExportProgress } from '@/types';
import type { PlatformAdapter } from '@/adapters';
import { downloader } from './downloader';
import { isInRange } from '@/utils/date';

/**
 * 导出调度器
 * 负责协调整个导出流程
 */
export class Exporter {
  private adapter: PlatformAdapter;
  private onProgress: (progress: ExportProgress) => void;
  private abortController: AbortController | null = null;

  constructor(
    adapter: PlatformAdapter,
    onProgress: (progress: ExportProgress) => void
  ) {
    this.adapter = adapter;
    this.onProgress = onProgress;
  }

  /**
   * 执行导出
   */
  async export(
    dateRange: DateRange,
    format: ExportFormat
  ): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      // 1. 获取符合条件的对话列表
      this.updateProgress({
        current: 0,
        total: 0,
        status: 'fetching_list',
        message: '正在获取对话列表...',
      });

      const conversations = await this.fetchConversations(dateRange, signal);
      
      if (conversations.length === 0) {
        this.updateProgress({
          current: 0,
          total: 0,
          status: 'completed',
          message: '没有找到符合条件的对话',
        });
        return;
      }

      // 2. 批量获取对话详情
      this.updateProgress({
        current: 0,
        total: conversations.length,
        status: 'fetching_detail',
        message: '正在获取对话详情...',
      });

      const detailedConversations = await this.fetchDetailsWithRateLimit(
        conversations,
        signal
      );

      // 3. 打包下载
      this.updateProgress({
        current: detailedConversations.length,
        total: detailedConversations.length,
        status: 'packaging',
        message: '正在打包文件...',
      });

      await downloader.downloadBatch(
        detailedConversations,
        format,
        (current, total) => {
          this.updateProgress({
            current,
            total,
            status: 'packaging',
            message: `正在打包文件 (${current}/${total})...`,
          });
        }
      );

      // 4. 完成
      this.updateProgress({
        current: detailedConversations.length,
        total: detailedConversations.length,
        status: 'completed',
        message: `成功导出 ${detailedConversations.length} 个对话`,
      });

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.updateProgress({
          current: 0,
          total: 0,
          status: 'idle',
          message: '已取消导出',
        });
      } else {
        this.updateProgress({
          current: 0,
          total: 0,
          status: 'error',
          message: error instanceof Error ? error.message : '导出失败',
        });
      }
    }
  }

  /**
   * 取消导出
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * 获取符合条件的对话列表
   */
  private async fetchConversations(
    dateRange: DateRange,
    signal: AbortSignal
  ): Promise<Conversation[]> {
    const conversations: Conversation[] = [];
    const pageSize = 20;
    let page = 1;
    let hasMore = true;

    while (hasMore && !signal.aborted) {
      const batch = await this.adapter.getConversations(page, pageSize);
      
      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // 按日期筛选
      const filtered = batch.filter(conv => isInRange(conv.createdAt, dateRange));
      
      // 如果这一页的所有对话都在范围外，且是按时间倒序的，可以停止
      if (filtered.length === 0 && batch[0].createdAt < (dateRange.start || new Date(0))) {
        hasMore = false;
        break;
      }

      conversations.push(...filtered);
      page++;

      // 限速：每页之间延迟 500ms
      if (hasMore) {
        await this.sleep(500, signal);
      }
    }

    return conversations;
  }

  /**
   * 带限速的批量获取详情
   */
  private async fetchDetailsWithRateLimit(
    conversations: Conversation[],
    signal: AbortSignal
  ): Promise<Conversation[]> {
    const results: Conversation[] = [];
    const batchSize = 3; // 每批 3 个，减少并发
    const delayMs = 1500; // 每批间隔 1.5 秒
    let hasError = false;

    for (let i = 0; i < conversations.length; i += batchSize) {
      if (signal.aborted) {
        throw new Error('AbortError');
      }

      const batch = conversations.slice(i, i + batchSize);
      
      // 串行处理而不是并行，避免卡死
      for (let j = 0; j < batch.length; j++) {
        const conv = batch[j];
        if (signal.aborted) {
          throw new Error('AbortError');
        }

        const currentIndex = i + j + 1;

        try {
          // 更新进度：开始获取当前对话
          this.updateProgress({
            current: currentIndex,
            total: conversations.length,
            status: 'fetching_detail',
            message: `正在获取 "${conv.title}" 的消息... (${currentIndex}/${conversations.length})`,
          });

          const detail = await this.adapter.getConversationDetail(conv.id);
          if (detail.messages.length === 0) {
            console.warn(`[Exporter] 对话 "${conv.title}" (${conv.id}) 详情获取成功但无消息`);
          }
          results.push(detail);
        } catch (error) {
          console.error(`[Exporter] 获取对话 "${conv.title}" (${conv.id}) 详情失败:`, error);
          hasError = true;
          // 继续处理其他对话，不中断流程
          results.push(conv);
        }

        // 每个对话之间添加小延迟
        if (j < batch.length - 1) {
          await this.sleep(300, signal);
        }
      }

      // 限速
      if (i + batchSize < conversations.length) {
        await this.sleep(delayMs, signal);
      }
    }

    return results;
  }

  /**
   * 更新进度
   */
  private updateProgress(progress: ExportProgress): void {
    this.onProgress(progress);
  }

  /**
   * 延迟（支持中断）
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('AbortError'));
      }, { once: true });
    });
  }
}
