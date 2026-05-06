import type { ExportProgress as ExportProgressType } from '@/types';

interface ExportProgressProps {
  progress: ExportProgressType;
}

const statusMap: Record<ExportProgressType['status'], { label: string; color: string }> = {
  idle: { label: '等待中', color: 'gray' },
  fetching_list: { label: '获取列表', color: 'blue' },
  fetching_detail: { label: '获取详情', color: 'blue' },
  formatting: { label: '格式化', color: 'yellow' },
  packaging: { label: '打包中', color: 'purple' },
  completed: { label: '已完成', color: 'green' },
  error: { label: '出错了', color: 'red' },
};

export function ExportProgress({ progress }: ExportProgressProps) {
  const status = statusMap[progress.status];
  const percentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  const colorClasses: Record<string, string> = {
    gray: 'bg-gray-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };

  return (
    <div className="p-3 bg-gray-50 rounded">
      {/* 状态标签 */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium text-${status.color}-600`}>
          {status.label}
        </span>
        {progress.total > 0 && (
          <span className="text-sm text-gray-500">
            {progress.current} / {progress.total}
          </span>
        )}
      </div>

      {/* 进度条 */}
      {progress.total > 0 && (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorClasses[status.color]} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {/* 消息 */}
      {progress.message && (
        <p className="mt-2 text-xs text-gray-600">{progress.message}</p>
      )}
    </div>
  );
}
