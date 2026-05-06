import JSZip from 'jszip';
import type { Conversation, ExportFormat } from '@/types';
import { formatter } from './formatter';

/**
 * 下载器
 * 负责打包和下载导出文件
 */
export class Downloader {
  /**
   * 下载单个对话
   */
  downloadSingle(conversation: Conversation, format: ExportFormat): void {
    const content = formatter.format(conversation, format);
    const extension = format === 'markdown' ? 'md' : 'json';
    const filename = this.sanitizeFilename(`${conversation.title}.${extension}`);
    
    this.downloadFile(content, filename, format);
  }

  /**
   * 批量下载对话（打包为 ZIP）
   */
  async downloadBatch(
    conversations: Conversation[],
    format: ExportFormat,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const zip = new JSZip();
    const folder = zip.folder('conversations');
    
    if (!folder) {
      throw new Error('创建 ZIP 文件夹失败');
    }

    const extension = format === 'markdown' ? 'md' : 'json';

    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];
      const content = formatter.format(conversation, format);
      const filename = this.sanitizeFilename(`${conversation.title}.${extension}`);
      
      // 处理重名文件
      const uniqueFilename = this.getUniqueFilename(folder, filename);
      folder.file(uniqueFilename, content);
      
      onProgress?.(i + 1, conversations.length);
    }

    // 生成 ZIP 文件
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    this.downloadBlob(zipBlob, `conversations_${timestamp}.zip`);
  }

  /**
   * 下载文件
   */
  private downloadFile(content: string, filename: string, format: ExportFormat): void {
    const mimeType = format === 'markdown' 
      ? 'text/markdown;charset=utf-8'
      : 'application/json;charset=utf-8';
    
    const blob = new Blob([content], { type: mimeType });
    this.downloadBlob(blob, filename);
  }

  /**
   * 下载 Blob
   */
  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * 清理文件名（移除非法字符）
   */
  private sanitizeFilename(filename: string): string {
    // 移除或替换文件名中的非法字符
    return filename
      .replace(/[<>"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200); // 限制长度
  }

  /**
   * 获取唯一文件名（处理重名）
   */
  private getUniqueFilename(folder: JSZip, filename: string): string {
    let uniqueName = filename;
    let counter = 1;
    const extIndex = filename.lastIndexOf('.');
    const baseName = extIndex > 0 ? filename.slice(0, extIndex) : filename;
    const extension = extIndex > 0 ? filename.slice(extIndex) : '';

    while (folder.file(uniqueName)) {
      uniqueName = `${baseName}_${counter}${extension}`;
      counter++;
    }

    return uniqueName;
  }
}

export const downloader = new Downloader();
