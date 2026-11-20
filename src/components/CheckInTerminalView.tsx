import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  WifiOff,
} from 'lucide-react';
import type { CheckInResult } from '../hooks/useEventSync.ts';
import type { AccessTier } from '../lib/permissions.ts';
import type { AppStateSnapshot } from '../types/event.ts';

interface CheckInTerminalViewProps {
  snapshot: AppStateSnapshot;
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  defaultGate?: string;
  accessTier?: AccessTier;
  onSyncNow: () => Promise<unknown>;
  onCheckIn: (input: { qrToken?: string; ticketCode?: string; gate: string }) => Promise<CheckInResult>;
}

function playFeedbackTone(success: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = success ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(success ? 880 : 280, ctx.currentTime);
    if (success) {
      osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.08);
    }
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Ignore audio context restriction
  }
}

export const CheckInTerminalView: React.FC<CheckInTerminalViewProps> = ({
  snapshot,
  isOnline,
  pendingCount,
  syncing,
  defaultGate,
  accessTier = 'super-admin',
  onSyncNow,
  onCheckIn,
}) => {
  const isGateLocked =
    accessTier === 'gate' && Boolean(defaultGate) && defaultGate !== 'Semua Gerbang';
  const gateOptions =
    isGateLocked && defaultGate && !snapshot.event.gates.includes(defaultGate)
      ? [defaultGate, ...snapshot.event.gates]
      : snapshot.event.gates;
  const initialGate = isGateLocked && defaultGate
    ? defaultGate
    : defaultGate && snapshot.event.gates.includes(defaultGate)
      ? defaultGate
      : snapshot.event.gates[0] || 'Gerbang Utama A';
  const [selectedGate, setSelectedGate] = useState(initialGate);

  useEffect(() => {
    if (isGateLocked && defaultGate) {
      setSelectedGate(defaultGate);
    }
  }, [isGateLocked, defaultGate]);
  const [manualInput, setManualInput] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [processing, setProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ token: string; ts: number }>({ token: '', ts: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleVerifyTokenOrCode = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || processing) return;

      setProcessing(true);
      try {
        const res = await onCheckIn(
          trimmed.startsWith('GP1.')
            ? { qrToken: trimmed, gate: selectedGate }
            : { ticketCode: trimmed, gate: selectedGate }
        );
        setResult(res);
        playFeedbackTone(res.ok);
        if (res.ok) {
          setManualInput('');
        }
      } finally {
        setProcessing(false);
      }
    },
    [onCheckIn, processing, selectedGate]
  );

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError(
        'Kamera tidak dapat diakses. Gunakan unggah gambar QR atau input kode gelang di bawah.'
      );
      setCameraActive(false);
    }
  }, []);

  useEffect(() => {
    if (!cameraActive) return;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code && code.data) {
            const now = Date.now();
            if (
              lastScannedRef.current.token !== code.data ||
              now - lastScannedRef.current.ts > 3000
            ) {
              lastScannedRef.current = { token: code.data, ts: now };
              handleVerifyTokenOrCode(code.data);
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraActive, handleVerifyTokenOrCode]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height);
        if (decoded?.data) {
          handleVerifyTokenOrCode(decoded.data);
        } else {
          setResult({
            ok: false,
            status: 'invalid-signature',
            message: 'Tidak ditemukan kode QR yang terbaca pada gambar tersebut.',
          });
          playFeedbackTone(false);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const pendingGuests = snapshot.attendees.filter((a) => {
    if (a.checkedIn) return false;
    if (isGateLocked && defaultGate && a.gateAssigned !== defaultGate) return false;
    if (!quickFilter.trim()) return true;
    const q = quickFilter.toLowerCase();
    return (
      a.fullName.toLowerCase().includes(q) ||
      a.ticketCode.toLowerCase().includes(q) ||
      a.tier.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Gate Header Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="gate-select" className="text-xs font-semibold text-slate-700">
            Lokasi Gerbang Aktif:
          </label>
          <select
            id="gate-select"
            value={selectedGate}
            disabled={isGateLocked}
            onChange={(e) => setSelectedGate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-700 disabled:cursor-not-allowed"
          >
            {gateOptions.map((gate) => (
              <option key={gate} value={gate}>
                {gate}
              </option>
            ))}
          </select>
          {isGateLocked && (
            <span className="text-xs font-medium text-amber-800">
              Terkunci sesuai gate/zona tugas ({defaultGate})
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <WifiOff className="w-4 h-4" />
              Mode Offline Aktif · Verifikasi AES-256-GCM Lokal
            </span>
          )}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => onSyncNow()}
              disabled={!isOnline || syncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sinkronkan {pendingCount} Antrean</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Split: Scanner & Instant Feedback vs 1-Tap Guest Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-5">
          {/* Camera + Upload + Manual Input */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Pemindai QR Gelang Tiket
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mendukung kamera langsung, gambar gelang PNG, dan scanner barcode USB
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (cameraActive ? stopCamera() : startCamera())}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    cameraActive
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {cameraActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                  <span>{cameraActive ? 'Matikan Kamera' : 'Aktifkan Kamera'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Pindai Gambar</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Camera Viewport */}
            <div className="relative aspect-video w-full rounded-xl bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-200">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />
              <canvas ref={canvasRef} className="hidden" />
              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-blue-400 rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
                </div>
              )}
              {!cameraActive && (
                <div className="text-center px-6">
                  <Camera className="w-10 h-10 text-slate-500 mx-auto" />
                  <p className="mt-2 text-xs text-slate-300 max-w-xs mx-auto">
                    {cameraError || 'Klik "Aktifkan Kamera" untuk memindai QR gelang, atau tempel token / kode tiket di bawah.'}
                  </p>
                </div>
              )}
            </div>

            {/* Manual Token / Barcode Entry */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyTokenOrCode(manualInput);
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Masukkan kode tiket (mis. GP-VIP-...) atau token GP1..."
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm font-mono text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={processing || !manualInput.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                {processing ? 'Memeriksa...' : 'Verifikasi'}
              </button>
            </form>
          </div>

          {/* High-Contrast Verification Result */}
          {result && (
            <div
              className={`rounded-xl border p-5 transition-all ${
                result.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : result.status === 'duplicate-blocked'
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-red-50 border-red-200 text-red-950'
              }`}
            >
              <div className="flex items-start gap-3">
                {result.ok ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert
                    className={`w-6 h-6 shrink-0 mt-0.5 ${
                      result.status === 'duplicate-blocked' ? 'text-amber-600' : 'text-red-600'
                    }`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-bold">
                      {result.ok
                        ? 'Akses Diterima — Gelang Valid'
                        : result.status === 'duplicate-blocked'
                        ? 'Peringatan — Gelang Sudah Check-In'
                        : result.status === 'revoked-blocked'
                        ? 'Akses Ditolak — Gelang Diblokir'
                        : 'Akses Ditolak — QR Tidak Valid'}
                    </h3>
                    {result.offlineQueued && (
                      <span className="text-[11px] font-mono font-semibold text-amber-800">
                        Tersimpan di Antrean Offline
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1">{result.message}</p>
                  {result.attendee && (
                    <div className="mt-3 pt-3 border-t border-current/15 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="opacity-70 block">Pemegang</span>
                        <span className="font-semibold">{result.attendee.fullName}</span>
                      </div>
                      <div>
                        <span className="opacity-70 block">Kategori · Kode</span>
                        <span className="font-mono font-semibold">
                          {result.attendee.tier} · {result.attendee.ticketCode}
                        </span>
                      </div>
                      <div>
                        <span className="opacity-70 block">Gerbang</span>
                        <span className="font-semibold">{result.attendee.gateAssigned}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Rapid 1-Tap Check-In Queue */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Check-In Cepat 1-Klik ({pendingGuests.length} Menunggu)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Percepat antrean gerbang dengan verifikasi instan per nama atau kode
                </p>
              </div>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quickFilter}
                onChange={(e) => setQuickFilter(e.target.value)}
                placeholder="Cari nama tamu, kode GP-, atau kategori..."
                className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
            {pendingGuests.map((guest) => (
              <div
                key={guest.id}
                className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {guest.fullName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    <span>{guest.tier}</span>
                    <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono">{guest.ticketCode}</span>
                    <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                    <span>{guest.gateAssigned}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={processing || guest.revoked}
                  onClick={() => handleVerifyTokenOrCode(guest.qrToken)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    guest.revoked
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-900 text-white hover:bg-blue-600'
                  }`}
                >
                  {guest.revoked ? 'Diblokir' : 'Check-In'}
                </button>
              </div>
            ))}
            {pendingGuests.length === 0 && (
              <div className="py-12 px-6 text-center text-xs text-slate-500">
                Tidak ada tamu menunggu check-in yang cocok dengan pencarian Anda.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
