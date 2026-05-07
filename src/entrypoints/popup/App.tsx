import { useEffect, useState } from 'react';
import { adapterRegistry } from '@/adapters';
import { Exporter } from '@/core';
import { useExportStore } from '@/stores/exportStore';
import type { ExportProgress as ExportProgressType, ExportFormat, DateRange } from '@/types';

const styles = {
  container: {
    width: 360,
    padding: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #e5e7eb',
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#111827',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500 as const,
    marginBottom: 16,
  },
  badgeSuccess: {
    backgroundColor: '#ecfdf5',
    color: '#059669',
    border: '1px solid #a7f3d0',
  },
  badgeError: {
    backgroundColor: '#fff7ed',
    color: '#ea580c',
    border: '1px solid #fed7aa',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  section: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600 as const,
    color: '#374151',
    marginBottom: 8,
  },
  presetRow: {
    display: 'flex',
    gap: 6,
    marginBottom: 8,
  },
  presetBtn: {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid #d1d5db',
    backgroundColor: '#f9fafb',
    color: '#374151',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  presetBtnActive: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    borderColor: '#3b82f6',
  },
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    padding: '6px 8px',
    fontSize: 13,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    color: '#374151',
  },
  dateSep: {
    color: '#9ca3af',
    fontSize: 13,
  },
  formatCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    border: '2px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginBottom: 6,
  },
  formatCardActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  formatRadio: {
    width: 16,
    height: 16,
    accentColor: '#3b82f6',
  },
  formatLabel: {
    fontWeight: 600 as const,
    fontSize: 13,
    color: '#111827',
  },
  formatDesc: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  progressBox: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    marginBottom: 16,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressStatus: {
    fontSize: 13,
    fontWeight: 600 as const,
  },
  progressCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  progressMsg: {
    marginTop: 8,
    fontSize: 11,
    color: '#6b7280',
  },
  btnPrimary: {
    flex: 1,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600 as const,
    color: '#ffffff',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  btnPrimaryDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed' as const,
  },
  btnDanger: {
    flex: 1,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600 as const,
    color: '#ffffff',
    backgroundColor: '#ef4444',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 500 as const,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
  },
  btnRow: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
};

