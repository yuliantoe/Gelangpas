import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarPlus,
  Check,
  CreditCard,
  FileSpreadsheet,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  QrCode,
  RefreshCw,
  Shield,
  Tag,
  UserCog,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { CategoryPriceView } from './components/CategoryPriceView.tsx';
import { CheckInTerminalView } from './components/CheckInTerminalView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { EventManagementView } from './components/EventManagementView.tsx';
import { LandingPageView } from './components/LandingPageView.tsx';
import { PanelLoginView } from './components/PanelLoginView.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { SecurityOfflineView } from './components/SecurityOfflineView.tsx';
import { TicketingPaymentView } from './components/TicketingPaymentView.tsx';
import { UsersManagementView } from './components/UsersManagementView.tsx';
import { VisitorsView } from './components/VisitorsView.tsx';
import { WristbandDesignerView } from './components/WristbandDesignerView.tsx';
import { useEventSync } from './hooks/useEventSync.ts';
import { getAccessTier, getAccessTierLabel, getRoleCapabilities } from './lib/permissions.ts';
import type { PlatformUser } from './types/event.ts';

type ActiveTab =
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

const AUTH_STORAGE_KEY = 'gelangpass_auth_user_id';
const EVENT_STORAGE_KEY = 'gelangpass_active_event_id';

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dasbor Analitik', icon: LayoutDashboard },
  { id: 'events', label: 'Acara & Event', icon: CalendarPlus },
  { id: 'checkin', label: 'Terminal Check-In', icon: QrCode },
  { id: 'designer', label: 'Desainer Gelang QR', icon: Palette },
  { id: 'ticketing', label: 'Pembayaran & Loket', icon: CreditCard },
  { id: 'categories', label: 'Kategori & Harga', icon: Tag },
  { id: 'visitors', label: 'Data Pengunjung', icon: Users },
  { id: 'reports', label: 'Laporan Kehadiran', icon: FileSpreadsheet },
  { id: 'users', label: 'Pengguna & Tim', icon: UserCog },
  { id: 'security', label: 'Enkripsi & Offline', icon: Shield },
];

