import React, { useEffect, useState } from 'react';
import { Check, Lock, Plus, Save, Tag, Trash2 } from 'lucide-react';
import type { AppStateSnapshot, TicketCategory, UserRole } from '../types/event.ts';

interface CategoryPriceViewProps {
  snapshot: AppStateSnapshot;
  currentRole: UserRole;
  onSaveCategories: (eventId: string, categories: TicketCategory[]) => Promise<unknown>;
}

export const CategoryPriceView: React.FC<CategoryPriceViewProps> = ({
  snapshot,
  currentRole,
  onSaveCategories,
}) => {
  const [draftCategories, setDraftCategories] = useState<TicketCategory[]>(
    snapshot.event.categories || []
  );
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('250000');
  const [newQuota, setNewQuota] = useState('200');
  const [newGate, setNewGate] = useState(snapshot.event.gates[0] || 'Gerbang Utama A');

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraftCategories(snapshot.event.categories || []);
  }, [snapshot.event.categories]);

  const isAdmin = currentRole === 'administrator';

  const handleFieldChange = (
    id: string,
    field: keyof TicketCategory,
    value: string | number | boolean
  ) => {
    setDraftCategories((prev) =>
      prev.map((cat) => (cat.id === id ? { ...cat, [field]: value } : cat))
    );
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isAdmin) {
      setErrorMsg('Hanya Administrator yang dapat menambah kategori tiket.');
      return;
    }
    const cleanName = newName.trim();
    if (!cleanName) {
      setErrorMsg('Nama kategori wajib diisi.');
      return;
    }
    if (draftCategories.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg(`Kategori "${cleanName}" sudah ada.`);
      return;
    }

    const nextList: TicketCategory[] = [
      ...draftCategories,
      {
        id: `cat-${Date.now().toString(36)}`,
        name: cleanName,
        price: Math.max(0, Number(newPrice) || 0),
        defaultGate: newGate,
        quota: Math.max(1, Number(newQuota) || 100),
        active: true,
      },
    ];

    setSaving(true);
    try {
      await onSaveCategories(snapshot.event.id, nextList);
      setDraftCategories(nextList);
      setNewName('');
      setNewPrice('250000');
      setNewQuota('200');
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah kategori.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCategory = (id: string) => {
    if (!isAdmin) return;
    if (draftCategories.length <= 1) {
      setErrorMsg('Minimal harus tersisa 1 kategori tiket aktif.');
      return;
    }
    setDraftCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSaveAll = async () => {
    setErrorMsg(null);
    if (!isAdmin) {
      setErrorMsg('Akses ditolak: hanya Administrator yang dapat mengubah harga tiket.');
      return;
    }
    for (const cat of draftCategories) {
      if (!cat.name.trim()) {
        setErrorMsg('Semua nama kategori wajib diisi.');
        return;
      }
    }
    setSaving(true);
    try {
      await onSaveCategories(snapshot.event.id, draftCategories);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 flex items-center gap-3 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            Anda sedang masuk dengan peran <strong>User</strong>. Pengeditan kategori dan harga tiket hanya tersedia untuk akun <strong>Administrator</strong>.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left / Main: Editable Categories & Prices Table */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Pengaturan Kategori & Harga Tiket Gelang
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ubah nama kategori, tarif (IDR), kuota, dan gerbang masuk default secara real-time
              </p>
            </div>
            <button
              type="button"
              disabled={!isAdmin || saving}
              onClick={handleSaveAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>
                {savedNotice
                  ? 'Perubahan Disimpan'
                  : saving
                  ? 'Menyimpan...'
                  : 'Simpan Perubahan Harga'}
              </span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-5">Nama Kategori</th>
                  <th className="py-3 px-3">Harga Tiket (Rp)</th>
                  <th className="py-3 px-3">Kuota</th>
                  <th className="py-3 px-3">Gerbang Default</th>
                  <th className="py-3 px-3">Terjual</th>
                  <th className="py-3 px-3">Aktif</th>
                  <th className="py-3 px-5 text-right">Hapus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draftCategories.map((cat) => {
                  const soldCount = snapshot.attendees.filter(
                    (a) => a.tier === cat.name
                  ).length;

                  return (
                    <tr key={cat.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-5">
                        <input
                          type="text"
                          disabled={!isAdmin}
                          value={cat.name}
                          onChange={(e) => handleFieldChange(cat.id, 'name', e.target.value)}
                          className="w-full min-w-[120px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          min={0}
                          step={5000}
                          disabled={!isAdmin}
                          value={cat.price}
                          onChange={(e) =>
                            handleFieldChange(
                              cat.id,
                              'price',
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 tabular-nums disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          min={1}
                          disabled={!isAdmin}
                          value={cat.quota}
                          onChange={(e) =>
                            handleFieldChange(
                              cat.id,
                              'quota',
                              Math.max(1, Number(e.target.value) || 1)
                            )
                          }
                          className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 tabular-nums disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <select
                          disabled={!isAdmin}
                          value={cat.defaultGate}
                          onChange={(e) =>
                            handleFieldChange(cat.id, 'defaultGate', e.target.value)
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 disabled:bg-slate-50 disabled:text-slate-500"
                        >
                          {snapshot.event.gates.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {soldCount} / {cat.quota}
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          disabled={!isAdmin}
                          checked={cat.active}
                          onChange={(e) =>
                            handleFieldChange(cat.id, 'active', e.target.checked)
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                        />
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          type="button"
                          disabled={!isAdmin || draftCategories.length <= 1}
                          onClick={() => handleRemoveCategory(cat.id)}
                          title="Hapus kategori"
                          className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Add New Category Form */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Tambah Kategori Baru
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Buat kelas gelang tambahan seperti Pelajar, VVIP, atau Day Pass
              </p>
            </div>
            <Tag className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          <form onSubmit={handleAddCategory} className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nama Kategori *
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contoh: VVIP / Pelajar / Day 1"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Harga Tiket (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  step={5000}
                  disabled={!isAdmin}
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Kuota Gelang
                </label>
                <input
                  type="number"
                  min={1}
                  disabled={!isAdmin}
                  value={newQuota}
                  onChange={(e) => setNewQuota(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Gerbang Masuk Default
              </label>
              <select
                disabled={!isAdmin}
                value={newGate}
                onChange={(e) => setNewGate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white disabled:bg-slate-50"
              >
                {snapshot.event.gates.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!isAdmin || saving}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kategori & Harga</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
