import type { ExportFormat } from '@/types';

interface FormatSelectorProps {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
  disabled?: boolean;
}

const formats: { value: ExportFormat; label: string; description: string }[] = [
  {
    value: 'markdown',
    label: 'Markdown',
    description: '适合阅读和存档',
  },
  {
    value: 'json',
    label: 'JSON',
    description: '适合二次处理',
  },
];

export function FormatSelector({ value, onChange, disabled }: FormatSelectorProps) {
  return (
    <div className="space-y-2">
      {formats.map((format) => (
        <label
          key={format.value}
          className={`flex items-start p-2 border rounded cursor-pointer transition-colors ${
            value === format.value
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="radio"
            name="format"
            value={format.value}
            checked={value === format.value}
            onChange={() => onChange(format.value)}
            disabled={disabled}
            className="mt-0.5 mr-2"
          />
          <div>
            <div className="font-medium text-sm">{format.label}</div>
            <div className="text-xs text-gray-500">{format.description}</div>
          </div>
        </label>
      ))}
    </div>
  );
}
