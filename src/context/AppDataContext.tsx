import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type {
  ManufacturerDTO,
  PrinterModelDTO,
  ImageAssetDTO,
  DiagnosticCategoryDTO,
  DiagnosticQuestionDTO,
  DiagnosticCauseDTO,
  RepairGuideDTO,
  MaterialReferenceDTO,
  ErrorCodeDTO,
  MaintenanceItemDTO,
} from '../types/domain.ts';

export interface CoverageCounts {
  manufacturersTotal: number;
  manufacturersWithSeededModels: number;
  manufacturersAwaitingModelImport: number;
  modelsTotal: number;
  fdmModels: number;
  resinModels: number;
  verifiedSpecModels: number;
  partialOrUnverifiedModels: number;
  repairGuidesTotal: number;
  errorCodesTotal: number;
  materialsTotal: number;
  pendingModelRequests: number;
  recordedOutcomes: number;
  guideFeedbackTotal?: number;
  flaggedGuideStepsTotal?: number;
  activeSavedSessionsTotal?: number;
}

export interface BootstrapPayload {
  manufacturers: ManufacturerDTO[];
  models: PrinterModelDTO[];
  images: ImageAssetDTO[];
  diagnostics: {
    categories: DiagnosticCategoryDTO[];
    questions: DiagnosticQuestionDTO[];
    causes: DiagnosticCauseDTO[];
  };
  guides: RepairGuideDTO[];
  materials: MaterialReferenceDTO[];
  errorCodes: ErrorCodeDTO[];
  maintenance: MaintenanceItemDTO[];
  coverageCounts: CoverageCounts;
}

interface AppDataContextValue {
  data: BootstrapPayload | null;
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  getImageById: (id: string | null | undefined) => ImageAssetDTO | null;
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/bootstrap');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const json: BootstrapPayload = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load reference data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const getImageById = useCallback(
    (id: string | null | undefined): ImageAssetDTO | null => {
      if (!id || !data) return null;
      return data.images.find((i) => i.id === id) || null;
    },
    [data]
  );

  return (
    <AppDataContext.Provider value={{ data, loading, error, refreshData, getImageById }}>
      {children}
    </AppDataContext.Provider>
  );
};

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
