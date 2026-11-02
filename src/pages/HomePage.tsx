import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  Wrench,
  Printer,
  Database,
  Eye,
  Layers,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext.tsx';
import { ResilientFaultVisual } from '../components/FaultVisuals.tsx';
import { PrinterSilhouette } from '../components/PrinterSilhouette.tsx';
import { formatBedLevelingLabel } from '../components/Layout.tsx';

const HERO_IMAGE_SRC = '/assets/aistudio/3DFC9A2C-F7CE-4C59-ABFD-1A994577B3B4_397711ef.png';

function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const BENEFIT_ITEMS = [
  {
    icon: Printer,
    title: 'All major brands',
    description: 'Find supported models from leading manufacturers.',
  },
  {
    icon: Wrench,
    title: 'Step-by-step fixes',
    description: 'Follow practical, illustrated repair instructions.',
  },
  {
    icon: Database,
    title: 'Real technical data',
    description: 'Use sourced, model-specific specifications and maintenance guidance.',
  },
  {
    icon: Eye,
    title: 'Visual diagnostics',
    description: 'Compare symptoms with relevant photographs and diagrams.',
  },
  {
    icon: Layers,
    title: 'FDM & MSLA support',
    description: 'Troubleshooting for filament and resin printers.',
  },
] as const;

