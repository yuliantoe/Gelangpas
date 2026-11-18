import React, { useMemo } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import type { AppStateSnapshot, TicketTier } from '../types/event.ts';

interface ReportsViewProps {
  snapshot: AppStateSnapshot;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ snapshot }) => {
  const report = useMemo(() => {
    const total = snapshot.attendees.length;
    const checkedIn = snapshot.attendees.filter((a) => a.checkedIn).length;
    const notCheckedIn = snapshot.attendees.filter((a) => !a.checkedIn && !a.revoked).length;
    const revoked = snapshot.attendees.filter((a) => a.revoked).length;
    const turnoutPct = total > 0 ? ((checkedIn / total) * 100).toFixed(1) : '0.0';

    const onlineCount = snapshot.checkInLogs.filter(
      (l) => l.status === 'verified' && l.mode === 'online'
    ).length;
    const offlineSyncedCount = snapshot.checkInLogs.filter(
      (l) => l.status === 'verified' && l.mode === 'offline-synced'
    ).length;
    const blockedAttempts = snapshot.checkInLogs.filter(
      (l) => l.status !== 'verified'
    ).length;

    const gateBreakdown = snapshot.event.gates.map((gate) => {
      const assigned = snapshot.attendees.filter((a) => a.gateAssigned === gate).length;
      const entered = snapshot.attendees.filter(
        (a) => a.checkedIn && a.checkedInGate === gate
      ).length;
      const blocked = snapshot.checkInLogs.filter(
        (l) => l.gate === gate && l.status !== 'verified'
      ).length;
      const rate = assigned > 0 ? Math.round((entered / assigned) * 100) : 0;
      return { gate, assigned, entered, blocked, rate };
    });

    const tiers: TicketTier[] = Array.from(
      new Set([
        ...(snapshot.event.categories?.map((c) => c.name) || Object.keys(snapshot.event.ticketPrices)),
        ...snapshot.attendees.map((a) => a.tier),
      ])
    );
    const tierBreakdown = tiers.map((tier) => {
      const issued = snapshot.attendees.filter((a) => a.tier === tier).length;
      const entered = snapshot.attendees.filter((a) => a.tier === tier && a.checkedIn).length;
      const revenue = snapshot.attendees
        .filter((a) => a.tier === tier)
        .reduce((sum, a) => sum + a.amountPaid, 0);
      const rate = issued > 0 ? Math.round((entered / issued) * 100) : 0;
      return { tier, issued, entered, rate, revenue };
    });

    return {
      total,
      checkedIn,
      notCheckedIn,
      revoked,
      turnoutPct,
      onlineCount,
      offlineSyncedCount,
      blockedAttempts,
      gateBreakdown,
      tierBreakdown,
    };
  }, [snapshot]);

  const exportCsv = () => {
    const header = [
      'Kode Tiket',
      'Nama Lengkap',
      'Email',
      'Kategori',
      'Gerbang Ditugaskan',
      'Metode Bayar',
      'Nominal (IDR)',
      'Sudah Check-In',
      'Waktu Check-In',
      'Gerbang Check-In',
      'Mode Verifikasi',
      'Diblokir',
    ];
    const rows = snapshot.attendees.map((a) => [
      a.ticketCode,
      `"${a.fullName.replace(/"/g, '""')}"`,
      a.email,
      a.tier,
      `"${a.gateAssigned}"`,
      a.paymentMethod,
      a.amountPaid,
      a.checkedIn ? 'YA' : 'TIDAK',
      a.checkedInAt || '-',
      a.checkedInGate || '-',
      a.checkedInMode || '-',
      a.revoked ? 'YA' : 'TIDAK',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-kehadiran-${snapshot.event.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      event: snapshot.event,
      summary: report,
      checkInLogs: snapshot.checkInLogs,
      transactions: snapshot.transactions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-statistik-${snapshot.event.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Laporan Statistik Kehadiran Real-Time
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {snapshot.event.title} · {snapshot.event.venue} · {snapshot.event.dateLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>
          <button
            type="button"
            onClick={exportJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor JSON</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Rasio Kehadiran Aktual</p>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {report.turnoutPct}%
          </p>
          <p className="text-xs text-slate-500 tabular-nums mt-1">
            {report.checkedIn} dari {report.total} gelang aktif
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Belum Check-In (No-Show)</p>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {report.notCheckedIn}
          </p>
          <p className="text-xs text-slate-500 tabular-nums mt-1">
            {report.revoked} gelang dinonaktifkan
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Verifikasi Online vs Offline</p>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {report.onlineCount} / {report.offlineSyncedCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Online langsung · Sync offline
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Upaya Anomali Diblokir</p>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {report.blockedAttempts}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Scan ganda & tanda tangan tidak sah
          </p>
        </div>
      </div>

      {/* Tables: Gate Breakdown & Tier Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Statistik per Gerbang Masuk
            </h3>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-6">Gerbang</th>
                <th className="py-2.5 px-3 text-right">Terdaftar</th>
                <th className="py-2.5 px-3 text-right">Masuk</th>
                <th className="py-2.5 px-3 text-right">Diblokir</th>
                <th className="py-2.5 px-6 text-right">Tingkat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.gateBreakdown.map((g) => (
                <tr key={g.gate}>
                  <td className="py-3 px-6 font-medium text-slate-900">{g.gate}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                    {g.assigned}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                    {g.entered}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-red-600">
                    {g.blocked}
                  </td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-900">
                    {g.rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Statistik per Kategori & Pendapatan
            </h3>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-6">Kategori</th>
                <th className="py-2.5 px-3 text-right">Terbit</th>
                <th className="py-2.5 px-3 text-right">Hadir</th>
                <th className="py-2.5 px-6 text-right">Pendapatan (IDR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.tierBreakdown.map((t) => (
                <tr key={t.tier}>
                  <td className="py-3 px-6 font-medium text-slate-900">{t.tier}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                    {t.issued}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                    {t.entered} ({t.rate}%)
                  </td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-slate-900">
                    Rp {t.revenue.toLocaleString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Log Audit Verifikasi Gerbang ({snapshot.checkInLogs.length} Rekaman)
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-6">Timestamp</th>
                <th className="py-2.5 px-4">Kode · Pengunjung</th>
                <th className="py-2.5 px-4">Gerbang · Perangkat</th>
                <th className="py-2.5 px-4">Mode</th>
                <th className="py-2.5 px-6 text-right">Hasil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshot.checkInLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 px-6 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('id-ID')}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className="font-mono text-slate-700">{log.ticketCode}</span>
                    <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                    <span className="font-medium text-slate-900">{log.fullName}</span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                    {log.gate} · <span className="font-mono">{log.deviceId}</span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                    {log.mode === 'offline-synced' ? 'Sinkron Offline' : 'Online'}
                  </td>
                  <td className="py-2.5 px-6 text-right whitespace-nowrap font-medium">
                    {log.status === 'verified' ? (
                      <span className="text-emerald-700">Terverifikasi</span>
                    ) : (
                      <span className="text-red-700">{log.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
