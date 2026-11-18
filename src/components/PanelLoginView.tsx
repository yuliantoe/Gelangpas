import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  Eye,
  EyeOff,
  Lock,
  Shield,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import type { AppStateSnapshot, EventInfo, PlatformUser, UserRole } from '../types/event.ts';

interface PanelLoginViewProps {
  snapshot: AppStateSnapshot;
  isOnline: boolean;
  onBackToLanding: () => void;
  onLoginSubmit: (input: {
    email: string;
    password: string;
    expectedRole: UserRole;
  }) => Promise<{ user: PlatformUser; recommendedEventId?: string }>;
  onRegisterOrganizer: (input: {
    organizerName: string;
    fullName: string;
    email: string;
    password: string;
    eventTitle: string;
    eventVenue: string;
    eventDateLabel: string;
    capacity?: number;
  }) => Promise<{ user: PlatformUser; event: EventInfo }>;
  onLoginSuccess: (user: PlatformUser, targetEventId?: string) => void;
}

export const PanelLoginView: React.FC<PanelLoginViewProps> = ({
  snapshot,
  isOnline,
  onBackToLanding,
  onLoginSubmit,
  onRegisterOrganizer,
  onLoginSuccess,
}) => {
  const activeUsers = useMemo(
    () => (snapshot.users || []).filter((u) => u.active),
    [snapshot.users]
  );
  const eventsList = useMemo(
    () => (snapshot.events && snapshot.events.length > 0 ? snapshot.events : [snapshot.event]),
    [snapshot.events, snapshot.event]
  );

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [selectedRole, setSelectedRole] = useState<UserRole>('administrator');
  const [eventFilterId, setEventFilterId] = useState<string>('all');

  const roleUsers = useMemo(() => {
    const byRole = activeUsers.filter((u) => u.role === selectedRole);
    if (eventFilterId === 'all') return byRole;
    return byRole.filter(
      (u) => u.isOwner || u.assignedEventIds?.includes('*') || u.assignedEventIds?.includes(eventFilterId)
    );
  }, [activeUsers, selectedRole, eventFilterId]);

  // Login State
  const [email, setEmail] = useState(
    () =>
      activeUsers.find((u) => u.role === 'administrator')?.email ||
      'idmonggo@gmail.com'
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register Organizer State
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventVenue, setEventVenue] = useState('');
  const [eventDateLabel, setEventDateLabel] = useState('');
  const [eventCapacity, setEventCapacity] = useState('1000');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const describeUserEvents = (u: PlatformUser) => {
    if (u.isOwner || u.assignedEventIds?.includes('*')) {
      return 'Semua Event (Pemilik Platform)';
    }
    const names = (u.assignedEventIds || [])
      .map((evId) => eventsList.find((e) => e.id === evId)?.title)
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : snapshot.event.title;
  };

  const handleRoleTab = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg(null);
    const pool = activeUsers.filter((u) => {
      if (u.role !== role) return false;
      if (eventFilterId === 'all') return true;
      return u.isOwner || u.assignedEventIds?.includes('*') || u.assignedEventIds?.includes(eventFilterId);
    });
    const firstMatch = pool[0] || activeUsers.find((u) => u.role === role);
    setEmail(firstMatch ? firstMatch.email : '');
    setPassword('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('Email dan kata sandi wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const { user, recommendedEventId } = await onLoginSubmit({
        email: email.trim(),
        password,
        expectedRole: selectedRole,
      });
      const targetEv =
        eventFilterId !== 'all' &&
        (user.isOwner || user.assignedEventIds?.includes('*') || user.assignedEventIds?.includes(eventFilterId))
          ? eventFilterId
          : recommendedEventId;
      onLoginSuccess(user, targetEv);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke panel penyelenggara.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isOnline) {
      setErrorMsg('Pendaftaran penyelenggara baru memerlukan koneksi internet ke server.');
      return;
    }
    if (
      !orgName.trim() ||
      !adminName.trim() ||
      !regEmail.trim() ||
      !regPassword.trim() ||
      !eventTitle.trim() ||
      !eventVenue.trim() ||
      !eventDateLabel.trim()
    ) {
      setErrorMsg('Lengkapi seluruh data penyelenggara, admin, dan acara awal.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await onRegisterOrganizer({
        organizerName: orgName.trim(),
        fullName: adminName.trim(),
        email: regEmail.trim(),
        password: regPassword.trim(),
        eventTitle: eventTitle.trim(),
        eventVenue: eventVenue.trim(),
        eventDateLabel: eventDateLabel.trim(),
        capacity: Math.max(10, Number(eventCapacity) || 1000),
      });
      onLoginSuccess(res.user, res.event.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mendaftarkan penyelenggara baru.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickFill = (targetUser: PlatformUser) => {
    setEmail(targetUser.email);
    setPassword(targetUser.role === 'administrator' ? 'admin2026' : 'user2026');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#0E1330] flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-[#D5DBEC] bg-white/80 backdrop-blur">
        <div className="max-w-[1184px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <svg width="32" height="32" viewBox="0 0 36 36" aria-hidden="true">
              <rect x="2" y="10" width="32" height="16" rx="8" fill="#FF5A1F" />
              <circle cx="26" cy="18" r="4" fill="#0E1330" />
            </svg>
            <span className="font-display font-bold text-lg tracking-tight text-[#0E1330]">
              GelangPass
            </span>
          </div>

          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3F4668] hover:text-[#0E1330] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Halaman Utama</span>
          </button>
        </div>
      </header>

      {/* Main Centered Login / Organizer Registration Card */}
      <main className="flex-1 flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-xl bg-white border border-[#D5DBEC] rounded-[28px] p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[#2B3BFF]">
                Multi-User Penyelenggara Event
              </span>
              {!isOnline && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                  <WifiOff className="w-3.5 h-3.5" />
                  Mode Offline
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0E1330]">
              {authMode === 'login'
                ? 'Masuk Panel Penyelenggara'
                : 'Daftarkan Penyelenggara & Event'}
            </h1>
            <p className="text-sm text-[#3F4668]">
              {authMode === 'login'
                ? 'Masuk sebagai Administrator atau User sesuai penyelenggara event yang Anda kelola.'
                : 'Buat ruang kerja penyelenggara baru beserta acara pertama dan akun Administrator-nya.'}
            </p>
          </div>

          {/* Auth Mode Switch */}
          <div className="grid grid-cols-2 rounded-2xl bg-[#F4F7FB] p-1 border border-[#D5DBEC]">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                authMode === 'login'
                  ? 'bg-white text-[#0E1330] shadow-xs'
                  : 'text-[#3F4668] hover:text-[#0E1330]'
              }`}
            >
              Masuk Akun Terdaftar
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                authMode === 'register'
                  ? 'bg-white text-[#0E1330] shadow-xs'
                  : 'text-[#3F4668] hover:text-[#0E1330]'
              }`}
            >
              + Daftar Penyelenggara Baru
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          {authMode === 'login' ? (
            <>
              {/* Role Mode Switch */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleRoleTab('administrator')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-colors cursor-pointer ${
                    selectedRole === 'administrator'
                      ? 'border-[#2B3BFF] bg-[#2B3BFF]/5'
                      : 'border-[#D5DBEC] hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[#0E1330]">
                    <Shield
                      className={`w-4 h-4 ${
                        selectedRole === 'administrator' ? 'text-[#2B3BFF]' : 'text-[#3F4668]'
                      }`}
                    />
                    <span className="font-display text-sm font-bold">Administrator</span>
                  </div>
                  <p className="text-[11px] text-[#3F4668] mt-1">
                    Kelola acara, tim penyelenggara, harga &amp; desain gelang
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleTab('user')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-colors cursor-pointer ${
                    selectedRole === 'user'
                      ? 'border-[#2B3BFF] bg-[#2B3BFF]/5'
                      : 'border-[#D5DBEC] hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[#0E1330]">
                    <UserCheck
                      className={`w-4 h-4 ${
                        selectedRole === 'user' ? 'text-[#2B3BFF]' : 'text-[#3F4668]'
                      }`}
                    />
                    <span className="font-display text-sm font-bold">User</span>
                  </div>
                  <p className="text-[11px] text-[#3F4668] mt-1">
                    Petugas check-in gerbang, loket &amp; pantau pengunjung acara
                  </p>
                </button>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-[#0E1330] mb-1.5">
                    Email Akun {selectedRole === 'administrator' ? 'Administrator' : 'User'}
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      selectedRole === 'administrator'
                        ? 'idmonggo@gmail.com'
                        : 'fauzan.gate@gelangpass.id'
                    }
                    className="w-full rounded-xl border border-[#D5DBEC] bg-white px-3.5 py-2.5 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-xs font-semibold text-[#0E1330] mb-1.5">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        selectedRole === 'administrator'
                          ? 'Masukkan kata sandi Administrator (default: admin2026)'
                          : 'Masukkan kata sandi User (default: user2026)'
                      }
                      className="w-full rounded-xl border border-[#D5DBEC] bg-white pl-3.5 pr-10 py-2.5 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3F4668] hover:text-[#0E1330]"
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#3F4668] mt-1.5">
                    Kata sandi bawaan akun contoh:{' '}
                    <code className="font-mono font-semibold text-[#0E1330]">
                      {selectedRole === 'administrator' ? 'admin2026' : 'user2026'}
                    </code>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0E1330] text-white py-3 text-sm font-semibold hover:bg-[#1e2554] disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <Lock className="w-4 h-4 text-[#FF5A1F]" />
                  <span>
                    {submitting
                      ? 'Memverifikasi Akun...'
                      : `Masuk sebagai ${selectedRole === 'administrator' ? 'Administrator' : 'User'}`}
                  </span>
                </button>
              </form>

              {/* Registered Quick-Fill Accounts Scoped by Event Organizer */}
              {activeUsers.some((u) => u.role === selectedRole) && (
                <div className="pt-4 border-t border-[#D5DBEC] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-[#3F4668]">
                      Akun {selectedRole === 'administrator' ? 'Administrator' : 'User'} terdaftar:
                    </p>
                    {eventsList.length > 1 && (
                      <select
                        aria-label="Filter akun berdasarkan acara"
                        value={eventFilterId}
                        onChange={(e) => setEventFilterId(e.target.value)}
                        className="rounded-lg border border-[#D5DBEC] bg-[#F4F7FB] px-2.5 py-1 text-[11px] font-medium text-[#0E1330]"
                      >
                        <option value="all">Semua Acara ({eventsList.length})</option>
                        {eventsList.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {roleUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleQuickFill(u)}
                        className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#D5DBEC] bg-[#F4F7FB]/70 px-3 py-2 text-left text-xs hover:border-[#2B3BFF] hover:bg-[#2B3BFF]/5 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0E1330] truncate">{u.fullName}</p>
                          <p className="text-[11px] text-[#3F4668] truncate">
                            {u.email} · {u.organizationName}
                          </p>
                          <p className="text-[10px] text-[#2B3BFF] font-medium truncate mt-0.5">
                            {describeUserEvents(u)}
                          </p>
                        </div>
                        <span className="text-[11px] font-medium text-[#3F4668] shrink-0">
                          {u.assignedGate}
                        </span>
                      </button>
                    ))}
                    {roleUsers.length === 0 && (
                      <p className="text-xs text-[#3F4668] py-2">
                        Belum ada akun {selectedRole === 'administrator' ? 'Administrator' : 'User'} pada acara ini.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0E1330] mb-1">
                    Nama Penyelenggara / Organisasi *
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-[#3F4668] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Contoh: Panitia SMAN 1 / PT Expo"
                      className="w-full rounded-xl border border-[#D5DBEC] pl-9 pr-3 py-2 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0E1330] mb-1">
                    Nama Lengkap Admin *
                  </label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Contoh: Andi Wijaya"
                    className="w-full rounded-xl border border-[#D5DBEC] px-3 py-2 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0E1330] mb-1">
                    Email Login Admin *
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="admin@penyelenggara.id"
                    className="w-full rounded-xl border border-[#D5DBEC] px-3 py-2 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0E1330] mb-1">
                    Kata Sandi Login *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimal 4 karakter"
                    className="w-full rounded-xl border border-[#D5DBEC] px-3 py-2 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[#D5DBEC] space-y-3">
                <p className="text-xs font-semibold text-[#2B3BFF]">
                  Detail Acara / Event Pertama
                </p>
                <div>
                  <label className="block text-xs font-semibold text-[#0E1330] mb-1">
                    Nama Acara / Event *
                  </label>
                  <input
                    type="text"
                    required
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Contoh: Pensi Harmoni Kampus 2026"
                    className="w-full rounded-xl border border-[#D5DBEC] px-3 py-2 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#0E1330] mb-1">
                      Lokasi / Venue *
                    </label>
                    <input
                      type="text"
                      required
                      value={eventVenue}
                      onChange={(e) => setEventVenue(e.target.value)}
                      placeholder="Contoh: Hall Basket Senayan"
                      className="w-full rounded-xl border border-[#D5DBEC] px-3 py-2 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0E1330] mb-1">
                      Kapasitas
                    </label>
                    <input
                      type="number"
                      min={10}
                      value={eventCapacity}
                      onChange={(e) => setEventCapacity(e.target.value)}
                      className="w-full rounded-xl border border-[#D5DBEC] px-3 py-2 text-sm font-mono text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0E1330] mb-1">
                    Tanggal Pelaksanaan *
                  </label>
                  <input
                    type="text"
                    required
                    value={eventDateLabel}
                    onChange={(e) => setEventDateLabel(e.target.value)}
                    placeholder="Contoh: 12 Desember 2026"
                    className="w-full rounded-xl border border-[#D5DBEC] px-3 py-2 text-sm text-[#0E1330] focus:outline-none focus:ring-2 focus:ring-[#2B3BFF]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#FF5A1F] text-[#0E1330] py-3 text-sm font-semibold hover:bg-[#ff6d38] disabled:opacity-60 transition-colors cursor-pointer mt-2"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Membuat Ruang Kerja Penyelenggara...'
                    : 'Buat Akun Penyelenggara & Masuk Panel'}
                </span>
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};
