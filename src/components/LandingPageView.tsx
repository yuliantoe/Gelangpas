import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  LayoutDashboard,
  Menu,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  AppStateSnapshot,
  Attendee,
  PaymentMethod,
  PaymentTransaction,
  TicketCategory,
  TicketTier,
} from '../types/event.ts';
import { QrCanvas } from './QrCanvas.tsx';
import { WristbandPreview, downloadWristbandPng } from './WristbandPreview.tsx';

export type DashboardTargetTab =
  | 'dashboard'
  | 'events'
  | 'checkin'
  | 'designer'
  | 'ticketing'
  | 'categories'
  | 'visitors'
  | 'reports'
  | 'users'
  | 'security';

interface LandingPageViewProps {
  snapshot: AppStateSnapshot;
  isOnline: boolean;
  onEnterDashboard: (tab?: DashboardTargetTab) => void;
  onSelectEvent?: (eventId: string) => Promise<unknown>;
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

const LANDING_PAYMENT_METHODS: Array<{ id: PaymentMethod; desc: string }> = [
  { id: 'QRIS', desc: 'Scan instan semua e-wallet & mobile banking' },
  { id: 'Virtual Account BCA', desc: 'Otomatis terverifikasi lewat BCA' },
  { id: 'Virtual Account Mandiri', desc: 'Otomatis terverifikasi lewat Mandiri' },
  { id: 'GoPay / OVO', desc: 'Pembayaran dompet digital instan' },
  { id: 'Kartu Kredit', desc: 'Visa, Mastercard, dan JCB 3DS' },
];

function buildCategoryDetails(cat: TicketCategory, eventDateLabel: string): {
  note: string;
  perks: string[];
  featured: boolean;
} {
  const lower = cat.name.toLowerCase();
  const isVip = lower.includes('vip');
  const isPass = lower.includes('terusan') || lower.includes('pass') || lower.includes('multi');
  const isStaff = lower.includes('backstage') || lower.includes('media') || lower.includes('panitia');

  if (isVip) {
    return {
      featured: true,
      note: 'Akses prioritas tanpa antre panjang dengan area khusus VIP.',
      perks: [
        `Akses cepat melalui ${cat.defaultGate}`,
        `QR Terenkripsi AES-256-GCM · Kuota ${cat.quota} gelang`,
        'Termasuk jalur penukaran prioritas di lokasi',
      ],
    };
  }
  if (isPass) {
    return {
      featured: false,
      note: 'Satu gelang aktif untuk seluruh rangkaian jadwal acara.',
      perks: [
        `Berlaku untuk jadwal ${eventDateLabel}`,
        `Akses melalui ${cat.defaultGate}`,
        'Verifikasi QR instan walau koneksi offline',
      ],
    };
  }
  if (isStaff) {
    return {
      featured: false,
      note: 'Kategori akses operasional dan area terbatas sesuai otorisasi.',
      perks: [
        `Jalur masuk ${cat.defaultGate}`,
        `Kuota terpantau ${cat.quota} gelang aktif`,
        'Tercatat otomatis di laporan kehadiran penyelenggara',
      ],
    };
  }

  return {
    featured: false,
    note: 'Akses utama ke seluruh zona publik acara dan tenant pameran.',
    perks: [
      `Masuk lewat ${cat.defaultGate}`,
      `Jadwal ${eventDateLabel}`,
      `Kuota tersedia ${cat.quota} gelang · QR terenkripsi`,
    ],
  };
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  snapshot,
  isOnline,
  onEnterDashboard,
  onSelectEvent,
  onCheckout,
}) => {
  const eventsList = snapshot.events && snapshot.events.length > 0 ? snapshot.events : [snapshot.event];
  const activeCategories = useMemo(() => {
    const raw =
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
    const filtered = raw.filter((c) => c.active);
    return filtered.length > 0 ? filtered : raw;
  }, [snapshot.event.categories, snapshot.event.ticketPrices, snapshot.event.gates]);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Checkout Modal State
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'buyer' | 'pay' | 'done'>('buyer');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QRIS');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [issuedAttendees, setIssuedAttendees] = useState<Attendee[]>([]);
  const [issuedInvoices, setIssuedInvoices] = useState<PaymentTransaction[]>([]);

  const activeDesign =
    snapshot.designs.find((d) => d.id === snapshot.event.activeDesignId) || snapshot.designs[0];

  const selectedItems = useMemo(
    () =>
      activeCategories
        .map((cat) => ({
          category: cat,
          qty: quantities[cat.id] || 0,
        }))
        .filter((item) => item.qty > 0),
    [activeCategories, quantities]
  );

  const totalQty = selectedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalAmount = selectedItems.reduce(
    (sum, item) => sum + item.category.price * item.qty,
    0
  );

  const updateQty = (catId: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(0, Math.min(20, (prev[catId] || 0) + delta));
      return { ...prev, [catId]: next };
    });
  };

  const openCheckoutFlow = () => {
    if (totalQty === 0 && activeCategories.length > 0) {
      const defaultCat =
        activeCategories.find((c) => c.name.toLowerCase().includes('reguler')) || activeCategories[0];
      setQuantities((prev) => ({ ...prev, [defaultCat.id]: 1 }));
    }
    setCheckoutError(null);
    setCheckoutStep('buyer');
    setCheckoutOpen(true);
  };

  const handleBuyerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    if (!buyerName.trim()) {
      setCheckoutError('Nama lengkap pemesan wajib diisi.');
      return;
    }
    if (!buyerEmail.trim() && !buyerPhone.trim()) {
      setCheckoutError('Isi email atau nomor WhatsApp untuk pengiriman kode gelang.');
      return;
    }
    if (totalAmount === 0) {
      void settleAllSelectedItems();
    } else {
      setCheckoutStep('pay');
    }
  };

  const settleAllSelectedItems = async () => {
    setSubmitting(true);
    setCheckoutError(null);
    try {
      const allAttendees: Attendee[] = [];
      const allTx: PaymentTransaction[] = [];

      for (const item of selectedItems) {
        const res = await onCheckout({
          fullName: buyerName.trim(),
          email: buyerEmail.trim(),
          phone: buyerPhone.trim(),
          tier: item.category.name,
          quantity: item.qty,
          gateAssigned: item.category.defaultGate || snapshot.event.gates[0] || 'Gerbang Utama A',
          paymentMethod,
        });
        allAttendees.push(...res.attendees);
        allTx.push(res.transaction);
      }

      setIssuedAttendees(allAttendees);
      setIssuedInvoices(allTx);
      setQuantities({});
      setCheckoutStep('done');
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Gagal memproses transaksi tiket.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeCheckoutModal = () => {
    setCheckoutOpen(false);
    setCheckoutError(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FB] text-[#0E1330]">
      {/* TOP NAVIGATION BAR (Single-line 3-Zone Header) */}
      <header className="sticky top-0 z-40 bg-[#F4F7FB]/95 backdrop-blur border-b border-[#D5DBEC]">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-12 h-20 flex items-center justify-between gap-4">
          {/* Brand Lockup */}
          <a href="#top" className="flex items-center gap-2.5 shrink-0">
            <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
              <rect x="2" y="10" width="32" height="16" rx="8" fill="#FF5A1F" />
              <circle cx="26" cy="18" r="4" fill="#0E1330" />
            </svg>
            <span className="font-display font-bold text-[22px] tracking-tight text-[#0E1330] whitespace-nowrap shrink-0">
              GelangPass
            </span>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-[15px] font-medium">
            <a
              href="#cara"
              className="text-[#0E1330] hover:text-[#2B3BFF] transition-colors whitespace-nowrap shrink-0"
            >
              Cara beli
            </a>
            <a
              href="#tiket"
              className="text-[#0E1330] hover:text-[#2B3BFF] transition-colors whitespace-nowrap shrink-0"
            >
              Pilih tiket
            </a>
            <a
              href="#faq"
              className="text-[#0E1330] hover:text-[#2B3BFF] transition-colors whitespace-nowrap shrink-0"
            >
              Pertanyaan
            </a>
            <button
              type="button"
              onClick={() => onEnterDashboard('dashboard')}
              className="inline-flex items-center gap-1.5 text-[#3F4668] hover:text-[#0E1330] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Panel Penyelenggara</span>
            </button>
          </nav>

          {/* Primary Header CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="#tiket"
              className="hidden sm:inline-flex items-center justify-center rounded-full bg-[#0E1330] text-white text-[15px] font-medium px-5 py-2.5 hover:bg-[#1e2554] transition-colors whitespace-nowrap shrink-0"
            >
              Beli sekarang
            </a>
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg border border-[#D5DBEC] bg-white text-[#0E1330]"
              aria-label="Buka menu navigasi"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileNavOpen && (
          <div className="md:hidden border-t border-[#D5DBEC] bg-white px-5 py-4 space-y-3 text-sm font-medium">
            <a
              href="#cara"
              onClick={() => setMobileNavOpen(false)}
              className="block py-1.5 text-[#0E1330]"
            >
              Cara beli
            </a>
            <a
              href="#tiket"
              onClick={() => setMobileNavOpen(false)}
              className="block py-1.5 text-[#0E1330]"
            >
              Pilih tiket
            </a>
            <a
              href="#faq"
              onClick={() => setMobileNavOpen(false)}
              className="block py-1.5 text-[#0E1330]"
            >
              Pertanyaan
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileNavOpen(false);
                onEnterDashboard('dashboard');
              }}
              className="w-full text-left py-1.5 text-[#2B3BFF] font-semibold flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Masuk Panel Penyelenggara</span>
            </button>
            <a
              href="#tiket"
              onClick={() => setMobileNavOpen(false)}
              className="block w-full text-center rounded-full bg-[#0E1330] text-white py-2.5 font-semibold"
            >
              Beli sekarang
            </a>
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section id="top" className="w-full">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-12 pt-10 pb-16 lg:pt-14 lg:pb-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Hero Copy */}
          <div className="lg:col-span-7 flex flex-col gap-6 min-w-0">
            {eventsList.length > 1 && onSelectEvent && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label htmlFor="landing-event-select" className="font-semibold text-[#3F4668]">
                  Pilih Acara:
                </label>
                <select
                  id="landing-event-select"
                  value={snapshot.event.id}
                  onChange={(e) => {
                    setQuantities({});
                    void onSelectEvent(e.target.value);
                  }}
                  className="rounded-lg border border-[#D5DBEC] bg-white px-3 py-1.5 text-xs font-semibold text-[#0E1330]"
                >
                  {eventsList.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} — {ev.dateLabel}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <p className="text-sm font-semibold tracking-tight text-[#2B3BFF]">
              <span>{snapshot.event.title}</span>
              <span className="mx-2 text-[#9AA3C2]" aria-hidden="true">·</span>
              <span className="text-[#3F4668] font-medium">{snapshot.event.dateLabel}</span>
              <span className="mx-2 text-[#9AA3C2]" aria-hidden="true">·</span>
              <span className="text-[#3F4668] font-medium">{snapshot.event.venue}</span>
              <span className="mx-2 text-[#9AA3C2]" aria-hidden="true">·</span>
              <span className="text-[#3F4668] font-medium">Buka gerbang 13:00 WIB</span>
            </p>

            <h1 className="font-display font-bold text-[#0E1330] text-[clamp(2.5rem,5.5vw,4.35rem)] leading-[1.03] tracking-[-0.03em]">
              Satu gelang,
              <br />
              masuk semua keseruan.
            </h1>

            <p className="text-[17px] sm:text-[19px] leading-[1.55] text-[#3F4668] max-w-[540px]">
              Beli tiket gelang secara online, pindai QR terenkripsi di pintu masuk, lalu langsung masuk.
              Pilih kategori gelang yang sesuai dan bayar lewat metode favoritmu.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-1">
              <a
                href="#tiket"
                className="inline-flex items-center justify-center rounded-full bg-[#FF5A1F] text-[#0E1330] font-semibold text-[16px] sm:text-[17px] px-7 py-3.5 hover:bg-[#ff6d38] transition-colors whitespace-nowrap"
              >
                Pilih tiket gelang
              </a>
              <a
                href="#cara"
                className="inline-flex items-center justify-center rounded-full border-2 border-[#0E1330] text-[#0E1330] font-semibold text-[16px] sm:text-[17px] px-7 py-3.5 hover:bg-[#0E1330] hover:text-white transition-colors whitespace-nowrap"
              >
                Lihat cara beli
              </a>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-[#3F4668]">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#2B3BFF]" />
                Enkripsi AES-256-GCM + SHA-256
              </span>
              <button
                type="button"
                onClick={() => onEnterDashboard('designer')}
                className="inline-flex items-center gap-1 text-[#2B3BFF] hover:underline font-semibold cursor-pointer"
              >
                <span>Kustomisasi Desain Gelang</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onEnterDashboard('checkin')}
                className="inline-flex items-center gap-1 text-[#0E1330] hover:underline font-semibold cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Terminal Check-In Gerbang</span>
              </button>
            </div>
          </div>

          {/* Hero Visual Artwork Card (#2B3BFF) */}
          <div className="lg:col-span-5 flex items-center justify-center">
            <div className="w-full max-w-[520px] bg-[#2B3BFF] rounded-[36px] p-8 sm:p-11 flex flex-col items-center gap-6 shadow-sm">
              <svg
                viewBox="0 0 400 120"
                className="w-full h-auto"
                role="img"
                aria-label="Ilustrasi gelang tiket QR GelangPass"
              >
                <rect x="10" y="30" width="380" height="60" rx="30" fill="#FF5A1F" />
                <rect
                  x="10"
                  y="30"
                  width="380"
                  height="60"
                  rx="30"
                  fill="none"
                  stroke="#0E1330"
                  strokeWidth="3"
                />
                <g fill="#0E1330">
                  <rect x="58" y="48" width="6" height="24" rx="3" />
                  <rect x="76" y="48" width="6" height="24" rx="3" />
                  <rect x="94" y="48" width="6" height="24" rx="3" />
                  <rect x="112" y="48" width="6" height="24" rx="3" />
                  <rect x="130" y="48" width="6" height="24" rx="3" />
                  <rect x="148" y="48" width="6" height="24" rx="3" />
                  <rect x="166" y="48" width="6" height="24" rx="3" />
                  <rect x="184" y="48" width="6" height="24" rx="3" />
                  <rect x="202" y="48" width="6" height="24" rx="3" />
                  <rect x="220" y="48" width="6" height="24" rx="3" />
                </g>
                <rect
                  x="248"
                  y="42"
                  width="36"
                  height="36"
                  rx="6"
                  fill="#F4F7FB"
                  stroke="#0E1330"
                  strokeWidth="2.5"
                />
                <rect x="255" y="49" width="9" height="9" fill="#0E1330" />
                <rect x="268" y="49" width="9" height="9" fill="#0E1330" />
                <rect x="255" y="62" width="9" height="9" fill="#0E1330" />
                <rect x="268" y="62" width="5" height="5" fill="#FF5A1F" />
                <circle
                  cx="326"
                  cy="60"
                  r="15"
                  fill="#F4F7FB"
                  stroke="#0E1330"
                  strokeWidth="3"
                />
                <circle cx="326" cy="60" r="5" fill="#0E1330" />
              </svg>

              <div className="text-center space-y-1.5">
                <p className="font-display font-bold text-[24px] sm:text-[26px] text-white tracking-tight leading-snug">
                  Tiket gelang digital, tukar di lokasi
                </p>
                <p className="text-sm text-[#DCE1FF] font-medium">
                  {activeDesign?.name || 'Desain Resmi'} · {snapshot.event.gates.length} gerbang siap pindai
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CARA BELI (3 LANGKAH) */}
      <section id="cara" className="bg-white py-16 lg:py-20 border-y border-[#D5DBEC]">
        <div className="max-w-[1184px] mx-auto px-5 sm:px-8 lg:px-12 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <h2 className="font-display font-bold text-[32px] sm:text-[40px] tracking-[-0.025em] text-[#0E1330]">
              Tiga langkah, selesai.
            </h2>
            <p className="text-sm text-[#3F4668]">
              Sistem penerbitan QR GelangPass bekerja instan secara online maupun mode loket offline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-[#D5DBEC] rounded-[24px] p-7 sm:p-8 flex flex-col gap-3.5 bg-[#F4F7FB]/40">
              <div className="w-11 h-11 rounded-full bg-[#FF5A1F] text-[#0E1330] font-display font-bold text-xl flex items-center justify-center">
                1
              </div>
              <h3 className="font-display font-bold text-[22px] text-[#0E1330]">
                Pilih jenis gelang
              </h3>
              <p className="text-[16px] leading-[1.55] text-[#3F4668]">
                Tentukan kategori gelang dan jumlah yang kamu butuhkan sesuai kuota acara aktif.
              </p>
            </div>

            <div className="border border-[#D5DBEC] rounded-[24px] p-7 sm:p-8 flex flex-col gap-3.5 bg-[#F4F7FB]/40">
              <div className="w-11 h-11 rounded-full bg-[#FF5A1F] text-[#0E1330] font-display font-bold text-xl flex items-center justify-center">
                2
              </div>
              <h3 className="font-display font-bold text-[22px] text-[#0E1330]">
                Bayar online
              </h3>
              <p className="text-[16px] leading-[1.55] text-[#3F4668]">
                Bayar lewat QRIS, Virtual Account BCA &amp; Mandiri, GoPay / OVO, atau Kartu Kredit.
                Gelang QR langsung terbit.
              </p>
            </div>

            <div className="border border-[#D5DBEC] rounded-[24px] p-7 sm:p-8 flex flex-col gap-3.5 bg-[#F4F7FB]/40">
              <div className="w-11 h-11 rounded-full bg-[#FF5A1F] text-[#0E1330] font-display font-bold text-xl flex items-center justify-center">
                3
              </div>
              <h3 className="font-display font-bold text-[22px] text-[#0E1330]">
                Tukar di pintu masuk
              </h3>
              <p className="text-[16px] leading-[1.55] text-[#3F4668]">
                Tunjukkan e-gelang QR ke petugas gerbang ({snapshot.event.gates.join(', ')}), lalu langsung masuk.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PILIH GELANGMU (DYNAMIC TIERS & CHECKOUT) */}
      <section id="tiket" className="py-16 lg:py-20">
        <div className="max-w-[1184px] mx-auto px-5 sm:px-8 lg:px-12 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2">
              <h2 className="font-display font-bold text-[32px] sm:text-[40px] tracking-[-0.025em] text-[#0E1330]">
                Pilih gelangmu.
              </h2>
              <p className="text-[16px] sm:text-[17px] text-[#3F4668]">
                Kategori dan harga langsung mengikuti pengaturan penyelenggara untuk {snapshot.event.title}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEnterDashboard('categories')}
              className="text-sm font-semibold text-[#2B3BFF] hover:underline self-start sm:self-auto cursor-pointer"
            >
              Kelola Kategori &amp; Harga di Panel &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {activeCategories.map((cat) => {
              const qty = quantities[cat.id] || 0;
              const details = buildCategoryDetails(cat, snapshot.event.dateLabel);

              return (
                <div
                  key={cat.id}
                  className={`bg-white rounded-[28px] p-7 sm:p-8 flex flex-col gap-5 border-2 transition-colors ${
                    qty > 0 ? 'border-[#2B3BFF]' : 'border-[#0E1330]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display font-bold text-[24px] sm:text-[26px] text-[#0E1330] leading-tight">
                      Gelang {cat.name}
                    </h3>
                    {details.featured && (
                      <span className="bg-[#FF5A1F] text-[#0E1330] px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap shrink-0">
                        Paling dipilih
                      </span>
                    )}
                  </div>

                  <p className="text-[15px] leading-[1.5] text-[#3F4668]">{details.note}</p>

                  <div className="font-display font-bold text-[32px] sm:text-[36px] tracking-[-0.03em] text-[#0E1330] tabular-nums">
                    {cat.price > 0 ? `Rp ${cat.price.toLocaleString('id-ID')}` : 'Gratis / Undangan'}
                  </div>

                  <div className="flex flex-col gap-2.5 text-[15px] text-[#0E1330]">
                    {details.perks.map((perk) => (
                      <div key={perk} className="flex items-start gap-2.5">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          className="shrink-0 mt-0.5"
                          aria-hidden="true"
                        >
                          <circle cx="10" cy="10" r="10" fill="#2B3BFF" />
                          <path
                            d="M5.5 10.5l3 3 6-6.5"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>{perk}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-label={`Kurangi jumlah gelang ${cat.name}`}
                        onClick={() => updateQty(cat.id, -1)}
                        className="w-11 h-11 rounded-full border-2 border-[#0E1330] bg-white text-[#0E1330] text-xl font-semibold flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        -
                      </button>
                      <span className="min-w-[28px] text-center font-display font-bold text-2xl tabular-nums text-[#0E1330]">
                        {qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`Tambah jumlah gelang ${cat.name}`}
                        onClick={() => updateQty(cat.id, 1)}
                        className="w-11 h-11 rounded-full border-2 border-[#0E1330] bg-[#0E1330] text-white text-xl font-semibold flex items-center justify-center hover:bg-[#1e2554] transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm text-[#3F4668]">gelang</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dark Order Summary Bar */}
          <div className="bg-[#0E1330] text-white rounded-[28px] p-6 sm:px-8 sm:py-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm text-[#C9CEEA]">Ringkasan pesanan</p>
              <p className="font-display font-bold text-[22px] sm:text-[26px] tabular-nums">
                {totalQty === 0
                  ? 'Belum ada gelang dipilih'
                  : `${totalQty} gelang dipilih · Rp ${totalAmount.toLocaleString('id-ID')}`}
              </p>
            </div>
            <button
              type="button"
              onClick={openCheckoutFlow}
              className="rounded-full bg-[#FF5A1F] text-[#0E1330] px-8 py-3.5 text-[16px] sm:text-[17px] font-semibold hover:bg-[#ff6d38] transition-colors whitespace-nowrap cursor-pointer"
            >
              Lanjut ke pembayaran
            </button>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="bg-white py-16 lg:py-20 border-t border-[#D5DBEC]">
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 space-y-8">
          <h2 className="font-display font-bold text-[32px] sm:text-[40px] tracking-[-0.025em] text-[#0E1330]">
            Pertanyaan umum
          </h2>

          <div className="space-y-3">
            <details className="border border-[#D5DBEC] rounded-[18px] px-6 py-5 group">
              <summary className="font-semibold text-[17px] sm:text-[18px] text-[#0E1330] cursor-pointer">
                Bagaimana cara menukar kode dengan gelang?
              </summary>
              <p className="mt-3 text-[15px] sm:text-[16px] leading-[1.6] text-[#3F4668]">
                Setelah transaksi selesai, kamu langsung memperoleh PNG e-gelang beserta kode QR terenkripsi.
                Tunjukkan QR tersebut ke petugas di lokasi acara ({snapshot.event.venue}) melalui{' '}
                {snapshot.event.gates.join(', ')} untuk dipindai dan dipasangkan gelang fisik.
              </p>
            </details>

            <details className="border border-[#D5DBEC] rounded-[18px] px-6 py-5">
              <summary className="font-semibold text-[17px] sm:text-[18px] text-[#0E1330] cursor-pointer">
                Apakah sistem check-in tetap berjalan jika internet di lokasi terganggu?
              </summary>
              <p className="mt-3 text-[15px] sm:text-[16px] leading-[1.6] text-[#3F4668]">
                Ya. Seluruh QR gelang GelangPass terenkripsi dengan AES-256-GCM dan disinkronkan ke cache lokal
                IndexedDB perangkat gerbang, sehingga pemindaian verifikasi tetap berjalan instan meskipun tanpa
                koneksi internet.
              </p>
            </details>

            <details className="border border-[#D5DBEC] rounded-[18px] px-6 py-5">
              <summary className="font-semibold text-[17px] sm:text-[18px] text-[#0E1330] cursor-pointer">
                Bagaimana jika gelang hilang atau rusak?
              </summary>
              <p className="mt-3 text-[15px] sm:text-[16px] leading-[1.6] text-[#3F4668]">
                Laporkan ke meja bantuan penyelenggara di lokasi dengan menunjukkan bukti pembayaran atau identitas
                pembelian. Administrator dapat memblokir (revoke) QR gelang lama secara real-time dan menerbitkan
                gelang pengganti yang aman dari penyalahgunaan.
              </p>
            </details>

            <details className="border border-[#D5DBEC] rounded-[18px] px-6 py-5">
              <summary className="font-semibold text-[17px] sm:text-[18px] text-[#0E1330] cursor-pointer">
                Bagaimana penyelenggara memantau jumlah pengunjung dan mencetak gelang massal?
              </summary>
              <p className="mt-3 text-[15px] sm:text-[16px] leading-[1.6] text-[#3F4668]">
                Klik menu{' '}
                <button
                  type="button"
                  onClick={() => onEnterDashboard('dashboard')}
                  className="font-semibold text-[#2B3BFF] underline cursor-pointer"
                >
                  Panel Penyelenggara
                </button>{' '}
                untuk melihat arus masuk real-time, mendesain gelang sesuai tema acara lengkap dengan logo brand,
                serta mengunduh lembar cetak PNG berurutan.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0E1330] text-[#C9CEEA] py-14 px-5 sm:px-8 lg:px-12 mt-auto">
        <div className="max-w-[1184px] mx-auto flex flex-wrap justify-between gap-10">
          <div className="space-y-3 max-w-[360px]">
            <div className="flex items-center gap-2.5">
              <svg width="30" height="30" viewBox="0 0 36 36" aria-hidden="true">
                <rect x="2" y="10" width="32" height="16" rx="8" fill="#FF5A1F" />
                <circle cx="26" cy="18" r="4" fill="#0E1330" />
              </svg>
              <span className="font-display font-bold text-2xl text-white">GelangPass</span>
            </div>
            <p className="text-[15px] leading-relaxed">
              Penjualan tiket gelang QR terenkripsi dan manajemen pengunjung real-time untuk{' '}
              {snapshot.event.title}.
            </p>
          </div>

          <div className="space-y-2 text-[15px]">
            <p className="text-white font-semibold">Lokasi &amp; Kontak</p>
            <p>idmonggo@gmail.com</p>
            <p>{snapshot.event.venue}</p>
            <p>{snapshot.event.dateLabel}</p>
          </div>

          <div className="space-y-2 text-[15px]">
            <p className="text-white font-semibold">Pembayaran &amp; Akses</p>
            <p>QRIS · VA BCA &amp; Mandiri · GoPay / OVO · Kartu Kredit</p>
            <div className="pt-1 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => onEnterDashboard('dashboard')}
                className="text-[#FF5A1F] font-semibold hover:underline cursor-pointer"
              >
                Buka Dasbor Penyelenggara &rarr;
              </button>
              <button
                type="button"
                onClick={() => onEnterDashboard('designer')}
                className="text-white hover:underline cursor-pointer"
              >
                Desainer Gelang
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* DIRECT CHECKOUT MODAL */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0E1330]/70 backdrop-blur-xs">
          <div className="bg-white border border-[#D5DBEC] rounded-[28px] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#D5DBEC]">
              <div>
                <h3 className="font-display text-xl font-bold text-[#0E1330]">
                  {checkoutStep === 'done'
                    ? 'Gelang Tiket Berhasil Diterbitkan'
                    : checkoutStep === 'pay'
                    ? `Selesaikan Pembayaran · ${paymentMethod}`
                    : 'Lengkapi Data Pemegang Gelang'}
                </h3>
                <p className="text-xs text-[#3F4668] mt-1">
                  {snapshot.event.title} · {snapshot.event.venue}
                  {!isOnline && ' · Mode Offline Aktif'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCheckoutModal}
                className="p-2 rounded-full border border-[#D5DBEC] text-[#3F4668] hover:bg-slate-100"
                aria-label="Tutup jendela pembayaran"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {checkoutError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 font-medium">
                {checkoutError}
              </div>
            )}

            {checkoutStep === 'buyer' && (
              <form onSubmit={handleBuyerSubmit} className="space-y-5">
                <div className="rounded-2xl bg-[#F4F7FB] border border-[#D5DBEC] p-4 space-y-2">
                  <p className="text-xs font-semibold text-[#3F4668]">Rincian gelang dipilih</p>
                  {selectedItems.map(({ category, qty }) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between text-sm font-medium text-[#0E1330]"
                    >
                      <span>
                        {qty}x Gelang {category.name} ({category.defaultGate})
                      </span>
                      <span className="font-mono tabular-nums">
                        Rp {(category.price * qty).toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-[#D5DBEC] flex items-center justify-between font-display font-bold text-base text-[#0E1330]">
                    <span>Total Tagihan ({totalQty} gelang)</span>
                    <span className="tabular-nums">Rp {totalAmount.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#0E1330] mb-1.5">
                      Nama Lengkap Pemesan / Pemegang Gelang *
                    </label>
                    <input
                      type="text"
                      required
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Contoh: Nadia Pratiwi"
                      className="w-full rounded-xl border border-[#D5DBEC] px-3.5 py-2.5 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0E1330] mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full rounded-xl border border-[#D5DBEC] px-3.5 py-2.5 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0E1330] mb-1.5">
                      Nomor WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="0812-xxxx-xxxx"
                      className="w-full rounded-xl border border-[#D5DBEC] px-3.5 py-2.5 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0E1330] mb-2">
                    Pilih Metode Pembayaran
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {LANDING_PAYMENT_METHODS.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setPaymentMethod(pm.id)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          paymentMethod === pm.id
                            ? 'border-[#2B3BFF] bg-[#2B3BFF]/5'
                            : 'border-[#D5DBEC] hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-xs font-bold text-[#0E1330]">{pm.id}</p>
                        <p className="text-[11px] text-[#3F4668] mt-0.5">{pm.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeCheckoutModal}
                    className="rounded-full border border-[#D5DBEC] px-5 py-2.5 text-sm font-medium text-[#3F4668] hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-[#FF5A1F] text-[#0E1330] px-7 py-2.5 text-sm font-semibold hover:bg-[#ff6d38] transition-colors cursor-pointer"
                  >
                    {totalAmount === 0 ? 'Terbitkan Gelang Sekarang' : 'Lanjut Bayar'}
                  </button>
                </div>
              </form>
            )}

            {checkoutStep === 'pay' && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-[#F4F7FB] border border-[#D5DBEC] p-6 flex flex-col sm:flex-row items-center gap-6">
                  <div className="bg-white p-3 rounded-xl border border-[#D5DBEC] shrink-0">
                    <QrCanvas
                      value={`00020101021226580014ID.GELANGPASS.WWW0118936005030000089123520459995303360540${totalAmount}5802ID5910GELANGPASS6007JAKARTA6304`}
                      size={148}
                    />
                  </div>
                  <div className="space-y-2 text-center sm:text-left">
                    <p className="text-xs font-semibold text-[#2B3BFF]">
                      Menunggu Konfirmasi · {paymentMethod}
                    </p>
                    <p className="font-display text-2xl font-bold text-[#0E1330] tabular-nums">
                      Rp {totalAmount.toLocaleString('id-ID')}
                    </p>
                    <p className="text-xs text-[#3F4668] leading-relaxed">
                      Atas nama {buyerName} ({totalQty} gelang). Setelah pembayaran terkonfirmasi, kode QR terenkripsi
                      AES-256-GCM langsung aktif di sistem check-in gerbang.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckoutStep('buyer')}
                    className="rounded-full border border-[#D5DBEC] px-5 py-2.5 text-xs font-semibold text-[#3F4668] hover:bg-slate-50"
                  >
                    Kembali Ubah Data
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={settleAllSelectedItems}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0E1330] text-white px-7 py-3 text-sm font-semibold hover:bg-[#1e2554] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#FF5A1F]" />
                    <span>
                      {submitting ? 'Menerbitkan Gelang...' : 'Konfirmasi Pembayaran & Terbitkan QR'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {checkoutStep === 'done' && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-950 space-y-1">
                    <p className="font-bold text-sm">
                      Pembayaran Berhasil ({issuedInvoices.map((i) => i.invoiceNumber).join(', ')})
                    </p>
                    <p>
                      {issuedAttendees.length} gelang tiket QR terenkripsi telah ditambahkan ke daftar pengunjung
                      aktif dan siap dipindai di pintu masuk.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {issuedAttendees.map((att) => (
                    <div key={att.id} className="space-y-2">
                      {activeDesign && (
                        <WristbandPreview
                          design={activeDesign}
                          event={snapshot.event}
                          attendee={att}
                          compact
                        />
                      )}
                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="font-mono text-[#3F4668]">
                          {att.ticketCode} · {att.tier} · {att.gateAssigned}
                        </span>
                        {activeDesign && (
                          <button
                            type="button"
                            onClick={() => downloadWristbandPng(activeDesign, snapshot.event, att)}
                            className="inline-flex items-center gap-1.5 font-semibold text-[#2B3BFF] hover:underline cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Unduh PNG Gelang</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#D5DBEC]">
                  <button
                    type="button"
                    onClick={() => {
                      closeCheckoutModal();
                      onEnterDashboard('visitors');
                    }}
                    className="text-xs font-semibold text-[#2B3BFF] hover:underline cursor-pointer"
                  >
                    Lihat di Data Pengunjung &rarr;
                  </button>
                  <button
                    type="button"
                    onClick={closeCheckoutModal}
                    className="rounded-full bg-[#0E1330] text-white px-6 py-2.5 text-sm font-semibold hover:bg-[#1e2554]"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
