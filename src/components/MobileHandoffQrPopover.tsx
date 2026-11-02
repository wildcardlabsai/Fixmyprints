import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Copy, Check, X } from 'lucide-react';

interface MobileHandoffQrPopoverProps {
  url: string;
  title: string;
  subtitle?: string;
  buttonLabel?: string;
  compact?: boolean;
}

export const MobileHandoffQrPopover: React.FC<MobileHandoffQrPopoverProps> = ({
  url,
  title,
  subtitle = 'Scan with your phone camera to open this exact page at your printer workbench.',
  buttonLabel = 'Continue on Phone',
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !url) return;
    let active = true;
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: 176,
      color: {
        dark: '#0b1a2a',
        light: '#ffffff',
      },
    })
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setSvgMarkup('');
      });

    return () => {
      active = false;
    };
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          compact
            ? 'inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors'
            : 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors'
        }
      >
        <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span>{buttonLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Mobile handoff QR code for ${title}`}
          className="absolute right-0 mt-2 w-72 z-40 rounded-xl border border-slate-200 bg-white shadow-lg p-4 space-y-3 text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-950">{title}</p>
              <p className="text-[11px] text-slate-600 leading-snug mt-0.5">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close QR handoff"
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-center p-3 rounded-lg bg-[#f6f9fc] border border-slate-200/80">
            {svgMarkup ? (
              <div
                className="w-40 h-40 [&>svg]:w-full [&>svg]:h-full rounded bg-white p-1.5 border border-slate-200/60"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center text-xs text-slate-500">
                Generating QR...
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              readOnly
              value={url}
              aria-label="Mobile handoff URL"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-md"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
