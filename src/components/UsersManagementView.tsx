import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Check,
  Lock,
  Radio,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type { AppStateSnapshot, PlatformUser, UserRole } from '../types/event.ts';

interface UsersManagementViewProps {
  snapshot: AppStateSnapshot;
  currentUser: PlatformUser;
  onSelectActiveUser: (userId: string) => void;
  onAddUser: (input: {
    fullName: string;
    email: string;
    role: UserRole;
    assignedGate: string;
    password?: string;
    organizationName?: string;
    assignedEventIds?: string[];
  }) => Promise<unknown>;
  onUpdateUser: (id: string, patch: Partial<PlatformUser> & { password?: string }) => Promise<unknown>;
  onDeleteUser: (id: string) => Promise<unknown>;
}

export const UsersManagementView: React.FC<UsersManagementViewProps> = ({
  snapshot,
  currentUser,
  onSelectActiveUser,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  const eventsList = useMemo(
    () => (snapshot.events && snapshot.events.length > 0 ? snapshot.events : [snapshot.event]),
    [snapshot.events, snapshot.event]
  );

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState(
    () => snapshot.event.organizerName || currentUser.organizationName || ''
  );
  const [role, setRole] = useState<UserRole>('user');
  const [assignedGate, setAssignedGate] = useState(snapshot.event.gates[0] || 'Gerbang Utama A');
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([snapshot.event.id]);
  const [filterEventId, setFilterEventId] = useState<string>('all');
  const [editingEventsUserId, setEditingEventsUserId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isAdmin = currentUser.role === 'administrator';
  const canGrantAllEvents = Boolean(currentUser.isOwner || currentUser.assignedEventIds?.includes('*'));

  const onlineUserIds = useMemo(
    () => new Set((snapshot.onlineSessions || []).map((s) => s.userId)),
    [snapshot.onlineSessions]
  );

  const filteredUsers = useMemo(() => {
    if (filterEventId === 'all') return snapshot.users;
    return snapshot.users.filter(
      (u) =>
        u.isOwner ||
        u.assignedEventIds?.includes('*') ||
        u.assignedEventIds?.includes(filterEventId)
    );
  }, [snapshot.users, filterEventId]);

  const adminCount = filteredUsers.filter((u) => u.role === 'administrator' && u.active).length;
  const userCount = filteredUsers.filter((u) => u.role === 'user' && u.active).length;
  const activeEventSessions = snapshot.onlineSessions || [];

  const toggleFormEvent = (evId: string) => {
    if (evId === '*') {
      setSelectedEventIds((prev) =>
        prev.includes('*') ? [snapshot.event.id] : ['*']
      );
      return;
    }
    setSelectedEventIds((prev) => {
      const withoutWildcard = prev.filter((id) => id !== '*');
      if (withoutWildcard.includes(evId)) {
        const next = withoutWildcard.filter((id) => id !== evId);
        return next.length > 0 ? next : [snapshot.event.id];
      }
      return [...withoutWildcard, evId];
    });
  };

  const toggleExistingUserEvent = async (targetUser: PlatformUser, evId: string) => {
    if (!isAdmin || targetUser.isOwner) return;
    setErrorMsg(null);
    let nextIds: string[];
    if (evId === '*') {
      nextIds = targetUser.assignedEventIds?.includes('*') ? [snapshot.event.id] : ['*'];
    } else {
      const base = (targetUser.assignedEventIds || []).filter((id) => id !== '*');
      if (base.includes(evId)) {
        const filtered = base.filter((id) => id !== evId);
        if (filtered.length === 0) {
          setErrorMsg('Setiap pengguna minimal harus terhubung ke 1 event.');
          return;
        }
        nextIds = filtered;
      } else {
        nextIds = [...base, evId];
      }
    }
    try {
      await onUpdateUser(targetUser.id, { assignedEventIds: nextIds });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui event pengguna.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isAdmin) {
      setErrorMsg('Hanya Administrator penyelenggara yang dapat menambahkan pengguna baru.');
      return;
    }
    const effectiveEvents =
      selectedEventIds.length > 0 ? selectedEventIds : [snapshot.event.id];

    setSubmitting(true);
    try {
      await onAddUser({
        fullName: fullName.trim(),
        email: email.trim(),
        role,
        assignedGate,
        password: password.trim() || undefined,
        organizationName:
          organizationName.trim() ||
          snapshot.event.organizerName ||
          currentUser.organizationName,
        assignedEventIds: effectiveEvents,
      });
      setFullName('');
      setEmail('');
      setPassword('');
      setSuccessMsg(
        `Pengguna berhasil ditambahkan sebagai ${role === 'administrator' ? 'Administrator' : 'User'} untuk penyelenggara ${organizationName.trim() || snapshot.event.organizerName}.`
      );
      window.setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah pengguna.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: UserRole) => {
    setErrorMsg(null);
    try {
      await onUpdateUser(userId, { role: nextRole });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah peran.');
    }
  };

  const handleToggleActive = async (user: PlatformUser) => {
    setErrorMsg(null);
    try {
      await onUpdateUser(user.id, { active: !user.active });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status aktif.');
    }
  };

  const handleDelete = async (userId: string) => {
    setErrorMsg(null);
    try {
      await onDeleteUser(userId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus pengguna.');
    }
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 flex items-center justify-between gap-4 text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Anda masuk sebagai <strong>User ({currentUser.fullName})</strong>. Hanya Administrator penyelenggara yang dapat menambah atau mengubah anggota tim.
            </span>
          </div>
        </div>
      )}

      {/* Organizer Scope & Live Presence Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Penyelenggara Event Aktif</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <p className="font-display text-base font-bold text-slate-900 truncate mt-2">
            {snapshot.event.organizerName}
          </p>
          <p className="text-xs text-slate-500 truncate mt-1">
            {snapshot.event.title}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tim dalam Ruang Lingkup</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {filteredUsers.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {adminCount} Admin · {userCount} User Gerbang/Loket
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Administrator Aktif</span>
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {adminCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Kelola acara, harga, desain &amp; multi-user tim
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Terhubung Online di Event Ini</span>
            <Radio className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {activeEventSessions.length}
          </p>
          <p className="text-xs text-slate-500 truncate mt-1">
            {activeEventSessions.length > 0
              ? activeEventSessions.map((s) => s.fullName.split(' ')[0]).join(', ')
              : 'Menunggu sesi aktif lain'}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs text-emerald-800">
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Add User Form Scoped to Organizer Event */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Tambah Tim Penyelenggara
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Buat akun Admin atau Petugas khusus untuk event pilihan
              </p>
            </div>
            <UserPlus className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nama Lengkap *
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Contoh: Bagus Setiawan"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Email Akses *
              </label>
              <input
                type="email"
                required
                disabled={!isAdmin}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@penyelenggara.id"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nama Penyelenggara / Organisasi
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Contoh: Soundscape Live Indonesia"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Kata Sandi Login (Opsional)
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={role === 'administrator' ? 'Default: admin2026' : 'Default: user2026'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Peran Akses (Role)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => {
                    setRole('administrator');
                    setAssignedGate('Semua Gerbang');
                  }}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    role === 'administrator'
                      ? 'border-blue-600 bg-blue-50/70'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900">Administrator</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Kelola event &amp; tim
                  </p>
                </button>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => {
                    setRole('user');
                    setAssignedGate(snapshot.event.gates[0] || 'Gerbang Utama A');
                  }}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    role === 'user'
                      ? 'border-blue-600 bg-blue-50/70'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900">User</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Check-in &amp; loket
                  </p>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Event / Acara yang Diikuti *
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 space-y-1.5 max-h-40 overflow-y-auto">
                {canGrantAllEvents && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-blue-700 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={selectedEventIds.includes('*')}
                      onChange={() => toggleFormEvent('*')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Semua Event (Super Admin Platform)</span>
                  </label>
                )}
                {eventsList.map((ev) => {
                  const checked =
                    selectedEventIds.includes('*') || selectedEventIds.includes(ev.id);
                  return (
                    <label
                      key={ev.id}
                      className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer py-0.5"
                    >
                      <input
                        type="checkbox"
                        disabled={!isAdmin || selectedEventIds.includes('*')}
                        checked={checked}
                        onChange={() => toggleFormEvent(ev.id)}
                        className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900 block truncate">
                          {ev.title}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate">
                          Penyelenggara: {ev.organizerName}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Penempatan Gerbang
              </label>
              <select
                disabled={!isAdmin}
                value={assignedGate}
                onChange={(e) => setAssignedGate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white disabled:bg-slate-50"
              >
                <option value="Semua Gerbang">Semua Gerbang</option>
                {snapshot.event.gates.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!isAdmin || submitting}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Menambahkan...'
                  : `Tambah sebagai ${role === 'administrator' ? 'Administrator' : 'User'}`}
              </span>
            </button>
          </form>
        </div>

        {/* Right: Organizer-Scoped User Directory */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Daftar Multi-User Penyelenggara ({filteredUsers.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Atur penugasan event, peran, dan gerbang tugas tiap anggota tim penyelenggara
              </p>
            </div>

            {eventsList.length > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                <select
                  aria-label="Filter tim menurut acara"
                  value={filterEventId}
                  onChange={(e) => setFilterEventId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                >
                  <option value="all">Semua Event yang Dikelola</option>
                  {eventsList.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-5">Pengguna &amp; Penyelenggara</th>
                  <th className="py-3 px-3">Event yang Dikelola</th>
                  <th className="py-3 px-3">Peran</th>
                  <th className="py-3 px-3">Gerbang</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser.id;
                  const isUserOnline = onlineUserIds.has(u.id);
                  const isAllScope = Boolean(u.isOwner || u.assignedEventIds?.includes('*'));
                  const assignedTitles = isAllScope
                    ? ['Semua Event']
                    : (u.assignedEventIds || [])
                        .map((evId) => eventsList.find((e) => e.id === evId)?.title || evId);
                  const isEditingEvents = editingEventsUserId === u.id;

                  return (
                    <React.Fragment key={u.id}>
                      <tr className={isCurrent ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'}>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900">{u.fullName}</p>
                            {isUserOnline && (
                              <span
                                className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                                title="Sedang online di event ini"
                              />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{u.email}</p>
                          <p className="text-[10px] font-medium text-blue-700 mt-0.5">
                            {u.organizationName}
                            {isCurrent && ' · (Sesi Anda)'}
                          </p>
                        </td>

                        <td className="py-3 px-3 max-w-[200px]">
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium text-slate-800 truncate">
                              {assignedTitles.join(', ')}
                            </p>
                            {isAdmin && !u.isOwner && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingEventsUserId(isEditingEvents ? null : u.id)
                                }
                                className="text-[11px] font-semibold text-blue-600 hover:underline"
                              >
                                {isEditingEvents ? 'Tutup Akses Event' : 'Ubah Event'}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <select
                            disabled={!isAdmin || Boolean(u.isOwner)}
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 disabled:bg-slate-50 disabled:text-slate-600"
                          >
                            <option value="administrator">Administrator</option>
                            <option value="user">User</option>
                          </select>
                        </td>

                        <td className="py-3 px-3">
                          <select
                            disabled={!isAdmin}
                            value={u.assignedGate}
                            onChange={(e) =>
                              onUpdateUser(u.id, { assignedGate: e.target.value })
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 disabled:bg-slate-50"
                          >
                            <option value="Semua Gerbang">Semua Gerbang</option>
                            {snapshot.event.gates.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!isAdmin || Boolean(u.isOwner)}
                            onClick={() => handleToggleActive(u)}
                            className={`text-xs font-semibold ${
                              u.active ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {u.active ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </td>

                        <td className="py-3 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!u.active || isCurrent}
                              onClick={() => onSelectActiveUser(u.id)}
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                            >
                              {isCurrent ? 'Aktif' : 'Pakai Sesi'}
                            </button>
                            <button
                              type="button"
                              disabled={!isAdmin || isCurrent || Boolean(u.isOwner)}
                              onClick={() => handleDelete(u.id)}
                              title={
                                u.isOwner
                                  ? 'Pemilik Utama Platform tidak dapat dihapus'
                                  : 'Hapus pengguna'
                              }
                              className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isEditingEvents && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="px-5 py-3 border-t border-slate-200">
                            <div className="flex flex-wrap items-center gap-4 text-xs">
                              <span className="font-semibold text-slate-700">
                                Pilih Event untuk {u.fullName}:
                              </span>
                              {canGrantAllEvents && (
                                <label className="inline-flex items-center gap-1.5 font-semibold text-blue-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(u.assignedEventIds?.includes('*'))}
                                    onChange={() => void toggleExistingUserEvent(u, '*')}
                                    className="rounded border-slate-300 text-blue-600"
                                  />
                                  <span>Semua Event</span>
                                </label>
                              )}
                              {eventsList.map((ev) => {
                                const hasEv =
                                  Boolean(u.assignedEventIds?.includes('*')) ||
                                  Boolean(u.assignedEventIds?.includes(ev.id));
                                return (
                                  <label
                                    key={ev.id}
                                    className="inline-flex items-center gap-1.5 text-slate-800 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={Boolean(u.assignedEventIds?.includes('*'))}
                                      checked={hasEv}
                                      onChange={() => void toggleExistingUserEvent(u, ev.id)}
                                      className="rounded border-slate-300 text-blue-600"
                                    />
                                    <span>{ev.title}</span>
                                  </label>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() => setEditingEventsUserId(null)}
                                className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                              >
                                <Check className="w-3 h-3" />
                                <span>Selesai</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Belum ada pengguna yang ditugaskan pada event ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
