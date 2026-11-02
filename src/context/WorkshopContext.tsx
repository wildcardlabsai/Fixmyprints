import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X, Wrench, Star, Trash2, CheckCircle2, Clock, Plus } from 'lucide-react';
import { useAppData } from './AppDataContext.tsx';
import { PrinterSilhouette } from '../components/PrinterSilhouette.tsx';

const WORKSHOP_STORAGE_KEY = 'fixmyprint_workshop_v1';

export interface WorkshopPrinterEntry {
  slug: string;
  addedAt: string;
  isPrimary: boolean;
  preferredMaterialCode: string;
  printHours: number;
}

export interface MaintenanceCompletionRecord {
  procedureId: string;
  printerSlug: string; // 'ALL' or specific model slug
  lastCompletedDate: string; // YYYY-MM-DD
  printHoursAtCompletion: number | null;
  notes?: string;
}

interface PersistedWorkshopState {
  printers: WorkshopPrinterEntry[];
  maintenanceLogs: Record<string, MaintenanceCompletionRecord>;
}

interface WorkshopContextValue {
  workshopPrinters: WorkshopPrinterEntry[];
  primaryPrinter: WorkshopPrinterEntry | null;
  maintenanceLogs: Record<string, MaintenanceCompletionRecord>;
  isPinned: (slug: string) => boolean;
  toggleWorkshopPrinter: (slug: string, defaultMaterialCode?: string) => void;
  setPrimaryWorkshopPrinter: (slug: string) => void;
  updateWorkshopPrinter: (
    slug: string,
    patch: Partial<Pick<WorkshopPrinterEntry, 'preferredMaterialCode' | 'printHours'>>
  ) => void;
  logMaintenanceCompleted: (
    procedureId: string,
    printerSlug?: string,
    notes?: string
  ) => void;
  clearMaintenanceLog: (procedureId: string, printerSlug?: string) => void;
  getMaintenanceRecord: (
    procedureId: string,
    printerSlug?: string
  ) => MaintenanceCompletionRecord | null;
  openWorkshopModal: () => void;
  closeWorkshopModal: () => void;
}

const WorkshopContext = createContext<WorkshopContextValue | undefined>(undefined);

function makeMaintKey(procedureId: string, printerSlug: string = 'ALL'): string {
  return `${procedureId}::${printerSlug || 'ALL'}`;
}

function readPersistedWorkshop(): PersistedWorkshopState {
  try {
    const raw = localStorage.getItem(WORKSHOP_STORAGE_KEY);
    if (!raw) return { printers: [], maintenanceLogs: {} };
    const parsed = JSON.parse(raw);
    const printers = Array.isArray(parsed?.printers)
      ? parsed.printers.filter((p: unknown) => Boolean(p && typeof (p as WorkshopPrinterEntry).slug === 'string'))
      : [];
    const maintenanceLogs =
      parsed?.maintenanceLogs && typeof parsed.maintenanceLogs === 'object'
        ? parsed.maintenanceLogs
        : {};
    return { printers, maintenanceLogs };
  } catch {
    return { printers: [], maintenanceLogs: {} };
  }
}