export const HomePage: React.FC = () => {
  const { data, loading, error, getImageById } = useAppData();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'FixMyPrint – Faster fixes. Better prints.';
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const searchResults = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw || !data) return null;
    const q = normalizeForSearch(raw);

    const models = data.models
      .filter((m) => {
        const haystack = normalizeForSearch(
          `${m.name} ${m.manufacturerName || ''} ${m.family}`
        );
        return haystack.includes(q);
      })
      .slice(0, 6);

    const manufacturers = data.manufacturers
      .filter((mfg) => normalizeForSearch(mfg.name).includes(q))
      .slice(0, 3);

    const categories = data.diagnostics.categories
      .filter((c) => {
        const haystack = normalizeForSearch(`${c.title} ${c.shortDescription}`);
        return haystack.includes(q);
      })
      .slice(0, 4);

    const guides = data.guides
      .filter((g) => {
        const haystack = normalizeForSearch(`${g.title} ${g.symptoms.join(' ')}`);
        return haystack.includes(q);
      })
      .slice(0, 4);

    const errorCodes = data.errorCodes
      .filter((e) => {
        const haystack = normalizeForSearch(
          `${e.code} ${e.verifiedMeaning} ${e.manufacturerName || ''}`
        );
        return haystack.includes(q) || e.code.toLowerCase().includes(raw.toLowerCase());
      })
      .slice(0, 4);

    const totalMatches =
      models.length +
      manufacturers.length +
      categories.length +
      guides.length +
      errorCodes.length;

    return { models, manufacturers, categories, guides, errorCodes, totalMatches };
  }, [searchQuery, data]);

  function handleHeroSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      navigate('/printers');
      return;
    }
    if (searchResults) {
      if (searchResults.models.length === 1) {
        navigate(`/printers/${searchResults.models[0].slug}`);
        return;
      }
      if (searchResults.models.length > 1) {
        navigate(`/printers?q=${encodeURIComponent(trimmed)}`);
        return;
      }
      if (searchResults.manufacturers.length === 1) {
        navigate(`/printers?brand=${encodeURIComponent(searchResults.manufacturers[0].slug)}`);
        return;
      }
      if (searchResults.categories.length > 0) {
        navigate(`/diagnose?category=${encodeURIComponent(searchResults.categories[0].slug)}`);
        return;
      }
      if (searchResults.guides.length > 0) {
        navigate(`/guides/${encodeURIComponent(searchResults.guides[0].slug)}`);
        return;
      }
      if (searchResults.errorCodes.length > 0) {
        navigate(`/reference?code=${encodeURIComponent(searchResults.errorCodes[0].code)}`);
        return;
      }
    }
    navigate(`/printers?q=${encodeURIComponent(trimmed)}`);
  }

  const featuredBrands = useMemo(() => {
    if (!data) return [];
    return data.manufacturers
      .filter((m) => (m.modelCount || 0) > 0)
      .sort((a, b) => (b.modelCount || 0) - (a.modelCount || 0))
      .slice(0, 12);
  }, [data]);

  const popularModels = useMemo(() => {
    if (!data) return [];
    const targetSlugs = [
      'bambu-lab-a1',
      'flashforge-adventurer-5m',
      'prusa-mk4s',
      'creality-k1c',
      'creality-ender-3-v2',
      'elegoo-saturn-4-ultra',
    ];
    return targetSlugs
      .map((s) => data.models.find((m) => m.slug === s))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }, [data]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="h-80 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="border border-red-200 bg-red-50/60 rounded-xl p-6 text-slate-900">
          <h2 className="text-lg font-semibold text-red-900">Unable to load FixMyPrint database</h2>
          <p className="mt-2 text-sm text-red-800">{error || 'Reference catalog unavailable.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Responsive Two-Column Homepage Hero */}
      <section
        aria-labelledby="hero-heading"
        className="bg-white border-b border-slate-200"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Column: Headline, Description, CTAs, Reassurance & Live Search */}
            <div className="lg:col-span-6 space-y-6">
              <div className="space-y-3.5">
                <h1
                  id="hero-heading"
                  className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-slate-950 leading-[1.12]"
                >
                  Let’s get your printer working again.
                </h1>
                <p className="text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">
                  Find the cause of a printing problem and follow clear, step-by-step instructions to fix it.
                </p>
              </div>

              {/* Primary & Secondary CTA Buttons + Reassurance Text */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <Link
                    to="/diagnose"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <span>Diagnose a problem</span>
                    <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                  </Link>
                  <Link
                    to="/printers"
                    className="inline-flex items-center justify-center px-5 py-3 min-h-[44px] text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    Find my printer
                  </Link>
                </div>
                <p className="text-xs text-slate-600">
                  Start immediately without creating an account · Model-specific guidance
                </p>
              </div>

              {/* Search Input Connected to Existing Printer, Symptom & Error Code Catalog */}
              <div ref={searchContainerRef} className="relative pt-1 max-w-xl">
                <form role="search" onSubmit={handleHeroSearchSubmit}>
                  <label
                    htmlFor="hero-printer-search"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Search by printer model, manufacturer, symptom, or error code
                  </label>
                  <div className="relative flex items-center">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="hero-printer-search"
                      type="search"
                      value={searchQuery}
                      onFocus={() => setSearchDropdownOpen(true)}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSearchDropdownOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setSearchDropdownOpen(false);
                        }
                      }}
                      placeholder="e.g. Bambu Lab A1, Ender 3, Prusa MK4S, Adventurer 5M"
                      aria-expanded={Boolean(searchDropdownOpen && searchResults)}
                      aria-controls="hero-search-results"
                      autoComplete="off"
                      className="w-full pl-10 pr-24 py-3 min-h-[44px] text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    />
                    <button
                      type="submit"
                      className="absolute right-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
                    >
                      Search
                    </button>
                  </div>
                </form>

                {searchDropdownOpen && searchResults && (
                  <div
                    id="hero-search-results"
                    role="region"
                    aria-label="Search suggestions"
                    className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 max-h-96 overflow-y-auto"
                  >
                    {searchResults.totalMatches === 0 && (
                      <div className="p-4 text-sm text-slate-600 space-y-2">
                        <p>No verified catalog entry matches “{searchQuery}” yet.</p>
                        <div className="flex flex-wrap gap-3 text-xs font-semibold">
                          <Link
                            to="/diagnose?mode=generic"
                            onClick={() => setSearchDropdownOpen(false)}
                            className="text-blue-600 hover:underline"
                          >
                            Use Generic Diagnostic Route →
                          </Link>
                          <Link
                            to="/printers?request=1"
                            onClick={() => setSearchDropdownOpen(false)}
                            className="text-slate-700 hover:underline"
                          >
                            Request this printer model →
                          </Link>
                        </div>
                      </div>
                    )}

                    {searchResults.models.length > 0 && (
                      <div className="p-3 space-y-1">
                        <p className="px-2 text-xs font-semibold text-slate-500">Supported Printer Models</p>
                        {searchResults.models.map((m) => (
                          <Link
                            key={m.id}
                            to={`/printers/${m.slug}`}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 text-sm"
                          >
                            <span className="font-medium text-slate-900 truncate">{m.name}</span>
                            <span className="text-xs text-slate-500 shrink-0">
                              {m.technology} · {formatBedLevelingLabel(m.bedLevelingCategory)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}

                    {searchResults.manufacturers.length > 0 && (
                      <div className="p-3 space-y-1">
                        <p className="px-2 text-xs font-semibold text-slate-500">Manufacturers</p>
                        {searchResults.manufacturers.map((mfg) => (
                          <Link
                            key={mfg.id}
                            to={`/printers?brand=${mfg.slug}`}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 text-sm"
                          >
                            <span className="font-medium text-slate-900">{mfg.name}</span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              {(mfg.modelCount || 0) > 0
                                ? `${mfg.modelCount} supported ${mfg.modelCount === 1 ? 'model' : 'models'}`
                                : 'Registered manufacturer'}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}

                    {searchResults.categories.length > 0 && (
                      <div className="p-3 space-y-1">
                        <p className="px-2 text-xs font-semibold text-slate-500">Symptom Categories</p>
                        {searchResults.categories.map((cat) => (
                          <Link
                            key={cat.id}
                            to={`/diagnose?category=${cat.slug}`}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 text-sm"
                          >
                            <span className="font-medium text-slate-900">{cat.title}</span>
                            <span className="text-xs text-slate-500 shrink-0">{cat.technology}</span>
                          </Link>
                        ))}
                      </div>
                    )}

                    {searchResults.guides.length > 0 && (
                      <div className="p-3 space-y-1">
                        <p className="px-2 text-xs font-semibold text-slate-500">Step-by-Step Repair Guides</p>
                        {searchResults.guides.map((g) => (
                          <Link
                            key={g.id}
                            to={`/guides/${g.slug}`}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 text-sm"
                          >
                            <span className="font-medium text-slate-900 truncate">{g.title}</span>
                            <span className="text-xs text-slate-500 shrink-0">{g.technology}</span>
                          </Link>
                        ))}
                      </div>
                    )}

                    {searchResults.errorCodes.length > 0 && (
                      <div className="p-3 space-y-1">
                        <p className="px-2 text-xs font-semibold text-slate-500">Verified Error Codes</p>
                        {searchResults.errorCodes.map((err) => (
                          <Link
                            key={err.id}
                            to={`/reference?code=${encodeURIComponent(err.code)}`}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="block px-2 py-2 rounded-lg hover:bg-slate-50 text-sm"
                          >
                            <span className="font-mono font-semibold text-slate-900">{err.code}</span>
                            <span className="text-xs text-slate-500">
                              {' '}
                              · {err.manufacturerName} — {err.verifiedMeaning}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Supplied Illustrative Hero Artwork */}
            <div className="lg:col-span-6">
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img
                  src={HERO_IMAGE_SRC}
                  alt="Workbench scene with a 3D printer, sample printed calibration parts, and a laptop illustrating the FixMyPrint troubleshooting workflow"
                  width={1536}
                  height={1024}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-auto aspect-[3/2] object-cover block"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Five-Item Benefit Section Directly Below Hero */}
      <section aria-label="Platform highlights" className="border-b border-slate-200 bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 lg:gap-0 lg:divide-x lg:divide-slate-200">
            {BENEFIT_ITEMS.map((item, idx) => {
              const IconComponent = item.icon;
              return (
                <div
                  key={item.title}
                  className={`space-y-1.5 ${idx === 0 ? 'lg:pr-6' : idx === BENEFIT_ITEMS.length - 1 ? 'lg:pl-6' : 'lg:px-6'}`}
                >
                  <div className="flex items-center gap-2 text-slate-900">
                    <IconComponent className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-slate-950 leading-snug">{item.title}</h2>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Visual Grid of Common Printing Problems */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Visual Fault Identification</h2>
              <p className="text-sm text-slate-600 mt-1">
                Select the printing defect that matches your part to launch branching model-aware questions.
              </p>
            </div>
            <Link to="/diagnose" className="text-sm font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
              Open full diagnostic wizard →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.diagnostics.categories.map((cat) => {
              const asset = getImageById(cat.imageAssetId);
              return (
                <Link
                  key={cat.id}
                  to={`/diagnose?category=${cat.slug}`}
                  className="group border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-slate-400 transition-colors flex flex-col"
                >
                  <div className="border-b border-slate-100">
                    <ResilientFaultVisual
                      asset={asset}
                      faultCode={cat.visualFaultCode}
                      className="w-full h-44"
                    />
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">
                        {cat.technology === 'RESIN' ? 'Resin / MSLA' : 'FDM / FFF Filament'}
                      </p>
                      <h3 className="text-base font-semibold text-slate-950 group-hover:text-blue-600 transition-colors">
                        {cat.title}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{cat.shortDescription}</p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600 inline-flex items-center gap-1 pt-1">
                      Diagnose symptom <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Popular Printer Manufacturers & Popular Model-Specific Guides */}
      <section className="border-b border-slate-200 bg-[#f6f9fc] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-950">Browse by Printer Manufacturer</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Showing brands with verified model records first ·{' '}
                  <span className="tabular-nums">{data.coverageCounts.manufacturersTotal}</span> registered manufacturers in catalog.
                </p>
              </div>
              <Link to="/printers" className="text-sm font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
                View all {data.coverageCounts.manufacturersTotal} manufacturers →
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {featuredBrands.map((brand) => (
                <Link
                  key={brand.id}
                  to={`/printers?brand=${brand.slug}`}
                  className="p-3.5 bg-white border border-slate-200 rounded-lg hover:border-slate-400 transition-colors"
                >
                  <p className="text-sm font-semibold text-slate-900 truncate">{brand.name}</p>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {brand.modelCount} {brand.modelCount === 1 ? 'model' : 'models'} ·{' '}
                    {brand.supportsFdm && brand.supportsResin ? 'FDM / Resin' : brand.supportsResin ? 'Resin' : 'FDM'}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {/* Popular Model-Specific Troubleshooting Profiles */}
          <div>
            <h2 className="text-xl font-bold text-slate-950 mb-4">Model-Specific Hardware &amp; Calibration Profiles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {popularModels.map((model) => (
                <div
                  key={model.id}
                  className="p-5 bg-white border border-slate-200 rounded-lg hover:border-slate-400 transition-colors flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">
                          {model.manufacturerName} · {model.technology}
                        </p>
                        <h3 className="text-base font-semibold text-slate-950 mt-0.5">
                          <Link to={`/printers/${model.slug}`} className="hover:text-blue-600">
                            {model.name}
                          </Link>
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {formatBedLevelingLabel(model.bedLevelingCategory)}
                        </p>
                      </div>
                      <div className="p-2 rounded-md bg-slate-50 border border-slate-200/80 shrink-0">
                        <PrinterSilhouette model={model} className="w-11 h-11" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{model.summary}</p>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs font-semibold">
                    <Link to={`/diagnose?printer=${model.slug}`} className="text-blue-600 hover:underline">
                      Troubleshoot {model.name}
                    </Link>
                    <Link to={`/printers/${model.slug}`} className="text-slate-600 hover:text-slate-950">
                      Specs &amp; Sources
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Recently Verified Repair Guides & Technical Reference Library Entry Points */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Repair Guides */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-950">Verified Step-by-Step Repair Guides</h2>
              <Link to="/guides" className="text-sm font-semibold text-blue-600 hover:underline whitespace-nowrap">
                All guides →
              </Link>
            </div>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
              {data.guides.slice(0, 5).map((guide) => (
                <Link
                  key={guide.id}
                  to={`/guides/${guide.slug}`}
                  className="block p-4 sm:p-5 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm sm:text-base font-semibold text-slate-950">{guide.title}</h3>
                      <p className="text-xs text-slate-500">
                        {guide.technology} · Difficulty: {guide.difficulty}
                        {guide.estimatedTime ? ` · Est. ${guide.estimatedTime}` : ''} · Verified {guide.lastVerifiedDate}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Technical Library Entry Points */}
          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-2xl font-bold text-slate-950">Technical Reference Library</h2>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
              <Link
                to="/materials"
                className="flex items-start justify-between gap-4 p-4 sm:p-5 hover:bg-slate-50/80 transition-colors"
              >
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-semibold text-slate-950">Filament &amp; Resin Material Reference</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Nozzle &amp; bed temperature ranges, active drying times, enclosure limits, and MSLA exposure baselines.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
              </Link>

              <Link
                to="/reference"
                className="flex items-start justify-between gap-4 p-4 sm:p-5 hover:bg-slate-50/80 transition-colors"
              >
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-semibold text-slate-950">Firmware Error Codes</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Source-backed Bambu HMS codes, Prusa loadcell QR codes, and Creality Klipper fault keys.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
              </Link>

              <Link
                to="/reference?tab=maintenance"
                className="flex items-start justify-between gap-4 p-4 sm:p-5 hover:bg-slate-50/80 transition-colors"
              >
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-semibold text-slate-950">Preventive Maintenance Tracker</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Approved lubricants, rail &amp; carbon rod care, build plate cleaning rules, and print-hour stamps.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
              </Link>

              <Link
                to="/reference?tab=calculators"
                className="flex items-start justify-between gap-4 p-4 sm:p-5 hover:bg-slate-50/80 transition-colors"
              >
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-semibold text-slate-950">Workbench Calibration Calculators</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Extruder E-steps &amp; Klipper <code className="font-mono text-xs">rotation_distance</code>, slicer flow ratio passes, and MSLA exposure math.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
