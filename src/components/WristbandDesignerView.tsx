import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckSquare,
  CopyPlus,
  Download,
  ImagePlus,
  Printer,
  Save,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AppStateSnapshot,
  TicketTier,
  WristbandDesign,
  WristbandMaterial,
  WristbandPattern,
} from '../types/event.ts';
import {
  WristbandPreview,
  downloadBatchWristbandsPng,
  downloadWristbandPng,
} from './WristbandPreview.tsx';

interface WristbandDesignerViewProps {
  snapshot: AppStateSnapshot;
  onSaveDesign: (
    design: WristbandDesign
  ) => Promise<{ design?: WristbandDesign; activeDesignId?: string } | unknown>;
}

const THEME_PRESETS: Array<{
  label: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  pattern: WristbandPattern;
  material: WristbandMaterial;
  sponsorLabel: string;
  tagline: string;
}> = [
  {
    label: 'Acara Sekolah',
    primaryColor: '#1E3A8A',
    secondaryColor: '#0284C7',
    accentColor: '#FACC15',
    textColor: '#FFFFFF',
    pattern: 'geometric',
    material: 'tyvek',
    sponsorLabel: 'OSIS & Panitia Sekolah',
    tagline: 'Akses Siswa, Guru & Wali Murid',
  },
  {
    label: 'Acara Bisnis',
    primaryColor: '#0F172A',
    secondaryColor: '#334155',
    accentColor: '#E2E8F0',
    textColor: '#F8FAFC',
    pattern: 'grid',
    material: 'rfid-pvc',
    sponsorLabel: 'Executive Business Forum',
    tagline: 'Main Ballroom & Executive Lounge',
  },
  {
    label: 'Festival',
    primaryColor: '#7C2D12',
    secondaryColor: '#D97706',
    accentColor: '#FDE68A',
    textColor: '#FFFBEB',
    pattern: 'geometric',
    material: 'woven',
    sponsorLabel: 'Pesona Festival 2026',
    tagline: 'Panggung Utama & Zona Kuliner',
  },
  {
    label: 'Musik',
    primaryColor: '#4C1D95',
    secondaryColor: '#BE123C',
    accentColor: '#FDA4AF',
    textColor: '#FFFFFF',
    pattern: 'wave',
    material: 'woven',
    sponsorLabel: 'Sound Stage Official',
    tagline: 'Festival Area & Front Row',
  },
  {
    label: 'Gala Eksklusif',
    primaryColor: '#18181B',
    secondaryColor: '#92400E',
    accentColor: '#FBBF24',
    textColor: '#FAFAFA',
    pattern: 'diagonal',
    material: 'silicone',
    sponsorLabel: 'VIP Priority Access',
    tagline: 'Undangan VIP Lounge & Dinner',
  },
  {
    label: 'Olahraga & Maraton',
    primaryColor: '#7F1D1D',
    secondaryColor: '#DC2626',
    accentColor: '#FCA5A5',
    textColor: '#FFFFFF',
    pattern: 'wave',
    material: 'rfid-pvc',
    sponsorLabel: 'Official Race Pass',
    tagline: 'Start Zone & Hydration Bay',
  },
];

const COLLECTION_FILTERS = [
  'Semua',
  'Kustom',
  'Acara Sekolah',
  'Acara Bisnis',
  'Festival',
  'Musik',
] as const;