function writePersistedWorkshop(state: PersistedWorkshopState) {
  try {
    localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

export const WorkshopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useAppData();
  const [state, setState] = useState<PersistedWorkshopState>(() => readPersistedWorkshop());
  const [modalOpen, setModalOpen] = useState(false);
  const [quickAddSlug, setQuickAddSlug] = useState('');

  const isPinned = useCallback(
    (slug: string) => state.printers.some((p) => p.slug === slug),
    [state.printers]
  );

  const primaryPrinter = useMemo(() => {
    if (state.printers.length === 0) return null;
    return state.printers.find((p) => p.isPrimary) || state.printers[0];
  }, [state.printers]);

  const toggleWorkshopPrinter = useCallback(
    (slug: string, defaultMaterialCode?: string) => {
      setState((prev) => {
        const exists = prev.printers.some((p) => p.slug === slug);
        let nextPrinters: WorkshopPrinterEntry[];
        if (exists) {
          nextPrinters = prev.printers.filter((p) => p.slug !== slug);
          if (nextPrinters.length > 0 && !nextPrinters.some((p) => p.isPrimary)) {
            nextPrinters[0] = { ...nextPrinters[0], isPrimary: true };
          }
        } else {
          const model = data?.models.find((m) => m.slug === slug);
          const inferredMat =
            defaultMaterialCode || (model?.technology === 'RESIN' ? 'RESIN_STD_ABS' : 'PLA');
          const entry: WorkshopPrinterEntry = {
            slug,
            addedAt: new Date().toISOString().slice(0, 10),
            isPrimary: prev.printers.length === 0,
            preferredMaterialCode: inferredMat,
            printHours: 0,
          };
          nextPrinters = [...prev.printers, entry];
        }
        const next = { ...prev, printers: nextPrinters };
        writePersistedWorkshop(next);
        return next;
      });
    },
    [data]
  );

  const setPrimaryWorkshopPrinter = useCallback((slug: string) => {
    setState((prev) => {
      const nextPrinters = prev.printers.map((p) => ({
        ...p,
        isPrimary: p.slug === slug,
      }));
      const next = { ...prev, printers: nextPrinters };
      writePersistedWorkshop(next);
      return next;
    });
  }, []);

  const updateWorkshopPrinter = useCallback(
    (
      slug: string,
      patch: Partial<Pick<WorkshopPrinterEntry, 'preferredMaterialCode' | 'printHours'>>
    ) => {
      setState((prev) => {
        const nextPrinters = prev.printers.map((p) =>
          p.slug === slug ? { ...p, ...patch } : p
        );
        const next = { ...prev, printers: nextPrinters };
        writePersistedWorkshop(next);
        return next;
      });
    },
    []
  );

  const logMaintenanceCompleted = useCallback(
    (procedureId: string, printerSlug: string = 'ALL', notes?: string) => {
      setState((prev) => {
        const key = makeMaintKey(procedureId, printerSlug);
        const matchedPrinter = prev.printers.find((p) => p.slug === printerSlug);
        const record: MaintenanceCompletionRecord = {
          procedureId,
          printerSlug: printerSlug || 'ALL',
          lastCompletedDate: new Date().toISOString().slice(0, 10),
          printHoursAtCompletion: matchedPrinter ? matchedPrinter.printHours : null,
          notes: notes?.trim() || undefined,
        };
        const next = {
          ...prev,
          maintenanceLogs: {
            ...prev.maintenanceLogs,
            [key]: record,
          },
        };
        writePersistedWorkshop(next);
        return next;
      });
    },
    []
  );

  const clearMaintenanceLog = useCallback(
    (procedureId: string, printerSlug: string = 'ALL') => {
      setState((prev) => {
        const key = makeMaintKey(procedureId, printerSlug);
        const copy = { ...prev.maintenanceLogs };
        delete copy[key];
        const next = { ...prev, maintenanceLogs: copy };
        writePersistedWorkshop(next);
        return next;
      });
    },
    []
  );

  const getMaintenanceRecord = useCallback(
    (procedureId: string, printerSlug: string = 'ALL'): MaintenanceCompletionRecord | null => {
      const exact = state.maintenanceLogs[makeMaintKey(procedureId, printerSlug)];
      if (exact) return exact;
      if (printerSlug !== 'ALL') {
        return state.maintenanceLogs[makeMaintKey(procedureId, 'ALL')] || null;
      }
      return null;
    },
    [state.maintenanceLogs]
  );

  const openWorkshopModal = useCallback(() => setModalOpen(true), []);
  const closeWorkshopModal = useCallback(() => setModalOpen(false), []);

  const value = useMemo<WorkshopContextValue>(
    () => ({
      workshopPrinters: state.printers,
      primaryPrinter,
      maintenanceLogs: state.maintenanceLogs,
      isPinned,
      toggleWorkshopPrinter,
      setPrimaryWorkshopPrinter,
      updateWorkshopPrinter,
      logMaintenanceCompleted,
      clearMaintenanceLog,
      getMaintenanceRecord,
      openWorkshopModal,
      closeWorkshopModal,
    }),
    [
      state.printers,
      primaryPrinter,
      state.maintenanceLogs,
      isPinned,
      toggleWorkshopPrinter,
      setPrimaryWorkshopPrinter,
      updateWorkshopPrinter,
      logMaintenanceCompleted,
      clearMaintenanceLog,
      getMaintenanceRecord,
      openWorkshopModal,
      closeWorkshopModal,
    ]
  );

  const availableToAdd = useMemo(() => {
    if (!data) return [];
    return data.models.filter((m) => !state.printers.some((p) => p.slug === m.slug));
  }, [data, state.printers]);

  const totalMaintenanceCount = Object.keys(state.maintenanceLogs).length;

  return (
    <WorkshopContext.Provider value={value}>
      {children}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="My Workshop Garage and Maintenance Log"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs print:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-xl p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  My Workshop ({state.printers.length} {state.printers.length === 1 ? 'Printer' : 'Printers'})
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Pin the printers you own for 1-click pre-selected diagnostics, default filament profiles, and preventive maintenance tracking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close My Workshop"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Add Printer */}
            {data && availableToAdd.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2.5 p-3.5 rounded-xl bg-[#f6f9fc] border border-slate-200/80">
                <select
                  value={quickAddSlug}
                  onChange={(e) => setQuickAddSlug(e.target.value)}
                  aria-label="Select a verified printer to add to My Workshop"
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Add a verified printer to your workshop...</option>
                  {availableToAdd.map((m) => (
                    <option key={m.id} value={m.slug}>
                      {m.name} ({m.manufacturerName} · {m.technology})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!quickAddSlug}
                  onClick={() => {
                    if (!quickAddSlug) return;
                    toggleWorkshopPrinter(quickAddSlug);
                    setQuickAddSlug('');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Pin to Workshop</span>
                </button>
              </div>
            )}

            {/* Pinned Printers List */}
            {state.printers.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 space-y-2">
                <p className="text-sm font-semibold text-slate-900">No printers pinned yet</p>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Select your printer above or click <strong>Pin to Workshop</strong> on any card in the Printer Library. Your primary machine will automatically pre-load when diagnosing problems.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {state.printers.map((entry) => {
                  const model = data?.models.find((m) => m.slug === entry.slug);
                  if (!model) return null;
                  const compatibleMats =
                    data?.materials.filter((mat) => mat.technology === model.technology) || [];

                  return (
                    <div
                      key={entry.slug}
                      className={`p-4 rounded-xl border transition-colors space-y-3 ${
                        entry.isPrimary
                          ? 'border-blue-300 bg-blue-50/30'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-white border border-slate-200 shrink-0">
                            <PrinterSilhouette model={model} className="w-10 h-10" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/printers/${model.slug}`}
                                onClick={() => setModalOpen(false)}
                                className="text-sm font-bold text-slate-950 hover:text-blue-600 truncate"
                              >
                                {model.name}
                              </Link>
                              {entry.isPrimary && (
                                <span className="text-[11px] font-semibold text-blue-700">
                                  · Primary Bench Printer
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {model.manufacturerName} · {model.technology}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {!entry.isPrimary && (
                            <button
                              type="button"
                              onClick={() => setPrimaryWorkshopPrinter(entry.slug)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                            >
                              <Star className="w-3.5 h-3.5" />
                              <span>Set Primary</span>
                            </button>
                          )}
                          <Link
                            to={`/diagnose?printer=${model.slug}`}
                            onClick={() => setModalOpen(false)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>Diagnose</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleWorkshopPrinter(entry.slug)}
                            aria-label={`Remove ${model.name} from My Workshop`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/70 text-xs">
                        <div>
                          <label
                            htmlFor={`ws-mat-${entry.slug}`}
                            className="block text-[11px] font-semibold text-slate-600 mb-1"
                          >
                            Preferred Default Material
                          </label>
                          <select
                            id={`ws-mat-${entry.slug}`}
                            value={entry.preferredMaterialCode}
                            onChange={(e) =>
                              updateWorkshopPrinter(entry.slug, {
                                preferredMaterialCode: e.target.value,
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs"
                          >
                            {compatibleMats.map((m) => (
                              <option key={m.id} value={m.code}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`ws-hrs-${entry.slug}`}
                            className="block text-[11px] font-semibold text-slate-600 mb-1"
                          >
                            Logged Print Hours (for Maintenance)
                          </label>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                              id={`ws-hrs-${entry.slug}`}
                              type="number"
                              min={0}
                              max={99999}
                              value={entry.printHours}
                              onChange={(e) =>
                                updateWorkshopPrinter(entry.slug, {
                                  printHours: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs tabular-nums"
                            />
                            <span className="text-slate-500 shrink-0">hrs</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer Link to Maintenance Log */}
            <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <p className="text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong className="text-slate-900 tabular-nums">{totalMaintenanceCount}</strong>{' '}
                  completed maintenance {totalMaintenanceCount === 1 ? 'task' : 'tasks'} logged in browser storage.
                </span>
              </p>
              <Link
                to="/reference?tab=maintenance"
                onClick={() => setModalOpen(false)}
                className="font-semibold text-blue-600 hover:underline"
              >
                Open Preventive Maintenance Tracker →
              </Link>
            </div>
          </div>
        </div>
      )}
    </WorkshopContext.Provider>
  );
};

export function useWorkshop(): WorkshopContextValue {
  const ctx = useContext(WorkshopContext);
  if (!ctx) {
    throw new Error('useWorkshop must be used within a WorkshopProvider');
  }
  return ctx;
}
