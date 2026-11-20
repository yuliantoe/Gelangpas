import React, { useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Lock,
  MapPin,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { getRoleCapabilities, type AccessTier } from '../lib/permissions.ts';
import type { AppStateSnapshot, EventInfo, UserRole } from '../types/event.ts';

interface EventManagementViewProps {
  snapshot: AppStateSnapshot;
  currentRole: UserRole;
  accessTier?: AccessTier;
  currentOrganizationName?: string;
  onCreateEvent: (input: {
    title: string;
    subtitle?: string;
    organizerName?: string;
    venue: string;
    dateLabel: string;
    capacity: number;
    gates: string[];
    activeDesignId?: string;
    categoryPreset?: 'standard' | 'school' | 'business' | 'clone';
    activateImmediately?: boolean;
  }) => Promise<unknown>;
  onUpdateEvent: (eventId: string, patch: Partial<EventInfo>) => Promise<unknown>;
  onActivateEvent: (eventId: string) => Promise<unknown>;
  onDeleteEvent: (eventId: string) => Promise<unknown>;
  onNavigateTab: (tab: 'categories' | 'designer' | 'ticketing' | 'users') => void;
  onOpenLandingPage: () => void;
}

export const EventManagementView: React.FC<EventManagementViewProps> = ({
  snapshot,
  currentRole,
  accessTier,
  currentOrganizationName,
  onCreateEvent,
  onUpdateEvent,
  onActivateEvent,
  onDeleteEvent,
  onNavigateTab,
  onOpenLandingPage,
}) => {
  const effectiveTier: AccessTier =
    accessTier || (currentRole === 'administrator' ? 'admin' : 'gate');
  const caps = getRoleCapabilities(effectiveTier);
  const canEditOperational = caps.canManageSystemLimited;
  const canCreateOrDelete = caps.canManageSystemFull;
  const eventsList = snapshot.events && snapshot.events.length > 0 ? snapshot.events : [snapshot.event];

  // Add Event Form State
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [organizerName, setOrganizerName] = useState(
    () => currentOrganizationName || snapshot.event.organizerName || ''
  );
  const [venue, setVenue] = useState('');
  const [dateLabel, setDateLabel] = useState('');
  const [capacity, setCapacity] = useState('1500');
  const [gatesText, setGatesText] = useState('Gerbang Utama A, Gerbang VIP Barat, Pintu Panitia');
  const [designId, setDesignId] = useState(
    snapshot.event.activeDesignId || snapshot.designs[0]?.id || ''
  );
  const [categoryPreset, setCategoryPreset] = useState<
    'standard' | 'school' | 'business' | 'clone'
  >('standard');
  const [activateImmediately, setActivateImmediately] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    subtitle: string;
    organizerName: string;
    venue: string;
    dateLabel: string;
    capacity: string;
    gatesText: string;
    activeDesignId: string;
  } | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!canCreateOrDelete) {
      setErrorMsg('Pengaturan Sistem Penuh — Hanya Super Admin yang dapat menambahkan acara baru.');
      return;
    }

    const parsedGates = gatesText
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      await onCreateEvent({
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        organizerName: organizerName.trim() || undefined,
        venue: venue.trim(),
        dateLabel: dateLabel.trim(),
        capacity: Math.max(10, Number(capacity) || 1000),
        gates: parsedGates.length > 0 ? parsedGates : ['Gerbang Utama A'],
        activeDesignId: designId || undefined,
        categoryPreset,
        activateImmediately,
      });
      const createdTitle = title.trim();
      setTitle('');
      setSubtitle('');
      setVenue('');
      setDateLabel('');
      setCapacity('1500');
      showSuccess(
        `Acara "${createdTitle}" berhasil dibuat${activateImmediately ? ' dan langsung diaktifkan' : ''}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat acara baru.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (ev: EventInfo) => {
    setErrorMsg(null);
    setBusyId(ev.id);
    try {
      await onActivateEvent(ev.id);
      showSuccess(`Acara aktif diganti ke "${ev.title}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengaktifkan acara.');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (ev: EventInfo) => {
    setEditingId(ev.id);
    setConfirmDeleteId(null);
    setEditDraft({
      title: ev.title,
      subtitle: ev.subtitle,
      organizerName: ev.organizerName || '',
      venue: ev.venue,
      dateLabel: ev.dateLabel,
      capacity: String(ev.capacity),
      gatesText: ev.gates.join(', '),
      activeDesignId: ev.activeDesignId,
    });
  };

  const handleSaveEdit = async (evId: string) => {
    if (!editDraft || !canEditOperational) return;
    setErrorMsg(null);
    if (!editDraft.title.trim() || !editDraft.venue.trim() || !editDraft.dateLabel.trim()) {
      setErrorMsg('Nama acara, lokasi, dan tanggal tidak boleh kosong.');
      return;
    }
    const parsedGates = editDraft.gatesText
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    setBusyId(evId);
    try {
      await onUpdateEvent(evId, {
        title: editDraft.title.trim(),
        subtitle: editDraft.subtitle.trim(),
        organizerName: editDraft.organizerName.trim() || undefined,
        venue: editDraft.venue.trim(),
        dateLabel: editDraft.dateLabel.trim(),
        capacity: Math.max(10, Number(editDraft.capacity) || 1000),
        gates: parsedGates.length > 0 ? parsedGates : ['Gerbang Utama A'],
        activeDesignId: editDraft.activeDesignId,
      });
      setEditingId(null);
      setEditDraft(null);
      showSuccess('Detail acara berhasil diperbarui.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui detail acara.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (evId: string) => {
    if (!canCreateOrDelete) return;
    setErrorMsg(null);
    setBusyId(evId);
    try {
      await onDeleteEvent(evId);
      setConfirmDeleteId(null);
      showSuccess('Acara telah dihapus dari daftar.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus acara.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {!canCreateOrDelete && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 flex items-center gap-3 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            {canEditOperational ? (
              <>
                Akun <strong>Admin (Pengaturan Terbatas)</strong> dapat mengubah detail operasional acara yang ditugaskan. Pembuatan dan penghapusan event hanya tersedia untuk <strong>Super Admin</strong>.
              </>
            ) : (
              <>
                Anda masuk dengan peran <strong>Sistem Cek (Gate)</strong>. Pengaturan acara tidak tersedia.
              </>
            )}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-medium text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Active Event Spotlight + Registered Events List */}
        <div className="xl:col-span-8 space-y-6">
          {/* Active Event Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                  Acara Aktif Saat Ini · Penyelenggara: {snapshot.event.organizerName}
                </p>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                  {snapshot.event.title}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{snapshot.event.subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('users')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Kelola Tim Event
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('categories')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Atur Kategori &amp; Harga
                </button>
                <button
                  type="button"
                  onClick={onOpenLandingPage}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <span>Lihat Halaman Utama</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{snapshot.event.venue}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{snapshot.event.dateLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 tabular-nums">
                <Users className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  Kapasitas {snapshot.event.capacity.toLocaleString('id-ID')} · {snapshot.event.gates.length} gerbang
                </span>
              </div>
            </div>
          </div>

          {/* All Registered Events List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Daftar Event &amp; Acara Penyelenggara
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih acara untuk mengaktifkan halaman penjualan, check-in gerbang, dan pelaporannya
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {eventsList.length} acara
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {eventsList.map((ev) => {
                const isActive = ev.id === snapshot.event.id;
                const isEditing = editingId === ev.id && editDraft !== null;
                const designObj = snapshot.designs.find((d) => d.id === ev.activeDesignId);
                const teamCount = (snapshot.users || []).filter(
                  (u) => u.active && (u.isOwner || u.assignedEventIds?.includes('*') || u.assignedEventIds?.includes(ev.id))
                ).length;

                return (
                  <div key={ev.id} className="p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h4 className="font-display text-sm font-bold text-slate-900">
                            {ev.title}
                          </h4>
                          {isActive ? (
                            <span className="text-[11px] font-semibold text-emerald-700">
                              ● Sedang Aktif
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-slate-400">
                              Tersimpan
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-blue-700">
                          Penyelenggara: {ev.organizerName} · {teamCount} pengguna tim ditugaskan
                        </p>
                        <p className="text-xs text-slate-500">{ev.subtitle}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-1">
                          <span>{ev.dateLabel}</span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span>{ev.venue}</span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Kap. {ev.capacity.toLocaleString('id-ID')}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span>{ev.categories.length} kategori</span>
                          {designObj && (
                            <>
                              <span className="text-slate-300" aria-hidden="true">·</span>
                              <span>Tema: {designObj.themePreset}</span>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Gerbang: {ev.gates.join(' · ')}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {!isActive && (
                          <button
                            type="button"
                            disabled={busyId === ev.id}
                            onClick={() => handleActivate(ev)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Aktifkan</span>
                          </button>
                        )}
                        {canEditOperational && (
                          <button
                            type="button"
                            onClick={() => (isEditing ? setEditingId(null) : startEdit(ev))}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{isEditing ? 'Tutup' : 'Edit'}</span>
                          </button>
                        )}
                        {canCreateOrDelete && eventsList.length > 1 && (
                          confirmDeleteId === ev.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busyId === ev.id}
                                onClick={() => handleDelete(ev.id)}
                                className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                              >
                                Hapus Permanen
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(ev.id)}
                              title="Hapus acara"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Inline Edit Panel */}
                    {isEditing && editDraft && (
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">
                              Nama Acara *
                            </label>
                            <input
                              type="text"
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, title: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">
                              Subjudul
                            </label>
                            <input
                              type="text"
                              value={editDraft.subtitle}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, subtitle: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">
                              Nama Penyelenggara / Organisasi
                            </label>
                            <input
                              type="text"
                              value={editDraft.organizerName}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, organizerName: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">
                              Lokasi / Venue *
                            </label>
                            <input
                              type="text"
                              value={editDraft.venue}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, venue: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">
                              Tanggal Pelaksanaan *
                            </label>
                            <input
                              type="text"
                              value={editDraft.dateLabel}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, dateLabel: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">
                              Kapasitas Maksimal
                            </label>
                            <input
                              type="number"
                              min={10}
                              value={editDraft.capacity}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, capacity: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">
                              Desain Gelang Default
                            </label>
                            <select
                              value={editDraft.activeDesignId}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, activeDesignId: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                            >
                              {snapshot.designs.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name} ({d.themePreset})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="font-semibold text-slate-700 block mb-1">
                              Daftar Gerbang (pisahkan dengan koma)
                            </label>
                            <input
                              type="text"
                              value={editDraft.gatesText}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, gatesText: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            disabled={busyId === ev.id}
                            onClick={() => handleSaveEdit(ev.id)}
                            className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {busyId === ev.id ? 'Menyimpan...' : 'Simpan Perubahan'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Add New Event Form */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Tambah Event / Acara Baru
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Buat acara sekolah, bisnis, festival, atau konser dengan QR &amp; kategori tiket tersendiri
              </p>
            </div>
            <CalendarPlus className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nama Acara / Event *
              </label>
              <input
                type="text"
                required
                disabled={!canCreateOrDelete}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Expo Inovasi Kampus 2026"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nama Penyelenggara / Organisasi *
              </label>
              <input
                type="text"
                required
                disabled={!canCreateOrDelete}
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
                placeholder="Contoh: PT Kreasi Panggung Nusantara"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Subjudul / Tema Singkat
              </label>
              <input
                type="text"
                disabled={!canCreateOrDelete}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Contoh: Pameran Teknologi & Pentas Musik"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Lokasi / Venue *
              </label>
              <input
                type="text"
                required
                disabled={!canCreateOrDelete}
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Contoh: Balai Kartini, Jakarta"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Tanggal Acara *
                </label>
                <input
                  type="text"
                  required
                  disabled={!canCreateOrDelete}
                  value={dateLabel}
                  onChange={(e) => setDateLabel(e.target.value)}
                  placeholder="20 Des 2026"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Kapasitas
                </label>
                <input
                  type="number"
                  min={10}
                  disabled={!canCreateOrDelete}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Gerbang Masuk (pisahkan koma)
              </label>
              <input
                type="text"
                disabled={!canCreateOrDelete}
                value={gatesText}
                onChange={(e) => setGatesText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Koleksi Desain Gelang Default
              </label>
              <select
                disabled={!canCreateOrDelete}
                value={designId}
                onChange={(e) => setDesignId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              >
                {snapshot.designs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.themePreset})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Template Kategori Tiket Awal
              </label>
              <select
                disabled={!canCreateOrDelete}
                value={categoryPreset}
                onChange={(e) =>
                  setCategoryPreset(
                    e.target.value as 'standard' | 'school' | 'business' | 'clone'
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              >
                <option value="standard">Standar Festival &amp; Musik (VIP, Reguler, Early Bird)</option>
                <option value="school">Acara Sekolah (Siswa, Umum/Wali, Guru &amp; Panitia)</option>
                <option value="business">Acara Bisnis (Eksekutif VIP, Delegasi, Media/Sponsor)</option>
                <option value="clone">Salin Kategori dari Acara Aktif Saat Ini</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
              <input
                type="checkbox"
                disabled={!canCreateOrDelete}
                checked={activateImmediately}
                onChange={(e) => setActivateImmediately(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>Langsung aktifkan acara ini di halaman utama &amp; loket</span>
            </label>

            <button
              type="submit"
              disabled={!canCreateOrDelete || submitting}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'Membuat Acara...' : 'Tambah Event / Acara'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
