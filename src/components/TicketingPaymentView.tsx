import React, { useState } from 'react';
import { CheckCircle2, CreditCard, Download, QrCode, Receipt, Wallet } from 'lucide-react';
import type {
  AppStateSnapshot,
  Attendee,
  PaymentMethod,
  PaymentTransaction,
  TicketTier,
} from '../types/event.ts';
import { QrCanvas } from './QrCanvas.tsx';
import { WristbandPreview, downloadWristbandPng } from './WristbandPreview.tsx';

interface TicketingPaymentViewProps {
  snapshot: AppStateSnapshot;
  isOnline: boolean;
  canEditCategories?: boolean;
  onEditCategories?: () => void;
  onCheckout: (input: {
    fullName: string;
    email: string;
    phone: string;
    tier: TicketTier;
    quantity: number;
    gateAssigned: string;
    paymentMethod: PaymentMethod;
  }) => Promise<{ attendees: Attendee[]; transaction: PaymentTransaction; offline?: boolean }>;
}

const PAYMENT_METHODS: Array<{ id: PaymentMethod; desc: string }> = [
  { id: 'QRIS', desc: 'Scan instan semua e-wallet & mobile banking' },
  { id: 'Virtual Account BCA', desc: 'Verifikasi otomatis nomor VA BCA' },
  { id: 'Virtual Account Mandiri', desc: 'Pembayaran mandiri VA real-time' },
  { id: 'GoPay / OVO', desc: 'Dompet digital & kasir cepat' },
  { id: 'Kartu Kredit', desc: 'Visa, Mastercard & JCB 3DS' },
  { id: 'Tunai Loket', desc: 'Pembayaran tunai langsung di booth gerbang' },
];