function canAccessTab(tab: ActiveTab, caps: ReturnType<typeof getRoleCapabilities>): boolean {
  switch (tab) {
    case 'dashboard':
    case 'checkin':
    case 'visitors':
    case 'reports':
      return true;
    case 'events':
    case 'designer':
    case 'security':
      return caps.canManageSystemLimited;
    case 'ticketing':
    case 'categories':
      return caps.canManageAttendeesAndCategories;
    case 'users':
      return caps.canManageGateStaff;
  }
}

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [pendingTab, setPendingTab] = useState<ActiveTab | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(AUTH_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [preferredEventId, setPreferredEventId] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(EVENT_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const {
    snapshot,
    loading,
    browserOnline,
    simulatedOffline,
    setSimulatedOffline,
    isOnline,
    wsConnected,
    pollingActive,
    pendingCount,
    pendingCheckIns,
    pendingOrders,
    syncing,
    liveToast,
    dismissToast,
    syncNow,
    performCheckIn,
    checkoutTicket,
    batchCreateAttendees,
    toggleAttendeeRevoked,
    reissueAttendee,
    saveDesign,
    createEvent,
    activateEvent,
    deleteEvent,
    updateEventInfo,
    updateEventCategories,
    loginUser,
    registerOrganizer,
    addUser,
    updateUser,
    deleteUser,
    rotateEncryptionKey,
    markNotificationRead,
    updateNotificationRules,
  } = useEventSync({
    userId: authenticatedUserId || undefined,
    eventId: preferredEventId || undefined,
  });

  if (loading || !snapshot) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const usersList = snapshot.users || [];
  const activeUsers = usersList.filter((u) => u.active);
  const authenticatedUser: PlatformUser | null = authenticatedUserId
    ? activeUsers.find((u) => u.id === authenticatedUserId) || null
    : null;

  const setSessionUser = (userId: string) => {
    setAuthenticatedUserId(userId);
    try {
      if (userId) window.sessionStorage.setItem(AUTH_STORAGE_KEY, userId);
      else window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
  };

  const setSessionEvent = (eventId: string) => {
    setPreferredEventId(eventId);
    try {
      if (eventId) window.sessionStorage.setItem(EVENT_STORAGE_KEY, eventId);
      else window.sessionStorage.removeItem(EVENT_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
  };

  const handleLogout = () => {
    setSessionUser('');
    setSessionEvent('');
    setMobileMenuOpen(false);
    setNotifDrawerOpen(false);
    setPendingTab(null);
  };

  const handleActivateScopedEvent = async (eventId: string) => {
    setSessionEvent(eventId);
    return activateEvent(eventId);
  };

  if (showLanding) {
    return (
      <LandingPageView
        snapshot={snapshot}
        isOnline={isOnline}
        onSelectEvent={handleActivateScopedEvent}
        onEnterDashboard={(tab) => {
          const requestedTab = tab || 'dashboard';
          if (authenticatedUser) {
            const userCaps = getRoleCapabilities(getAccessTier(authenticatedUser));
            setActiveTab(canAccessTab(requestedTab, userCaps) ? requestedTab : 'checkin');
          } else {
            setPendingTab(requestedTab);
          }
          setShowLanding(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onCheckout={checkoutTicket}
      />
    );
  }

  if (!authenticatedUser) {
    return (
      <PanelLoginView
        snapshot={snapshot}
        isOnline={isOnline}
        onBackToLanding={() => {
          setPendingTab(null);
          setShowLanding(true);
        }}
        onLoginSubmit={loginUser}
        onRegisterOrganizer={registerOrganizer}
        onLoginSuccess={(user, targetEventId) => {
          setSessionUser(user.id);
          if (targetEventId) {
            setSessionEvent(targetEventId);
          } else if (!user.isOwner && !user.assignedEventIds?.includes('*') && user.assignedEventIds?.[0]) {
            setSessionEvent(user.assignedEventIds[0]);
          }
          const userTier = getAccessTier(user);
          const userCaps = getRoleCapabilities(userTier);
          const candidate = pendingTab || (userTier !== 'gate' ? 'dashboard' : 'checkin');
          setActiveTab(canAccessTab(candidate, userCaps) ? candidate : 'checkin');
          setPendingTab(null);
        }}
      />
    );
  }

  const currentUser = authenticatedUser;
  const accessTier = getAccessTier(currentUser);
  const caps = getRoleCapabilities(accessTier);
  const accessTierLabel = getAccessTierLabel(accessTier);
  const visibleNavItems = NAV_ITEMS.filter((item) => canAccessTab(item.id, caps));
  const effectiveActiveTab =
    visibleNavItems.some((item) => item.id === activeTab) ? activeTab : visibleNavItems[0].id;

  const unreadCount = snapshot.notifications.filter((n) => !n.read).length;
  const activeItem = visibleNavItems.find((i) => i.id === effectiveActiveTab) || visibleNavItems[0];

  const handleNavClick = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 no-print">
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
          <button
            type="button"
            onClick={() => setShowLanding(true)}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-blue-700 transition-colors cursor-pointer"
            title="Kembali ke Halaman Utama"
          >
            GelangPass
          </button>
          <button
            type="button"
            onClick={() => setShowLanding(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            title="Lihat Halaman Utama"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Beranda</span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = effectiveActiveTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <PWAInstallButton />
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500">Akun Login</span>
              <span
                className={`font-semibold ${
                  accessTier === 'super-admin'
                    ? 'text-indigo-700'
                    : accessTier === 'admin'
                      ? 'text-blue-700'
                      : 'text-emerald-700'
                }`}
              >
                {accessTierLabel}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">{currentUser.fullName}</p>
              <p className="text-[11px] font-medium text-blue-700 truncate">
                {currentUser.organizationName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{currentUser.assignedGate}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar / Ganti Akun</span>
            </button>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
            {snapshot.events && snapshot.events.length > 1 ? (
              <select
                aria-label="Pilih acara aktif"
                value={snapshot.event.id}
                onChange={(e) => {
                  handleActivateScopedEvent(e.target.value).catch(() => {});
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
              >
                {snapshot.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-semibold text-slate-900 truncate">
                {snapshot.event.title}
              </p>
            )}
            <p className="text-[11px] text-slate-500 truncate">
              {snapshot.event.organizerName} · {snapshot.event.venue}
            </p>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-mono tabular-nums">
                {snapshot.attendees.filter((a) => a.checkedIn).length} / {snapshot.attendees.length} hadir
                {(snapshot.onlineSessions?.length || 0) > 0 && (
                  <span className="text-emerald-700 font-semibold">
                    {' '}· {snapshot.onlineSessions!.length} tim online
                  </span>
                )}
              </span>
              {caps.canManageSystemFull && (
                <button
                  type="button"
                  onClick={() => handleNavClick('events')}
                  className="font-semibold text-blue-600 hover:text-blue-700"
                >
                  + Acara
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">
                GelangPass
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = effectiveActiveTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-3">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 truncate">{currentUser.fullName}</span>
                  <span
                    className={`text-[11px] font-semibold ${
                      accessTier === 'super-admin'
                        ? 'text-indigo-700'
                        : accessTier === 'admin'
                          ? 'text-blue-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    {accessTierLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar / Ganti Akun</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowLanding(true);
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Lihat Halaman Utama</span>
              </button>
              <PWAInstallButton />
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                {snapshot.event.title}
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {activeItem.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Real Connectivity & Offline Sync Indicator */}
            <button
              type="button"
              onClick={() => {
                if (caps.canManageSystemLimited) setActiveTab('security');
              }}
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isOnline
                  ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
              title={caps.canManageSystemLimited ? 'Kelola mode offline & enkripsi' : 'Status sinkronisasi jaringan'}
            >
              {isOnline ? (
                <Wifi
                  className={`w-3.5 h-3.5 ${
                    wsConnected || pollingActive ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span>
                {isOnline
                  ? wsConnected
                    ? 'Sinkronisasi Real-Time'
                    : pollingActive
                      ? 'Sinkronisasi Cloud'
                      : 'Menghubungkan...'
                  : 'Mode Offline Aktif'}
              </span>
              {pendingCount > 0 && (
                <span className="font-mono font-bold text-amber-700 tabular-nums">
                  ({pendingCount})
                </span>
              )}
            </button>

            {/* Organizer Automated Notifications Bell */}
            <button
              type="button"
              onClick={() => setNotifDrawerOpen(true)}
              className="relative p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
              aria-label="Notifikasi penyelenggara"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-[10px] font-mono font-bold text-white flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Primary CTA */}
            {caps.canManageAttendeesAndCategories && (
              <button
                type="button"
                onClick={() => setActiveTab('ticketing')}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                + Jual Tiket
              </button>
            )}
          </div>
        </header>

        {/* Offline / Sync Banner */}
        {(!isOnline || pendingCount > 0) && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 no-print">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                {!isOnline
                  ? 'Koneksi terputus — Terminal gerbang berjalan dalam Mode Offline menggunakan cache IndexedDB & dekripsi lokal AES-256-GCM.'
                  : `${pendingCount} data offline siap disinkronkan ke server pusat.`}
              </span>
            </div>
            {isOnline && pendingCount > 0 && (
              <button
                type="button"
                disabled={syncing}
                onClick={() => syncNow()}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
              </button>
            )}
          </div>
        )}

        {/* Active Page Viewport */}
        <main key={snapshot.event.id} className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
          {effectiveActiveTab === 'dashboard' && (
            <DashboardView
              snapshot={snapshot}
              accessTier={accessTier}
              assignedGate={currentUser.assignedGate}
              onNavigate={handleNavClick}
            />
          )}
          {effectiveActiveTab === 'events' && (
            <EventManagementView
              snapshot={snapshot}
              currentRole={currentUser.role}
              accessTier={accessTier}
              currentOrganizationName={currentUser.organizationName}
              onCreateEvent={async (input) => {
                const res = await createEvent(input);
                if (res.event && input.activateImmediately !== false) {
                  setSessionEvent(res.event.id);
                }
                return res;
              }}
              onUpdateEvent={updateEventInfo}
              onActivateEvent={handleActivateScopedEvent}
              onDeleteEvent={deleteEvent}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenLandingPage={() => {
                setShowLanding(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
          {effectiveActiveTab === 'checkin' && (
            <CheckInTerminalView
              snapshot={snapshot}
              isOnline={isOnline}
              pendingCount={pendingCount}
              syncing={syncing}
              defaultGate={currentUser.assignedGate}
              accessTier={accessTier}
              onSyncNow={syncNow}
              onCheckIn={performCheckIn}
            />
          )}
          {effectiveActiveTab === 'designer' && (
            <WristbandDesignerView snapshot={snapshot} onSaveDesign={saveDesign} />
          )}
          {effectiveActiveTab === 'ticketing' && (
            <TicketingPaymentView
              snapshot={snapshot}
              isOnline={isOnline}
              canEditCategories={caps.canManageAttendeesAndCategories}
              onEditCategories={() => setActiveTab('categories')}
              onCheckout={checkoutTicket}
            />
          )}
          {effectiveActiveTab === 'categories' && (
            <CategoryPriceView
              snapshot={snapshot}
              currentRole={currentUser.role}
              onSaveCategories={updateEventCategories}
            />
          )}
          {effectiveActiveTab === 'visitors' && (
            <VisitorsView
              snapshot={snapshot}
              accessTier={accessTier}
              assignedGate={currentUser.assignedGate}
              onCheckIn={performCheckIn}
              onToggleRevoked={toggleAttendeeRevoked}
              onReissueWristband={reissueAttendee}
              onBatchCreate={batchCreateAttendees}
            />
          )}
          {effectiveActiveTab === 'reports' && (
            <ReportsView
              snapshot={snapshot}
              accessTier={accessTier}
              assignedGate={currentUser.assignedGate}
            />
          )}
          {effectiveActiveTab === 'users' && (
            <UsersManagementView
              snapshot={{ ...snapshot, users: usersList }}
              currentUser={currentUser}
              onSelectActiveUser={(uid) => setSessionUser(uid)}
              onAddUser={addUser}
              onUpdateUser={updateUser}
              onDeleteUser={deleteUser}
            />
          )}
          {effectiveActiveTab === 'security' && (
            <SecurityOfflineView
              snapshot={snapshot}
              currentUserId={currentUser.id}
              currentRole={currentUser.role}
              accessTier={accessTier}
              browserOnline={browserOnline}
              simulatedOffline={simulatedOffline}
              setSimulatedOffline={setSimulatedOffline}
              pendingCheckIns={pendingCheckIns}
              pendingOrders={pendingOrders}
              syncing={syncing}
              onSyncNow={syncNow}
              onRotateKey={rotateEncryptionKey}
              onUpdateNotificationRules={updateNotificationRules}
            />
          )}
        </main>
      </div>

      {/* Live Automated Organizer Notification Toast */}
      {liveToast && (
        <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm bg-slate-900 text-white rounded-xl border border-slate-700 p-4 shadow-xl no-print">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <BarChart3 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-white">{liveToast.title}</p>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{liveToast.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              className="text-slate-400 hover:text-white p-0.5"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Organizer Notifications Slide-Over Drawer */}
      {notifDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end no-print">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setNotifDrawerOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Notifikasi Otomatis Penyelenggara
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {unreadCount} peringatan belum dibaca
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markNotificationRead()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Tandai Semua</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotifDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {snapshot.notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => !notif.read && markNotificationRead(notif.id)}
                  className={`p-4 cursor-pointer transition-colors ${
                    notif.read ? 'bg-white' : 'bg-blue-50/50 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        notif.severity === 'critical'
                          ? 'text-red-700'
                          : notif.severity === 'warning'
                          ? 'text-amber-700'
                          : notif.severity === 'success'
                          ? 'text-emerald-700'
                          : 'text-blue-700'
                      }`}
                    >
                      {notif.title}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                      {new Date(notif.timestamp).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{notif.message}</p>
                </div>
              ))}
              {snapshot.notifications.length === 0 && (
                <div className="p-10 text-center text-xs text-slate-500">
                  Belum ada notifikasi otomatis.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
