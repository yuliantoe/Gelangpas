import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Download,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  AppStateSnapshot,
  Attendee,
  TicketPreviewLayout,
  TicketTier,
} from '../types/event.ts';
import {
  TICKET_PREVIEW_LAYOUT_OPTIONS,
  WristbandPreview,
  downloadWristbandPng,
} from './WristbandPreview.tsx';

interface VisitorsViewProps {
  snapshot: AppStateSnapshot;
  onCheckIn: (input: { qrToken?: string; gate: string }) => Promise<unknown>;
  onToggleRevoked: (id: string, revoked: boolean) => Promise<unknown>;
  onBatchCreate: (input: {
    prefixName: string;
    tier: TicketTier;
    count: number;
    gateAssigned: string;
  }) => Promise<unknown>;
}

export const VisitorsView: React.FC<VisitorsViewProps> = ({
  snapshot,
  onCheckIn,
  onToggleRevoked,
  onBatchCreate,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'checked-in' | 'pending' | 'revoked'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | TicketTier>('all');
  const [previewAttendee, setPreviewAttendee] = useState<Attendee | null>(null);
  const [modalLayoutOverride, setModalLayoutOverride] = useState<TicketPreviewLayout | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);

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

  const [batchPrefix, setBatchPrefix] = useState('Tamu VIP Korporat');
  const [batchTier, setBatchTier] = useState<TicketTier>(tierOptions[0] || 'VIP');
  const [batchCount, setBatchCount] = useState(5);
  const [batchGate, setBatchGate] = useState(snapshot.event.gates[1] || snapshot.event.gates[0]);
  const [creatingBatch, setCreatingBatch] = useState(false);

  const activeDesign =
    snapshot.designs.find((d) => d.id === snapshot.event.activeDesignId) || snapshot.designs[0];

  const filtered = useMemo(() => {
    return snapshot.attendees.filter((a) => {
      if (statusFilter === 'checked-in' && !a.checkedIn) return false;
      if (statusFilter === 'pending' && (a.checkedIn || a.revoked)) return false;
      if (statusFilter === 'revoked' && !a.revoked) return false;
      if (tierFilter !== 'all' && a.tier !== tierFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.fullName.toLowerCase().includes(q) ||
          a.ticketCode.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [snapshot.attendees, statusFilter, tierFilter, search]);

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingBatch(true);
    try {
      await onBatchCreate({
        prefixName: batchPrefix,
        tier: batchTier,
        count: batchCount,
        gateAssigned: batchGate,
      });
      setShowBatchModal(false);
    } finally {
      setCreatingBatch(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter & Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, kode GP-, atau email..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'all' as const, label: 'Semua' },
              { id: 'checked-in' as const, label: 'Sudah Masuk' },
              { id: 'pending' as const, label: 'Belum Masuk' },
              { id: 'revoked' as const, label: 'Diblokir' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as 'all' | TicketTier)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800"
          >
            <option value="all">Semua Kategori</option>
            {tierOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowBatchModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Generate Gelang Batch</span>
        </button>
      </div>

      {/* Directory Data Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-5">Pengunjung</th>
                <th className="py-3 px-4">Kode Gelang · Kategori</th>
                <th className="py-3 px-4">Gerbang · Pembayaran</th>
                <th className="py-3 px-4">Status Kehadiran</th>
                <th className="py-3 px-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-5">
                    <p className="font-semibold text-slate-900">{att.fullName}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {att.email} · {att.phone}
                    </p>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <p className="font-mono font-medium text-slate-800">{att.ticketCode}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{att.tier}</p>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <p className="text-slate-800">{att.gateAssigned}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {att.paymentMethod} · Rp {att.amountPaid.toLocaleString('id-ID')}
                    </p>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {att.revoked ? (
                      <span className="text-red-700 font-semibold">Gelang Diblokir</span>
                    ) : att.checkedIn ? (
                      <div>
                        <span className="text-emerald-700 font-semibold">Sudah Check-In</span>
                        <p className="font-mono text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {att.checkedInAt
                            ? new Date(att.checkedInAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                          {' · '}
                          {att.checkedInGate}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-500">Belum Check-In</span>
                    )}
                  </td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewAttendee(att)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Lihat Gelang</span>
                      </button>
                      {!att.checkedIn && !att.revoked && (
                        <button
                          type="button"
                          onClick={() => onCheckIn({ qrToken: att.qrToken, gate: att.gateAssigned })}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Check-In</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggleRevoked(att.id, !att.revoked)}
                        title={att.revoked ? 'Pulihkan Akses' : 'Blokir Gelang'}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          att.revoked
                            ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                            : 'border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                        }`}
                      >
                        {att.revoked ? (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Ban className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Tidak ada data pengunjung yang sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Wristband & Ticket QR Viewer & Download */}
      {previewAttendee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white border border-slate-200 p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Pratinjau Tiket Terenkripsi · {previewAttendee.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {previewAttendee.ticketCode} · Enkripsi AES-256-GCM (v{snapshot.event.encryptionKeyVersion})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewAttendee(null);
                  setModalLayoutOverride(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
              {TICKET_PREVIEW_LAYOUT_OPTIONS.map((opt) => {
                const current = modalLayoutOverride ?? activeDesign.previewLayout ?? 'wristband';
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setModalLayoutOverride(opt.id)}
                    className={`flex-1 min-w-[120px] px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      current === opt.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <WristbandPreview
                design={{
                  ...activeDesign,
                  previewLayout: modalLayoutOverride ?? activeDesign.previewLayout ?? 'wristband',
                }}
                event={snapshot.event}
                attendee={previewAttendee}
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-[11px] font-semibold text-slate-700 mb-1">
                Token QR Terenkripsi (AES-256-GCM + SHA-256):
              </p>
              <p className="font-mono text-[11px] text-slate-600 break-all select-all">
                {previewAttendee.qrToken}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  downloadWristbandPng(
                    {
                      ...activeDesign,
                      previewLayout:
                        modalLayoutOverride ?? activeDesign.previewLayout ?? 'wristband',
                    },
                    snapshot.event,
                    previewAttendee
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh PNG Tiket</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Batch Generate Wristbands */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleBatchSubmit}
            className="w-full max-w-md rounded-xl bg-white border border-slate-200 p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Generate Gelang QR Massal
              </h3>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Label Grup / Pemegang
              </label>
              <input
                type="text"
                required
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Kategori
                </label>
                <select
                  value={batchTier}
                  onChange={(e) => setBatchTier(e.target.value as TicketTier)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white"
                >
                  {tierOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Jumlah (maks 50)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Gerbang Masuk
              </label>
              <select
                value={batchGate}
                onChange={(e) => setBatchGate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white"
              >
                {snapshot.event.gates.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creatingBatch}
                className="px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creatingBatch ? 'Membuat...' : `Terbitkan ${batchCount} Gelang`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
