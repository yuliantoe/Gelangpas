import React from 'react';
import QRCode from 'qrcode';
import type { Attendee, EventInfo, WristbandDesign } from '../types/event.ts';
import { QrCanvas } from './QrCanvas.tsx';

interface WristbandPreviewProps {
  design: WristbandDesign;
  event: EventInfo;
  attendee: Attendee;
  compact?: boolean;
}

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

export const WristbandPreview: React.FC<WristbandPreviewProps> = ({
  design,
  event,
  attendee,
  compact = false,
}) => {
  const heightPx = design.widthMm === 25 ? (compact ? 112 : 144) : compact ? 92 : 118;
  const qrSize = design.widthMm === 25 ? (compact ? 78 : 102) : compact ? 66 : 84;
  const patternBg = getPatternSvg(design.pattern, design.accentColor);
  const logoSize = compact ? 38 : 48;
  const hasCustomBg = Boolean(design.customBackgroundDataUrl);
  const customFit = design.customBackgroundFit ?? 'cover';
  const overlayOpacity =
    typeof design.customOverlayOpacity === 'number' ? design.customOverlayOpacity : 0.25;
  const showPattern = patternBg !== 'none' && (!hasCustomBg || !design.hidePatternOnCustomBg);

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div
        className="relative flex items-center justify-between rounded-xl overflow-hidden border border-slate-300/60 select-none shadow-sm mx-auto"
        style={{
          minWidth: compact ? 540 : 660,
          maxWidth: 780,
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
        <div className="relative z-10 flex-1 px-5 py-2.5 flex flex-col justify-between h-full min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
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
                <div className="flex items-center gap-2 text-[11px] font-medium opacity-85 truncate">
                  <span>{design.sponsorLabel || 'GelangPass'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{event.dateLabel}</span>
                </div>
                <h4 className="font-display font-bold tracking-tight text-base md:text-lg leading-tight truncate mt-0.5">
                  {event.title}
                </h4>
              </div>
            </div>

            {design.showTierBadge && (
              <div
                className="px-2.5 py-1 rounded text-xs font-bold tracking-wide shrink-0"
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
                <p className="text-xs md:text-sm font-semibold truncate">
                  {attendee.fullName}
                </p>
              )}
              <p className="text-[11px] opacity-80 truncate">
                {design.customTagline} · {attendee.gateAssigned}
              </p>
              {design.showSecurityMicrotext && (
                <p className="font-mono text-[10px] opacity-75 mt-0.5 tracking-wider truncate">
                  AES-256-GCM · {attendee.ticketCode}
                </p>
              )}
            </div>
            <div className="text-right shrink-0 hidden sm:block">
              <span className="text-[10px] opacity-75 block">
                {getMaterialLabel(design.material)} · {design.widthMm}mm
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

async function renderWristbandCanvas(
  design: WristbandDesign,
  event: EventInfo,
  attendee: Attendee
): Promise<HTMLCanvasElement> {
  const width = 1600;
  const height = design.widthMm === 25 ? 340 : 280;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Gradient Background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, design.primaryColor);
  grad.addColorStop(1, design.secondaryColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Custom Uploaded Wristband Artwork
  const hasCustomBg = Boolean(design.customBackgroundDataUrl);
  if (design.customBackgroundDataUrl) {
    const bgImg = await loadImageElement(design.customBackgroundDataUrl);
    if (bgImg && bgImg.width > 0 && bgImg.height > 0) {
      const fit = design.customBackgroundFit ?? 'cover';
      const scale =
        fit === 'contain'
          ? Math.min(width / bgImg.width, height / bgImg.height)
          : Math.max(width / bgImg.width, height / bgImg.height);
      const drawW = bgImg.width * scale;
      const drawH = bgImg.height * scale;
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;
      ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);

      const overlayOpacity =
        typeof design.customOverlayOpacity === 'number' ? design.customOverlayOpacity : 0.25;
      if (overlayOpacity > 0) {
        ctx.fillStyle = `rgba(15, 23, 42, ${overlayOpacity})`;
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  // Pattern (skip if custom background is active and pattern hidden)
  const shouldDrawPattern = !hasCustomBg || !design.hidePatternOnCustomBg;
  if (shouldDrawPattern && design.pattern === 'diagonal') {
    ctx.strokeStyle = `${design.accentColor}30`;
    ctx.lineWidth = 14;
    for (let x = -height; x < width + height; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }
  } else if (shouldDrawPattern && design.pattern === 'grid') {
    ctx.strokeStyle = `${design.accentColor}28`;
    ctx.lineWidth = 2;
    for (let x = 0; x < width; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (shouldDrawPattern && design.pattern === 'geometric') {
    ctx.fillStyle = `${design.accentColor}24`;
    for (let x = 140; x < 1180; x += 64) {
      for (let y = 32; y < height; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (shouldDrawPattern && design.pattern === 'wave') {
    ctx.strokeStyle = `${design.accentColor}26`;
    ctx.lineWidth = 4;
    for (let r = 80; r < 1100; r += 36) {
      ctx.beginPath();
      ctx.arc(110, height / 2, r, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    }
  }

  // Left clasp zone
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 110, height);
  ctx.fillStyle = '#F1F5F9';
  ctx.beginPath();
  ctx.arc(55, height * 0.35, 14, 0, Math.PI * 2);
  ctx.arc(55, height * 0.65, 14, 0, Math.PI * 2);
  ctx.fill();

  // Brand Logo if uploaded
  let textStartX = 150;
  if (design.brandLogoDataUrl) {
    const logoImg = await loadImageElement(design.brandLogoDataUrl);
    if (logoImg) {
      const boxSize = design.widthMm === 25 ? 104 : 86;
      const boxX = 148;
      const boxY = 34;
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
      textStartX = boxX + boxSize + 24;
    }
  }

  // Text block
  ctx.fillStyle = design.textColor;
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${design.sponsorLabel || 'GelangPass'}  ·  ${event.dateLabel}`, textStartX, 66);
  ctx.globalAlpha = 1;

  ctx.font = '800 42px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(event.title, textStartX, 122);

  if (design.showHolderName) {
    ctx.font = '700 30px "DM Sans", sans-serif';
    ctx.fillText(attendee.fullName, 150, height - 92);
  }

  ctx.font = '500 22px "DM Sans", sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${design.customTagline}  ·  ${attendee.gateAssigned}`, 150, height - 56);
  ctx.globalAlpha = 1;

  if (design.showSecurityMicrotext) {
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.globalAlpha = 0.8;
    ctx.fillText(`AES-256-GCM  ·  ${attendee.ticketCode}`, 150, height - 26);
    ctx.globalAlpha = 1;
  }

  // Tier box
  if (design.showTierBadge) {
    ctx.fillStyle = design.accentColor;
    ctx.fillRect(980, 44, 170, 52);
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(attendee.tier, 1065, 79);
    ctx.textAlign = 'left';
  }

  // Perforation line
  if (design.showPerforation) {
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1185, 0);
    ctx.lineTo(1185, height);
    ctx.stroke();
    ctx.restore();
  }

  // QR Box
  const qrBoxSize = height - 56;
  const qrX = 1220;
  const qrY = 28;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(qrX, qrY, qrBoxSize, qrBoxSize);

  const qrDataUrl = await QRCode.toDataURL(attendee.qrToken, {
    width: qrBoxSize - 24,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });

  const qrImg = await loadImageElement(qrDataUrl);
  if (qrImg) {
    ctx.drawImage(qrImg, qrX + 12, qrY + 12, qrBoxSize - 24, qrBoxSize - 24);
  }

  return canvas;
}

export async function downloadWristbandPng(
  design: WristbandDesign,
  event: EventInfo,
  attendee: Attendee
): Promise<void> {
  const canvas = await renderWristbandCanvas(design, event, attendee);
  const link = document.createElement('a');
  link.download = `gelang-${attendee.ticketCode}.png`;
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

  const bandHeight = design.widthMm === 25 ? 340 : 280;
  const marginX = 60;
  const marginY = 60;
  const headerH = options.includeHeader ? 120 : 0;
  const labelH = options.includeCutIndex ? 36 : 0;
  const gapY = 34;
  const sheetWidth = 1720;
  const sheetHeight =
    marginY * 2 + headerH + attendees.length * (bandHeight + labelH + gapY);

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
    ctx.fillText(`${event.title} — Lembar Cetak Gelang Tiket`, marginX, y + 36);

    ctx.fillStyle = '#64748B';
    ctx.font = '500 22px "DM Sans", sans-serif';
    ctx.fillText(
      `Desain: ${design.name} (${design.themePreset} · ${design.widthMm}mm) · ${attendees.length} gelang · AES-256-GCM v${event.encryptionKeyVersion}`,
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
    ctx.drawImage(bandCanvas, marginX, y);
    y += bandHeight;

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
  link.download = `batch-gelang-${event.id}-${attendees.length}.png`;
  link.href = sheet.toDataURL('image/png');
  link.click();
}
