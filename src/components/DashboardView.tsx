import React, { useMemo, useState } from 'react';
import { ArrowUpRight, QrCode, ShieldAlert, Users, Wallet } from 'lucide-react';
import type { AppStateSnapshot } from '../types/event.ts';

interface DashboardViewProps {
  snapshot: AppStateSnapshot;
  onNavigate: (tab: 'checkin' | 'ticketing' | 'designer' | 'visitors' | 'reports') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ snapshot, onNavigate }) => {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const stats = useMemo(() => {
    const totalAttendees = snapshot.attendees.length;
    const checkedInCount = snapshot.attendees.filter((a) => a.checkedIn).length;
    const revokedCount = snapshot.attendees.filter((a) => a.revoked).length;
    const attendancePct = totalAttendees > 0 ? Math.round((checkedInCount / totalAttendees) * 100) : 0;

    const oneHourAgo = Date.now() - 3600 * 1000;
    const recentVelocity = snapshot.checkInLogs.filter(
      (l) => l.status === 'verified' && new Date(l.timestamp).getTime() >= oneHourAgo
    ).length;

    const totalRevenue = snapshot.transactions.reduce((acc, tx) => acc + tx.amount, 0);

    // Build 8-hour arrival flow buckets
    const now = new Date();
    const buckets: Array<{
      label: string;
      online: number;
      offline: number;
      total: number;
    }> = [];

    for (let i = 7; i >= 0; i--) {
      const bucketEnd = new Date(now.getTime() - i * 3600 * 1000);
      const bucketStart = new Date(bucketEnd.getTime() - 3600 * 1000);
      const label = `${String(bucketEnd.getHours()).padStart(2, '0')}:00`;

      let online = 0;
      let offline = 0;
      snapshot.checkInLogs.forEach((log) => {
        if (log.status !== 'verified') return;
        const ts = new Date(log.timestamp).getTime();
        if (ts >= bucketStart.getTime() && ts < bucketEnd.getTime()) {
          if (log.mode === 'offline-synced') offline++;
          else online++;
        }
      });

      buckets.push({ label, online, offline, total: online + offline });
    }

    const maxBucket = Math.max(4, ...buckets.map((b) => b.total));

    // Gate breakdown
    const gateStats = snapshot.event.gates.map((gate) => {
      const assigned = snapshot.attendees.filter((a) => a.gateAssigned === gate).length;
      const entered = snapshot.attendees.filter(
        (a) => a.checkedIn && a.checkedInGate === gate
      ).length;
      const pct = assigned > 0 ? Math.round((entered / assigned) * 100) : 0;
      return { gate, assigned, entered, pct };
    });

    // Tier breakdown
    const tiers = Array.from(
      new Set([
        ...(snapshot.event.categories?.map((c) => c.name) || Object.keys(snapshot.event.ticketPrices)),
        ...snapshot.attendees.map((a) => a.tier),
      ])
    );
    const tierStats = tiers.map((tier) => {
      const total = snapshot.attendees.filter((a) => a.tier === tier).length;
      const checkedIn = snapshot.attendees.filter((a) => a.tier === tier && a.checkedIn).length;
      return { tier, total, checkedIn };
    });

    return {
      totalAttendees,
      checkedInCount,
      revokedCount,
      attendancePct,
      recentVelocity,
      totalRevenue,
      buckets,
      maxBucket,
      gateStats,
      tierStats,
    };
  }, [snapshot]);

  return (
    <div className="space-y-6">
      {/* KPI Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Pemegang Gelang</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {stats.totalAttendees.toLocaleString('id-ID')}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              / {snapshot.event.capacity.toLocaleString('id-ID')} kapasitas
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {stats.revokedCount > 0 ? `${stats.revokedCount} gelang diblokir` : 'Semua gelang terenkripsi AES-256'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tamu Sudah Check-In</span>
            <QrCode className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {stats.checkedInCount.toLocaleString('id-ID')}
            </span>
            <span className="text-xs font-semibold text-emerald-700 tabular-nums">
              {stats.attendancePct}% hadir
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${Math.min(100, stats.attendancePct)}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Arus Masuk (60 Menit Terakhir)</span>
            <ArrowUpRight className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {stats.recentVelocity}
            </span>
            <span className="text-xs text-slate-500">tamu / jam</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Terpantau instan melalui {snapshot.event.gates.length} gerbang aktif
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pendapatan Tiket Platform</span>
            <Wallet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              Rp {stats.totalRevenue.toLocaleString('id-ID')}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            {snapshot.transactions.length} transaksi lunas · QRIS, VA & Loket
          </p>
        </div>
      </div>

      {/* Main Analytics Split: Hourly Flow Chart + Gate Capacity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Arus Masuk Pengunjung per Jam
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pemantauan real-time check-in online vs sinkronisasi gerbang offline (8 jam terakhir)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" />
                Verifikasi Online
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                Offline Tersinkron
              </span>
            </div>
          </div>

          {/* Interactive SVG Bar Flow Chart */}
          <div className="mt-6 h-56 flex items-end justify-between gap-2 sm:gap-4 pt-6 border-b border-slate-200 pb-2 relative">
            {stats.buckets.map((bucket, idx) => {
              const totalHeightPct = (bucket.total / stats.maxBucket) * 100;
              const onlinePct = bucket.total > 0 ? (bucket.online / bucket.total) * 100 : 0;
              const offlinePct = bucket.total > 0 ? (bucket.offline / bucket.total) * 100 : 0;
              const isHovered = hoveredHour === idx;

              return (
                <div
                  key={bucket.label}
                  onMouseEnter={() => setHoveredHour(idx)}
                  onMouseLeave={() => setHoveredHour(null)}
                  className="flex-1 h-full flex flex-col items-center justify-end group relative cursor-pointer"
                >
                  {isHovered && (
                    <div className="absolute -top-2 z-10 bg-slate-900 text-white text-[11px] font-mono px-2 py-1 rounded shadow-md whitespace-nowrap">
                      {bucket.label} · {bucket.total} tamu ({bucket.online} online, {bucket.offline} offline)
                    </div>
                  )}
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums mb-1.5">
                    {bucket.total > 0 ? bucket.total : ''}
                  </span>
                  <div
                    className="w-full max-w-[44px] rounded-t-md overflow-hidden flex flex-col-reverse bg-slate-100 transition-all duration-200"
                    style={{ height: `${Math.max(4, totalHeightPct)}%` }}
                  >
                    {bucket.online > 0 && (
                      <div
                        className="w-full bg-blue-600 group-hover:bg-blue-700 transition-colors"
                        style={{ height: `${onlinePct}%` }}
                      />
                    )}
                    {bucket.offline > 0 && (
                      <div
                        className="w-full bg-amber-500 group-hover:bg-amber-600 transition-colors"
                        style={{ height: `${offlinePct}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 sm:gap-4 mt-2">
            {stats.buckets.map((bucket) => (
              <div
                key={bucket.label}
                className="flex-1 text-center font-mono text-[11px] text-slate-500 tabular-nums"
              >
                {bucket.label}
              </div>
            ))}
          </div>
        </div>

        {/* Gate Load & Quick Actions */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Kepadatan per Gerbang
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribusi kedatangan di setiap pintu masuk
            </p>

            <div className="mt-5 space-y-4">
              {stats.gateStats.map((g) => (
                <div key={g.gate}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 truncate">{g.gate}</span>
                    <span className="font-mono text-slate-600 tabular-nums shrink-0">
                      {g.entered} / {g.assigned} ({g.pct}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-900 transition-all duration-300"
                      style={{ width: `${Math.min(100, g.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('checkin')}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              Buka Scanner Gerbang
            </button>
            <button
              type="button"
              onClick={() => onNavigate('designer')}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Desain Gelang QR
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Split: Live Check-In Log + Tier Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Aktivitas Verifikasi Gerbang Terkini
              </h2>
              <p className="text-xs text-slate-500">
                Pembaruan otomatis langsung dari terminal check-in
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              Lihat Laporan Lengkap
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-6">Waktu</th>
                  <th className="py-2.5 px-4">Pengunjung</th>
                  <th className="py-2.5 px-4">Kategori · Kode</th>
                  <th className="py-2.5 px-4">Gerbang</th>
                  <th className="py-2.5 px-6 text-right">Status Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {snapshot.checkInLogs.slice(0, 7).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-6 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {log.fullName}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      <span>{log.tier}</span>
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                      <span className="font-mono text-slate-500">{log.ticketCode}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      <span>{log.gate}</span>
                      {log.verifiedByName && (
                        <span className="block text-[10px] text-slate-400">
                          Petugas: {log.verifiedByName}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-6 text-right whitespace-nowrap">
                      {log.status === 'verified' ? (
                        <span className="text-emerald-700 font-medium">
                          {log.mode === 'offline-synced' ? 'Lolos (Sync Offline)' : 'Terverifikasi'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {log.status === 'duplicate-blocked'
                            ? 'Scan Ganda Diblokir'
                            : log.status === 'revoked-blocked'
                            ? 'Gelang Diblokir'
                            : 'QR Tidak Valid'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {snapshot.checkInLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Belum ada aktivitas check-in tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tier Breakdown */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Kehadiran per Kategori Tiket
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Rasio kedatangan masing-masing kelas gelang
          </p>

          <div className="mt-5 divide-y divide-slate-100">
            {stats.tierStats.map((t) => {
              const pct = t.total > 0 ? Math.round((t.checkedIn / t.total) * 100) : 0;
              return (
                <div key={t.tier} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-slate-900">{t.tier}</p>
                    <p className="text-slate-500 tabular-nums mt-0.5">
                      Rp {(snapshot.event.ticketPrices[t.tier] || 0).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold text-slate-900 tabular-nums">
                      {t.checkedIn} / {t.total}
                    </p>
                    <p className="font-mono text-slate-500 tabular-nums mt-0.5">{pct}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
