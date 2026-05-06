import { formatDate, parseDate } from '@/utils/date';
import type { DateRange } from '@/types';

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  disabled?: boolean;
}

export function DateRangePicker({ value, onChange, disabled }: DateRangePickerProps) {
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = parseDate(e.target.value);
    onChange({ ...value, start: date || undefined });
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = parseDate(e.target.value);
    onChange({ ...value, end: date || undefined });
  };

  const setPreset = (days: number | 'all') => {
    if (days === 'all') {
      onChange({ start: undefined, end: new Date() });
    } else {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      onChange({ start, end });
    }
  };

  return (
    <div className="space-y-2">
      {/* 快捷选项 */}
      <div className="flex flex-wrap gap-1">
        {[
          { label: '全部', value: 'all' as const },
          { label: '最近7天', value: 7 },
          { label: '最近30天', value: 30 },
          { label: '最近90天', value: 90 },
        ].map((preset) => (
          <button
            key={preset.label}
            onClick={() => setPreset(preset.value)}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* 日期输入 */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value.start ? formatDate(value.start) : ''}
          onChange={handleStartChange}
          disabled={disabled}
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
          placeholder="开始日期"
        />
        <span className="text-gray-500">至</span>
        <input
          type="date"
          value={value.end ? formatDate(value.end) : ''}
          onChange={handleEndChange}
          disabled={disabled}
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
          placeholder="结束日期"
        />
      </div>
    </div>
  );
}
