import type { PlatformUser } from '../types/event.ts';

export type AccessTier = 'gate' | 'admin' | 'super-admin';

export interface PermissionMatrixRow {
  feature: string;
  gate: string;
  admin: string;
  superAdmin: string;
}

export const PERMISSION_MATRIX: PermissionMatrixRow[] = [
  {
    feature: 'Scan / Validasi Gelang',
    gate: 'Ya (sesuai gate/zona)',
    admin: 'Ya',
    superAdmin: 'Ya',
  },
  {
    feature: 'Blokir / Reissue Gelang Hilang',
    gate: 'Tidak',
    admin: 'Ya',
    superAdmin: 'Ya',
  },
  {
    feature: 'Kelola Data Peserta & Kategori',
    gate: 'Tidak',
    admin: 'Ya',
    superAdmin: 'Ya',
  },
  {
    feature: 'Kelola Akun Petugas Cek',
    gate: 'Tidak',
    admin: 'Ya',
    superAdmin: 'Ya',
  },
  {
    feature: 'Kelola Akun Admin & Hak Akses',
    gate: 'Tidak',
    admin: 'Tidak',
    superAdmin: 'Ya',
  },
  {
    feature: 'Pengaturan Sistem & Integrasi',
    gate: 'Tidak',
    admin: 'Terbatas',
    superAdmin: 'Penuh',
  },
  {
    feature: 'Lihat Log Audit & Laporan Penuh',
    gate: 'Terbatas (gate sendiri)',
    admin: 'Operasional',
    superAdmin: 'Penuh + Finansial',
  },
];

export function getAccessTier(
  user?: Pick<PlatformUser, 'role' | 'isOwner' | 'assignedEventIds'> | null
): AccessTier {
  if (!user || user.role === 'user') return 'gate';
  if (user.isOwner || user.assignedEventIds?.includes('*')) return 'super-admin';
  return 'admin';
}

export function getAccessTierLabel(tier: AccessTier): string {
  switch (tier) {
    case 'super-admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'gate':
      return 'Sistem Cek (Gate)';
  }
}

export function getRoleCapabilities(tier: AccessTier) {
  return {
    canScanAnyGate: tier !== 'gate',
    canScanAssignedGate: true,
    canBlockOrReissueWristband: tier !== 'gate',
    canManageAttendeesAndCategories: tier !== 'gate',
    canManageGateStaff: tier !== 'gate',
    canManageAdminsAndAccess: tier === 'super-admin',
    canManageSystemFull: tier === 'super-admin',
    canManageSystemLimited: tier === 'admin' || tier === 'super-admin',
    canViewFullAuditLogs: tier !== 'gate',
    canViewFinancialReports: tier === 'super-admin',
  };
}