function DateRangePicker({ value, onChange, disabled }: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  disabled?: boolean;
}) {
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

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

  const isAllActive = !value.start;
  const activePreset = value.start
    ? [7, 30, 90].find(d => {
        const diff = (value.end!.getTime() - value.start.getTime()) / (1000 * 60 * 60 * 24);
        return Math.abs(diff - d) < 1;
      })
    : null;

  return (
    <div>
      <div style={styles.presetRow}>
        {[
          { label: '全部', value: 'all' as const },
          { label: '7天', value: 7 },
          { label: '30天', value: 30 },
          { label: '90天', value: 90 },
        ].map((preset) => {
          const isActive = preset.value === 'all' ? isAllActive : activePreset === preset.value;
          return (
            <button
              key={preset.label}
              onClick={() => setPreset(preset.value)}
              disabled={disabled}
              style={{
                ...styles.presetBtn,
                ...(isActive ? styles.presetBtnActive : {}),
                ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div style={styles.dateRow}>
        <input
          type="date"
          value={value.start ? formatDate(value.start) : ''}
          onChange={(e) => onChange({ ...value, start: e.target.value ? new Date(e.target.value) : undefined })}
          disabled={disabled}
          style={styles.dateInput}
        />
        <span style={styles.dateSep}>至</span>
        <input
          type="date"
          value={value.end ? formatDate(value.end) : ''}
          onChange={(e) => onChange({ ...value, end: e.target.value ? new Date(e.target.value) : undefined })}
          disabled={disabled}
          style={styles.dateInput}
        />
      </div>
    </div>
  );
}

function FormatSelector({ value, onChange, disabled }: {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
  disabled?: boolean;
}) {
  const formats = [
    { value: 'markdown' as const, label: 'Markdown', desc: '适合阅读和存档' },
    { value: 'json' as const, label: 'JSON', desc: '适合二次处理' },
  ];

  return (
    <div>
      {formats.map((f) => (
        <div
          key={f.value}
          onClick={() => !disabled && onChange(f.value)}
          style={{
            ...styles.formatCard,
            ...(value === f.value ? styles.formatCardActive : {}),
            ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
          }}
        >
          <input
            type="radio"
            checked={value === f.value}
            onChange={() => !disabled && onChange(f.value)}
            disabled={disabled}
            style={styles.formatRadio}
          />
          <div>
            <div style={styles.formatLabel}>{f.label}</div>
            <div style={styles.formatDesc}>{f.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExportProgressView({ progress }: { progress: ExportProgressType }) {
  const statusMap: Record<string, { label: string; color: string }> = {
    idle: { label: '等待中', color: '#6b7280' },
    fetching_list: { label: '正在获取对话列表...', color: '#3b82f6' },
    fetching_detail: { label: '正在获取对话详情...', color: '#3b82f6' },
    formatting: { label: '正在格式化...', color: '#f59e0b' },
    packaging: { label: '正在打包...', color: '#8b5cf6' },
    completed: { label: '导出完成!', color: '#10b981' },
    error: { label: '导出失败', color: '#ef4444' },
  };

  const status = statusMap[progress.status] || statusMap.idle;
  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={styles.progressBox}>
      <div style={styles.progressHeader}>
        <span style={{ ...styles.progressStatus, color: status.color }}>{status.label}</span>
        {progress.total > 0 && (
          <span style={styles.progressCount}>{progress.current} / {progress.total} ({percentage}%)</span>
        )}
      </div>
      {progress.total > 0 && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${percentage}%`, backgroundColor: status.color }} />
        </div>
      )}
      {progress.message && <p style={styles.progressMsg}>{progress.message}</p>}
    </div>
  );
}

function App() {
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
  const [detectedAdapterId, setDetectedAdapterId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exporter, setExporter] = useState<Exporter | null>(null);

  const { dateRange, format, progress, setDateRange, setFormat, setProgress } = useExportStore();

  useEffect(() => {
    // popup 中 window.location 是 chrome-extension://，无法直接用 isMatch()
    // 需要通过 chrome.tabs API 获取当前活动标签页的 URL 来检测
    const detectPlatform = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          const adapter = adapterRegistry.detectByUrl(tab.url);
          if (adapter) {
            setDetectedPlatform(adapter.name);
            setDetectedAdapterId(adapter.id);
            return;
          }
        }
      } catch {
        // fallback: 尝试直接检测（content script 上下文）
        const adapter = adapterRegistry.detect();
        if (adapter) {
          setDetectedPlatform(adapter.name);
          setDetectedAdapterId(adapter.id);
          return;
        }
      }
      setDetectedPlatform(null);
      setDetectedAdapterId(null);
    };
    detectPlatform();
  }, []);

  const handleExport = async () => {
    // 优先使用已检测到的适配器 ID，再 fallback 到 detect()
    const adapter = detectedAdapterId
      ? adapterRegistry.get(detectedAdapterId) ?? null
      : adapterRegistry.detect();
    if (!adapter) {
      setProgress({ current: 0, total: 0, status: 'error', message: '未检测到支持的平台' });
      return;
    }
    setIsExporting(true);
    const exp = new Exporter(adapter, (p: ExportProgressType) => setProgress(p));
    setExporter(exp);
    try {
      await exp.export(dateRange, format);
    } catch (err) {
      setProgress({ current: 0, total: 0, status: 'error', message: String(err) });
    } finally {
      // 确保无论成功失败，状态都会重置
      setIsExporting(false);
      setExporter(null);
    }
  };

  const isIdle = progress.status === 'idle';
  const isCompleted = progress.status === 'completed';
  const isError = progress.status === 'error';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>E</div>
        <span style={styles.headerTitle}>对话批量导出</span>
      </div>

      {/* Platform Badge */}
      <div
        style={{
          ...styles.badge,
          ...(detectedPlatform ? styles.badgeSuccess : styles.badgeError),
        }}
      >
        <div
          style={{
            ...styles.badgeDot,
            backgroundColor: detectedPlatform ? '#10b981' : '#f97316',
          }}
        />
        {detectedPlatform ? `已连接 ${detectedPlatform}` : '请在 DeepSeek、ChatGPT、Kimi 或千问页面使用'}
      </div>

      {/* Date Range */}
      <div style={styles.section}>
        <label style={styles.label}>日期范围</label>
        <DateRangePicker value={dateRange} onChange={setDateRange} disabled={isExporting} />
      </div>

      {/* Format */}
      <div style={styles.section}>
        <label style={styles.label}>导出格式</label>
        <FormatSelector value={format} onChange={setFormat} disabled={isExporting} />
      </div>

      {/* Progress */}
      {!isIdle && <ExportProgressView progress={progress} />}

      {/* Buttons */}
      <div style={styles.btnRow}>
        {isExporting ? (
          <button onClick={() => exporter?.cancel()} style={styles.btnDanger}>
            取消导出
          </button>
        ) : (
          <button
            onClick={handleExport}
            disabled={!detectedPlatform || isCompleted}
            style={{
              ...styles.btnPrimary,
              ...((!detectedPlatform || isCompleted) ? styles.btnPrimaryDisabled : {}),
            }}
          >
            {isCompleted ? '导出完成' : '开始导出'}
          </button>
        )}
        {(isCompleted || isError) && (
          <button onClick={() => useExportStore.getState().reset()} style={styles.btnSecondary}>
            重置
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
