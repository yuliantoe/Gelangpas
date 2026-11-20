import React from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Music2, Plane, Sparkles, Ticket } from 'lucide-react';
import type {
  Attendee,
  EventInfo,
  TicketPreviewLayout,
  WristbandDesign,
} from '../types/event.ts';
import { QrCanvas } from './QrCanvas.tsx';

interface WristbandPreviewProps {
  design: WristbandDesign;
  event: EventInfo;
  attendee: Attendee;
  compact?: boolean;
}

export const TICKET_PREVIEW_LAYOUT_OPTIONS: Array<{
  id: TicketPreviewLayout;
  label: string;
  description: string;
}> = [
  {
    id: 'wristband',
    label: 'Gelang Pita QR',
    description: 'Strip gelang acara standar 2,2 cm × 28 cm (22 × 280 mm)',
  },
  {
    id: 'concert-ticket',
    label: 'Tiket Konser Musik',
    description: 'Panggung konser, equalizer & stub Admit One',
  },
  {
    id: 'boarding-pass',
    label: 'Tiket Boarding',
    description: 'Panel ilustrasi, rute gerbang & stub stempel',
  },
  {
    id: 'gallery-pass',
    label: 'Tiket Galeri',
    description: 'Stub barcode kiri & kanvas visual penuh',
  },
  {
    id: 'invitation-card',
    label: 'Kartu Undangan',
    description: 'Stub medali warna, daftar akses & QR',
  },
];

function getPatternSvg(pattern: WristbandDesign['pattern'], color: string): string {
  switch (pattern) {
    case 'diagonal':
      return `repeating-linear-gradient(135deg, transparent, transparent 12px, ${color}24 12px, ${color}24 24px)`;
    case 'geometric':
      return `radial-gradient(circle at 12px 12px, ${color}28 2px, transparent 2px), radial-gradient(circle at 28px 28px, ${color}1f 2px, transparent 2px)`;
    case 'wave':
      return `repeating-radial-gradient(circle at 0 50%, transparent 0, transparent 14px, ${color}22 14px, ${color}22 18px)`;
    case 'grid':
      return `linear-gradient(${color}1a 1px, transparent 1px), linear-gradient(90deg, ${color}1a 1px, transparent 1px)`;
    default:
      return 'none';
  }
}

function getMaterialLabel(material: WristbandDesign['material']): string {
  switch (material) {
    case 'tyvek':
      return 'Tyvek Tahan Air';
    case 'woven':
      return 'Kain Tenun (Woven)';
    case 'silicone':
      return 'Silikon Elastis';
    case 'rfid-pvc':
      return 'RFID + PVC Laminasi';
  }
}

function formatRupiah(amount: number): string {
  return amount > 0 ? `Rp ${amount.toLocaleString('id-ID')}` : 'Gratis / Undangan';
}