export const TicketingPaymentView: React.FC<TicketingPaymentViewProps> = ({
  snapshot,
  isOnline,
  canEditCategories,
  onEditCategories,
  onCheckout,
}) => {
  const allCategories =
    snapshot.event.categories && snapshot.event.categories.length > 0
      ? snapshot.event.categories
      : Object.entries(snapshot.event.ticketPrices).map(([name, price], idx) => ({
          id: `cat-fallback-${idx}`,
          name,
          price,
          defaultGate: snapshot.event.gates[0] || 'Gerbang Utama A',
          quota: 500,
          active: true,
        }));
  const activeCategories = allCategories.filter((c) => c.active);
  const selectableCategories = activeCategories.length > 0 ? activeCategories : allCategories;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState<TicketTier>(
    () =>
      selectableCategories.find((c) => c.name === 'Reguler')?.name ||
      selectableCategories[0]?.name ||
      'Reguler'
  );
  const [quantity, setQuantity] = useState(1);
  const [gateAssigned, setGateAssigned] = useState(
    () =>
      selectableCategories.find((c) => c.name === 'Reguler')?.defaultGate ||
      snapshot.event.gates[0] ||
      'Gerbang Utama A'
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QRIS');
  const [step, setStep] = useState<'form' | 'awaiting-payment' | 'settled'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [issuedResult, setIssuedResult] = useState<{
    attendees: Attendee[];
    transaction: PaymentTransaction;
    offline?: boolean;
  } | null>(null);

  const selectedCat = selectableCategories.find((c) => c.name === tier) || selectableCategories[0];
  const effectiveTier = selectedCat?.name || tier;
  const unitPrice = selectedCat?.price ?? snapshot.event.ticketPrices[effectiveTier] ?? 0;
  const totalAmount = unitPrice * quantity;
  const activeDesign =
    snapshot.designs.find((d) => d.id === snapshot.event.activeDesignId) || snapshot.designs[0];

  const handleTierChange = (nextTier: TicketTier) => {
    setTier(nextTier);
    const matched = allCategories.find((c) => c.name === nextTier);
    if (matched?.defaultGate) {
      setGateAssigned(matched.defaultGate);
    } else if (nextTier === 'VIP') {
      setGateAssigned('Gerbang VIP Barat');
    } else if (nextTier === 'Backstage' || nextTier === 'Media') {
      setGateAssigned('Pintu Kru & Media');
    } else {
      setGateAssigned(snapshot.event.gates[0] || 'Gerbang Utama A');
    }
  };

  const handleProceedPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!fullName.trim()) {
      setErrorMsg('Nama lengkap pemegang gelang wajib diisi.');
      return;
    }
    if (totalAmount === 0 || paymentMethod === 'Tunai Loket') {
      handleConfirmSettlement();
    } else {
      setStep('awaiting-payment');
    }
  };

  const handleConfirmSettlement = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await onCheckout({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        tier: effectiveTier,
        quantity,
        gateAssigned,
        paymentMethod,
      });
      setIssuedResult(res);
      setStep('settled');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses pembayaran.');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  const resetOrder = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setQuantity(1);
    setIssuedResult(null);
    setStep('form');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Checkout & Direct Payment Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Pembelian Tiket & Penerbitan Gelang Langsung
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Transaksi langsung terintegrasi untuk pembelian online maupun loket di lokasi acara
              </p>
            </div>
            {!isOnline && (
              <span className="text-xs font-medium text-amber-700">
                Mode Loket Offline
              </span>
            )}
          </div>

          {step === 'form' && (
            <form onSubmit={handleProceedPayment} className="mt-5 space-y-5">
              {errorMsg && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              {/* Ticket Tier Selector */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Pilih Kategori Gelang Tiket
                  </label>
                  {canEditCategories && onEditCategories && (
                    <button
                      type="button"
                      onClick={onEditCategories}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Edit Kategori & Harga
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {selectableCategories.map((cat) => {
                    const active = effectiveTier === cat.name;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleTierChange(cat.name)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50/70'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-xs font-bold text-slate-900">{cat.name}</p>
                        <p className="font-mono text-xs text-slate-600 tabular-nums mt-1">
                          {cat.price > 0
                            ? `Rp ${cat.price.toLocaleString('id-ID')}`
                            : 'Gratis / Undangan'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Buyer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nama Lengkap Pengunjung *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Contoh: Andini Kusuma"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Email (untuk E-Gelang)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nomor WhatsApp / Telepon
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Jumlah Gelang
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Gerbang Masuk Ditugaskan
                  </label>
                  <select
                    value={gateAssigned}
                    onChange={(e) => setGateAssigned(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {snapshot.event.gates.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Metode Pembayaran Langsung
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PAYMENT_METHODS.map((pm) => (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        paymentMethod === pm.id
                          ? 'border-blue-600 bg-blue-50/70'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-900">{pm.id}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{pm.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-500 block">Total Pembayaran</span>
                  <span className="font-display text-xl font-bold text-slate-900 tabular-nums">
                    Rp {totalAmount.toLocaleString('id-ID')}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {totalAmount === 0 || paymentMethod === 'Tunai Loket'
                      ? 'Terbitkan Gelang Sekarang'
                      : 'Lanjutkan ke Pembayaran'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {step === 'awaiting-payment' && (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 flex flex-col sm:flex-row items-center gap-6">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shrink-0">
                  <QrCanvas
                    value={`00020101021226580014ID.GELANGPASS.WWW0118936005030000089123520459995303360540${totalAmount}5802ID5910GELANGPASS6007JAKARTA6304`}
                    size={150}
                  />
                </div>
                <div className="space-y-2 text-center sm:text-left">
                  <p className="text-xs font-semibold text-blue-700">
                    Menunggu Pembayaran · {paymentMethod}
                  </p>
                  <h3 className="font-display text-xl font-bold text-slate-900 tabular-nums">
                    Rp {totalAmount.toLocaleString('id-ID')}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {paymentMethod.startsWith('Virtual Account')
                      ? `Nomor VA: 88010-${Math.floor(10000000 + Math.random() * 89999999)} atas nama ${fullName}.`
                      : `Pindai QRIS di samping atau konfirmasi pembayaran dari perangkat ${fullName}.`}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {quantity}x Gelang {effectiveTier} · {gateAssigned}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Kembali Ubah Pesanan
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmSettlement}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Memverifikasi...' : 'Konfirmasi Pembayaran Lunas & Cetak QR'}</span>
                </button>
              </div>
            </div>
          )}

          {step === 'settled' && issuedResult && (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-950">
                      Pembayaran Lunas · {issuedResult.transaction.invoiceNumber}
                    </p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      {issuedResult.attendees.length} gelang tiket terenkripsi AES-256-GCM siap digunakan di gerbang.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetOrder}
                  className="rounded-lg bg-white border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap shrink-0"
                >
                  Transaksi Baru
                </button>
              </div>

              <div className="space-y-4">
                {issuedResult.attendees.map((att) => (
                  <div key={att.id} className="space-y-2">
                    <WristbandPreview
                      design={activeDesign}
                      event={snapshot.event}
                      attendee={att}
                      compact
                    />
                    <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                      <span className="font-mono">{att.ticketCode}</span>
                      <button
                        type="button"
                        onClick={() => downloadWristbandPng(activeDesign, snapshot.event, att)}
                        className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh PNG Gelang</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Price Summary & Recent Transactions */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Ringkasan Tarif & Kategori
              </h3>
              <div className="flex items-center gap-2">
                {canEditCategories && onEditCategories && (
                  <button
                    type="button"
                    onClick={onEditCategories}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Ubah Tarif
                  </button>
                )}
                <Wallet className="w-4 h-4 text-slate-400" />
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100 text-xs">
              {allCategories.map((cat) => (
                <div key={cat.id} className="py-2.5 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {cat.name}
                    {!cat.active && (
                      <span className="ml-1.5 text-[11px] text-slate-400">(Nonaktif)</span>
                    )}
                  </span>
                  <span className="font-mono text-slate-700 tabular-nums">
                    {cat.price > 0 ? `Rp ${cat.price.toLocaleString('id-ID')}` : 'Komplimenter'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-slate-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Riwayat Transaksi Terkini
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {snapshot.transactions.length} total
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
              {snapshot.transactions.slice(0, 10).map((tx) => (
                <div key={tx.id} className="px-6 py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{tx.buyerName}</p>
                    <p className="text-slate-500 mt-0.5 truncate">
                      <span>{tx.quantity}x {tx.tier}</span>
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                      <span>{tx.method}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-semibold text-slate-900 tabular-nums">
                      Rp {tx.amount.toLocaleString('id-ID')}
                    </p>
                    <p className="font-mono text-[11px] text-emerald-700 mt-0.5">
                      Lunas · {tx.referenceCode}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
