import { useEffect, useState } from 'react';
import { adapterRegistry } from '@/adapters';
import { Exporter } from '@/core';
import { useExportStore } from '@/stores/exportStore';
import { DateRangePicker } from '@/components/DateRangePicker';
import { FormatSelector } from '@/components/FormatSelector';
import { ExportProgress } from '@/components/ExportProgress';
import type { ExportProgress as ExportProgressType } from '@/types';

function App() {
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exporter, setExporter] = useState<Exporter | null>(null);
  
  const {
    dateRange,
    format,
    progress,
    setDateRange,
    setFormat,
    setProgress,
  } = useExportStore();

  // 检测当前平台
  useEffect(() => {
    const adapter = adapterRegistry.detect();
    if (adapter) {
      setDetectedPlatform(adapter.name);
    }
  }, []);

  const handleExport = async () => {
    const adapter = adapterRegistry.detect();
    if (!adapter) {
      setProgress({
        current: 0,
        total: 0,
        status: 'error',
        message: '未检测到支持的平台，请在 DeepSeek 或 ChatGPT 页面使用',
      });
      return;
    }

    setIsExporting(true);
    
    const exp = new Exporter(adapter, (p: ExportProgressType) => {
      setProgress(p);
    });
    
    setExporter(exp);
    await exp.export(dateRange, format);
    setIsExporting(false);
    setExporter(null);
  };

  const handleCancel = () => {
    exporter?.cancel();
  };

  const isIdle = progress.status === 'idle';
  const isCompleted = progress.status === 'completed';
  const isError = progress.status === 'error';

  return (
    <div className="w-80 p-4 bg-white">
      <h1 className="text-lg font-bold mb-4 text-gray-800">
        对话批量导出
      </h1>

      {/* 平台检测 */}
      <div className="mb-4 p-2 bg-gray-50 rounded text-sm">
        {detectedPlatform ? (
          <span className="text-green-600">
            已检测到: {detectedPlatform}
          </span>
        ) : (
          <span className="text-orange-500">
            请在 DeepSeek 或 ChatGPT 页面使用
          </span>
        )}
      </div>

      {/* 日期范围选择 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          日期范围
        </label>
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          disabled={isExporting}
        />
      </div>

      {/* 格式选择 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          导出格式
        </label>
        <FormatSelector
          value={format}
          onChange={setFormat}
          disabled={isExporting}
        />
      </div>

      {/* 进度显示 */}
      {progress.status !== 'idle' && (
        <div className="mb-4">
          <ExportProgress progress={progress} />
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        {isExporting ? (
          <button
            onClick={handleCancel}
            className="flex-1 py-2 px-4 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            取消导出
          </button>
        ) : (
          <button
            onClick={handleExport}
            disabled={!detectedPlatform || isCompleted}
            className="flex-1 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isCompleted ? '导出完成' : '开始导出'}
          </button>
        )}
        
        {(isCompleted || isError) && (
          <button
            onClick={() => useExportStore.getState().reset()}
            className="py-2 px-4 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            重置
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
