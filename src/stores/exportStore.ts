import { create } from 'zustand';
import type { DateRange, ExportFormat, ExportProgress } from '@/types';

interface ExportState {
  // 导出选项
  dateRange: DateRange;
  format: ExportFormat;
  
  // 进度状态
  progress: ExportProgress;
  
  // 当前平台
  currentPlatform: string | null;
  
  // Actions
  setDateRange: (range: DateRange) => void;
  setFormat: (format: ExportFormat) => void;
  setProgress: (progress: ExportProgress) => void;
  setCurrentPlatform: (platform: string | null) => void;
  reset: () => void;
}

const initialState = {
  dateRange: {
    start: undefined,
    end: new Date(),
  },
  format: 'markdown' as ExportFormat,
  progress: {
    current: 0,
    total: 0,
    status: 'idle' as const,
  },
  currentPlatform: null,
};

export const useExportStore = create<ExportState>((set) => ({
  ...initialState,

  setDateRange: (range) => set({ dateRange: range }),
  
  setFormat: (format) => set({ format }),
  
  setProgress: (progress) => set({ progress }),
  
  setCurrentPlatform: (platform) => set({ currentPlatform: platform }),
  
  reset: () => set(initialState),
}));