export function formatWristbandDimensionLabel(design: WristbandDesign): string {
  const widthCm = (design.widthMm / 10).toLocaleString('id-ID', {
    minimumFractionDigits: design.widthMm % 10 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
  const lengthCm = (design.lengthCm ?? 28).toLocaleString('id-ID', {
    maximumFractionDigits: 1,
  });
  return `${widthCm} cm × ${lengthCm} cm`;
}

function getShortCode(text: string, fallback: string): string {
  const letters = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return (letters.slice(0, 3) || fallback).padEnd(3, 'X');
}

const VerticalBarcodeBars: React.FC<{ seed: string; heightClass?: string }> = ({
  seed,
  heightClass = 'h-full',
}) => {
  const bars = Array.from({ length: 26 }, (_, idx) => {
    const code = seed.charCodeAt(idx % Math.max(1, seed.length)) || 65;
    const thick = (code + idx) % 3 === 0 ? 'h-[3px]' : (code + idx) % 2 === 0 ? 'h-[2px]' : 'h-[1px]';
    return { idx, thick };
  });

  return (
    <div className={`flex flex-col justify-between w-9 ${heightClass}`} aria-hidden="true">
      {bars.map((b) => (
        <span key={b.idx} className={`w-full bg-slate-900 rounded-[0.5px] ${b.thick}`} />
      ))}
    </div>
  );
};

export const WristbandPreview: React.FC<WristbandPreviewProps> = ({
  design,
  event,
  attendee,
  compact = false,
}) => {
  const layout: TicketPreviewLayout = design.previewLayout ?? 'wristband';
  const patternBg = getPatternSvg(design.pattern, design.accentColor);
  const hasCustomBg = Boolean(design.customBackgroundDataUrl);
  const customFit = design.customBackgroundFit ?? 'cover';
  const overlayOpacity =
    typeof design.customOverlayOpacity === 'number' ? design.customOverlayOpacity : 0.25;
  const showPattern = patternBg !== 'none' && (!hasCustomBg || !design.hidePatternOnCustomBg);

  // 0. CONCERT TICKET LAYOUT (Tiket Konser Musik — Stage Pass & Admit One Stub)
  if (layout === 'concert-ticket') {
    const minW = compact ? 580 : 690;
    const qrSize = compact ? 64 : 76;
    const eqHeights = [36, 62, 48, 84, 54, 92, 68, 42, 76, 52, 88, 44, 66, 38];

    return (
      <div className="w-full overflow-x-auto pb-1">
        <div
          className="relative mx-auto flex items-stretch rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-white select-none"
          style={{ minWidth: minW, maxWidth: 780, minHeight: compact ? 186 : 216 }}
        >
          {/* Main Stage Concert Pass Panel */}
          <div
            className="relative flex-1 p-5 flex flex-col justify-between overflow-hidden min-w-0"
            style={{
              background: `linear-gradient(125deg, ${design.primaryColor} 0%, ${design.secondaryColor} 100%)`,
              color: design.textColor,
            }}
          >
            {design.customBackgroundDataUrl && (
              <>
                <img
                  src={design.customBackgroundDataUrl}
                  alt="Artwork tiket konser musik"
                  className={`absolute inset-0 w-full h-full pointer-events-none ${
                    customFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundColor: `rgba(15, 23, 42, ${Math.max(0.24, overlayOpacity)})`,
                  }}
                />
              </>
            )}

            {showPattern && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: patternBg,
                  backgroundSize:
                    design.pattern === 'grid'
                      ? '18px 18px'
                      : design.pattern === 'geometric'
                      ? '28px 28px'
                      : undefined,
                }}
              />
            )}

            {/* Subtle Stage Spotlight Glow */}
            <div
              className="absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-25 pointer-events-none blur-xl"
              style={{ backgroundColor: design.accentColor }}
              aria-hidden="true"
            />

            {/* Top Concert Header */}
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {design.brandLogoDataUrl ? (
                  <div className="w-9 h-9 rounded-lg bg-white/95 p-1 flex items-center justify-center shrink-0 shadow-sm">
                    <img
                      src={design.brandLogoDataUrl}
                      alt="Logo konser"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: design.accentColor, color: '#0F172A' }}
                  >
                    <Music2 className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest opacity-85 truncate">
                    Live Music Concert · {design.sponsorLabel || event.organizerName}
                  </p>
                  <p className="font-mono text-[11px] opacity-90 truncate">
                    {event.dateLabel}
                  </p>
                </div>
              </div>

              {design.showTierBadge && (
                <span
                  className="px-2.5 py-1 rounded text-[11px] font-extrabold tracking-wide shrink-0"
                  style={{ backgroundColor: design.accentColor, color: '#0F172A' }}
                >
                  {attendee.tier}
                </span>
              )}
            </div>

            {/* Center Concert Title + Equalizer Bars */}
            <div className="relative z-10 flex items-end justify-between gap-4 my-2">
              <div className="min-w-0">
                <h4 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight leading-tight truncate">
                  {event.title}
                </h4>
                <p className="text-xs opacity-85 truncate mt-0.5">
                  {design.customTagline} · {event.venue}
                </p>
              </div>

              {/* Audio Equalizer Decorative Bars */}
              <div className="hidden sm:flex items-end gap-1 h-9 opacity-75 shrink-0" aria-hidden="true">
                {eqHeights.map((pct, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-t-sm"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: i % 2 === 0 ? design.accentColor : design.textColor,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Bottom Stage Access Details */}
            <div className="relative z-10 pt-2.5 border-t border-white/20 grid grid-cols-3 gap-3 text-[11px]">
              <div className="min-w-0">
                <span className="opacity-70 block text-[10px]">Pemegang Tiket</span>
                <span className="font-semibold truncate block">
                  {design.showHolderName ? attendee.fullName : attendee.tier}
                </span>
              </div>
              <div className="min-w-0">
                <span className="opacity-70 block text-[10px]">Pintu Masuk</span>
                <span className="font-semibold truncate block">{attendee.gateAssigned}</span>
              </div>
              <div className="min-w-0 text-right">
                <span className="opacity-70 block text-[10px]">Tarif Masuk</span>
                <span className="font-mono font-bold block">{formatRupiah(attendee.amountPaid)}</span>
              </div>
            </div>
          </div>

          {/* Perforated Cut Line with Punch Notches */}
          <div className="relative w-0 border-l-2 border-dashed border-slate-300 shrink-0">
            <span className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-300" />
            <span className="absolute -bottom-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-300" />
          </div>

          {/* Right Tear-Off Admit One Stub */}
          <div className="w-[29%] bg-white text-slate-900 p-3.5 sm:p-4 flex items-center justify-between gap-2 shrink-0">
            <div className="flex flex-col items-center justify-between h-full flex-1 min-w-0 text-center">
              <div className="w-full">
                <div
                  className="text-[10px] font-extrabold tracking-widest uppercase py-0.5 rounded text-white"
                  style={{ backgroundColor: design.primaryColor }}
                >
                  ADMIT ONE
                </div>
                <p className="text-[10px] font-bold text-slate-800 mt-1 truncate">
                  {attendee.tier} · {attendee.gateAssigned}
                </p>
              </div>

              <div className="p-1 rounded-lg border border-slate-200 bg-white my-1">
                <QrCanvas value={attendee.qrToken} size={qrSize} />
              </div>

              <p className="font-mono text-[10px] font-bold text-slate-700 truncate w-full">
                {attendee.ticketCode}
              </p>
            </div>

            <VerticalBarcodeBars seed={attendee.ticketCode} heightClass="h-36" />
          </div>
        </div>
      </div>
    );
  }

  // 1. BOARDING PASS LAYOUT (Inspired by Travel / Boarding Pass Reference)
  if (layout === 'boarding-pass') {
    const minW = compact ? 580 : 690;
    const qrSize = compact ? 54 : 66;
    const originCode = getShortCode(event.organizerName || 'GP', 'IDN');
    const gateCode = getShortCode(attendee.gateAssigned || 'GATE', 'GTE');

    return (
      <div className="w-full overflow-x-auto pb-1">
        <div
          className="relative mx-auto flex items-stretch rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-white select-none"
          style={{ minWidth: minW, maxWidth: 780, minHeight: compact ? 188 : 220 }}
        >
          {/* Left Illustrated / Theme Artwork Panel */}
          <div
            className="relative w-[36%] p-4 sm:p-5 flex flex-col justify-between overflow-hidden shrink-0"
            style={{
              background: `linear-gradient(135deg, ${design.primaryColor} 0%, ${design.secondaryColor} 100%)`,
              color: design.textColor,
            }}
          >
            {design.customBackgroundDataUrl && (
              <>
                <img
                  src={design.customBackgroundDataUrl}
                  alt="Artwork tiket boarding"
                  className={`absolute inset-0 w-full h-full pointer-events-none ${
                    customFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />
                {overlayOpacity > 0 && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: `rgba(15, 23, 42, ${overlayOpacity})` }}
                  />
                )}
              </>
            )}

            {showPattern && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: patternBg,
                  backgroundSize:
                    design.pattern === 'grid'
                      ? '18px 18px'
                      : design.pattern === 'geometric'
                      ? '28px 28px'
                      : undefined,
                }}
              />
            )}

            {/* Geometric decorative vector motifs */}
            <svg
              viewBox="0 0 220 140"
              className="absolute -bottom-3 -right-3 w-44 h-28 opacity-25 pointer-events-none"
              aria-hidden="true"
            >
              <circle cx="155" cy="90" r="46" fill={design.accentColor} />
              <circle cx="80" cy="40" r="18" fill="#FFFFFF" />
              <path
                d="M25 110 L55 55 L85 110 Z"
                fill={design.accentColor}
                opacity="0.7"
              />
            </svg>

            <div className="relative z-10 flex items-center justify-between gap-2">
              {design.brandLogoDataUrl ? (
                <div className="w-10 h-10 rounded-lg bg-white/95 p-1 flex items-center justify-center shadow-sm">
                  <img
                    src={design.brandLogoDataUrl}
                    alt="Logo acara"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: design.accentColor, color: '#0F172A' }}
                >
                  <Ticket className="w-5 h-5" />
                </div>
              )}
              <Sparkles className="w-4 h-4 opacity-80" />
            </div>

            <div className="relative z-10 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-85">
                {design.sponsorLabel || 'GelangPass Event'}
              </p>
              <p className="font-display text-sm sm:text-base font-bold leading-snug line-clamp-2">
                {event.title}
              </p>
              {design.showTierBadge && (
                <span
                  className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold"
                  style={{ backgroundColor: design.accentColor, color: '#0F172A' }}
                >
                  {attendee.tier}
                </span>
              )}
            </div>
          </div>

          {/* Center White Boarding Details */}
          <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between bg-white text-slate-900 min-w-0">
            <div>
              <p className="text-[10px] font-medium text-slate-500">
                {design.sponsorLabel || 'Pass Masuk Resmi'}
              </p>
              <h4
                className="font-display text-lg sm:text-xl font-extrabold tracking-tight leading-tight truncate mt-0.5"
                style={{ color: design.primaryColor }}
              >
                {event.title}
              </h4>
              <p className="font-mono text-[11px] font-semibold text-slate-700 mt-1">
                {event.dateLabel}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px] my-2">
              <div>
                <span className="text-slate-400 block text-[10px]">Kode Tiket</span>
                <span className="font-mono font-bold text-slate-800">{attendee.ticketCode}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Pemegang</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {design.showHolderName ? attendee.fullName : attendee.tier}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 font-display font-extrabold text-base sm:text-lg text-slate-900">
                  <span>{originCode}</span>
                  <Plane className="w-4 h-4 text-slate-700" />
                  <span>{gateCode}</span>
                </div>
                <p className="text-[10px] text-slate-500 truncate max-w-[190px]">
                  {event.venue} · {attendee.gateAssigned}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-400 block">Tarif</span>
                <span className="font-mono text-xs font-bold text-slate-900">
                  {formatRupiah(attendee.amountPaid)}
                </span>
              </div>
            </div>
          </div>

          {/* Perforated Divider with Top/Bottom Semicircle Notches */}
          <div className="relative w-0 border-l-2 border-dashed border-slate-300 shrink-0">
            <span className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-300" />
            <span className="absolute -bottom-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-300" />
          </div>

          {/* Right Boarding Stub with QR, Stamp & Barcode */}
          <div className="relative w-[27%] p-3.5 sm:p-4 flex items-center justify-between gap-2 bg-white text-slate-900 shrink-0">
            <div className="flex flex-col justify-between h-full min-w-0 flex-1">
              <div className="space-y-1.5 text-[10px]">
                <div>
                  <span className="text-slate-400 block">Kategori</span>
                  <span className="font-bold text-slate-900">{attendee.tier}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Gerbang</span>
                  <span className="font-semibold text-slate-800 truncate block">
                    {attendee.gateAssigned}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Zona</span>
                  <span className="text-slate-700 truncate block">{design.customTagline}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <div className="p-1 rounded border border-slate-200 bg-white">
                  <QrCanvas value={attendee.qrToken} size={qrSize} />
                </div>
              </div>
            </div>

            <VerticalBarcodeBars seed={attendee.ticketCode} heightClass="h-36" />

            {/* Circular Stamp Seal */}
            <div
              className="pointer-events-none absolute right-6 bottom-3 w-14 h-14 rounded-full border-2 border-dashed flex flex-col items-center justify-center -rotate-12 opacity-75"
              style={{ borderColor: design.primaryColor, color: design.primaryColor }}
              aria-hidden="true"
            >
              <span className="text-[7px] font-bold tracking-wider uppercase">VERIFIED</span>
              <span className="font-mono text-[8px] font-extrabold">PASS</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. GALLERY PASS LAYOUT (Inspired by Exhibition / Art Gallery Ticket Reference)
  if (layout === 'gallery-pass') {
    const minW = compact ? 580 : 680;
    const qrSize = compact ? 64 : 78;

    return (
      <div className="w-full overflow-x-auto pb-1">
        <div
          className="relative mx-auto flex items-stretch rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-white select-none"
          style={{ minWidth: minW, maxWidth: 780, minHeight: compact ? 168 : 196 }}
        >
          {/* Left White Barcode & Ticket Code Stub */}
          <div className="w-[18%] bg-white px-3 py-4 flex items-center justify-center gap-2 shrink-0">
            <VerticalBarcodeBars seed={attendee.ticketCode} heightClass="h-32" />
            <span className="font-mono text-[9px] font-semibold text-slate-600 tracking-widest [writing-mode:vertical-rl] rotate-180">
              {attendee.ticketCode}
            </span>
          </div>

          {/* Perforated Cut Line with Punch Notches */}
          <div className="relative w-0 border-l-2 border-dashed border-slate-300 shrink-0">
            <span className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-300" />
            <span className="absolute -bottom-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-300" />
          </div>

          {/* Right Rich Artwork Exhibition Panel */}
          <div
            className="relative flex-1 p-5 flex items-center justify-between gap-4 overflow-hidden"
            style={{
              background: `linear-gradient(115deg, ${design.primaryColor} 0%, ${design.secondaryColor} 100%)`,
              color: design.textColor,
            }}
          >
            {design.customBackgroundDataUrl && (
              <>
                <img
                  src={design.customBackgroundDataUrl}
                  alt="Artwork tiket galeri"
                  className={`absolute inset-0 w-full h-full pointer-events-none ${
                    customFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundColor: `rgba(15, 23, 42, ${Math.max(0.28, overlayOpacity)})`,
                  }}
                />
              </>
            )}

            {showPattern && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: patternBg,
                  backgroundSize:
                    design.pattern === 'grid'
                      ? '18px 18px'
                      : design.pattern === 'geometric'
                      ? '30px 30px'
                      : undefined,
                }}
              />
            )}

            <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-between h-full gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  {design.brandLogoDataUrl && (
                    <div className="w-8 h-8 rounded-md bg-white/95 p-0.5 shrink-0 flex items-center justify-center">
                      <img
                        src={design.brandLogoDataUrl}
                        alt="Logo galeri"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <h4 className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
                    {event.title} — {attendee.tier}
                  </h4>
                </div>
                <p className="text-xs opacity-90 mt-1">
                  {event.dateLabel} · {event.venue}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] opacity-75 block">Tarif Tiket</span>
                  <span className="font-mono font-bold text-sm">
                    {formatRupiah(attendee.amountPaid)}
                  </span>
                  {design.showHolderName && (
                    <span className="block text-[11px] opacity-85 truncate mt-0.5">
                      Pemegang: {attendee.fullName}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] opacity-75 block">Termasuk Akses:</span>
                  <span className="font-semibold block truncate">{attendee.gateAssigned}</span>
                  <span className="text-[11px] opacity-85 block truncate">
                    {design.customTagline}
                  </span>
                </div>
              </div>
            </div>

            {/* Scannable QR Box */}
            <div className="relative z-10 shrink-0 flex flex-col items-center gap-1.5">
              <div className="bg-white p-1.5 rounded-lg shadow-sm">
                <QrCanvas value={attendee.qrToken} size={qrSize} />
              </div>
              <span className="font-mono text-[10px] opacity-85">{attendee.ticketCode}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. INVITATION CARD LAYOUT (Inspired by 2-Part Invitation Pass Reference)
  if (layout === 'invitation-card') {
    const minW = compact ? 580 : 680;
    const qrSize = compact ? 58 : 70;

    return (
      <div className="w-full overflow-x-auto pb-1">
        <div
          className="relative mx-auto flex items-stretch rounded-2xl overflow-hidden border border-slate-300 shadow-sm bg-white select-none"
          style={{ minWidth: minW, maxWidth: 780, minHeight: compact ? 186 : 216 }}
        >
          {/* Left Bold Colored Invitation Stub with Medallion */}
          <div
            className="relative w-[31%] p-5 flex flex-col items-center justify-center text-center overflow-hidden shrink-0"
            style={{
              background: `linear-gradient(155deg, ${design.primaryColor} 0%, ${design.secondaryColor} 100%)`,
              color: design.textColor,
            }}
          >
            {design.customBackgroundDataUrl && (
              <>
                <img
                  src={design.customBackgroundDataUrl}
                  alt="Latar kartu undangan"
                  className={`absolute inset-0 w-full h-full pointer-events-none ${
                    customFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />
                {overlayOpacity > 0 && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: `rgba(15, 23, 42, ${overlayOpacity})` }}
                  />
                )}
              </>
            )}

            <div className="relative z-10 w-12 h-12 rounded-full bg-white/20 border-2 border-white/60 flex items-center justify-center mb-3 shadow-sm overflow-hidden">
              {design.brandLogoDataUrl ? (
                <img
                  src={design.brandLogoDataUrl}
                  alt="Medali logo"
                  className="w-full h-full object-contain bg-white p-1"
                />
              ) : (
                <Ticket className="w-6 h-6" />
              )}
            </div>

            <p className="relative z-10 font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-snug">
              1X {attendee.tier}
              <br />
              INVITATION
            </p>
            <p className="relative z-10 font-mono text-[10px] opacity-85 mt-2">
              {attendee.ticketCode}
            </p>
          </div>

          {/* Perforated Divider with Notches */}
          <div className="relative w-0 border-l-2 border-dashed border-slate-300 shrink-0">
            <span className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-300" />
            <span className="absolute -bottom-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-300" />
          </div>

          {/* Right White Checklist & QR Panel */}
          <div className="relative flex-1 p-5 sm:p-6 bg-white text-slate-900 flex flex-col justify-between min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-400">
                  {design.sponsorLabel || 'Undangan Resmi Acara'}
                </p>
                <h4 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate mt-0.5">
                  {design.showHolderName ? attendee.fullName : event.title}
                </h4>
              </div>
              <div className="p-1 rounded-lg border border-slate-200 bg-white shrink-0">
                <QrCanvas value={attendee.qrToken} size={qrSize} />
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-700 my-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: design.primaryColor }} />
                <span className="truncate">
                  {event.title} · {event.dateLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: design.primaryColor }} />
                <span className="truncate">{event.venue}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: design.primaryColor }} />
                <span className="truncate">
                  {attendee.gateAssigned} · {design.customTagline}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-slate-500 truncate">
                Email: {attendee.email}
              </p>
              <span
                className="px-3.5 py-1.5 rounded-full text-[11px] font-semibold text-white shrink-0"
                style={{ backgroundColor: design.primaryColor }}
              >
                {attendee.tier} · {formatRupiah(attendee.amountPaid)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. DEFAULT WRISTBAND LAYOUT (Gelang Pita QR · 2,2 cm × 28 cm)
  const heightPx =
    design.widthMm === 25
      ? compact
        ? 110
        : 136
      : design.widthMm === 22
      ? compact
        ? 98
        : 114
      : compact
      ? 90
      : 108;
  const qrSize =
    design.widthMm === 25
      ? compact
        ? 78
        : 98
      : design.widthMm === 22
      ? compact
        ? 72
        : 84
      : compact
      ? 64
      : 78;
  const logoSize = compact ? 34 : 44;

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div
        className="relative flex items-center justify-between rounded-xl overflow-hidden border border-slate-300/60 select-none shadow-sm mx-auto"
        style={{
          minWidth: compact ? 620 : 740,
          maxWidth: 880,
          height: heightPx,
          background: `linear-gradient(100deg, ${design.primaryColor} 0%, ${design.secondaryColor} 100%)`,
          color: design.textColor,
        }}
      >
        {/* Custom Uploaded Wristband Background Artwork */}
        {design.customBackgroundDataUrl && (
          <>
            <img
              src={design.customBackgroundDataUrl}
              alt="Desain gelang kustom"
              className={`absolute inset-0 w-full h-full pointer-events-none ${
                customFit === 'contain' ? 'object-contain' : 'object-cover'
              }`}
            />
            {overlayOpacity > 0 && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ backgroundColor: `rgba(15, 23, 42, ${overlayOpacity})` }}
              />
            )}
          </>
        )}

        {/* Pattern Overlay */}
        {showPattern && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: patternBg,
              backgroundSize:
                design.pattern === 'grid'
                  ? '18px 18px'
                  : design.pattern === 'geometric'
                  ? '32px 32px'
                  : undefined,
            }}
          />
        )}

        {/* Material Texture Subtle Sheen */}
        {design.material === 'woven' && (
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.2) 0px, rgba(255,255,255,0.2) 1px, transparent 1px, transparent 3px)',
            }}
          />
        )}

        {/* Left Clasp / Snap Hole Zone */}
        <div className="relative z-10 h-full w-14 flex flex-col items-center justify-center gap-3 border-r border-white/20 bg-black/15 shrink-0">
          <span className="w-3.5 h-3.5 rounded-full bg-slate-100 border-2 border-black/30 shadow-inner" />
          <span className="w-3.5 h-3.5 rounded-full bg-slate-100 border-2 border-black/30 shadow-inner" />
        </div>

        {/* Event Brand & Holder Details */}
        <div className="relative z-10 flex-1 px-4 sm:px-5 py-1.5 flex flex-col justify-between h-full min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {design.brandLogoDataUrl && (
                <div
                  className="rounded-lg bg-white/95 p-1 flex items-center justify-center shrink-0 shadow-sm border border-black/10"
                  style={{ width: logoSize, height: logoSize }}
                >
                  <img
                    src={design.brandLogoDataUrl}
                    alt="Logo Brand Acara"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-medium opacity-85 truncate">
                  <span>{design.sponsorLabel || 'GelangPass'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{event.dateLabel}</span>
                </div>
                <h4 className="font-display font-bold tracking-tight text-sm md:text-base leading-tight truncate">
                  {event.title}
                </h4>
              </div>
            </div>

            {design.showTierBadge && (
              <div
                className="px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide shrink-0"
                style={{
                  backgroundColor: design.accentColor,
                  color: '#0F172A',
                }}
              >
                {attendee.tier}
              </div>
            )}
          </div>

          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              {design.showHolderName && (
                <p className="text-xs font-semibold leading-tight truncate">
                  {attendee.fullName}
                </p>
              )}
              <p className="text-[10px] opacity-80 leading-tight truncate mt-0.5">
                {design.customTagline} · {attendee.gateAssigned}
              </p>
              {design.showSecurityMicrotext && (
                <p className="font-mono text-[9px] opacity-75 leading-tight tracking-wider truncate mt-0.5">
                  AES-256-GCM · {attendee.ticketCode}
                </p>
              )}
            </div>
            <div className="text-right shrink-0 hidden sm:block">
              <span className="text-[10px] opacity-80 block">
                {getMaterialLabel(design.material)} · {formatWristbandDimensionLabel(design)}
              </span>
            </div>
          </div>
        </div>

        {/* Perforated Tear Line */}
        {design.showPerforation && (
          <div
            className="relative z-10 h-full w-0 border-l-2 border-dashed border-white/40 shrink-0"
            aria-hidden="true"
          />
        )}

        {/* QR Security Zone */}
        <div className="relative z-10 h-full px-4 flex items-center gap-3 bg-white/10 backdrop-blur-[1px] shrink-0">
          <div className="bg-white p-1.5 rounded-lg shadow-sm flex items-center justify-center">
            <QrCanvas value={attendee.qrToken} size={qrSize} />
          </div>
          <div className="flex flex-col items-center justify-center">
            <span className="font-mono text-[10px] font-semibold tracking-widest opacity-90 [writing-mode:vertical-rl] rotate-180">
              {attendee.ticketCode}
            </span>
          </div>
        </div>

        {/* Right Fastener Zone */}
        <div className="relative z-10 h-full w-10 flex flex-col items-center justify-center border-l border-white/20 bg-black/15 shrink-0">
          <span className="w-3 h-3 rounded-full bg-slate-100 border-2 border-black/30" />
        </div>
      </div>
    </div>
  );
};

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawPatternOnCanvas(
  ctx: CanvasRenderingContext2D,
  design: WristbandDesign,
  x0: number,
  y0: number,
  w: number,
  h: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();

  if (design.pattern === 'diagonal') {
    ctx.strokeStyle = `${design.accentColor}30`;
    ctx.lineWidth = 14;
    for (let x = x0 - h; x < x0 + w + h; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + h, y0 + h);
      ctx.stroke();
    }
  } else if (design.pattern === 'grid') {
    ctx.strokeStyle = `${design.accentColor}28`;
    ctx.lineWidth = 2;
    for (let x = x0; x < x0 + w; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + h);
      ctx.stroke();
    }
    for (let y = y0; y < y0 + h; y += 36) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
    }
  } else if (design.pattern === 'geometric') {
    ctx.fillStyle = `${design.accentColor}24`;
    for (let x = x0 + 28; x < x0 + w; x += 64) {
      for (let y = y0 + 28; y < y0 + h; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (design.pattern === 'wave') {
    ctx.strokeStyle = `${design.accentColor}26`;
    ctx.lineWidth = 4;
    for (let r = 80; r < w + 200; r += 36) {
      ctx.beginPath();
      ctx.arc(x0 + 40, y0 + h / 2, r, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawVerticalBarcodeCanvas(
  ctx: CanvasRenderingContext2D,
  seed: string,
  x: number,
  y: number,
  barWidth: number,
  totalHeight: number
) {
  ctx.fillStyle = '#0F172A';
  const count = 28;
  const step = totalHeight / count;
  for (let i = 0; i < count; i++) {
    const code = seed.charCodeAt(i % Math.max(1, seed.length)) || 65;
    const thickness = (code + i) % 3 === 0 ? step * 0.62 : (code + i) % 2 === 0 ? step * 0.42 : step * 0.25;
    ctx.fillRect(x, y + i * step, barWidth, Math.max(2, thickness));
  }
}

export function getExportDimensions(design: WristbandDesign): {
  width: number;
  height: number;
} {
  const layout = design.previewLayout ?? 'wristband';
  switch (layout) {
    case 'concert-ticket':
      return { width: 1600, height: 500 };
    case 'boarding-pass':
      return { width: 1600, height: 500 };
    case 'gallery-pass':
      return { width: 1600, height: 460 };
    case 'invitation-card':
      return { width: 1600, height: 520 };
    default: {
      // Exact 2,2 cm × 28 cm (22 × 280 mm) scale at 100 px/cm = 2800 × 220 px
      const widthPx = Math.round((design.lengthCm ?? 28) * 100);
      const heightPx = Math.round(design.widthMm * 10);
      return { width: widthPx, height: heightPx };
    }
  }
}

export function getExportHeightForDesign(design: WristbandDesign): number {
  return getExportDimensions(design).height;
}

async function renderWristbandCanvas(
  design: WristbandDesign,
  event: EventInfo,
  attendee: Attendee
): Promise<HTMLCanvasElement> {
  const layout = design.previewLayout ?? 'wristband';
  const { width, height } = getExportDimensions(design);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const hasCustomBg = Boolean(design.customBackgroundDataUrl);
  const bgImg = design.customBackgroundDataUrl
    ? await loadImageElement(design.customBackgroundDataUrl)
    : null;
  const logoImg = design.brandLogoDataUrl ? await loadImageElement(design.brandLogoDataUrl) : null;
  const qrDataUrl = await QRCode.toDataURL(attendee.qrToken, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });
  const qrImg = await loadImageElement(qrDataUrl);

  const shouldDrawPattern = !hasCustomBg || !design.hidePatternOnCustomBg;
  const overlayOpacity =
    typeof design.customOverlayOpacity === 'number' ? design.customOverlayOpacity : 0.25;

  const drawCustomCover = (x: number, y: number, w: number, h: number, minScrim = 0) => {
    if (!bgImg || bgImg.width <= 0 || bgImg.height <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const fit = design.customBackgroundFit ?? 'cover';
    const scale =
      fit === 'contain' ? Math.min(w / bgImg.width, h / bgImg.height) : Math.max(w / bgImg.width, h / bgImg.height);
    const drawW = bgImg.width * scale;
    const drawH = bgImg.height * scale;
    ctx.drawImage(bgImg, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
    const scrim = Math.max(minScrim, overlayOpacity);
    if (scrim > 0) {
      ctx.fillStyle = `rgba(15, 23, 42, ${scrim})`;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  };

  // RENDER CONCERT TICKET ON CANVAS
  if (layout === 'concert-ticket') {
    const mainW = 1140;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 28);
    ctx.fill();

    // Left Stage Backdrop
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, mainW, height, [28, 0, 0, 28]);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, 0, mainW, height);
    grad.addColorStop(0, design.primaryColor);
    grad.addColorStop(1, design.secondaryColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, mainW, height);
    drawCustomCover(0, 0, mainW, height, 0.24);
    if (shouldDrawPattern) drawPatternOnCanvas(ctx, design, 0, 0, mainW, height);

    // Subtle Stage Spotlight
    ctx.fillStyle = design.accentColor;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(mainW - 110, 60, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Top Concert Header
    let hx = 56;
    if (logoImg) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.roundRect(56, 44, 80, 80, 14);
      ctx.fill();
      const s = Math.min(64 / logoImg.width, 64 / logoImg.height);
      ctx.drawImage(logoImg, 56 + (80 - logoImg.width * s) / 2, 44 + (80 - logoImg.height * s) / 2, logoImg.width * s, logoImg.height * s);
      hx = 156;
    }

    ctx.fillStyle = design.textColor;
    ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
    ctx.globalAlpha = 0.88;
    ctx.fillText(`LIVE MUSIC CONCERT  ·  ${(design.sponsorLabel || event.organizerName).toUpperCase()}`, hx, 74);
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(event.dateLabel, hx, 108);
    ctx.globalAlpha = 1;

    if (design.showTierBadge) {
      ctx.fillStyle = design.accentColor;
      ctx.beginPath();
      ctx.roundRect(mainW - 220, 46, 168, 46, 10);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(attendee.tier, mainW - 136, 76);
      ctx.textAlign = 'left';
    }

    // Center Concert Headline + Audio Equalizer Bars
    ctx.fillStyle = design.textColor;
    ctx.font = '800 52px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(event.title.slice(0, 28), 56, 232);
    ctx.font = '500 24px "DM Sans", sans-serif';
    ctx.globalAlpha = 0.88;
    ctx.fillText(`${design.customTagline}  ·  ${event.venue}`.slice(0, 52), 56, 276);
    ctx.globalAlpha = 1;

    const eqHeights = [36, 62, 48, 84, 54, 92, 68, 42, 76, 52, 88, 44, 66, 38];
    eqHeights.forEach((pct, i) => {
      const barH = (pct / 100) * 90;
      ctx.fillStyle = i % 2 === 0 ? design.accentColor : design.textColor;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(mainW - 260 + i * 14, 290 - barH, 8, barH);
    });
    ctx.globalAlpha = 1;

    // Bottom Divider & Metadata
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(56, 350);
    ctx.lineTo(mainW - 56, 350);
    ctx.stroke();

    ctx.fillStyle = design.textColor;
    ctx.globalAlpha = 0.75;
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.fillText('PEMEGANG TIKET', 56, 392);
    ctx.fillText('PINTU MASUK', 430, 392);
    ctx.fillText('TARIF MASUK', 810, 392);
    ctx.globalAlpha = 1;

    ctx.font = '700 25px "DM Sans", sans-serif';
    ctx.fillText(design.showHolderName ? attendee.fullName.slice(0, 22) : attendee.tier, 56, 432);
    ctx.fillText(attendee.gateAssigned.slice(0, 22), 430, 432);
    ctx.font = '800 26px "JetBrains Mono", monospace';
    ctx.fillText(formatRupiah(attendee.amountPaid), 810, 432);

    // Perforation + Punch Notches
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mainW, 0);
    ctx.lineTo(mainW, height);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.arc(mainW, 0, 22, 0, Math.PI * 2);
    ctx.arc(mainW, height, 22, 0, Math.PI * 2);
    ctx.fill();

    // Right Admit One Stub
    const sx = mainW + 34;
    ctx.fillStyle = design.primaryColor;
    ctx.beginPath();
    ctx.roundRect(sx, 40, 270, 42, 8);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('ADMIT ONE', sx + 135, 68);

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 18px "DM Sans", sans-serif';
    ctx.fillText(`${attendee.tier} · ${attendee.gateAssigned}`.slice(0, 24), sx + 135, 114);

    if (qrImg) {
      ctx.drawImage(qrImg, sx + 22, 138, 226, 226);
    }

    ctx.fillStyle = '#334155';
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText(attendee.ticketCode, sx + 135, height - 50);
    ctx.textAlign = 'left';

    drawVerticalBarcodeCanvas(ctx, attendee.ticketCode, width - 102, 44, 64, height - 88);

    return canvas;
  }

  // RENDER BOARDING PASS ON CANVAS
  if (layout === 'boarding-pass') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 28);
    ctx.fill();

    const leftW = 560;
    const stubX = 1170;

    // Left colored panel
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, leftW, height, [28, 0, 0, 28]);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, 0, leftW, height);
    grad.addColorStop(0, design.primaryColor);
    grad.addColorStop(1, design.secondaryColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, leftW, height);
    drawCustomCover(0, 0, leftW, height);
    if (shouldDrawPattern) drawPatternOnCanvas(ctx, design, 0, 0, leftW, height);

    // Decorative vector circles
    ctx.fillStyle = design.accentColor;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(leftW - 90, height - 60, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    if (logoImg) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.roundRect(44, 40, 88, 88, 16);
      ctx.fill();
      const s = Math.min(72 / logoImg.width, 72 / logoImg.height);
      ctx.drawImage(logoImg, 44 + (88 - logoImg.width * s) / 2, 40 + (88 - logoImg.height * s) / 2, logoImg.width * s, logoImg.height * s);
    }

    ctx.fillStyle = design.textColor;
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText((design.sponsorLabel || 'GelangPass Event').toUpperCase(), 44, height - 138);
    ctx.font = '800 36px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(event.title.slice(0, 28), 44, height - 92);
    if (design.showTierBadge) {
      ctx.fillStyle = design.accentColor;
      ctx.beginPath();
      ctx.roundRect(44, height - 68, 160, 38, 8);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(attendee.tier, 62, height - 42);
    }

    // Center white panel
    const cx = leftW + 44;
    ctx.fillStyle = '#64748B';
    ctx.font = '500 20px "DM Sans", sans-serif';
    ctx.fillText(design.sponsorLabel || 'Pass Masuk Resmi', cx, 66);

    ctx.fillStyle = design.primaryColor;
    ctx.font = '800 40px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(event.title.slice(0, 26), cx, 116);

    ctx.fillStyle = '#334155';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(event.dateLabel, cx, 164);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.fillText('KODE TIKET', cx, 224);
    ctx.fillText('PEMEGANG', cx + 260, 224);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(attendee.ticketCode, cx, 256);
    ctx.font = '700 24px "DM Sans", sans-serif';
    ctx.fillText(design.showHolderName ? attendee.fullName.slice(0, 18) : attendee.tier, cx + 260, 256);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, 304);
    ctx.lineTo(stubX - 40, 304);
    ctx.stroke();

    const originCode = getShortCode(event.organizerName || 'GP', 'IDN');
    const gateCode = getShortCode(attendee.gateAssigned || 'GATE', 'GTE');
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 42px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${originCode}  ✈  ${gateCode}`, cx, 368);
    ctx.fillStyle = '#64748B';
    ctx.font = '500 20px "DM Sans", sans-serif';
    ctx.fillText(`${event.venue.slice(0, 30)} · ${attendee.gateAssigned}`, cx, 412);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(formatRupiah(attendee.amountPaid), cx, 454);

    // Perforation line + punch notches
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(stubX, 0);
    ctx.lineTo(stubX, height);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.arc(stubX, 0, 20, 0, Math.PI * 2);
    ctx.arc(stubX, height, 20, 0, Math.PI * 2);
    ctx.fill();

    // Right stub
    const sx = stubX + 36;
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.fillText('KATEGORI', sx, 68);
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(attendee.tier, sx, 98);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.fillText('GERBANG', sx, 146);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 21px "DM Sans", sans-serif';
    ctx.fillText(attendee.gateAssigned, sx, 174);

    if (qrImg) {
      ctx.drawImage(qrImg, sx, 250, 175, 175);
    }
    drawVerticalBarcodeCanvas(ctx, attendee.ticketCode, width - 115, 44, 72, height - 88);

    // Stamp seal
    ctx.save();
    ctx.translate(width - 175, height - 85);
    ctx.rotate(-0.22);
    ctx.strokeStyle = design.primaryColor;
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = design.primaryColor;
    ctx.textAlign = 'center';
    ctx.font = '800 15px "JetBrains Mono", monospace';
    ctx.fillText('VERIFIED', 0, -2);
    ctx.fillText('PASS', 0, 18);
    ctx.restore();

    return canvas;
  }

  // RENDER GALLERY PASS ON CANVAS
  if (layout === 'gallery-pass') {
    const stubW = 285;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 24);
    ctx.fill();

    drawVerticalBarcodeCanvas(ctx, attendee.ticketCode, 64, 48, 96, height - 96);
    ctx.save();
    ctx.translate(210, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#475569';
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(attendee.ticketCode, 0, 0);
    ctx.restore();

    // Artwork panel
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(stubW, 0, width - stubW, height, [0, 24, 24, 0]);
    ctx.clip();
    const grad = ctx.createLinearGradient(stubW, 0, width, height);
    grad.addColorStop(0, design.primaryColor);
    grad.addColorStop(1, design.secondaryColor);
    ctx.fillStyle = grad;
    ctx.fillRect(stubW, 0, width - stubW, height);
    drawCustomCover(stubW, 0, width - stubW, height, 0.28);
    if (shouldDrawPattern) drawPatternOnCanvas(ctx, design, stubW, 0, width - stubW, height);
    ctx.restore();

    // Perforation + notches
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(stubW, 0);
    ctx.lineTo(stubW, height);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.arc(stubW, 0, 20, 0, Math.PI * 2);
    ctx.arc(stubW, height, 20, 0, Math.PI * 2);
    ctx.fill();

    // Gallery Content
    const gx = stubW + 56;
    if (logoImg) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.roundRect(gx, 48, 72, 72, 12);
      ctx.fill();
      const s = Math.min(58 / logoImg.width, 58 / logoImg.height);
      ctx.drawImage(logoImg, gx + (72 - logoImg.width * s) / 2, 48 + (72 - logoImg.height * s) / 2, logoImg.width * s, logoImg.height * s);
    }
    const titleX = logoImg ? gx + 92 : gx;
    ctx.fillStyle = design.textColor;
    ctx.font = '800 42px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${event.title} — ${attendee.tier}`.slice(0, 32), titleX, 94);
    ctx.font = '500 24px "DM Sans", sans-serif';
    ctx.globalAlpha = 0.9;
    ctx.fillText(`${event.dateLabel}  ·  ${event.venue}`, titleX, 138);
    ctx.globalAlpha = 1;

    ctx.font = '500 20px "DM Sans", sans-serif';
    ctx.globalAlpha = 0.78;
    ctx.fillText('Tarif Tiket', gx, height - 128);
    ctx.fillText('Termasuk Akses:', gx + 360, height - 128);
    ctx.globalAlpha = 1;

    ctx.font = '800 32px "JetBrains Mono", monospace';
    ctx.fillText(formatRupiah(attendee.amountPaid), gx, height - 86);
    if (design.showHolderName) {
      ctx.font = '500 22px "DM Sans", sans-serif';
      ctx.fillText(`Pemegang: ${attendee.fullName}`, gx, height - 46);
    }

    ctx.font = '700 26px "DM Sans", sans-serif';
    ctx.fillText(attendee.gateAssigned, gx + 360, height - 86);
    ctx.font = '500 21px "DM Sans", sans-serif';
    ctx.fillText(design.customTagline.slice(0, 34), gx + 360, height - 46);

    // QR Code
    const qrBox = 230;
    const qrX = width - qrBox - 48;
    const qrY = (height - qrBox) / 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(qrX, qrY, qrBox, qrBox, 16);
    ctx.fill();
    if (qrImg) ctx.drawImage(qrImg, qrX + 14, qrY + 14, qrBox - 28, qrBox - 28);

    return canvas;
  }

  // RENDER INVITATION CARD ON CANVAS
  if (layout === 'invitation-card') {
    const stubW = 490;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 32);
    ctx.fill();

    // Left colored stub
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, stubW, height, [32, 0, 0, 32]);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, 0, stubW, height);
    grad.addColorStop(0, design.primaryColor);
    grad.addColorStop(1, design.secondaryColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, stubW, height);
    drawCustomCover(0, 0, stubW, height);
    ctx.restore();

    // Medallion circle
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(stubW / 2, 130, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 4;
    ctx.stroke();

    if (logoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(stubW / 2, 130, 50, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(stubW / 2 - 50, 80, 100, 100);
      const s = Math.min(80 / logoImg.width, 80 / logoImg.height);
      ctx.drawImage(logoImg, stubW / 2 - (logoImg.width * s) / 2, 130 - (logoImg.height * s) / 2, logoImg.width * s, logoImg.height * s);
      ctx.restore();
    }

    ctx.fillStyle = design.textColor;
    ctx.textAlign = 'center';
    ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`1X ${attendee.tier.toUpperCase()}`, stubW / 2, 276);
    ctx.fillText('INVITATION', stubW / 2, 328);
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.globalAlpha = 0.85;
    ctx.fillText(attendee.ticketCode, stubW / 2, 390);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // Perforation + notches
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(stubW, 0);
    ctx.lineTo(stubW, height);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.arc(stubW, 0, 22, 0, Math.PI * 2);
    ctx.arc(stubW, height, 22, 0, Math.PI * 2);
    ctx.fill();

    // Right white card content
    const rx = stubW + 64;
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 22px "DM Sans", sans-serif';
    ctx.fillText(design.sponsorLabel || 'Undangan Resmi Acara', rx, 78);

    ctx.fillStyle = '#0F172A';
    ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(design.showHolderName ? attendee.fullName : event.title, rx, 128);

    if (qrImg) {
      ctx.drawImage(qrImg, width - 210, 44, 160, 160);
    }

    const items = [
      `${event.title} · ${event.dateLabel}`,
      event.venue,
      `${attendee.gateAssigned} · ${design.customTagline}`,
    ];
    items.forEach((line, idx) => {
      const iy = 215 + idx * 54;
      ctx.strokeStyle = design.primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx + 12, iy - 8, 12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#334155';
      ctx.font = '500 26px "DM Sans", sans-serif';
      ctx.fillText(line.slice(0, 48), rx + 40, iy);
    });

    ctx.fillStyle = '#64748B';
    ctx.font = '500 23px "DM Sans", sans-serif';
    ctx.fillText(`Email: ${attendee.email}`, rx, height - 102);

    ctx.fillStyle = design.primaryColor;
    ctx.beginPath();
    ctx.roundRect(rx, height - 76, 360, 48, 24);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${attendee.tier} · ${formatRupiah(attendee.amountPaid)}`, rx + 26, height - 44);

    return canvas;
  }

  // 4. DEFAULT WRISTBAND CANVAS RENDER (2,2 cm × 28 cm · 2800 × 220 px)
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, design.primaryColor);
  grad.addColorStop(1, design.secondaryColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  drawCustomCover(0, 0, width, height);
  if (shouldDrawPattern) drawPatternOnCanvas(ctx, design, 0, 0, width, height);

  // Left clasp zone
  const leftZoneW = 120;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, leftZoneW, height);
  ctx.fillStyle = '#F1F5F9';
  ctx.beginPath();
  ctx.arc(leftZoneW / 2, height * 0.34, 12, 0, Math.PI * 2);
  ctx.arc(leftZoneW / 2, height * 0.66, 12, 0, Math.PI * 2);
  ctx.fill();

  // Brand Logo if uploaded
  let textStartX = leftZoneW + 44;
  if (logoImg) {
    const boxSize = Math.min(96, height - 44);
    const boxX = leftZoneW + 38;
    const boxY = Math.round((height - boxSize) / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxSize, boxSize, 14);
    ctx.fill();

    const pad = 10;
    const maxDim = boxSize - pad * 2;
    const scale = Math.min(maxDim / logoImg.width, maxDim / logoImg.height);
    const drawW = logoImg.width * scale;
    const drawH = logoImg.height * scale;
    ctx.drawImage(
      logoImg,
      boxX + (boxSize - drawW) / 2,
      boxY + (boxSize - drawH) / 2,
      drawW,
      drawH
    );
    textStartX = boxX + boxSize + 28;
  }

  // Text block
  ctx.fillStyle = design.textColor;
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${design.sponsorLabel || 'GelangPass'}  ·  ${event.dateLabel}`, textStartX, 44);
  ctx.globalAlpha = 1;

  ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(event.title, textStartX, 86);

  if (design.showHolderName) {
    ctx.font = '700 26px "DM Sans", sans-serif';
    ctx.fillText(attendee.fullName, textStartX, height - 86);
  }

  ctx.font = '500 19px "DM Sans", sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${design.customTagline}  ·  ${attendee.gateAssigned}`, textStartX, height - 54);
  ctx.globalAlpha = 1;

  if (design.showSecurityMicrotext) {
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.globalAlpha = 0.8;
    ctx.fillText(`AES-256-GCM  ·  ${attendee.ticketCode}`, textStartX, height - 24);
    ctx.globalAlpha = 1;
  }

  // Right Fastener Zone
  const rightZoneW = 90;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(width - rightZoneW, 0, rightZoneW, height);
  ctx.fillStyle = '#F1F5F9';
  ctx.beginPath();
  ctx.arc(width - rightZoneW / 2, height / 2, 12, 0, Math.PI * 2);
  ctx.fill();

  // QR Box & Vertical Code
  const qrBoxSize = height - 32;
  const qrX = width - rightZoneW - qrBoxSize - 68;
  const qrY = 16;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(qrX, qrY, qrBoxSize, qrBoxSize);

  if (qrImg) {
    ctx.drawImage(qrImg, qrX + 10, qrY + 10, qrBoxSize - 20, qrBoxSize - 20);
  }

  ctx.save();
  ctx.translate(width - rightZoneW - 28, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = design.textColor;
  ctx.globalAlpha = 0.9;
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(attendee.ticketCode, 0, 5);
  ctx.restore();
  ctx.globalAlpha = 1;

  // Perforation line
  const perfX = qrX - 36;
  if (design.showPerforation) {
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(perfX, 0);
    ctx.lineTo(perfX, height);
    ctx.stroke();
    ctx.restore();
  }

  // Tier box & physical size note
  if (design.showTierBadge) {
    const tierW = 190;
    const tierX = perfX - tierW - 36;
    ctx.fillStyle = design.accentColor;
    ctx.beginPath();
    ctx.roundRect(tierX, 34, tierW, 48, 8);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(attendee.tier, tierX + tierW / 2, 65);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = design.textColor;
  ctx.globalAlpha = 0.78;
  ctx.font = '500 16px "DM Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(
    `${getMaterialLabel(design.material)} · ${formatWristbandDimensionLabel(design)}`,
    perfX - 36,
    height - 26
  );
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;

  return canvas;
}

