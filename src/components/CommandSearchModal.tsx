import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Wrench,
  Cpu,
  AlertTriangle,
  Calculator,
  Layers,
  ArrowRight,
  Star,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useWorkshop } from '../context/WorkshopContext.tsx';

interface CommandItem {
  id: string;
  group: 'Workshop' | 'Printers' | 'Symptoms' | 'Repair Guides' | 'Error Codes' | 'Calculators' | 'Materials';
  title: string;
  subtitle: string;
  path: string;
}

interface CommandSearchModalProps {
  open: boolean;
  onClose: () => void;
}

function norm(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CALCULATOR_SHORTCUTS: CommandItem[] = [
  {
    id: 'calc-esteps',
    group: 'Calculators',
    title: 'Extruder E-Steps & Klipper rotation_distance Calculator',
    subtitle: 'Compute exact Marlin M92 E-steps or Klipper rotation_distance from a 100mm extrusion mark',
    path: '/reference?tab=calculators&calc=esteps',
  },
  {
    id: 'calc-flow',
    group: 'Calculators',
    title: 'OrcaSlicer / Bambu Studio / PrusaSlicer Flow Rate Calculator',
    subtitle: 'Pass 1 & Pass 2 chip modifiers, YOLO mode, and caliper single-wall thickness math',
    path: '/reference?tab=calculators&calc=flow',
  },
  {
    id: 'calc-resin',
    group: 'Calculators',
    title: 'MSLA Resin Exposure & Lift Speed Dial-In Helper',
    subtitle: 'Adjust normal exposure seconds and peel speed from calibration matrix / cone tests',
    path: '/reference?tab=calculators&calc=resin',
  },
];

export const CommandSearchModal: React.FC<CommandSearchModalProps> = ({ open, onClose }) => {
  const { data } = useAppData();
  const { workshopPrinters } = useWorkshop();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo<CommandItem[]>(() => {
    if (!data) return CALCULATOR_SHORTCUTS;
    const q = norm(query);
    const rawLower = query.trim().toLowerCase();

    if (!q) {
      const pinned: CommandItem[] = [];
      for (const wp of workshopPrinters) {
        const m = data.models.find((mod) => mod.slug === wp.slug);
        if (m) {
          pinned.push({
            id: `ws-${m.slug}`,
            group: 'Workshop',
            title: `Diagnose ${m.name}`,
            subtitle: `${m.manufacturerName} · My Workshop${wp.isPrimary ? ' (Primary)' : ''}`,
            path: `/diagnose?printer=${m.slug}`,
          });
        }
      }

      const popularModels: CommandItem[] = data.models.slice(0, 4).map((m) => ({
        id: `mod-${m.id}`,
        group: 'Printers',
        title: m.name,
        subtitle: `${m.manufacturerName} · ${m.technology} Hardware Profile`,
        path: `/printers/${m.slug}`,
      }));

      return [...pinned, ...CALCULATOR_SHORTCUTS, ...popularModels];
    }

    const matchedPrinters: CommandItem[] = data.models
      .filter((m) => norm(`${m.name} ${m.manufacturerName || ''} ${m.family}`).includes(q))
      .slice(0, 6)
      .map((m) => ({
        id: `mod-${m.id}`,
        group: 'Printers',
        title: m.name,
        subtitle: `${m.manufacturerName} · ${m.technology} · Specs & Diagnostics`,
        path: `/printers/${m.slug}`,
      }));

    const matchedSymptoms: CommandItem[] = data.diagnostics.categories
      .filter((c) => norm(`${c.title} ${c.shortDescription}`).includes(q))
      .slice(0, 4)
      .map((c) => ({
        id: `cat-${c.id}`,
        group: 'Symptoms',
        title: c.title,
        subtitle: `${c.technology} Diagnostic Workflow · ${c.shortDescription}`,
        path: `/diagnose?category=${c.slug}`,
      }));

    const matchedGuides: CommandItem[] = data.guides
      .filter((g) => norm(`${g.title} ${g.symptoms.join(' ')}`).includes(q))
      .slice(0, 5)
      .map((g) => ({
        id: `guide-${g.id}`,
        group: 'Repair Guides',
        title: g.title,
        subtitle: `${g.technology} · ${g.difficulty} · ${g.steps.length} steps`,
        path: `/guides/${g.slug}`,
      }));

    const matchedErrors: CommandItem[] = data.errorCodes
      .filter(
        (e) =>
          e.code.toLowerCase().includes(rawLower) ||
          norm(`${e.code} ${e.verifiedMeaning} ${e.manufacturerName || ''}`).includes(q)
      )
      .slice(0, 5)
      .map((e) => ({
        id: `err-${e.id}`,
        group: 'Error Codes',
        title: `${e.code} — ${e.verifiedMeaning}`,
        subtitle: `${e.manufacturerName} · ${e.firmwareContext}`,
        path: `/reference?code=${encodeURIComponent(e.code)}`,
      }));

    const matchedCalcs = CALCULATOR_SHORTCUTS.filter((c) =>
      norm(`${c.title} ${c.subtitle} esteps rotation distance flow extrusion multiplier exposure`).includes(q)
    );

    const matchedMaterials: CommandItem[] = data.materials
      .filter((mat) =>
        norm(`${mat.name} ${mat.code} ${mat.category} ${mat.hardwareCompatibilityNotes}`).includes(q)
      )
      .slice(0, 3)
      .map((mat) => ({
        id: `mat-${mat.id}`,
        group: 'Materials',
        title: mat.name,
        subtitle: `${mat.technology} · ${mat.category}`,
        path: '/materials',
      }));

    return [
      ...matchedErrors,
      ...matchedPrinters,
      ...matchedSymptoms,
      ...matchedGuides,
      ...matchedCalcs,
      ...matchedMaterials,
    ];
  }, [data, query, workshopPrinters]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (results.length > 0 ? (i + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) =>
          results.length > 0 ? (i - 1 + results.length) % results.length : 0
        );
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        const target = results[activeIndex];
        onClose();
        navigate(target.path);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, results, activeIndex, navigate, onClose]);

  if (!open) return null;

  function renderIcon(group: CommandItem['group']) {
    switch (group) {
      case 'Workshop':
        return <Star className="w-4 h-4 text-slate-500 shrink-0" />;
      case 'Printers':
        return <Cpu className="w-4 h-4 text-slate-500 shrink-0" />;
      case 'Symptoms':
        return <Wrench className="w-4 h-4 text-slate-500 shrink-0" />;
      case 'Repair Guides':
        return <Wrench className="w-4 h-4 text-slate-500 shrink-0" />;
      case 'Error Codes':
        return <AlertTriangle className="w-4 h-4 text-slate-500 shrink-0" />;
      case 'Calculators':
        return <Calculator className="w-4 h-4 text-slate-500 shrink-0" />;
      case 'Materials':
        return <Layers className="w-4 h-4 text-slate-500 shrink-0" />;
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick search across printers, symptoms, repair guides, error codes, and calculators"
      className="fixed inset-0 z-50 flex items-start justify-center pt-14 sm:pt-20 px-4 bg-slate-950/50 backdrop-blur-xs print:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to printer, error code (e.g. #13101, 0300-8008), symptom, guide, or calculator..."
            aria-label="Global quick search"
            className="flex-1 text-sm sm:text-base text-slate-950 placeholder:text-slate-400 bg-transparent focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick search"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[62vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                No direct match for “{query}”
              </p>
              <p className="text-xs text-slate-500">
                Try a printer model (e.g. P1S, Ender 3, MK4S), error code, or open the visual diagnostic wizard.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/diagnose');
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <span>Open Visual Diagnostic Wizard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <ul role="listbox" className="space-y-1">
              {results.map((item, idx) => {
                const selected = idx === activeIndex;
                return (
                  <li key={item.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        onClose();
                        navigate(item.path);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-lg flex items-center justify-between gap-3 transition-colors ${
                        selected ? 'bg-slate-100 text-slate-950' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5">{renderIcon(item.group)}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950 truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {item.group} · {item.subtitle}
                          </p>
                        </div>
                      </div>
                      <ArrowRight
                        className={`w-4 h-4 shrink-0 transition-opacity ${
                          selected ? 'text-blue-600 opacity-100' : 'opacity-0'
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Keyboard Shortcut Legend */}
        <div className="px-4 py-2.5 bg-[#f6f9fc] border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            <strong className="text-slate-700">↑↓</strong> Navigate ·{' '}
            <strong className="text-slate-700">Enter</strong> Open ·{' '}
            <strong className="text-slate-700">Esc</strong> Close
          </span>
          <span>FixMyPrint Workbench Search</span>
        </div>
      </div>
    </div>
  );
};
