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

      const [json, loadedViaFallback] = await (async (): Promise<[BootstrapPayload, boolean]> => {
        // Attempt 1: Dynamic API endpoint
        try {
          const res = await fetch('/api/bootstrap');
          if (res.ok) {
            const parsed = await res.json();
            if (parsed && Array.isArray(parsed.models) && parsed.models.length > 0) {
              return [parsed, false];
            }
          }
        } catch {
          // Continue to static file attempt
        }

        // Attempt 2: Pre-rendered static JSON endpoint
        try {
          const staticRes = await fetch('/api/bootstrap.json');
          if (staticRes.ok) {
            const parsed = await staticRes.json();
            if (parsed && Array.isArray(parsed.models) && parsed.models.length > 0) {
              return [parsed, false];
            }
          }
        } catch {
          // Continue to bundled static seed fallback
        }

        // Attempt 3: Immediate zero-latency bundled client catalog
        const { getStaticBootstrapPayload } = await import('../data/staticBootstrap.ts');
        return [getStaticBootstrapPayload(), true];
      })();

      if (loadedViaFallback) {
        console.info('[FixMyPrint] Loaded verified 3D printer catalog via embedded client bundle.');
      }
      setData(json);
      setError(null);
    } catch (err: unknown) {
      console.error('[FixMyPrint] Failed to initialize catalog:', err);
      try {
        const { getStaticBootstrapPayload } = await import('../data/staticBootstrap.ts');
        setData(getStaticBootstrapPayload());
        setError(null);
      } catch (innerErr: unknown) {
        setError(innerErr instanceof Error ? innerErr.message : 'Unable to load reference data.');
      }
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