export const WristbandDesignerView: React.FC<WristbandDesignerViewProps> = ({
  snapshot,
  onSaveDesign,
}) => {
  const initialDesign =
    snapshot.designs.find((d) => d.id === snapshot.event.activeDesignId) || snapshot.designs[0];

  const [draft, setDraft] = useState<WristbandDesign>(initialDesign);
  const [sampleAttendeeId, setSampleAttendeeId] = useState<string>(
    snapshot.attendees[0]?.id || ''
  );
  const [collectionFilter, setCollectionFilter] = useState<(typeof COLLECTION_FILTERS)[number]>('Semua');
  const [saving, setSaving] = useState(false);
  const [savedMode, setSavedMode] = useState<'updated' | 'created' | null>(null);
  const [customBgError, setCustomBgError] = useState<string | null>(null);
  const [isDraggingCustomBg, setIsDraggingCustomBg] = useState(false);

  const lastEventIdRef = useRef(snapshot.event.id);
  useEffect(() => {
    if (lastEventIdRef.current !== snapshot.event.id) {
      lastEventIdRef.current = snapshot.event.id;
      const nextDesign =
        snapshot.designs.find((d) => d.id === snapshot.event.activeDesignId) ||
        snapshot.designs[0];
      if (nextDesign) setDraft(nextDesign);
    }
  }, [snapshot.event.id, snapshot.event.activeDesignId, snapshot.designs]);

  // Upload Refs
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const customBgInputRef = useRef<HTMLInputElement | null>(null);

  // Print & Download Preview Modal with Checklist State
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>(() =>
    snapshot.attendees.slice(0, 6).map((a) => a.id)
  );
  const [printSearch, setPrintSearch] = useState('');
  const [printTierFilter, setPrintTierFilter] = useState<'all' | TicketTier>('all');
  const [includePrintHeader, setIncludePrintHeader] = useState(true);
  const [includeCutIndex, setIncludeCutIndex] = useState(true);
  const [downloadAsSingleSheet, setDownloadAsSingleSheet] = useState(true);
  const [downloadingBatch, setDownloadingBatch] = useState(false);

  const tierOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...(snapshot.event.categories?.map((c) => c.name) ||
            Object.keys(snapshot.event.ticketPrices)),
          ...snapshot.attendees.map((a) => a.tier),
        ])
      ),
    [snapshot.event.categories, snapshot.event.ticketPrices, snapshot.attendees]
  );

  const sampleAttendee =
    snapshot.attendees.find((a) => a.id === sampleAttendeeId) || snapshot.attendees[0];

  const filteredDesigns = useMemo(() => {
    if (collectionFilter === 'Semua') return snapshot.designs;
    if (collectionFilter === 'Kustom') {
      return snapshot.designs.filter(
        (d) =>
          Boolean(d.customBackgroundDataUrl) ||
          Boolean(d.isCustomUpload) ||
          d.themePreset.toLowerCase().includes('kustom')
      );
    }
    return snapshot.designs.filter((d) =>
      d.themePreset.toLowerCase().includes(collectionFilter.toLowerCase().replace('acara ', ''))
    );
  }, [snapshot.designs, collectionFilter]);

  const filteredPrintCandidates = useMemo(() => {
    return snapshot.attendees.filter((a) => {
      if (printTierFilter !== 'all' && a.tier !== printTierFilter) return false;
      if (printSearch.trim()) {
        const q = printSearch.toLowerCase();
        return (
          a.fullName.toLowerCase().includes(q) ||
          a.ticketCode.toLowerCase().includes(q) ||
          a.gateAssigned.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [snapshot.attendees, printSearch, printTierFilter]);

  const checkedPrintAttendees = useMemo(() => {
    const idSet = new Set(selectedPrintIds);
    return snapshot.attendees.filter((a) => idSet.has(a.id));
  }, [snapshot.attendees, selectedPrintIds]);

  const togglePrintId = (id: string) => {
    setSelectedPrintIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = filteredPrintCandidates.map((a) => a.id);
    setSelectedPrintIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleSelectPendingOnly = () => {
    const pendingIds = snapshot.attendees
      .filter((a) => !a.checkedIn && !a.revoked)
      .map((a) => a.id);
    setSelectedPrintIds(pendingIds);
  };

  const handleClearSelection = () => {
    setSelectedPrintIds([]);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const resultUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 240;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/png');
        setDraft((prev) => ({ ...prev, brandLogoDataUrl: compressed }));
      };
      img.src = resultUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const processCustomDesignFile = (file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setCustomBgError('Format tidak didukung. Gunakan file PNG, JPG, WEBP, atau SVG.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setCustomBgError('Ukuran file maksimal 12 MB.');
      return;
    }

    setCustomBgError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const resultUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1400;
        const maxHeight = 560;
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const usePng = file.type === 'image/png' || file.type === 'image/svg+xml';
        const compressed = usePng
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.86);

        setDraft((prev) => ({
          ...prev,
          customBackgroundDataUrl: compressed,
          isCustomUpload: true,
          customOverlayOpacity: prev.customOverlayOpacity ?? 0.2,
          customBackgroundFit: prev.customBackgroundFit ?? 'cover',
          hidePatternOnCustomBg: prev.hidePatternOnCustomBg ?? true,
        }));
      };
      img.onerror = () => {
        setCustomBgError('File gambar tidak dapat dibaca. Coba file lain.');
      };
      img.src = resultUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processCustomDesignFile(file);
    e.target.value = '';
  };

  const handleApplyPreset = (preset: (typeof THEME_PRESETS)[number]) => {
    setDraft((prev) => ({
      ...prev,
      themePreset: preset.label,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentColor: preset.accentColor,
      textColor: preset.textColor,
      pattern: preset.pattern,
      material: preset.material,
      sponsorLabel: preset.sponsorLabel,
      customTagline: preset.tagline,
    }));
  };

  const handleSave = async (saveAsNew = false) => {
    setSaving(true);
    try {
      const cleanName = draft.name.trim() || 'Desain Gelang Kustom';
      const payload: WristbandDesign = saveAsNew
        ? {
            ...draft,
            id: '',
            name: cleanName.toLowerCase().includes('kustom')
              ? cleanName
              : `${cleanName} (Kustom)`,
            themePreset: draft.customBackgroundDataUrl ? 'Upload Kustom' : draft.themePreset,
            isCustomUpload: Boolean(draft.customBackgroundDataUrl) || draft.isCustomUpload,
          }
        : {
            ...draft,
            name: cleanName,
          };

      const res = (await onSaveDesign(payload)) as
        | { design?: WristbandDesign }
        | undefined;
      if (res && res.design) {
        setDraft(res.design);
      }
      setSavedMode(saveAsNew ? 'created' : 'updated');
      window.setTimeout(() => setSavedMode(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadCheckedDesigns = async () => {
    if (checkedPrintAttendees.length === 0 || downloadingBatch) return;
    setDownloadingBatch(true);
    try {
      if (downloadAsSingleSheet) {
        await downloadBatchWristbandsPng(draft, snapshot.event, checkedPrintAttendees, {
          includeHeader: includePrintHeader,
          includeCutIndex,
        });
      } else {
        for (const att of checkedPrintAttendees) {
          await downloadWristbandPng(draft, snapshot.event, att);
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    } finally {
      setDownloadingBatch(false);
    }
  };

  const estimatedPages = Math.max(1, Math.ceil(checkedPrintAttendees.length / 5));

  return (
    <div className="space-y-6">
      {/* Studio Workspace Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 no-print">
        {/* Left: Customization Controls */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Kustomisasi Tema Gelang Acara
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sesuaikan palet, logo brand, bahan, pola grafis, dan elemen keamanan gelang
            </p>
          </div>

          {/* Preset Themes */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">
              Preset Tema Acara
            </label>
            <div className="grid grid-cols-2 gap-2">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={`px-3 py-2 rounded-lg border text-left text-xs font-medium transition-colors flex items-center gap-2 ${
                    draft.themePreset === preset.label
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                    style={{
                      background: `linear-gradient(135deg, ${preset.primaryColor}, ${preset.secondaryColor})`,
                    }}
                  />
                  <span className="truncate">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Wristband Artwork / Full Design Upload */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-xs font-semibold text-slate-700">
                Upload Desain Gelang Kustom (Latar Penuh)
              </label>
              <span className="text-[11px] font-mono text-slate-500">1600×340 px</span>
            </div>

            {!draft.customBackgroundDataUrl ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingCustomBg(true);
                }}
                onDragLeave={() => setIsDraggingCustomBg(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingCustomBg(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) processCustomDesignFile(file);
                }}
                className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                  isDraggingCustomBg
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-300 bg-slate-50/70 hover:bg-slate-50'
                }`}
              >
                <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-slate-800">
                  Unggah gambar desain gelang buatan sendiri
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tarik file ke sini atau klik tombol di bawah (PNG, JPG, WEBP, SVG)
                </p>
                <button
                  type="button"
                  onClick={() => customBgInputRef.current?.click()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Pilih File Desain Gelang</span>
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-24 h-11 rounded-lg bg-slate-900 border border-slate-300 overflow-hidden shrink-0">
                    <img
                      src={draft.customBackgroundDataUrl}
                      alt="Pratinjau desain gelang upload"
                      className={`w-full h-full ${
                        (draft.customBackgroundFit ?? 'cover') === 'contain'
                          ? 'object-contain'
                          : 'object-cover'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      Artwork Desain Kustom Aktif
                    </p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      Otomatis diterapkan ke pratinjau & ekspor cetak PNG
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => customBgInputRef.current?.click()}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      Ganti
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          customBackgroundDataUrl: null,
                          isCustomUpload: false,
                        }))
                      }
                      className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors"
                      title="Hapus desain kustom"
                      aria-label="Hapus desain kustom"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Custom Background Fit & Overlay Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <span className="text-[11px] font-medium text-slate-600 block mb-1">
                      Penyesuaian Gambar
                    </span>
                    <div className="flex rounded-lg border border-slate-300 p-0.5 bg-white">
                      {(
                        [
                          { id: 'cover', label: 'Penuh (Cover)' },
                          { id: 'contain', label: 'Utuh (Contain)' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({ ...prev, customBackgroundFit: opt.id }))
                          }
                          className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                            (draft.customBackgroundFit ?? 'cover') === opt.id
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
                      <span>Lapisan Kontras Teks</span>
                      <span className="font-mono text-slate-800">
                        {Math.round((draft.customOverlayOpacity ?? 0.25) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.7}
                      step={0.05}
                      value={draft.customOverlayOpacity ?? 0.25}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          customOverlayOpacity: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.hidePatternOnCustomBg ?? true}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, hidePatternOnCustomBg: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Sembunyikan pola grafis bawaan agar artwork kustom tampil bersih</span>
                </label>
              </div>
            )}

            {customBgError && (
              <p className="text-[11px] text-red-600 mt-1.5">{customBgError}</p>
            )}

            <input
              ref={customBgInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleCustomBgUpload}
              className="hidden"
            />
          </div>

          {/* Brand Logo Upload */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">
              Logo Brand / Penyelenggara di Gelang
            </label>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                {draft.brandLogoDataUrl ? (
                  <img
                    src={draft.brandLogoDataUrl}
                    alt="Pratinjau logo brand"
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <ImagePlus className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">
                  {draft.brandLogoDataUrl ? 'Logo brand terpasang di gelang' : 'Belum ada logo diunggah'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Format PNG, JPG, atau SVG (otomatis disesuaikan ukuran gelang)
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
                >
                  {draft.brandLogoDataUrl ? 'Ganti' : 'Unggah Logo'}
                </button>
                {draft.brandLogoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, brandLogoDataUrl: null })}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors"
                    title="Hapus logo brand"
                    aria-label="Hapus logo brand"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Design Name */}
          <div>
            <label htmlFor="design-name" className="text-xs font-semibold text-slate-700 block mb-1.5">
              Nama Desain Template
            </label>
            <input
              id="design-name"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Color Pickers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'primaryColor' as const, label: 'Utama' },
              { key: 'secondaryColor' as const, label: 'Sekunder' },
              { key: 'accentColor' as const, label: 'Aksen' },
              { key: 'textColor' as const, label: 'Teks' },
            ].map((item) => (
              <label key={item.key} className="block">
                <span className="text-[11px] font-medium text-slate-600 block mb-1">
                  {item.label}
                </span>
                <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                  <input
                    type="color"
                    value={draft[item.key]}
                    onChange={(e) => setDraft({ ...draft, [item.key]: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                  />
                  <span className="font-mono text-[11px] text-slate-600 uppercase">
                    {draft[item.key]}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {/* Material, Pattern, Width */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Bahan Gelang
              </label>
              <select
                value={draft.material}
                onChange={(e) =>
                  setDraft({ ...draft, material: e.target.value as WristbandMaterial })
                }
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-900 bg-white"
              >
                <option value="woven">Kain Tenun (Woven)</option>
                <option value="tyvek">Tyvek Tahan Air</option>
                <option value="silicone">Silikon Elastis</option>
                <option value="rfid-pvc">RFID + PVC</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Pola Grafis
              </label>
              <select
                value={draft.pattern}
                onChange={(e) =>
                  setDraft({ ...draft, pattern: e.target.value as WristbandPattern })
                }
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-900 bg-white"
              >
                <option value="diagonal">Garis Diagonal</option>
                <option value="geometric">Geometris</option>
                <option value="wave">Gelombang Akustik</option>
                <option value="grid">Grid Teknis</option>
                <option value="solid">Polos Bersih</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Lebar Pita
              </label>
              <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-50">
                {([19, 25] as const).map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    onClick={() => setDraft({ ...draft, widthMm: mm })}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      draft.widthMm === mm
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600'
                    }`}
                  >
                    {mm} mm
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Label & Tagline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Label Sponsor / Header
              </label>
              <input
                type="text"
                value={draft.sponsorLabel}
                onChange={(e) => setDraft({ ...draft, sponsorLabel: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Sub-teks Zona Acara
              </label>
              <input
                type="text"
                value={draft.customTagline}
                onChange={(e) => setDraft({ ...draft, customTagline: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Feature Toggles */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {[
              { key: 'showHolderName' as const, label: 'Tampilkan Nama Tamu' },
              { key: 'showTierBadge' as const, label: 'Tampilkan Kategori' },
              { key: 'showPerforation' as const, label: 'Garis Potong Perforasi' },
              { key: 'showSecurityMicrotext' as const, label: 'Mikroteks AES-256' },
            ].map((tog) => (
              <label
                key={tog.key}
                className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={draft[tog.key]}
                  onChange={(e) => setDraft({ ...draft, [tog.key]: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>{tog.label}</span>
              </label>
            ))}
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {savedMode === 'updated' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {savedMode === 'updated'
                  ? 'Tema Aktif Disimpan'
                  : saving
                  ? 'Menyimpan...'
                  : 'Simpan & Terapkan Tema'}
              </span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap"
              title="Simpan sebagai template baru di koleksi desain"
            >
              {savedMode === 'created' ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <CopyPlus className="w-4 h-4 text-slate-600" />
              )}
              <span>
                {savedMode === 'created' ? 'Desain Baru Disimpan' : 'Simpan Desain Baru'}
              </span>
            </button>
          </div>
        </div>

        {/* Right: Live Wristband Studio & Design Collections */}
        <div className="xl:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Pratinjau Gelang QR Terenkripsi
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kode QR di kanan memuat payload AES-256-GCM asli dan dapat langsung dipindai
                </p>
              </div>
              {sampleAttendee && (
                <select
                  value={sampleAttendee.id}
                  onChange={(e) => setSampleAttendeeId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 max-w-[230px]"
                >
                  {snapshot.attendees.slice(0, 15).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName} ({a.tier})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {sampleAttendee ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                <WristbandPreview
                  design={draft}
                  event={snapshot.event}
                  attendee={sampleAttendee}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <span>
                    Dimensi cetak: 250 × {draft.widthMm} mm · Resolusi ekspor 1600 px
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadWristbandPng(draft, snapshot.event, sampleAttendee)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh PNG Gelang</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPrintPreview(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Pratinjau Cetak & Unduh ({selectedPrintIds.length})</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Belum ada pengunjung untuk pratinjau.</p>
            )}

            {/* Saved Design Gallery Switcher with Category Filter */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-700">
                  Koleksi Desain Tersimpan ({filteredDesigns.length})
                </p>
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {COLLECTION_FILTERS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCollectionFilter(cat)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        collectionFilter === cat
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat.replace('Acara ', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[290px] overflow-y-auto pr-1">
                {filteredDesigns.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...d,
                        brandLogoDataUrl: d.brandLogoDataUrl ?? prev.brandLogoDataUrl ?? null,
                        customBackgroundDataUrl: d.customBackgroundDataUrl ?? null,
                        customOverlayOpacity: d.customOverlayOpacity ?? 0.25,
                        customBackgroundFit: d.customBackgroundFit ?? 'cover',
                        hidePatternOnCustomBg: d.hidePatternOnCustomBg ?? true,
                        isCustomUpload: d.isCustomUpload ?? Boolean(d.customBackgroundDataUrl),
                      }))
                    }
                    className={`p-3 rounded-lg border text-left transition-colors flex items-center justify-between gap-3 ${
                      draft.id === d.id
                        ? 'border-blue-600 bg-blue-50/50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{d.name}</p>
                        {(d.customBackgroundDataUrl || d.isCustomUpload) && (
                          <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                            Kustom
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {d.themePreset} · {d.widthMm}mm
                      </p>
                    </div>
                    {d.customBackgroundDataUrl ? (
                      <img
                        src={d.customBackgroundDataUrl}
                        alt={d.name}
                        className="w-12 h-6 rounded border border-black/15 object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-5 rounded border border-black/10 shrink-0"
                        style={{
                          background: `linear-gradient(90deg, ${d.primaryColor}, ${d.secondaryColor})`,
                        }}
                      />
                    )}
                  </button>
                ))}
                {filteredDesigns.length === 0 && (
                  <p className="col-span-full text-xs text-slate-500 py-4 text-center">
                    Belum ada desain tersimpan pada kategori ini.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Print & Download Preview Modal with Attendee Checklist */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6 no-print">
          <div className="w-full max-w-6xl max-h-[92vh] rounded-xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Pratinjau Cetak & Unduh Desain · Pilihan Ceklis Batch A4
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Centang pengunjung untuk mencetak lembar A4 atau mengunduh file desain PNG dengan tema{' '}
                  <strong className="text-slate-800">{draft.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Tutup pratinjau cetak"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Split */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
              {/* Left: Checklist Selector */}
              <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col min-h-0 bg-slate-50/60">
                <div className="p-4 border-b border-slate-200 space-y-3 shrink-0 bg-white">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={printSearch}
                      onChange={(e) => setPrintSearch(e.target.value)}
                      placeholder="Cari nama atau kode tiket..."
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={printTierFilter}
                      onChange={(e) => setPrintTierFilter(e.target.value as 'all' | TicketTier)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                    >
                      <option value="all">Semua Kategori</option>
                      {tierOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    <span className="font-mono text-xs font-semibold text-blue-700 tabular-nums">
                      {selectedPrintIds.length} dipilih
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <CheckSquare className="w-3 h-3" />
                      <span>Pilih Semua</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectPendingOnly}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Belum Check-In
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Square className="w-3 h-3" />
                      <span>Kosongkan</span>
                    </button>
                  </div>
                </div>

                {/* Scrollable Attendee Checkboxes */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70 max-h-[240px] lg:max-h-none">
                  {filteredPrintCandidates.map((att) => {
                    const checked = selectedPrintIds.includes(att.id);
                    return (
                      <label
                        key={att.id}
                        className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                          checked ? 'bg-blue-50/70' : 'hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePrintId(att.id)}
                          className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              {att.fullName}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 shrink-0">
                              {att.tier}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                            {att.ticketCode} · {att.checkedIn ? 'Sudah Masuk' : 'Belum Masuk'}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                  {filteredPrintCandidates.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Tidak ada tamu yang sesuai pencarian.
                    </div>
                  )}
                </div>

                {/* Print & Download Checklist Options */}
                <div className="p-4 border-t border-slate-200 bg-white space-y-2 shrink-0">
                  <p className="text-[11px] font-semibold text-slate-700 mb-1">
                    Opsi Ceklis Cetak & Unduh Desain
                  </p>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePrintHeader}
                      onChange={(e) => setIncludePrintHeader(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Sertakan header info acara pada lembar</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCutIndex}
                      onChange={(e) => setIncludeCutIndex(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Tampilkan nomor urut & garis potong</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={downloadAsSingleSheet}
                      onChange={(e) => setDownloadAsSingleSheet(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Gabungkan menjadi 1 lembar PNG saat unduh</span>
                  </label>
                </div>
              </div>

              {/* Right: Live A4 Print Sheet Preview */}
              <div className="lg:col-span-8 bg-slate-100 p-4 sm:p-6 overflow-y-auto">
                <div className="max-w-[820px] mx-auto bg-white border border-slate-200 rounded-lg shadow-sm p-6 sm:p-8 space-y-4">
                  {includePrintHeader && (
                    <div className="border-b border-slate-200 pb-3 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h4 className="font-display text-base font-bold text-slate-900">
                          {snapshot.event.title} — Lembar Cetak Gelang Tiket
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Desain: {draft.name} ({draft.themePreset} · {draft.widthMm}mm) · Enkripsi AES-256-GCM v{snapshot.event.encryptionKeyVersion}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-slate-600 tabular-nums">
                        {checkedPrintAttendees.length} gelang · ~{estimatedPages} hal. A4
                      </span>
                    </div>
                  )}

                  {checkedPrintAttendees.length > 0 ? (
                    <div className="space-y-3">
                      {checkedPrintAttendees.map((att, index) => (
                        <div
                          key={att.id}
                          className={
                            includeCutIndex
                              ? 'pb-3 border-b border-dashed border-slate-300 last:border-b-0'
                              : ''
                          }
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1.5">
                            <span>
                              {includeCutIndex
                                ? `#${String(index + 1).padStart(2, '0')} · ${att.fullName}`
                                : att.fullName}
                            </span>
                            <div className="flex items-center gap-3">
                              <span>
                                {att.ticketCode} · {att.tier}
                              </span>
                              <button
                                type="button"
                                onClick={() => downloadWristbandPng(draft, snapshot.event, att)}
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-sans font-medium"
                                title="Unduh PNG gelang ini"
                              >
                                <Download className="w-3 h-3" />
                                <span>PNG</span>
                              </button>
                            </div>
                          </div>
                          <WristbandPreview
                            design={draft}
                            event={snapshot.event}
                            attendee={att}
                            compact
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 text-center space-y-2">
                      <p className="text-sm font-semibold text-slate-700">
                        Belum ada gelang yang dicentang untuk dicetak atau diunduh
                      </p>
                      <p className="text-xs text-slate-500">
                        Centang minimal satu nama pengunjung pada daftar ceklis di sebelah kiri.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-slate-500 tabular-nums">
                Total terpilih: <strong className="text-slate-900">{checkedPrintAttendees.length}</strong> gelang
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPrintPreview(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={checkedPrintAttendees.length === 0 || downloadingBatch}
                  onClick={handleDownloadCheckedDesigns}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {downloadingBatch
                      ? 'Menyiapkan PNG...'
                      : downloadAsSingleSheet
                      ? `Unduh Lembar PNG (${checkedPrintAttendees.length})`
                      : `Unduh ${checkedPrintAttendees.length} File PNG`}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={checkedPrintAttendees.length === 0}
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Sekarang ({checkedPrintAttendees.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print-Only A4 Batch Wristband Sheet (matches checked items) */}
      <div className="hidden print-only space-y-4">
        {includePrintHeader && (
          <div className="mb-4 border-b border-slate-300 pb-2">
            <h1 className="text-lg font-bold">{snapshot.event.title} — Lembar Cetak Gelang Tiket</h1>
            <p className="text-xs text-slate-600">
              Desain: {draft.name} ({draft.themePreset} · {draft.widthMm}mm) · Enkripsi AES-256-GCM v{snapshot.event.encryptionKeyVersion}
            </p>
          </div>
        )}
        {checkedPrintAttendees.map((att, index) => (
          <div
            key={att.id}
            className={`mb-3 break-inside-avoid ${
              includeCutIndex ? 'pb-3 border-b border-dashed border-slate-400' : ''
            }`}
          >
            {includeCutIndex && (
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 mb-1">
                <span>
                  #{String(index + 1).padStart(2, '0')} · {att.fullName}
                </span>
                <span>
                  {att.ticketCode} · {att.tier}
                </span>
              </div>
            )}
            <WristbandPreview design={draft} event={snapshot.event} attendee={att} compact />
          </div>
        ))}
      </div>
    </div>
  );
};
