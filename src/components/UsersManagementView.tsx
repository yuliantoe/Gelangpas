import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Check,
  Crown,
  Lock,
  Radio,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  PERMISSION_MATRIX,
  getAccessTier,
  getAccessTierLabel,
  getRoleCapabilities,
} from '../lib/permissions.ts';
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

  const actorTier = getAccessTier(currentUser);
  const caps = getRoleCapabilities(actorTier);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState(
    () => snapshot.event.organizerName || currentUser.organizationName || ''
  );
  const [formRole, setFormRole] = useState<UserRole>('user');
  const [assignedGate, setAssignedGate] = useState(snapshot.event.gates[0] || 'Gerbang Utama A');
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([snapshot.event.id]);
  const [filterEventId, setFilterEventId] = useState<string>('all');
  const [editingEventsUserId, setEditingEventsUserId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  const superAdminCount = filteredUsers.filter(
    (u) => getAccessTier(u) === 'super-admin' && u.active
  ).length;
  const adminCount = filteredUsers.filter(
    (u) => getAccessTier(u) === 'admin' && u.active
  ).length;
  const gateCount = filteredUsers.filter(
    (u) => getAccessTier(u) === 'gate' && u.active
  ).length;
  const activeEventSessions = snapshot.onlineSessions || [];

  const canModifyTargetUser = (target: PlatformUser) => {
    if (!caps.canManageGateStaff) return false;
    if (target.isOwner) return false;
    const targetTier = getAccessTier(target);
    if (targetTier !== 'gate') {
      return caps.canManageAdminsAndAccess;
    }
    return true;
  };

  const toggleFormEvent = (evId: string) => {
    if (evId === '*') {
      if (!caps.canManageAdminsAndAccess) return;
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
    if (!canModifyTargetUser(targetUser)) return;
    setErrorMsg(null);
    let nextIds: string[];
    if (evId === '*') {
      if (!caps.canManageAdminsAndAccess) return;
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
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui akses event pengguna.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!caps.canManageGateStaff) {
      setErrorMsg('Sistem Cek (Gate) tidak memiliki izin menambahkan akun tim.');
      return;
    }

    const effectiveRole: UserRole =
      caps.canManageAdminsAndAccess && formRole === 'administrator' ? 'administrator' : 'user';
    const effectiveEvents =
      selectedEventIds.length > 0 ? selectedEventIds : [snapshot.event.id];

    setSubmitting(true);
    try {
      await onAddUser({
        fullName: fullName.trim(),
        email: email.trim(),
        role: effectiveRole,
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
      setFormRole('user');
      setSuccessMsg(
        `Akun ${
          effectiveRole === 'administrator'
            ? effectiveEvents.includes('*')
              ? 'Super Admin'
              : 'Admin'
            : 'Sistem Cek (Gate)'
        } berhasil ditambahkan.`
      );
      window.setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah pengguna.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user: PlatformUser) => {
    if (!canModifyTargetUser(user)) return;
    setErrorMsg(null);
    try {
      await onUpdateUser(user.id, { active: !user.active });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status aktif.');
    }
  };

  const handleRoleChange = async (user: PlatformUser, nextRole: UserRole) => {
    if (!caps.canManageAdminsAndAccess || user.isOwner) return;
    setErrorMsg(null);
    try {
      await onUpdateUser(user.id, { role: nextRole });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah peran pengguna.');
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

  const renderPermissionValue = (val: string) => {
    const lower = val.toLowerCase();
    if (lower === 'tidak') {
      return <span className="font-medium text-slate-400">{val}</span>;
    }
    if (lower.startsWith('terbatas') || lower === 'operasional') {
      return <span className="font-semibold text-amber-700">{val}</span>;
    }
    if (lower.startsWith('penuh')) {
      return <span className="font-bold text-blue-700">{val}</span>;
    }
    return <span className="font-semibold text-emerald-700">{val}</span>;
  };

  return (
    <div className="space-y-6">
      {!caps.canManageGateStaff && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            Anda masuk sebagai <strong>Sistem Cek (Gate)</strong>. Pengelolaan akun petugas dan Admin hanya tersedia untuk Admin atau Super Admin.
          </span>
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
            {superAdminCount} Super Admin · {adminCount} Admin · {gateCount} Gate
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tingkat Akses Anda</span>
            {actorTier === 'super-admin' ? (
              <Crown className="w-4 h-4 text-blue-600" />
            ) : (
              <Shield className="w-4 h-4 text-indigo-600" />
            )}
          </div>
          <p className="font-display text-lg font-bold text-slate-900 mt-2">
            {getAccessTierLabel(actorTier)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {caps.canManageAdminsAndAccess
              ? 'Kelola akun Admin, Petugas Cek & hak akses penuh'
              : 'Kelola akun Petugas Cek (Gate) saja'}
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

      {/* Matriks Hak Akses Fitur */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Matriks Hak Akses Sistem
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pembagian wewenang antara Sistem Cek (Gate), Admin, dan Super Admin
            </p>
          </div>
          <span className="text-xs font-semibold text-blue-700">
            Sesi Aktif: {getAccessTierLabel(actorTier)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[12px] font-semibold text-slate-700">
                <th className="py-3.5 px-6">Fitur / Hak Akses</th>
                <th
                  className={`py-3.5 px-4 ${
                    actorTier === 'gate' ? 'bg-blue-50/70 text-blue-900' : ''
                  }`}
                >
                  Sistem Cek (Gate)
                </th>
                <th
                  className={`py-3.5 px-4 ${
                    actorTier === 'admin' ? 'bg-blue-50/70 text-blue-900' : ''
                  }`}
                >
                  Admin
                </th>
                <th
                  className={`py-3.5 px-6 ${
                    actorTier === 'super-admin' ? 'bg-blue-50/70 text-blue-900' : ''
                  }`}
                >
                  Super Admin
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {PERMISSION_MATRIX.map((row) => (
                <tr key={row.feature} className="hover:bg-slate-50/60">
                  <td className="py-3.5 px-6 font-semibold text-slate-900">{row.feature}</td>
                  <td
                    className={`py-3.5 px-4 ${
                      actorTier === 'gate' ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {renderPermissionValue(row.gate)}
                  </td>
                  <td
                    className={`py-3.5 px-4 ${
                      actorTier === 'admin' ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {renderPermissionValue(row.admin)}
                  </td>
                  <td
                    className={`py-3.5 px-6 ${
                      actorTier === 'super-admin' ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {renderPermissionValue(row.superAdmin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        {/* Left: Add User Form */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                {caps.canManageAdminsAndAccess
                  ? 'Tambah Akun Tim & Admin'
                  : 'Tambah Akun Petugas Cek (Gate)'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {caps.canManageAdminsAndAccess
                  ? 'Super Admin dapat menambahkan akun Petugas Cek maupun Admin event'
                  : 'Admin hanya dapat menambahkan akun Petugas Cek untuk event yang dikelola'}
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
                disabled={!caps.canManageGateStaff}
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
                disabled={!caps.canManageGateStaff}
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
                disabled={!caps.canManageGateStaff}
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
                disabled={!caps.canManageGateStaff}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  formRole === 'administrator' ? 'Default: admin2026' : 'Default: user2026'
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Peran Hak Akses
              </label>
              {caps.canManageAdminsAndAccess ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormRole('user')}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      formRole === 'user'
                        ? 'border-blue-600 bg-blue-50 text-blue-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold">Sistem Cek (Gate)</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Scan sesuai gate</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormRole('administrator')}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      formRole === 'administrator'
                        ? 'border-blue-600 bg-blue-50 text-blue-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold">Admin</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Kelola event &amp; peserta</p>
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 flex items-start gap-2.5">
                  <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">Sistem Cek (Gate)</p>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      Admin hanya berwenang menambah akun Petugas Cek. Penambahan akun Admin hanya oleh Super Admin.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Event / Acara yang Diikuti *
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 space-y-1.5 max-h-40 overflow-y-auto">
                {caps.canManageAdminsAndAccess && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-blue-700 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      disabled={!caps.canManageGateStaff}
                      checked={selectedEventIds.includes('*')}
                      onChange={() => toggleFormEvent('*')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Semua Event (Akses Super Admin)</span>
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
                        disabled={!caps.canManageGateStaff || selectedEventIds.includes('*')}
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
                Penempatan Gerbang / Zona
              </label>
              <select
                disabled={!caps.canManageGateStaff}
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
              disabled={!caps.canManageGateStaff || submitting}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Menambahkan...'
                  : formRole === 'administrator' && caps.canManageAdminsAndAccess
                  ? 'Tambah Akun Admin'
                  : 'Tambah Petugas Cek (Gate)'}
              </span>
            </button>
          </form>
        </div>

        {/* Right: Organizer-Scoped User Directory */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Daftar Akun &amp; Hak Akses Tim ({filteredUsers.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {caps.canManageAdminsAndAccess
                  ? 'Super Admin dapat mengatur akun Admin, Petugas Cek, event, dan gerbang tugas'
                  : 'Admin dapat mengatur akun Petugas Cek (Gate); akun Admin terkunci untuk Super Admin'}
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
                  <th className="py-3 px-3">Hak Akses</th>
                  <th className="py-3 px-3">Gerbang</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser.id;
                  const isUserOnline = onlineUserIds.has(u.id);
                  const uTier = getAccessTier(u);
                  const canEditThisRow = canModifyTargetUser(u);
                  const assignedTitles =
                    uTier === 'super-admin'
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
                            {canEditThisRow && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingEventsUserId(isEditingEvents ? null : u.id)
                                }
                                className="text-[11px] font-semibold text-blue-600 hover:underline"
                              >
                                {isEditingEvents ? 'Tutup Akses Event' : 'Ubah Akses Event'}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          {caps.canManageAdminsAndAccess && !u.isOwner ? (
                            <select
                              aria-label={`Ubah peran ${u.fullName}`}
                              value={u.role}
                              onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800"
                            >
                              <option value="user">Sistem Cek (Gate)</option>
                              <option value="administrator">
                                {u.assignedEventIds?.includes('*') ? 'Super Admin' : 'Admin'}
                              </option>
                            </select>
                          ) : uTier === 'super-admin' ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                              <Crown className="w-3 h-3" />
                              <span>Super Admin</span>
                            </span>
                          ) : uTier === 'admin' ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                              <Shield className="w-3 h-3" />
                              <span>Admin</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                              <UserCheck className="w-3 h-3 text-emerald-600" />
                              <span>Sistem Cek (Gate)</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <select
                            disabled={!canEditThisRow}
                            value={u.assignedGate}
                            onChange={(e) =>
                              onUpdateUser(u.id, { assignedGate: e.target.value })
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
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
                            disabled={!canEditThisRow}
                            onClick={() => handleToggleActive(u)}
                            className={`text-xs font-semibold disabled:opacity-60 ${
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
                              disabled={!canEditThisRow || isCurrent}
                              onClick={() => handleDelete(u.id)}
                              title={
                                u.isOwner
                                  ? 'Super Admin Utama tidak dapat dihapus'
                                  : !canEditThisRow
                                  ? 'Hanya Super Admin yang dapat menghapus akun Admin'
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
                              {caps.canManageAdminsAndAccess && (
                                <label className="inline-flex items-center gap-1.5 font-semibold text-blue-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(u.assignedEventIds?.includes('*'))}
                                    onChange={() => void toggleExistingUserEvent(u, '*')}
                                    className="rounded border-slate-300 text-blue-600"
                                  />
                                  <span>Semua Event (Super Admin)</span>
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