export async function downloadWristbandPng(
  design: WristbandDesign,
  event: EventInfo,
  attendee: Attendee
): Promise<void> {
  const canvas = await renderWristbandCanvas(design, event, attendee);
  const link = document.createElement('a');
  const prefix = (design.previewLayout ?? 'wristband') === 'wristband' ? 'gelang' : 'tiket';
  link.download = `${prefix}-${attendee.ticketCode}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function downloadBatchWristbandsPng(
  design: WristbandDesign,
  event: EventInfo,
  attendees: Attendee[],
  options: { includeHeader: boolean; includeCutIndex: boolean }
): Promise<void> {
  if (attendees.length === 0) return;

  const { width: rawBandWidth, height: rawBandHeight } = getExportDimensions(design);
  const drawBandWidth = 1600;
  const drawBandHeight = Math.round((rawBandHeight / rawBandWidth) * drawBandWidth);
  const marginX = 60;
  const marginY = 60;
  const headerH = options.includeHeader ? 120 : 0;
  const labelH = options.includeCutIndex ? 36 : 0;
  const gapY = 34;
  const sheetWidth = 1720;
  const sheetHeight =
    marginY * 2 + headerH + attendees.length * (drawBandHeight + labelH + gapY);

  const sheet = document.createElement('canvas');
  sheet.width = sheetWidth;
  sheet.height = sheetHeight;
  const ctx = sheet.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, sheetWidth, sheetHeight);

  let y = marginY;

  if (options.includeHeader) {
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${event.title} — Lembar Cetak Gelang & Tiket`, marginX, y + 36);

    ctx.fillStyle = '#64748B';
    ctx.font = '500 22px "DM Sans", sans-serif';
    ctx.fillText(
      `Desain: ${design.name} (${design.themePreset} · ${formatWristbandDimensionLabel(design)}) · ${attendees.length} tiket · AES-256-GCM v${event.encryptionKeyVersion}`,
      marginX,
      y + 74
    );

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginX, y + 96);
    ctx.lineTo(sheetWidth - marginX, y + 96);
    ctx.stroke();

    y += headerH;
  }

  for (let i = 0; i < attendees.length; i++) {
    const att = attendees[i];
    if (options.includeCutIndex) {
      ctx.fillStyle = '#475569';
      ctx.font = '600 20px "JetBrains Mono", monospace';
      ctx.fillText(`#${String(i + 1).padStart(2, '0')} · ${att.fullName}`, marginX, y + 22);
      ctx.textAlign = 'right';
      ctx.fillText(`${att.ticketCode} · ${att.tier}`, sheetWidth - marginX, y + 22);
      ctx.textAlign = 'left';
      y += labelH;
    }

    const bandCanvas = await renderWristbandCanvas(design, event, att);
    ctx.drawImage(bandCanvas, marginX, y, drawBandWidth, drawBandHeight);
    y += drawBandHeight;

    if (options.includeCutIndex && i < attendees.length - 1) {
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(marginX, y + gapY / 2);
      ctx.lineTo(sheetWidth - marginX, y + gapY / 2);
      ctx.stroke();
      ctx.restore();
    }

    y += gapY;
  }

  const link = document.createElement('a');
  link.download = `batch-tiket-${event.id}-${attendees.length}.png`;
  link.href = sheet.toDataURL('image/png');
  link.click();
}
