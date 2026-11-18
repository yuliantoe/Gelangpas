import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { decryptWristbandTokenClient } from '../lib/crypto.ts';
import type {
  AppStateSnapshot,
  DecryptedQrPayload,
  NotificationRules,
  PendingOfflineCheckIn,
  PendingOfflineOrder,
  UserRole,
} from '../types/event.ts';

interface SecurityOfflineViewProps {
  snapshot: AppStateSnapshot;
  currentRole?: UserRole;
  browserOnline: boolean;
  simulatedOffline: boolean;
  setSimulatedOffline: (val: boolean) => void;
  pendingCheckIns: PendingOfflineCheckIn[];
  pendingOrders: PendingOfflineOrder[];
  syncing: boolean;
  onSyncNow: () => Promise<unknown>;
  onRotateKey: () => Promise<unknown>;
  onUpdateNotificationRules: (rules: Partial<NotificationRules>) => Promise<unknown>;
}

export const SecurityOfflineView: React.FC<SecurityOfflineViewProps> = ({
  snapshot,
  currentRole = 'administrator',
  browserOnline,
  simulatedOffline,
  setSimulatedOffline,
  pendingCheckIns,
  pendingOrders,
  syncing,
  onSyncNow,
  onRotateKey,
  onUpdateNotificationRules,
}) => {
  const isAdmin = currentRole === 'administrator';
  const [inspectToken, setInspectToken] = useState(snapshot.attendees[0]?.qrToken || '');
  const [inspectResult, setInspectResult] = useState<{
    valid: boolean;
    payload?: DecryptedQrPayload;
    reason?: string;
  } | null>(null);

  const [pinInput, setPinInput] = useState('');
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [rotateMessage, setRotateMessage] = useState<string | null>(null);

  const handleInspect = async () => {
    const res = await decryptWristbandTokenClient(
      inspectToken,
      snapshot.gateEncryptionKeyHex
    );
    setInspectResult(res);
  };

  const handleUnlockPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    try {
      const res = await fetch('/api/security/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (!res.ok) {
        setPinError('PIN salah. Gunakan PIN default penyelenggara: 2026.');
        return;
      }
      setPinUnlocked(true);
      setPinInput('');
    } catch {
      if (pinInput === '2026') {
        setPinUnlocked(true);
        setPinInput('');
      } else {
        setPinError('Verifikasi PIN offline gagal.');
      }
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    setRotateMessage(null);
    try {
      await onRotateKey();
      setRotateMessage('Kunci AES-256-GCM berhasil dirotasi & seluruh gelang aktif ditandatangani ulang.');
    } finally {
      setRotating(false);
    }
  };

  const handleToggleBrowserPush = async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      await onUpdateNotificationRules({ browserPushEnabled: perm === 'granted' });
    } else {
      await onUpdateNotificationRules({
        browserPushEnabled: !snapshot.notificationRules.browserPushEnabled,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* AES-256-GCM Inspector & Key Rotation */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Enkripsi Data Kuat (AES-256-GCM + SHA-256)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Setiap QR gelang dienkripsi dengan IV acak 96-bit dan tag autentikasi GCM 128-bit untuk mencegah pemalsuan
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-emerald-700 shrink-0">
              Kunci v{snapshot.event.encryptionKeyVersion} Aktif
            </span>
          </div>

          {/* Token Inspector */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700">
                Inspektor Dekripsi Token QR Langsung
              </label>
              <select
                onChange={(e) => {
                  setInspectToken(e.target.value);
                  setInspectResult(null);
                }}
                value={inspectToken}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 max-w-[220px]"
              >
                {snapshot.attendees.slice(0, 12).map((a) => (
                  <option key={a.id} value={a.qrToken}>
                    {a.fullName} ({a.ticketCode})
                  </option>
                ))}
              </select>
            </div>

            <textarea
              rows={3}
              value={inspectToken}
              onChange={(e) => setInspectToken(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Coba ubah 1 karakter pada ciphertext di atas untuk menguji deteksi manipulasi AES-GCM.
              </p>
              <button
                type="button"
                onClick={handleInspect}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Uji Dekripsi WebCrypto</span>
              </button>
            </div>

            {inspectResult && (
              <div
                className={`rounded-lg border p-3.5 text-xs ${
                  inspectResult.valid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-red-50 border-red-200 text-red-950'
                }`}
              >
                {inspectResult.valid && inspectResult.payload ? (
                  <div className="space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Autentikasi Tag GCM & Tanda Tangan SHA-256 Valid
                    </p>
                    <pre className="font-mono text-[11px] bg-white/80 border border-emerald-200 rounded p-2.5 overflow-x-auto">
                      {JSON.stringify(inspectResult.payload, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="font-semibold">{inspectResult.reason}</p>
                )}
              </div>
            )}
          </div>

          {/* Organizer Key Rotation Protected by PIN */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {pinUnlocked ? (
                  <Unlock className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Lock className="w-4 h-4 text-slate-500" />
                )}
                <h3 className="text-xs font-semibold text-slate-900">
                  Kontrol Akses Kunci Enkripsi Penyelenggara
                </h3>
              </div>
            </div>

            {!isAdmin ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                Rotasi kunci enkripsi AES-256-GCM hanya tersedia untuk akun <strong>Administrator</strong>.
              </div>
            ) : !pinUnlocked ? (
              <form onSubmit={handleUnlockPin} className="flex flex-wrap items-center gap-2.5">
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Masukkan PIN Penyelenggara (default: 2026)"
                  className="flex-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  Buka Kontrol Kunci
                </button>
                {pinError && <p className="w-full text-xs text-red-600">{pinError}</p>}
              </form>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Fingerprint Kunci Gerbang (SHA-256)
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                      {snapshot.gateEncryptionKeyHex.slice(0, 16)}••••
                      {snapshot.gateEncryptionKeyHex.slice(-12)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={rotating}
                    onClick={handleRotate}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{rotating ? 'Merotasi...' : 'Rotasi Kunci AES-256'}</span>
                  </button>
                </div>
                {rotateMessage && (
                  <p className="text-xs text-emerald-700 font-medium">{rotateMessage}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Offline Mode & Notification Rules */}
        <div className="lg:col-span-5 space-y-6">
          {/* Offline Support Control */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Dukungan Operasional Offline (PWA + IndexedDB)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Terminal gerbang tetap dapat memverifikasi QR & mencatat transaksi saat internet terputus
                </p>
              </div>
              <Database className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Status Jaringan Perangkat</span>
                <span className="font-semibold flex items-center gap-1.5 text-slate-900">
                  {browserOnline && !simulatedOffline ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                      Online Tersambung
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                      Offline (Cache Lokal)
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Data Pengunjung Tersimpan di IndexedDB</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {snapshot.attendees.length} gelang
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Antrean Check-In Menunggu Sync</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {pendingCheckIns.length} scan
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Antrean Loket Offline</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {pendingOrders.length} transaksi
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => setSimulatedOffline(!simulatedOffline)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                  simulatedOffline
                    ? 'bg-amber-600 border-amber-600 text-white hover:bg-amber-700'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {simulatedOffline ? 'Matikan Simulasi Offline' : 'Simulasikan Gangguan Internet'}
              </button>

              {(pendingCheckIns.length > 0 || pendingOrders.length > 0) && (
                <button
                  type="button"
                  disabled={simulatedOffline || !browserOnline || syncing}
                  onClick={() => onSyncNow()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>Sinkronkan Sekarang</span>
                </button>
              )}
            </div>
          </div>

          {/* Automated Organizer Notification Rules */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Aturan Notifikasi Otomatis Penyelenggara
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Peringatan instan dikirim melalui WebSocket saat insiden atau pencapaian terjadi
                </p>
              </div>
              <Bell className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="space-y-3 text-xs">
              {[
                {
                  key: 'notifyOnVipArrival' as const,
                  label: 'Notifikasi Kedatangan Tamu VIP & Backstage',
                },
                {
                  key: 'notifyOnPayment' as const,
                  label: 'Notifikasi Transaksi Pembayaran Tiket Lunas',
                },
                {
                  key: 'notifyOnSecurityAlert' as const,
                  label: 'Peringatan Keamanan (Scan Ganda & QR Tidak Sah)',
                },
                {
                  key: 'notifyOnOfflineSync' as const,
                  label: 'Laporan Rekonsiliasi Antrean Gerbang Offline',
                },
              ].map((rule) => (
                <label
                  key={rule.key}
                  className="flex items-center justify-between gap-3 py-1 cursor-pointer"
                >
                  <span className="text-slate-700">{rule.label}</span>
                  <input
                    type="checkbox"
                    checked={snapshot.notificationRules[rule.key]}
                    onChange={(e) =>
                      onUpdateNotificationRules({ [rule.key]: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                </label>
              ))}

              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-700">Ambang Peringatan Kapasitas</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {snapshot.notificationRules.capacityThresholdPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={snapshot.notificationRules.capacityThresholdPercent}
                  onChange={(e) =>
                    onUpdateNotificationRules({
                      capacityThresholdPercent: Number(e.target.value),
                    })
                  }
                  className="w-full accent-blue-600"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleToggleBrowserPush}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {snapshot.notificationRules.browserPushEnabled
                    ? 'Notifikasi Desktop Browser Aktif'
                    : 'Aktifkan Izin Notifikasi Desktop Browser'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
