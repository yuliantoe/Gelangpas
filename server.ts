import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ActiveSessionInfo,
  AppStateSnapshot,
  Attendee,
  CheckInLog,
  DecryptedQrPayload,
  EventInfo,
  NotificationRules,
  OrganizerNotification,
  PaymentMethod,
  PaymentTransaction,
  PendingOfflineCheckIn,
  PendingOfflineOrder,
  PlatformUser,
  TicketCategory,
  TicketTier,
  UserRole,
  WristbandDesign,
} from './src/types/event.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

interface ServerStore extends Omit<AppStateSnapshot, 'securityPinConfigured' | 'events'> {
  events: EventInfo[];
  securityPinHash: string;
  userPasswords?: Record<string, string>;
}

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(`gelangpass-pin:${pin}`).digest('hex');
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`gelangpass-auth:${password}`).digest('hex');
}

function getDefaultPasswordForRole(role: UserRole): string {
  return role === 'administrator' ? 'admin2026' : 'user2026';
}

function encryptTokenServer(
  payload: Omit<DecryptedQrPayload, 'sig'>,
  keyHex: string
): string {
  const sigSource = `${payload.id}|${payload.code}|${payload.ev}|${payload.tier}|${payload.ver}`;
  const sig = crypto
    .createHash('sha256')
    .update(sigSource + keyHex)
    .digest('hex')
    .slice(0, 16);

  const fullPayload: DecryptedQrPayload = { ...payload, sig };
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(keyHex, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(fullPayload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([encrypted, tag]);

  return `GP1.${payload.ver}.${iv.toString('base64url')}.${combined.toString('base64url')}`;
}

function decryptTokenServer(
  token: string,
  keyHex: string
): { valid: boolean; payload?: DecryptedQrPayload; reason?: string } {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 4 || parts[0] !== 'GP1') {
      return { valid: false, reason: 'Format token QR bukan protokol GP1' };
    }
    const version = Number(parts[1]);
    const iv = Buffer.from(parts[2], 'base64url');
    const combined = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || combined.length < 16) {
      return { valid: false, reason: 'Payload enkripsi tidak lengkap' };
    }
    const tag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(0, combined.length - 16);
    const key = Buffer.from(keyHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const payload = JSON.parse(decrypted) as DecryptedQrPayload;

    if (payload.ver !== version) {
      return { valid: false, reason: 'Versi kunci tidak sesuai' };
    }
    const sigSource = `${payload.id}|${payload.code}|${payload.ev}|${payload.tier}|${payload.ver}`;
    const expectedSig = crypto
      .createHash('sha256')
      .update(sigSource + keyHex)
      .digest('hex')
      .slice(0, 16);

    if (payload.sig !== expectedSig) {
      return { valid: false, reason: 'Tanda tangan SHA-256 tidak valid' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'Gagal dekripsi AES-256-GCM: QR tidak sah atau kunci berbeda' };
  }
}

function makeTicketCode(tier: TicketTier): string {
  const prefixMap: Record<string, string> = {
    VIP: 'VIP',
    Reguler: 'REG',
    'Early Bird': 'EBD',
    Backstage: 'BKS',
    Media: 'MDA',
  };
  const fallbackPrefix =
    tier
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'TKT';
  const prefix = prefixMap[tier] || fallbackPrefix;
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `GP-${prefix}-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

function buildDefaultCategories(
  ticketPrices?: Record<string, number>,
  gates?: string[]
): TicketCategory[] {
  const mainGate = gates?.[0] || 'Gerbang Utama A';
  const vipGate = gates?.[1] || 'Gerbang VIP Barat';
  const crewGate = gates?.[3] || 'Pintu Kru & Media';
  return [
    {
      id: 'cat-vip',
      name: 'VIP',
      price: ticketPrices?.VIP ?? 1450000,
      defaultGate: vipGate,
      quota: 300,
      active: true,
    },
    {
      id: 'cat-backstage',
      name: 'Backstage',
      price: ticketPrices?.Backstage ?? 2250000,
      defaultGate: crewGate,
      quota: 100,
      active: true,
    },
    {
      id: 'cat-reguler',
      name: 'Reguler',
      price: ticketPrices?.Reguler ?? 550000,
      defaultGate: mainGate,
      quota: 1500,
      active: true,
    },
    {
      id: 'cat-early-bird',
      name: 'Early Bird',
      price: ticketPrices?.['Early Bird'] ?? 385000,
      defaultGate: mainGate,
      quota: 500,
      active: true,
    },
    {
      id: 'cat-media',
      name: 'Media',
      price: ticketPrices?.Media ?? 0,
      defaultGate: crewGate,
      quota: 100,
      active: true,
    },
  ];
}

function hasAllEventsAccess(user?: PlatformUser | null): boolean {
  if (!user) return false;
  return Boolean(user.isOwner || user.assignedEventIds?.includes('*'));
}

function canUserAccessEvent(user: PlatformUser | null | undefined, eventId: string): boolean {
  if (!user) return true;
  if (hasAllEventsAccess(user)) return true;
  return Array.isArray(user.assignedEventIds) && user.assignedEventIds.includes(eventId);
}

function usersShareOrganizerScope(actor: PlatformUser, target: PlatformUser): boolean {
  if (hasAllEventsAccess(actor)) return true;
  if (target.id === actor.id) return true;
  if (target.isOwner || target.assignedEventIds?.includes('*')) return false;
  const actorEvents = new Set(actor.assignedEventIds || []);
  if ((target.assignedEventIds || []).some((evId) => actorEvents.has(evId))) {
    return true;
  }
  return (
    Boolean(actor.organizationName) &&
    target.organizationName.trim().toLowerCase() === actor.organizationName.trim().toLowerCase()
  );
}

function buildDefaultUsers(defaultEventId = 'ev-soundscape-2026'): PlatformUser[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'usr-admin-1',
      fullName: 'Penyelenggara Utama',
      email: 'idmonggo@gmail.com',
      role: 'administrator',
      organizationName: 'GelangPass Pusat',
      assignedEventIds: ['*'],
      isOwner: true,
      assignedGate: 'Semua Gerbang',
      active: true,
      createdAt: now,
      lastActiveAt: now,
    },
    {
      id: 'usr-admin-2',
      fullName: 'Nadira Kusuma (Koordinator)',
      email: 'nadira.admin@gelangpass.id',
      role: 'administrator',
      organizationName: 'Soundscape Live Indonesia',
      assignedEventIds: [defaultEventId],
      assignedGate: 'Gerbang VIP Barat',
      active: true,
      createdAt: now,
      lastActiveAt: now,
    },
    {
      id: 'usr-staff-1',
      fullName: 'Fauzan Pratama (Petugas Gerbang)',
      email: 'fauzan.gate@gelangpass.id',
      role: 'user',
      organizationName: 'Soundscape Live Indonesia',
      assignedEventIds: [defaultEventId],
      assignedGate: 'Gerbang Utama A',
      active: true,
      createdAt: now,
      lastActiveAt: now,
    },
    {
      id: 'usr-staff-2',
      fullName: 'Sinta Dewi (Kasir Loket)',
      email: 'sinta.loket@gelangpass.id',
      role: 'user',
      organizationName: 'Soundscape Live Indonesia',
      assignedEventIds: [defaultEventId],
      assignedGate: 'Gerbang Timur B',
      active: true,
      createdAt: now,
      lastActiveAt: null,
    },
  ];
}

function buildDefaultDesigns(eventId: string): WristbandDesign[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'dsn-festival-cobalt',
      eventId,
      name: 'Soundscape Cobalt Live Musik',
      themePreset: 'Musik',
      primaryColor: '#0F172A',
      secondaryColor: '#2563EB',
      accentColor: '#38BDF8',
      textColor: '#FFFFFF',
      material: 'woven',
      pattern: 'diagonal',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'GelangPass Live Stage',
      customTagline: 'Akses Resmi Panggung Musik',
      updatedAt: now,
    },
    {
      id: 'dsn-musik-indie',
      eventId,
      name: 'Konser Musik & Panggung Malam',
      themePreset: 'Musik',
      primaryColor: '#4C1D95',
      secondaryColor: '#BE123C',
      accentColor: '#FDA4AF',
      textColor: '#FFFFFF',
      material: 'woven',
      pattern: 'wave',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Sound Stage Official',
      customTagline: 'Festival Area & Front Row',
      updatedAt: now,
    },
    {
      id: 'dsn-festival-nusantara',
      eventId,
      name: 'Festival Budaya & Kuliner Nusantara',
      themePreset: 'Festival',
      primaryColor: '#7C2D12',
      secondaryColor: '#D97706',
      accentColor: '#FDE68A',
      textColor: '#FFFBEB',
      material: 'woven',
      pattern: 'geometric',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Pesona Festival 2026',
      customTagline: 'Panggung Utama & Zona Kuliner',
      updatedAt: now,
    },
    {
      id: 'dsn-sekolah-pensi',
      eventId,
      name: 'Pentas Seni & Wisuda Sekolah',
      themePreset: 'Acara Sekolah',
      primaryColor: '#1E3A8A',
      secondaryColor: '#0284C7',
      accentColor: '#FACC15',
      textColor: '#FFFFFF',
      material: 'tyvek',
      pattern: 'geometric',
      widthMm: 19,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'OSIS & Panitia Sekolah',
      customTagline: 'Akses Siswa, Guru & Wali Murid',
      updatedAt: now,
    },
    {
      id: 'dsn-sekolah-classmeet',
      eventId,
      name: 'Pekan Olahraga & Akademik Sekolah',
      themePreset: 'Acara Sekolah',
      primaryColor: '#065F46',
      secondaryColor: '#0D9488',
      accentColor: '#A7F3D0',
      textColor: '#ECFDF5',
      material: 'silicone',
      pattern: 'diagonal',
      widthMm: 19,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: false,
      showSecurityMicrotext: true,
      sponsorLabel: 'Kompetisi Antar Kelas',
      customTagline: 'Zona Lapangan & Aula Kampus',
      updatedAt: now,
    },
    {
      id: 'dsn-bisnis-forum',
      eventId,
      name: 'Forum Bisnis & Eksekutif Korporat',
      themePreset: 'Acara Bisnis',
      primaryColor: '#0F172A',
      secondaryColor: '#334155',
      accentColor: '#E2E8F0',
      textColor: '#F8FAFC',
      material: 'rfid-pvc',
      pattern: 'grid',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Executive Business Forum',
      customTagline: 'Main Ballroom & Executive Lounge',
      updatedAt: now,
    },
    {
      id: 'dsn-bisnis-expo',
      eventId,
      name: 'B2B Business Expo & Networking',
      themePreset: 'Acara Bisnis',
      primaryColor: '#312E81',
      secondaryColor: '#1D4ED8',
      accentColor: '#93C5FD',
      textColor: '#FFFFFF',
      material: 'tyvek',
      pattern: 'solid',
      widthMm: 19,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Indonesia Business Summit',
      customTagline: 'Ruang Konferensi & Booth Mitra',
      updatedAt: now,
    },
    {
      id: 'dsn-gala-gold',
      eventId,
      name: 'VIP Lounge & Gala Night',
      themePreset: 'Gala Eksklusif',
      primaryColor: '#18181B',
      secondaryColor: '#B45309',
      accentColor: '#FBBF24',
      textColor: '#FAFAFA',
      material: 'silicone',
      pattern: 'geometric',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: false,
      showSecurityMicrotext: true,
      sponsorLabel: 'VIP Priority Access',
      customTagline: 'Undangan Resmi Terbatas',
      updatedAt: now,
    },
    {
      id: 'dsn-sport-running-marathon',
      eventId,
      name: 'City Marathon & Fun Run 10K',
      themePreset: 'Sport Running',
      primaryColor: '#0F172A',
      secondaryColor: '#EA580C',
      accentColor: '#BEF264',
      textColor: '#FFFFFF',
      material: 'rfid-pvc',
      pattern: 'diagonal',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Official Race Runner Pass',
      customTagline: 'Start Corral · Hydration & Finisher Zone',
      updatedAt: now,
    },
    {
      id: 'dsn-sport-running-trail',
      eventId,
      name: 'Trail & Night Running Series',
      themePreset: 'Sport Running',
      primaryColor: '#064E3B',
      secondaryColor: '#059669',
      accentColor: '#FDE047',
      textColor: '#FFFFFF',
      material: 'tyvek',
      pattern: 'wave',
      widthMm: 19,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Indonesia Running Series',
      customTagline: 'Timing Chip · 5K / 10K / Half Marathon',
      updatedAt: now,
    },
    {
      id: 'dsn-konser-musik-arena',
      eventId,
      name: 'Konser Musik Stadion & VIP Pit',
      themePreset: 'Konser Musik',
      primaryColor: '#1E1B4B',
      secondaryColor: '#9333EA',
      accentColor: '#F472B6',
      textColor: '#FFFFFF',
      material: 'woven',
      pattern: 'wave',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Live Concert Tour 2026',
      customTagline: 'Festival Pit · Soundcheck & Encore',
      updatedAt: now,
    },
    {
      id: 'dsn-bisnis-summit',
      eventId,
      name: 'Tech & Business Leadership Summit',
      themePreset: 'Bisnis',
      primaryColor: '#090D16',
      secondaryColor: '#0E7490',
      accentColor: '#38BDF8',
      textColor: '#F8FAFC',
      material: 'rfid-pvc',
      pattern: 'grid',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Executive Summit Pass',
      customTagline: 'Keynote Hall · VIP Networking Lounge',
      updatedAt: now,
    },
    {
      id: 'dsn-reuni-akbar',
      eventId,
      name: 'Reuni Akbar & Temu Kangen Alumni',
      themePreset: 'Reuni',
      primaryColor: '#451A03',
      secondaryColor: '#B45309',
      accentColor: '#FDE68A',
      textColor: '#FFFBEB',
      material: 'woven',
      pattern: 'geometric',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Ikatan Alumni Angkatan',
      customTagline: 'Hall Utama · Gala Dinner & Nostalgia',
      updatedAt: now,
    },
    {
      id: 'dsn-reuni-silver',
      eventId,
      name: 'Reuni Perak 25 Tahun Klasik',
      themePreset: 'Reuni',
      primaryColor: '#1E293B',
      secondaryColor: '#475569',
      accentColor: '#FCD34D',
      textColor: '#F8FAFC',
      material: 'silicone',
      pattern: 'solid',
      widthMm: 19,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: false,
      showSecurityMicrotext: true,
      sponsorLabel: 'Silver Reunion Celebration',
      customTagline: 'Registrasi Alumni & Doorprize',
      updatedAt: now,
    },
    {
      id: 'dsn-universitas-ospek',
      eventId,
      name: 'PKKMB & Orientasi Mahasiswa Baru',
      themePreset: 'Universitas',
      primaryColor: '#312E81',
      secondaryColor: '#4338CA',
      accentColor: '#FBBF24',
      textColor: '#FFFFFF',
      material: 'tyvek',
      pattern: 'diagonal',
      widthMm: 19,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'BEM & Panitia Kampus',
      customTagline: 'Auditorium Kampus & Zona Fakultas',
      updatedAt: now,
    },
    {
      id: 'dsn-universitas-dies',
      eventId,
      name: 'Dies Natalis & Wisuda Universitas',
      themePreset: 'Universitas',
      primaryColor: '#4C0519',
      secondaryColor: '#881337',
      accentColor: '#FDE047',
      textColor: '#FFF1F2',
      material: 'woven',
      pattern: 'geometric',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Senat & Alumni Universitas',
      customTagline: 'Graha Sabha · Tamu & Wisudawan',
      updatedAt: now,
    },
    {
      id: 'dsn-gkl-1',
      eventId,
      name: 'GKL.1 — JazzLoveFest VIP Gate 1',
      themePreset: 'Konser Musik',
      primaryColor: '#EC4899',
      secondaryColor: '#6366F1',
      accentColor: '#FDE047',
      textColor: '#FFFFFF',
      material: 'woven',
      pattern: 'wave',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'JazzLoveFest 2024',
      customTagline: 'VIP | GATE 1 · Smooth Jazz Stage',
      updatedAt: now,
    },
    {
      id: 'dsn-gkl-2',
      eventId,
      name: 'GKL.2 — LIVELINK 2024 CAT 3B',
      themePreset: 'Konser Musik',
      primaryColor: '#2E1A6B',
      secondaryColor: '#4338CA',
      accentColor: '#FDE047',
      textColor: '#FFFFFF',
      material: 'tyvek',
      pattern: 'geometric',
      widthMm: 19,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'LIVELINK 2024 · www.livelink.com',
      customTagline: 'CAT 3B · Live Music & Arena Access',
      updatedAt: now,
    },
    {
      id: 'dsn-gkl-3',
      eventId,
      name: 'GKL.3 — Rekaman di Taman Music Festival',
      themePreset: 'Konser Musik · Festival',
      primaryColor: '#13091F',
      secondaryColor: '#9D174D',
      accentColor: '#F472B6',
      textColor: '#FFF1F2',
      material: 'woven',
      pattern: 'wave',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Rekaman di Taman · Music Festival',
      customTagline: 'VIP Access · 24/09/2024 · Garden Stage',
      updatedAt: now,
    },
    {
      id: 'dsn-gkl-4',
      eventId,
      name: 'GKL.4 — Night Musiclub Day 3 VIP',
      themePreset: 'Konser Musik',
      primaryColor: '#BE123C',
      secondaryColor: '#3B0764',
      accentColor: '#FBBF24',
      textColor: '#FFFFFF',
      material: 'woven',
      pattern: 'diagonal',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'NIGHT MUSICLUB · DAY 3',
      customTagline: 'Jakarta International Stadium · VIP Brass & Piano',
      updatedAt: now,
    },
    {
      id: 'dsn-gkl-5',
      eventId,
      name: 'GKL.5 — International Jazz Day Istora',
      themePreset: 'Konser Musik · Festival',
      primaryColor: '#F59E0B',
      secondaryColor: '#7E22CE',
      accentColor: '#FDE047',
      textColor: '#FFFFFF',
      material: 'tyvek',
      pattern: 'geometric',
      widthMm: 25,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'International Jazz Day',
      customTagline: 'CAT 2AB · Istora Senayan Hall',
      updatedAt: now,
    },
    {
      id: 'dsn-gkl-6',
      eventId,
      name: 'GKL.6 — Creatiffest Day 3 Access',
      themePreset: 'Festival',
      primaryColor: '#DC2626',
      secondaryColor: '#0F172A',
      accentColor: '#FDBA74',
      textColor: '#FFFFFF',
      material: 'tyvek',
      pattern: 'diagonal',
      widthMm: 19,
      showHolderName: true,
      showTierBadge: true,
      showPerforation: true,
      showSecurityMicrotext: true,
      sponsorLabel: 'Creatiffest 2024',
      customTagline: 'Valid for Day 3 Access · Creative Festival',
      updatedAt: now,
    },
  ];
}

function seedInitialStore(): ServerStore {
  const keyHex = crypto.randomBytes(32).toString('hex');
  const eventId = 'ev-soundscape-2026';
  const designs = buildDefaultDesigns(eventId);

  const defaultGates = ['Gerbang Utama A', 'Gerbang VIP Barat', 'Gerbang Timur B', 'Pintu Kru & Media'];
  const categories = buildDefaultCategories(undefined, defaultGates);
  const ticketPrices: Record<string, number> = {};
  categories.forEach((c) => {
    ticketPrices[c.name] = c.price;
  });

  const event: EventInfo = {
    id: eventId,
    title: 'Soundscape Nusantara 2026',
    subtitle: 'Festival Musik & Eksibisi Seni Digital',
    organizerName: 'Soundscape Live Indonesia',
    organizerEmail: 'idmonggo@gmail.com',
    venue: 'Stadion Utama GBK, Jakarta',
    dateLabel: '15–16 November 2026',
    capacity: 2500,
    gates: defaultGates,
    activeDesignId: designs[0].id,
    ticketPrices,
    categories,
    encryptionKeyVersion: 1,
  };

  const samplePeople: Array<{
    name: string;
    email: string;
    phone: string;
    tier: TicketTier;
    gate: string;
    method: PaymentMethod;
    checkedIn: boolean;
    hoursAgo: number;
    mode: 'online' | 'offline-synced' | null;
  }> = [
    { name: 'Raka Pratama Wijaya', email: 'raka.pratama@gmail.com', phone: '0812-8490-1120', tier: 'VIP', gate: 'Gerbang VIP Barat', method: 'QRIS', checkedIn: true, hoursAgo: 4.5, mode: 'online' },
    { name: 'Nadia Kusuma Putri', email: 'nadia.kusuma@yahoo.co.id', phone: '0813-7721-9045', tier: 'VIP', gate: 'Gerbang VIP Barat', method: 'Kartu Kredit', checkedIn: true, hoursAgo: 3.8, mode: 'online' },
    { name: 'Dimas Aditya Saputra', email: 'dimas.aditya@outlook.com', phone: '0856-9100-4412', tier: 'Reguler', gate: 'Gerbang Utama A', method: 'QRIS', checkedIn: true, hoursAgo: 3.5, mode: 'online' },
    { name: 'Siti Nurhaliza Rahma', email: 'siti.rahma@gmail.com', phone: '0811-2234-8890', tier: 'Early Bird', gate: 'Gerbang Utama A', method: 'Virtual Account BCA', checkedIn: true, hoursAgo: 3.2, mode: 'online' },
    { name: 'Bima Sakti Nugroho', email: 'bima.sakti@studio.id', phone: '0819-4450-2211', tier: 'Backstage', gate: 'Pintu Kru & Media', method: 'Tunai Loket', checkedIn: true, hoursAgo: 5.1, mode: 'online' },
    { name: 'Clarissa Tanuwijaya', email: 'clarissa.t@media.co.id', phone: '0812-9090-3321', tier: 'Media', gate: 'Pintu Kru & Media', method: 'Tunai Loket', checkedIn: true, hoursAgo: 2.9, mode: 'online' },
    { name: 'Fajar Ramadhan', email: 'fajar.ramadhan@gmail.com', phone: '0852-6612-0934', tier: 'Reguler', gate: 'Gerbang Timur B', method: 'GoPay / OVO', checkedIn: true, hoursAgo: 2.6, mode: 'offline-synced' },
    { name: 'Aulia Putri Maharani', email: 'aulia.maharani@gmail.com', phone: '0878-3341-7755', tier: 'Early Bird', gate: 'Gerbang Utama A', method: 'QRIS', checkedIn: true, hoursAgo: 2.1, mode: 'online' },
    { name: 'Hendra Gunawan', email: 'hendra.g@perusahaan.id', phone: '0815-8812-3409', tier: 'VIP', gate: 'Gerbang VIP Barat', method: 'Virtual Account Mandiri', checkedIn: true, hoursAgo: 1.9, mode: 'online' },
    { name: 'Tasya Amalia Sari', email: 'tasya.amalia@gmail.com', phone: '0812-4419-0082', tier: 'Reguler', gate: 'Gerbang Timur B', method: 'QRIS', checkedIn: true, hoursAgo: 1.4, mode: 'online' },
    { name: 'Bagas Kara Yudha', email: 'bagas.yudha@gmail.com', phone: '0821-5509-1188', tier: 'Reguler', gate: 'Gerbang Utama A', method: 'GoPay / OVO', checkedIn: true, hoursAgo: 1.1, mode: 'online' },
    { name: 'Vina Octavia', email: 'vina.octavia@gmail.com', phone: '0813-9901-4522', tier: 'Early Bird', gate: 'Gerbang Timur B', method: 'Virtual Account BCA', checkedIn: true, hoursAgo: 0.7, mode: 'online' },
    { name: 'Reza Pahlevi Hakim', email: 'reza.hakim@gmail.com', phone: '0857-2201-8891', tier: 'VIP', gate: 'Gerbang VIP Barat', method: 'Kartu Kredit', checkedIn: false, hoursAgo: 0, mode: null },
    { name: 'Kezia Natalia', email: 'kezia.natalia@gmail.com', phone: '0812-6789-1234', tier: 'Reguler', gate: 'Gerbang Utama A', method: 'QRIS', checkedIn: false, hoursAgo: 0, mode: null },
    { name: 'Ilham Akbar Maulana', email: 'ilham.akbar@gmail.com', phone: '0818-7765-3321', tier: 'Early Bird', gate: 'Gerbang Timur B', method: 'GoPay / OVO', checkedIn: false, hoursAgo: 0, mode: null },
    { name: 'Dewi Anggraini', email: 'dewi.anggraini@gmail.com', phone: '0811-9012-5567', tier: 'Reguler', gate: 'Gerbang Utama A', method: 'Virtual Account Mandiri', checkedIn: false, hoursAgo: 0, mode: null },
    { name: 'Yusuf Mansur Hidayat', email: 'yusuf.hidayat@gmail.com', phone: '0822-3344-9988', tier: 'Backstage', gate: 'Pintu Kru & Media', method: 'Tunai Loket', checkedIn: false, hoursAgo: 0, mode: null },
    { name: 'Putri Ayu Lestari', email: 'putri.lestari@gmail.com', phone: '0813-4567-8901', tier: 'VIP', gate: 'Gerbang VIP Barat', method: 'QRIS', checkedIn: false, hoursAgo: 0, mode: null },
  ];

  const now = Date.now();
  const attendees: Attendee[] = [];
  const checkInLogs: CheckInLog[] = [];
  const transactions: PaymentTransaction[] = [];

  samplePeople.forEach((p, idx) => {
    const id = `att-${String(idx + 1).padStart(4, '0')}`;
    const ticketCode = makeTicketCode(p.tier);
    const createdTs = now - (8 + idx * 0.5) * 3600 * 1000;
    const qrToken = encryptTokenServer(
      {
        id,
        code: ticketCode,
        ev: eventId,
        tier: p.tier,
        name: p.name,
        gate: p.gate,
        ver: 1,
        ts: Math.floor(createdTs / 1000),
      },
      keyHex
    );

    const price = event.ticketPrices[p.tier];
    const checkedInAt = p.checkedIn
      ? new Date(now - p.hoursAgo * 3600 * 1000).toISOString()
      : null;

    attendees.push({
      id,
      ticketCode,
      eventId,
      fullName: p.name,
      email: p.email,
      phone: p.phone,
      tier: p.tier,
      gateAssigned: p.gate,
      qrToken,
      paymentStatus: p.tier === 'Media' ? 'complimentary' : 'paid',
      paymentMethod: p.method,
      amountPaid: price,
      checkedIn: p.checkedIn,
      checkedInAt,
      checkedInGate: p.checkedIn ? p.gate : null,
      checkedInMode: p.mode,
      revoked: false,
      createdAt: new Date(createdTs).toISOString(),
    });

    if (price > 0) {
      transactions.push({
        id: `tx-${String(idx + 1).padStart(4, '0')}`,
        invoiceNumber: `INV/20261115/${String(1001 + idx)}`,
        attendeeId: id,
        buyerName: p.name,
        buyerEmail: p.email,
        tier: p.tier,
        quantity: 1,
        amount: price,
        method: p.method,
        status: 'settled',
        createdAt: new Date(createdTs).toISOString(),
        settledAt: new Date(createdTs + 45000).toISOString(),
        referenceCode: `PAY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      });
    }

    if (p.checkedIn && checkedInAt) {
      checkInLogs.push({
        id: `chk-${String(idx + 1).padStart(4, '0')}`,
        attendeeId: id,
        ticketCode,
        fullName: p.name,
        tier: p.tier,
        gate: p.gate,
        timestamp: checkedInAt,
        mode: p.mode || 'online',
        status: 'verified',
        deviceId: p.gate === 'Gerbang VIP Barat' ? 'GATE-VIP-01' : 'GATE-MAIN-02',
      });
    }
  });

  checkInLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const notifications: OrganizerNotification[] = [
    {
      id: 'notif-1',
      type: 'vip-arrival',
      title: 'Tamu VIP Check-In',
      message: 'Hendra Gunawan (VIP) telah melewati Gerbang VIP Barat dan terverifikasi AES-256.',
      timestamp: new Date(now - 1.9 * 3600 * 1000).toISOString(),
      read: false,
      severity: 'info',
    },
    {
      id: 'notif-2',
      type: 'offline-sync',
      title: 'Sinkronisasi Gate Offline Selesai',
      message: 'Fajar Ramadhan (Reguler) disinkronkan otomatis dari antrean offline Gerbang Timur B.',
      timestamp: new Date(now - 2.4 * 3600 * 1000).toISOString(),
      read: false,
      severity: 'success',
    },
    {
      id: 'notif-3',
      type: 'payment-settled',
      title: 'Pembayaran Tiket Lunas',
      message: 'Putri Ayu Lestari menyelesaikan pembayaran VIP sebesar Rp 1.450.000 via QRIS.',
      timestamp: new Date(now - 3.1 * 3600 * 1000).toISOString(),
      read: true,
      severity: 'success',
    },
  ];

  const notificationRules: NotificationRules = {
    notifyOnVipArrival: true,
    notifyOnPayment: true,
    notifyOnSecurityAlert: true,
    notifyOnOfflineSync: true,
    capacityThresholdPercent: 80,
    browserPushEnabled: false,
  };

  const defaultUsers = buildDefaultUsers();
  const userPasswords: Record<string, string> = {};
  defaultUsers.forEach((u) => {
    userPasswords[u.id] = hashPassword(getDefaultPasswordForRole(u.role));
  });

  return {
    event,
    events: [event],
    designs,
    attendees,
    checkInLogs,
    transactions,
    notifications,
    notificationRules,
    users: defaultUsers,
    userPasswords,
    gateEncryptionKeyHex: keyHex,
    securityPinHash: hashPin('2026'),
  };
}

function loadOrCreateStore(): ServerStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(STORE_PATH)) {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const loaded = JSON.parse(raw) as ServerStore;
      const defaults = buildDefaultDesigns(loaded.event.id);
      let changed = false;
      for (const def of defaults) {
        if (!loaded.designs.some((d) => d.id === def.id)) {
          loaded.designs.push(def);
          changed = true;
        }
      }
      if (!loaded.event.organizerName) {
        loaded.event.organizerName = 'Soundscape Live Indonesia';
        changed = true;
      }
      if (!loaded.event.organizerEmail) {
        loaded.event.organizerEmail = 'idmonggo@gmail.com';
        changed = true;
      }
      if (!loaded.events || loaded.events.length === 0) {
        loaded.events = [loaded.event];
        changed = true;
      }
      for (const ev of loaded.events) {
        if (!ev.organizerName) {
          ev.organizerName = 'Soundscape Live Indonesia';
          changed = true;
        }
        if (!ev.organizerEmail) {
          ev.organizerEmail = 'idmonggo@gmail.com';
          changed = true;
        }
      }
      if (!loaded.users || loaded.users.length === 0) {
        loaded.users = buildDefaultUsers(loaded.event.id);
        changed = true;
      }
      if (!loaded.userPasswords) {
        loaded.userPasswords = {};
        changed = true;
      }
      const allKnownEventIds = loaded.events.map((e) => e.id);
      for (const u of loaded.users) {
        if (u.id === 'usr-admin-1' && !u.isOwner) {
          u.isOwner = true;
          u.organizationName = u.organizationName || 'GelangPass Pusat';
          u.assignedEventIds = ['*'];
          changed = true;
        }
        if (!u.organizationName) {
          u.organizationName = u.isOwner ? 'GelangPass Pusat' : loaded.event.organizerName || 'Soundscape Live Indonesia';
          changed = true;
        }
        if (!Array.isArray(u.assignedEventIds) || u.assignedEventIds.length === 0) {
          u.assignedEventIds = u.isOwner ? ['*'] : [allKnownEventIds[0] || loaded.event.id];
          changed = true;
        }
        if (!loaded.userPasswords[u.id]) {
          loaded.userPasswords[u.id] = hashPassword(getDefaultPasswordForRole(u.role));
          changed = true;
        }
      }
      for (const l of loaded.checkInLogs) {
        if (!l.eventId) {
          l.eventId = loaded.event.id;
          changed = true;
        }
      }
      for (const t of loaded.transactions) {
        if (!t.eventId) {
          t.eventId = loaded.event.id;
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(STORE_PATH, JSON.stringify(loaded, null, 2), 'utf8');
      }
      return loaded;
    } catch {
      // Fallback to fresh seed if store is corrupted
    }
  }
  const initial = seedInitialStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
  return initial;
}

const store: ServerStore = loadOrCreateStore();

function persistStore() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

interface WsClientMeta {
  sessionId: string;
  eventId: string;
  userId: string;
  connectedAt: string;
}

const wsClients = new Map<WebSocket, WsClientMeta>();

function getOnlineSessionsForEvent(eventId?: string): ActiveSessionInfo[] {
  const sessions: ActiveSessionInfo[] = [];
  wsClients.forEach((meta, client) => {
    if (client.readyState !== WebSocket.OPEN || !meta.userId) return;
    if (eventId && meta.eventId !== eventId) return;
    const usr = store.users.find((u) => u.id === meta.userId && u.active);
    if (!usr) return;
    sessions.push({
      sessionId: meta.sessionId,
      userId: usr.id,
      fullName: usr.fullName,
      role: usr.role,
      organizationName: usr.organizationName,
      assignedGate: usr.assignedGate,
      eventId: meta.eventId,
      connectedAt: meta.connectedAt,
    });
  });
  return sessions;
}

function getClientSnapshot(requestedEventId?: string, actorUserId?: string): AppStateSnapshot {
  const { securityPinHash: _pin, userPasswords: _pw, ...rest } = store;
  const actor = actorUserId ? store.users.find((u) => u.id === actorUserId) : undefined;

  const accessibleEvents =
    actor && !hasAllEventsAccess(actor)
      ? store.events.filter((ev) => canUserAccessEvent(actor, ev.id))
      : store.events;

  let targetEvent =
    (requestedEventId && store.events.find((e) => e.id === requestedEventId)) || store.event;

  if (actor && !canUserAccessEvent(actor, targetEvent.id)) {
    targetEvent = accessibleEvents[0] || store.event;
  }

  const activeEventId = targetEvent.id;
  const scopedUsers = actor
    ? store.users.filter((u) => usersShareOrganizerScope(actor, u))
    : store.users;

  const scopedNotifications = actor
    ? store.notifications.filter((n) => !n.eventId || canUserAccessEvent(actor, n.eventId))
    : store.notifications;

  return {
    ...rest,
    event: targetEvent,
    events: accessibleEvents.length > 0 ? accessibleEvents : [targetEvent],
    attendees: store.attendees.filter((a) => a.eventId === activeEventId),
    checkInLogs: store.checkInLogs.filter((l) => !l.eventId || l.eventId === activeEventId),
    transactions: store.transactions.filter((t) => !t.eventId || t.eventId === activeEventId),
    users: scopedUsers,
    notifications: scopedNotifications,
    onlineSessions: getOnlineSessionsForEvent(activeEventId),
    securityPinConfigured: Boolean(_pin),
  };
}

function resolveRequestContext(req: express.Request): {
  actor?: PlatformUser;
  targetEvent: EventInfo;
} {
  const rawUserId =
    (typeof req.headers['x-user-id'] === 'string' && req.headers['x-user-id']) ||
    (typeof req.query.userId === 'string' && req.query.userId) ||
    '';
  const rawEventId =
    (typeof req.headers['x-event-id'] === 'string' && req.headers['x-event-id']) ||
    (typeof req.query.eventId === 'string' && req.query.eventId) ||
    '';

  const actor = rawUserId ? store.users.find((u) => u.id === rawUserId) : undefined;
  let targetEvent =
    (rawEventId && store.events.find((e) => e.id === rawEventId)) || store.event;

  if (actor && !canUserAccessEvent(actor, targetEvent.id)) {
    const firstAllowed = store.events.find((e) => canUserAccessEvent(actor, e.id));
    if (firstAllowed) targetEvent = firstAllowed;
  }

  return { actor, targetEvent };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  function broadcast(type: string, payload: unknown, targetEventId?: string) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (targetEventId) {
        const meta = wsClients.get(client);
        if (meta && meta.eventId !== targetEventId) return;
      }
      client.send(message);
    });
  }

  function broadcastPresenceForEvent(eventId: string) {
    broadcast('presence:updated', getOnlineSessionsForEvent(eventId), eventId);
  }

  function broadcastScopedSnapshots(changedEventIds?: string[]) {
    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const meta = wsClients.get(client);
      if (changedEventIds && meta && !changedEventIds.includes(meta.eventId)) {
        // Still send updated events/users list if user belongs to platform
      }
      const snap = getClientSnapshot(meta?.eventId, meta?.userId || undefined);
      client.send(
        JSON.stringify({
          type: 'snapshot:replaced',
          payload: snap,
          timestamp: new Date().toISOString(),
        })
      );
    });
  }

  function pushNotification(
    notif: Omit<OrganizerNotification, 'id' | 'timestamp' | 'read'>
  ) {
    const created: OrganizerNotification = {
      ...notif,
      id: `notif-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    store.notifications.unshift(created);
    if (store.notifications.length > 80) {
      store.notifications = store.notifications.slice(0, 80);
    }
    broadcast('notification:new', created, created.eventId);
    return created;
  }

  wss.on('connection', (ws, req) => {
    const parsedUrl = new URL(req.url || '/ws', 'http://localhost');
    const reqEventId = parsedUrl.searchParams.get('eventId') || store.event.id;
    const reqUserId = parsedUrl.searchParams.get('userId') || '';
    const actor = reqUserId ? store.users.find((u) => u.id === reqUserId && u.active) : undefined;
    let resolvedEventId =
      store.events.some((e) => e.id === reqEventId) ? reqEventId : store.event.id;
    if (actor && !canUserAccessEvent(actor, resolvedEventId)) {
      const firstAllowed = store.events.find((e) => canUserAccessEvent(actor, e.id));
      if (firstAllowed) resolvedEventId = firstAllowed.id;
    }

    const meta: WsClientMeta = {
      sessionId: crypto.randomUUID().slice(0, 8),
      eventId: resolvedEventId,
      userId: actor?.id || '',
      connectedAt: new Date().toISOString(),
    };
    wsClients.set(ws, meta);

    ws.send(
      JSON.stringify({
        type: 'init',
        payload: getClientSnapshot(meta.eventId, meta.userId || undefined),
        timestamp: new Date().toISOString(),
      })
    );
    if (meta.userId) {
      broadcastPresenceForEvent(meta.eventId);
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          eventId?: string;
          userId?: string;
        };
        if (msg.type === 'session:context') {
          const prevEventId = meta.eventId;
          const nextActor = msg.userId
            ? store.users.find((u) => u.id === msg.userId && u.active)
            : undefined;
          let nextEventId =
            msg.eventId && store.events.some((e) => e.id === msg.eventId)
              ? msg.eventId
              : store.event.id;
          if (nextActor && !canUserAccessEvent(nextActor, nextEventId)) {
            const allowed = store.events.find((e) => canUserAccessEvent(nextActor, e.id));
            if (allowed) nextEventId = allowed.id;
          }
          meta.userId = nextActor?.id || '';
          meta.eventId = nextEventId;
          ws.send(
            JSON.stringify({
              type: 'init',
              payload: getClientSnapshot(meta.eventId, meta.userId || undefined),
              timestamp: new Date().toISOString(),
            })
          );
          if (prevEventId !== nextEventId) {
            broadcastPresenceForEvent(prevEventId);
          }
          broadcastPresenceForEvent(nextEventId);
        }
      } catch {
        // Ignore malformed WS control message
      }
    });

    ws.on('close', () => {
      const prevMeta = wsClients.get(ws);
      wsClients.delete(ws);
      if (prevMeta?.userId) {
        broadcastPresenceForEvent(prevMeta.eventId);
      }
    });
  });

  app.get('/api/state', (req, res) => {
    const { actor, targetEvent } = resolveRequestContext(req);
    res.json(getClientSnapshot(targetEvent.id, actor?.id));
  });

  app.post('/api/tickets/checkout', (req, res) => {
    const {
      fullName,
      email,
      phone,
      tier,
      quantity = 1,
      gateAssigned,
      paymentMethod,
    } = req.body as {
      fullName: string;
      email: string;
      phone: string;
      tier: TicketTier;
      quantity?: number;
      gateAssigned?: string;
      paymentMethod: PaymentMethod;
    };

    if (!fullName || !tier || !paymentMethod) {
      res.status(400).json({ error: 'Nama pengunjung, kategori tiket, dan metode pembayaran wajib diisi.' });
      return;
    }

    const { targetEvent } = resolveRequestContext(req);
    const qty = Math.max(1, Math.min(20, Number(quantity) || 1));
    const matchedCat = targetEvent.categories?.find((c) => c.name === tier);
    const unitPrice = matchedCat?.price ?? targetEvent.ticketPrices[tier] ?? 0;
    const totalAmount = unitPrice * qty;
    const createdAttendees: Attendee[] = [];
    const nowIso = new Date().toISOString();

    for (let i = 0; i < qty; i++) {
      const id = `att-${crypto.randomUUID().slice(0, 8)}`;
      const ticketCode = makeTicketCode(tier);
      const holderName = qty > 1 ? `${fullName} #${i + 1}` : fullName;
      const defaultGate =
        gateAssigned ||
        matchedCat?.defaultGate ||
        targetEvent.gates[0] ||
        'Gerbang Utama A';

      const qrToken = encryptTokenServer(
        {
          id,
          code: ticketCode,
          ev: targetEvent.id,
          tier,
          name: holderName,
          gate: defaultGate,
          ver: targetEvent.encryptionKeyVersion,
          ts: Math.floor(Date.now() / 1000),
        },
        store.gateEncryptionKeyHex
      );

      const attendee: Attendee = {
        id,
        ticketCode,
        eventId: targetEvent.id,
        fullName: holderName,
        email: email || '-',
        phone: phone || '-',
        tier,
        gateAssigned: defaultGate,
        qrToken,
        paymentStatus: totalAmount === 0 ? 'complimentary' : 'paid',
        paymentMethod,
        amountPaid: unitPrice,
        checkedIn: false,
        checkedInAt: null,
        checkedInGate: null,
        checkedInMode: null,
        revoked: false,
        createdAt: nowIso,
      };
      store.attendees.unshift(attendee);
      createdAttendees.push(attendee);
      broadcast('attendee:created', attendee, targetEvent.id);
    }

    const tx: PaymentTransaction = {
      id: `tx-${crypto.randomUUID().slice(0, 8)}`,
      eventId: targetEvent.id,
      invoiceNumber: `INV/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/${Math.floor(1000 + Math.random() * 9000)}`,
      attendeeId: createdAttendees[0].id,
      buyerName: fullName,
      buyerEmail: email || '-',
      tier,
      quantity: qty,
      amount: totalAmount,
      method: paymentMethod,
      status: 'settled',
      createdAt: nowIso,
      settledAt: nowIso,
      referenceCode: `PAY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    };
    store.transactions.unshift(tx);
    broadcast('payment:completed', tx, targetEvent.id);

    if (store.notificationRules.notifyOnPayment) {
      pushNotification({
        eventId: targetEvent.id,
        type: 'payment-settled',
        title: 'Transaksi Tiket Berhasil',
        message: `${fullName} membeli ${qty}x gelang ${tier} (${paymentMethod}) senilai Rp ${totalAmount.toLocaleString('id-ID')}.`,
        severity: 'success',
      });
    }

    persistStore();
    res.json({ attendees: createdAttendees, transaction: tx });
  });

  app.post('/api/attendees/batch', (req, res) => {
    const { targetEvent } = resolveRequestContext(req);
    const { prefixName, tier, count, gateAssigned } = req.body as {
      prefixName: string;
      tier: TicketTier;
      count: number;
      gateAssigned: string;
    };
    const safeCount = Math.max(1, Math.min(50, Number(count) || 1));
    const created: Attendee[] = [];
    const nowIso = new Date().toISOString();

    for (let i = 1; i <= safeCount; i++) {
      const id = `att-${crypto.randomUUID().slice(0, 8)}`;
      const ticketCode = makeTicketCode(tier);
      const fullName = `${prefixName || 'Tamu Undangan'} #${String(i).padStart(2, '0')}`;
      const qrToken = encryptTokenServer(
        {
          id,
          code: ticketCode,
          ev: targetEvent.id,
          tier,
          name: fullName,
          gate: gateAssigned || targetEvent.gates[0],
          ver: targetEvent.encryptionKeyVersion,
          ts: Math.floor(Date.now() / 1000),
        },
        store.gateEncryptionKeyHex
      );

      const att: Attendee = {
        id,
        ticketCode,
        eventId: targetEvent.id,
        fullName,
        email: '-',
        phone: '-',
        tier,
        gateAssigned: gateAssigned || targetEvent.gates[0],
        qrToken,
        paymentStatus: 'complimentary',
        paymentMethod: 'Tunai Loket',
        amountPaid: 0,
        checkedIn: false,
        checkedInAt: null,
        checkedInGate: null,
        checkedInMode: null,
        revoked: false,
        createdAt: nowIso,
      };
      store.attendees.unshift(att);
      created.push(att);
      broadcast('attendee:created', att, targetEvent.id);
    }

    persistStore();
    res.json({ created });
  });

  app.patch('/api/attendees/:id', (req, res) => {
    const { id } = req.params;
    const { revoked, gateAssigned, tier } = req.body as Partial<Attendee>;
    const attendee = store.attendees.find((a) => a.id === id);
    if (!attendee) {
      res.status(404).json({ error: 'Pengunjung tidak ditemukan.' });
      return;
    }

    if (typeof revoked === 'boolean') {
      attendee.revoked = revoked;
      if (revoked && store.notificationRules.notifyOnSecurityAlert) {
        pushNotification({
          eventId: attendee.eventId,
          type: 'security-alert',
          title: 'Gelang Dinonaktifkan',
          message: `Akses gelang ${attendee.ticketCode} (${attendee.fullName}) telah diblokir oleh penyelenggara.`,
          severity: 'warning',
        });
      }
    }
    if (gateAssigned) attendee.gateAssigned = gateAssigned;
    if (tier) attendee.tier = tier;

    persistStore();
    broadcast('attendee:updated', attendee, attendee.eventId);
    res.json({ attendee });
  });

  app.post('/api/checkin', (req, res) => {
    const { actor, targetEvent } = resolveRequestContext(req);
    const { qrToken, ticketCode, gate, deviceId = 'GATE-TERM-01' } = req.body as {
      qrToken?: string;
      ticketCode?: string;
      gate?: string;
      deviceId?: string;
    };

    const activeGate = gate || targetEvent.gates[0];
    let targetAttendee: Attendee | undefined;

    if (qrToken && qrToken.startsWith('GP1.')) {
      const decrypted = decryptTokenServer(qrToken, store.gateEncryptionKeyHex);
      if (!decrypted.valid || !decrypted.payload) {
        const failLog: CheckInLog = {
          id: `chk-${crypto.randomUUID().slice(0, 8)}`,
          eventId: targetEvent.id,
          attendeeId: 'unknown',
          ticketCode: 'INVALID-QR',
          fullName: 'Token Tidak Terverifikasi',
          tier: 'Reguler',
          gate: activeGate,
          timestamp: new Date().toISOString(),
          mode: 'online',
          status: 'invalid-signature',
          deviceId,
          verifiedByName: actor?.fullName,
        };
        store.checkInLogs.unshift(failLog);
        broadcast('checkin:log', failLog, targetEvent.id);
        if (store.notificationRules.notifyOnSecurityAlert) {
          pushNotification({
            eventId: targetEvent.id,
            type: 'security-alert',
            title: 'Deteksi QR Tidak Sah',
            message: `${decrypted.reason || 'QR gagal dekripsi'} di ${activeGate}.`,
            severity: 'critical',
          });
        }
        persistStore();
        res.status(400).json({ ok: false, status: 'invalid-signature', message: decrypted.reason, log: failLog });
        return;
      }
      targetAttendee = store.attendees.find(
        (a) =>
          a.eventId === targetEvent.id &&
          (a.id === decrypted.payload!.id || a.ticketCode === decrypted.payload!.code)
      );
      if (!targetAttendee && decrypted.payload.ev !== targetEvent.id) {
        res.status(404).json({
          ok: false,
          status: 'not-found',
          message: `Gelang QR terdaftar untuk acara berbeda (${decrypted.payload.ev}). Aktifkan acara terkait untuk memindai.`,
        });
        return;
      }
    } else if (ticketCode || qrToken) {
      const lookup = (ticketCode || qrToken || '').trim().toUpperCase();
      targetAttendee = store.attendees.find(
        (a) =>
          a.eventId === targetEvent.id &&
          (a.ticketCode.toUpperCase() === lookup || a.id.toUpperCase() === lookup)
      );
    }

    if (!targetAttendee) {
      res.status(404).json({ ok: false, status: 'not-found', message: 'Kode gelang tiket tidak ditemukan di basis data acara aktif.' });
      return;
    }

    if (targetAttendee.revoked) {
      const revokedLog: CheckInLog = {
        id: `chk-${crypto.randomUUID().slice(0, 8)}`,
        eventId: targetEvent.id,
        attendeeId: targetAttendee.id,
        ticketCode: targetAttendee.ticketCode,
        fullName: targetAttendee.fullName,
        tier: targetAttendee.tier,
        gate: activeGate,
        timestamp: new Date().toISOString(),
        mode: 'online',
        status: 'revoked-blocked',
        deviceId,
        verifiedByName: actor?.fullName,
      };
      store.checkInLogs.unshift(revokedLog);
      broadcast('checkin:log', revokedLog, targetEvent.id);
      if (store.notificationRules.notifyOnSecurityAlert) {
        pushNotification({
          eventId: targetEvent.id,
          type: 'security-alert',
          title: 'Percobaan Masuk Gelang Diblokir',
          message: `${targetAttendee.fullName} (${targetAttendee.ticketCode}) mencoba masuk di ${activeGate} dengan gelang yang telah dinonaktifkan.`,
          severity: 'critical',
        });
      }
      persistStore();
      res.status(403).json({
        ok: false,
        status: 'revoked-blocked',
        message: 'Gelang ini telah dinonaktifkan / diblokir oleh penyelenggara.',
        attendee: targetAttendee,
        log: revokedLog,
      });
      return;
    }

    if (targetAttendee.checkedIn) {
      const dupLog: CheckInLog = {
        id: `chk-${crypto.randomUUID().slice(0, 8)}`,
        eventId: targetEvent.id,
        attendeeId: targetAttendee.id,
        ticketCode: targetAttendee.ticketCode,
        fullName: targetAttendee.fullName,
        tier: targetAttendee.tier,
        gate: activeGate,
        timestamp: new Date().toISOString(),
        mode: 'online',
        status: 'duplicate-blocked',
        deviceId,
        verifiedByName: actor?.fullName,
      };
      store.checkInLogs.unshift(dupLog);
      broadcast('checkin:log', dupLog, targetEvent.id);
      if (store.notificationRules.notifyOnSecurityAlert) {
        pushNotification({
          eventId: targetEvent.id,
          type: 'security-alert',
          title: 'Deteksi Scan Ganda',
          message: `Gelang ${targetAttendee.ticketCode} (${targetAttendee.fullName}) sudah check-in sebelumnya pada ${new Date(targetAttendee.checkedInAt || '').toLocaleTimeString('id-ID')}.`,
          severity: 'warning',
        });
      }
      persistStore();
      res.status(409).json({
        ok: false,
        status: 'duplicate-blocked',
        message: `Gelang sudah digunakan di ${targetAttendee.checkedInGate || 'gerbang lain'}.`,
        attendee: targetAttendee,
        log: dupLog,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    targetAttendee.checkedIn = true;
    targetAttendee.checkedInAt = nowIso;
    targetAttendee.checkedInGate = activeGate;
    targetAttendee.checkedInMode = 'online';

    const log: CheckInLog = {
      id: `chk-${crypto.randomUUID().slice(0, 8)}`,
      eventId: targetEvent.id,
      attendeeId: targetAttendee.id,
      ticketCode: targetAttendee.ticketCode,
      fullName: targetAttendee.fullName,
      tier: targetAttendee.tier,
      gate: activeGate,
      timestamp: nowIso,
      mode: 'online',
      status: 'verified',
      deviceId,
      verifiedByName: actor?.fullName,
    };
    store.checkInLogs.unshift(log);

    if ((targetAttendee.tier === 'VIP' || targetAttendee.tier === 'Backstage') && store.notificationRules.notifyOnVipArrival) {
      pushNotification({
        eventId: targetEvent.id,
        type: 'vip-arrival',
        title: `Tamu ${targetAttendee.tier} Tiba`,
        message: `${targetAttendee.fullName} (${targetAttendee.ticketCode}) baru saja check-in melalui ${activeGate}.`,
        severity: 'info',
      });
    }

    const eventAttendees = store.attendees.filter((a) => a.eventId === targetEvent.id);
    const checkedInCount = eventAttendees.filter((a) => a.checkedIn).length;
    const occupancyPct = Math.round((checkedInCount / Math.max(1, eventAttendees.length)) * 100);
    if (occupancyPct >= store.notificationRules.capacityThresholdPercent) {
      const alreadyNotified = store.notifications.some(
        (n) =>
          n.eventId === targetEvent.id &&
          n.type === 'capacity-alert' &&
          Date.now() - new Date(n.timestamp).getTime() < 15 * 60 * 1000
      );
      if (!alreadyNotified) {
        pushNotification({
          eventId: targetEvent.id,
          type: 'capacity-alert',
          title: `Ambang Kehadiran ${occupancyPct}% Tercapai`,
          message: `${checkedInCount} dari ${eventAttendees.length} pemegang gelang telah masuk area acara.`,
          severity: 'warning',
        });
      }
    }

    persistStore();
    broadcast('attendee:checked_in', { attendee: targetAttendee, log }, targetEvent.id);
    res.json({ ok: true, status: 'verified', attendee: targetAttendee, log });
  });

  app.post('/api/checkin/sync', (req, res) => {
    const { actor, targetEvent } = resolveRequestContext(req);
    const { checkIns = [], orders = [] } = req.body as {
      checkIns?: PendingOfflineCheckIn[];
      orders?: PendingOfflineOrder[];
    };

    let syncedOrders = 0;
    let syncedCheckIns = 0;

    for (const ord of orders) {
      const exists = store.attendees.some((a) => a.ticketCode === ord.ticketCode);
      if (!exists) {
        const id = `att-${crypto.randomUUID().slice(0, 8)}`;
        const attendee: Attendee = {
          id,
          ticketCode: ord.ticketCode,
          eventId: targetEvent.id,
          fullName: ord.fullName,
          email: ord.email || '-',
          phone: ord.phone || '-',
          tier: ord.tier,
          gateAssigned: ord.gateAssigned,
          qrToken: ord.qrToken,
          paymentStatus: ord.amountPaid === 0 ? 'complimentary' : 'paid',
          paymentMethod: ord.paymentMethod,
          amountPaid: ord.amountPaid,
          checkedIn: false,
          checkedInAt: null,
          checkedInGate: null,
          checkedInMode: null,
          revoked: false,
          createdAt: ord.createdAt,
        };
        store.attendees.unshift(attendee);
        if (ord.amountPaid > 0) {
          store.transactions.unshift({
            id: `tx-off-${crypto.randomUUID().slice(0, 6)}`,
            eventId: targetEvent.id,
            invoiceNumber: `INV/OFF/${ord.ticketCode.slice(-4)}`,
            attendeeId: id,
            buyerName: ord.fullName,
            buyerEmail: ord.email || '-',
            tier: ord.tier,
            quantity: 1,
            amount: ord.amountPaid,
            method: ord.paymentMethod,
            status: 'settled',
            createdAt: ord.createdAt,
            settledAt: ord.createdAt,
            referenceCode: `OFF-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
          });
        }
        syncedOrders++;
      }
    }

    for (const item of checkIns) {
      const logExists = store.checkInLogs.some((l) => l.id === item.id);
      if (logExists) continue;

      const att = store.attendees.find(
        (a) => a.eventId === targetEvent.id && (a.id === item.attendeeId || a.ticketCode === item.ticketCode)
      );
      if (att && !att.checkedIn && !att.revoked) {
        att.checkedIn = true;
        att.checkedInAt = item.timestamp;
        att.checkedInGate = item.gate;
        att.checkedInMode = 'offline-synced';
      }

      store.checkInLogs.unshift({
        id: item.id,
        eventId: targetEvent.id,
        attendeeId: att?.id || item.attendeeId,
        ticketCode: item.ticketCode,
        fullName: att?.fullName || item.fullName,
        tier: att?.tier || item.tier,
        gate: item.gate,
        timestamp: item.timestamp,
        mode: 'offline-synced',
        status: 'verified',
        deviceId: item.deviceId,
        verifiedByName: actor?.fullName,
      });
      syncedCheckIns++;
    }

    if ((syncedCheckIns > 0 || syncedOrders > 0) && store.notificationRules.notifyOnOfflineSync) {
      pushNotification({
        eventId: targetEvent.id,
        type: 'offline-sync',
        title: 'Rekonsiliasi Data Offline Berhasil',
        message: `${syncedCheckIns} check-in offline dan ${syncedOrders} transaksi loket telah disinkronkan ke server pusat.`,
        severity: 'success',
      });
    }

    store.checkInLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    persistStore();

    const snapshot = getClientSnapshot(targetEvent.id, actor?.id);
    broadcast('offline:batch_synced', snapshot, targetEvent.id);
    res.json({ syncedCheckIns, syncedOrders, snapshot });
  });

  app.post('/api/designs', (req, res) => {
    const { targetEvent } = resolveRequestContext(req);
    const design = req.body as WristbandDesign;
    if (!design || !design.name) {
      res.status(400).json({ error: 'Data desain gelang tidak lengkap.' });
      return;
    }

    const existingIdx = store.designs.findIndex((d) => d.id === design.id);
    const updatedDesign: WristbandDesign = {
      ...design,
      id: design.id || `dsn-${crypto.randomUUID().slice(0, 8)}`,
      eventId: targetEvent.id,
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      store.designs[existingIdx] = updatedDesign;
    } else {
      store.designs.unshift(updatedDesign);
    }

    targetEvent.activeDesignId = updatedDesign.id;
    if (store.event.id === targetEvent.id) {
      store.event.activeDesignId = updatedDesign.id;
    }

    persistStore();
    broadcast('design:saved', { design: updatedDesign, activeDesignId: targetEvent.activeDesignId }, targetEvent.id);
    res.json({ design: updatedDesign, activeDesignId: targetEvent.activeDesignId });
  });

  app.post('/api/events', (req, res) => {
    const { actor, targetEvent: baseEvent } = resolveRequestContext(req);
    if (actor && actor.role !== 'administrator') {
      res.status(403).json({ error: 'Hanya Administrator penyelenggara yang dapat menambahkan acara baru.' });
      return;
    }

    const {
      title,
      subtitle,
      organizerName,
      venue,
      dateLabel,
      capacity = 1000,
      gates,
      activeDesignId,
      categoryPreset = 'standard',
      activateImmediately = true,
    } = req.body as {
      title: string;
      subtitle?: string;
      organizerName?: string;
      venue: string;
      dateLabel: string;
      capacity?: number;
      gates?: string[];
      activeDesignId?: string;
      categoryPreset?: 'standard' | 'school' | 'business' | 'clone';
      activateImmediately?: boolean;
    };

    if (!title?.trim() || !venue?.trim() || !dateLabel?.trim()) {
      res.status(400).json({ error: 'Nama acara, lokasi venue, dan tanggal acara wajib diisi.' });
      return;
    }

    const cleanGates =
      Array.isArray(gates) && gates.length > 0
        ? gates.map((g) => g.trim()).filter(Boolean)
        : ['Gerbang Utama A', 'Gerbang VIP Barat', 'Pintu Panitia'];
    const safeGates = cleanGates.length > 0 ? cleanGates : ['Gerbang Utama A'];
    const mainGate = safeGates[0];
    const vipGate = safeGates[1] || safeGates[0];
    const staffGate = safeGates[2] || safeGates[safeGates.length - 1];

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    const id = `ev-${slug || 'acara'}-${crypto.randomBytes(2).toString('hex')}`;

    let categories: TicketCategory[];
    if (categoryPreset === 'school') {
      categories = [
        { id: `cat-${id}-1`, name: 'Siswa / Pelajar', price: 75000, defaultGate: mainGate, quota: 600, active: true },
        { id: `cat-${id}-2`, name: 'Umum / Wali', price: 125000, defaultGate: mainGate, quota: 300, active: true },
        { id: `cat-${id}-3`, name: 'Guru & Panitia', price: 0, defaultGate: staffGate, quota: 100, active: true },
      ];
    } else if (categoryPreset === 'business') {
      categories = [
        { id: `cat-${id}-1`, name: 'Eksekutif VIP', price: 1850000, defaultGate: vipGate, quota: 200, active: true },
        { id: `cat-${id}-2`, name: 'Delegasi Reguler', price: 650000, defaultGate: mainGate, quota: 800, active: true },
        { id: `cat-${id}-3`, name: 'Media & Sponsor', price: 0, defaultGate: staffGate, quota: 120, active: true },
      ];
    } else if (categoryPreset === 'clone') {
      categories = baseEvent.categories.map((c, idx) => ({
        ...c,
        id: `cat-${id}-${idx + 1}`,
        defaultGate: safeGates.includes(c.defaultGate) ? c.defaultGate : mainGate,
      }));
    } else {
      categories = [
        { id: `cat-${id}-1`, name: 'VIP', price: 850000, defaultGate: vipGate, quota: 250, active: true },
        { id: `cat-${id}-2`, name: 'Reguler', price: 350000, defaultGate: mainGate, quota: 900, active: true },
        { id: `cat-${id}-3`, name: 'Early Bird', price: 225000, defaultGate: mainGate, quota: 300, active: true },
      ];
    }

    const ticketPrices: Record<string, number> = {};
    categories.forEach((c) => {
      ticketPrices[c.name] = c.price;
    });

    const resolvedDesignId =
      activeDesignId && store.designs.some((d) => d.id === activeDesignId)
        ? activeDesignId
        : baseEvent.activeDesignId || store.designs[0]?.id || 'dsn-festival-cobalt';

    const newEvent: EventInfo = {
      id,
      title: title.trim(),
      subtitle: subtitle?.trim() || 'Acara Resmi GelangPass',
      organizerName: organizerName?.trim() || actor?.organizationName || 'GelangPass Live Organizer',
      organizerEmail: actor?.email || 'idmonggo@gmail.com',
      venue: venue.trim(),
      dateLabel: dateLabel.trim(),
      capacity: Math.max(10, Number(capacity) || 1000),
      gates: safeGates,
      activeDesignId: resolvedDesignId,
      ticketPrices,
      categories,
      encryptionKeyVersion: store.event.encryptionKeyVersion || 1,
    };

    store.events.unshift(newEvent);
    if (actor && !hasAllEventsAccess(actor)) {
      actor.assignedEventIds = Array.from(new Set([...(actor.assignedEventIds || []), newEvent.id]));
      broadcast('user:updated', actor);
    }

    if (activateImmediately && (!actor || hasAllEventsAccess(actor))) {
      store.event = newEvent;
    }

    pushNotification({
      eventId: newEvent.id,
      type: 'offline-sync',
      title: 'Acara / Event Baru Ditambahkan',
      message: `${newEvent.title} oleh ${newEvent.organizerName} di ${newEvent.venue} (${newEvent.dateLabel}) telah dibuat.`,
      severity: 'success',
    });

    persistStore();
    const responseSnapshot = getClientSnapshot(activateImmediately ? newEvent.id : baseEvent.id, actor?.id);
    broadcastScopedSnapshots([newEvent.id]);
    res.json({ event: newEvent, snapshot: responseSnapshot });
  });

  app.post('/api/events/:id/activate', (req, res) => {
    const { actor } = resolveRequestContext(req);
    const { id } = req.params;
    const found = store.events.find((e) => e.id === id);
    if (!found) {
      res.status(404).json({ error: 'Acara / event tidak ditemukan.' });
      return;
    }
    if (actor && !canUserAccessEvent(actor, found.id)) {
      res.status(403).json({ error: 'Anda tidak memiliki izin akses untuk acara milik penyelenggara lain.' });
      return;
    }
    if (!actor || hasAllEventsAccess(actor)) {
      store.event = found;
      persistStore();
      broadcastScopedSnapshots([found.id]);
    }
    res.json({ snapshot: getClientSnapshot(found.id, actor?.id) });
  });

  app.delete('/api/events/:id', (req, res) => {
    const { actor } = resolveRequestContext(req);
    if (actor && actor.role !== 'administrator') {
      res.status(403).json({ error: 'Hanya Administrator yang dapat menghapus acara.' });
      return;
    }
    const { id } = req.params;
    if (store.events.length <= 1) {
      res.status(400).json({ error: 'Minimal harus tersedia 1 acara aktif di platform.' });
      return;
    }
    const found = store.events.find((e) => e.id === id);
    if (!found) {
      res.status(404).json({ error: 'Acara / event tidak ditemukan.' });
      return;
    }
    if (actor && !canUserAccessEvent(actor, found.id)) {
      res.status(403).json({ error: 'Anda tidak dapat menghapus acara milik penyelenggara lain.' });
      return;
    }

    store.events = store.events.filter((e) => e.id !== id);
    store.attendees = store.attendees.filter((a) => a.eventId !== id);
    store.checkInLogs = store.checkInLogs.filter((l) => l.eventId !== id);
    store.transactions = store.transactions.filter((t) => t.eventId !== id);
    store.users.forEach((u) => {
      if (Array.isArray(u.assignedEventIds)) {
        u.assignedEventIds = u.assignedEventIds.filter((evId) => evId !== id);
      }
    });
    if (store.event.id === id) {
      store.event = store.events[0];
    }

    persistStore();
    const snapshot = getClientSnapshot(store.event.id, actor?.id);
    broadcastScopedSnapshots([id]);
    res.json({ ok: true, snapshot });
  });

  app.patch('/api/events/:id', (req, res) => {
    const { actor } = resolveRequestContext(req);
    if (actor && actor.role !== 'administrator') {
      res.status(403).json({ error: 'Hanya Administrator yang dapat mengubah data acara.' });
      return;
    }
    const { id } = req.params;
    const target = store.events.find((e) => e.id === id) || (store.event.id === id ? store.event : undefined);
    if (!target) {
      res.status(404).json({ error: 'Acara / event tidak ditemukan.' });
      return;
    }
    if (actor && !canUserAccessEvent(actor, target.id)) {
      res.status(403).json({ error: 'Anda tidak memiliki otorisasi untuk mengubah acara penyelenggara lain.' });
      return;
    }

    const {
      title,
      subtitle,
      organizerName,
      venue,
      dateLabel,
      capacity,
      gates,
      activeDesignId,
      ticketPrices,
      categories,
    } = req.body as Partial<EventInfo>;
    if (title?.trim()) target.title = title.trim();
    if (typeof subtitle === 'string') target.subtitle = subtitle.trim() || target.subtitle;
    if (organizerName?.trim()) target.organizerName = organizerName.trim();
    if (venue?.trim()) target.venue = venue.trim();
    if (dateLabel?.trim()) target.dateLabel = dateLabel.trim();
    if (typeof capacity === 'number' && capacity > 0) target.capacity = capacity;
    if (Array.isArray(gates) && gates.length > 0) {
      const cleaned = gates.map((g) => g.trim()).filter(Boolean);
      if (cleaned.length > 0) target.gates = cleaned;
    }
    if (activeDesignId) target.activeDesignId = activeDesignId;
    if (Array.isArray(categories) && categories.length > 0) {
      target.categories = categories;
      const syncedPrices: Record<string, number> = {};
      categories.forEach((cat) => {
        syncedPrices[cat.name] = Math.max(0, Number(cat.price) || 0);
      });
      target.ticketPrices = syncedPrices;
    } else if (ticketPrices) {
      target.ticketPrices = ticketPrices;
      target.categories = target.categories.map((cat) => ({
        ...cat,
        price: ticketPrices[cat.name] ?? cat.price,
      }));
    }

    if (store.event.id === target.id) {
      store.event = target;
    }

    persistStore();
    const snapshot = getClientSnapshot(target.id, actor?.id);
    broadcastScopedSnapshots([target.id]);
    res.json({ event: target, snapshot });
  });

  app.post('/api/auth/register-organizer', (req, res) => {
    const {
      organizerName,
      fullName,
      email,
      password,
      eventTitle,
      eventVenue,
      eventDateLabel,
      capacity = 1000,
    } = req.body as {
      organizerName?: string;
      fullName?: string;
      email?: string;
      password?: string;
      eventTitle?: string;
      eventVenue?: string;
      eventDateLabel?: string;
      capacity?: number;
    };

    if (
      !organizerName?.trim() ||
      !fullName?.trim() ||
      !email?.trim() ||
      !password?.trim() ||
      !eventTitle?.trim() ||
      !eventVenue?.trim() ||
      !eventDateLabel?.trim()
    ) {
      res.status(400).json({
        error: 'Nama penyelenggara, nama admin, email, kata sandi, dan detail acara awal wajib diisi lengkap.',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (store.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk atau gunakan email lain.' });
      return;
    }

    const slug = eventTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    const eventId = `ev-${slug || 'acara'}-${crypto.randomBytes(2).toString('hex')}`;
    const defaultGates = ['Gerbang Utama A', 'Gerbang VIP', 'Pintu Panitia'];
    const categories = buildDefaultCategories(undefined, defaultGates);
    const ticketPrices: Record<string, number> = {};
    categories.forEach((c) => {
      ticketPrices[c.name] = c.price;
    });

    const newEvent: EventInfo = {
      id: eventId,
      title: eventTitle.trim(),
      subtitle: `Diselenggarakan oleh ${organizerName.trim()}`,
      organizerName: organizerName.trim(),
      organizerEmail: cleanEmail,
      venue: eventVenue.trim(),
      dateLabel: eventDateLabel.trim(),
      capacity: Math.max(10, Number(capacity) || 1000),
      gates: defaultGates,
      activeDesignId: store.designs[0]?.id || 'dsn-festival-cobalt',
      ticketPrices,
      categories,
      encryptionKeyVersion: store.event.encryptionKeyVersion || 1,
    };

    const newAdmin: PlatformUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      fullName: fullName.trim(),
      email: cleanEmail,
      role: 'administrator',
      organizationName: organizerName.trim(),
      assignedEventIds: [newEvent.id],
      assignedGate: 'Semua Gerbang',
      active: true,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    if (!store.userPasswords) store.userPasswords = {};
    store.userPasswords[newAdmin.id] = hashPassword(password.trim());
    store.events.unshift(newEvent);
    store.users.unshift(newAdmin);

    pushNotification({
      eventId: newEvent.id,
      type: 'offline-sync',
      title: 'Penyelenggara Event Baru Terdaftar',
      message: `${organizerName.trim()} (${newAdmin.fullName}) terdaftar untuk mengelola acara ${newEvent.title}.`,
      severity: 'success',
    });

    persistStore();
    broadcast('user:created', newAdmin);
    broadcastScopedSnapshots([newEvent.id]);
    res.json({
      user: newAdmin,
      event: newEvent,
      snapshot: getClientSnapshot(newEvent.id, newAdmin.id),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password, expectedRole } = req.body as {
      email?: string;
      password?: string;
      expectedRole?: UserRole;
    };
    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = store.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      res.status(401).json({ error: 'Email akun tidak ditemukan di tim penyelenggara.' });
      return;
    }
    if (!user.active) {
      res.status(403).json({ error: 'Akun ini sedang dinonaktifkan oleh Administrator.' });
      return;
    }
    if (expectedRole && user.role !== expectedRole) {
      res.status(403).json({
        error: `Akun ini terdaftar sebagai ${
          user.role === 'administrator' ? 'Administrator' : 'User'
        }. Pilih tab peran yang sesuai untuk masuk.`,
      });
      return;
    }
    const storedHash =
      store.userPasswords?.[user.id] || hashPassword(getDefaultPasswordForRole(user.role));
    if (hashPassword(password) !== storedHash) {
      res.status(401).json({ error: 'Kata sandi yang dimasukkan salah.' });
      return;
    }

    user.lastActiveAt = new Date().toISOString();
    persistStore();
    broadcast('user:updated', user);
    const recommendedEventId = hasAllEventsAccess(user)
      ? store.event.id
      : user.assignedEventIds.find((evId) => store.events.some((e) => e.id === evId)) ||
        store.event.id;
    res.json({ user, recommendedEventId });
  });

  app.post('/api/users', (req, res) => {
    const { actor, targetEvent } = resolveRequestContext(req);
    if (actor && actor.role !== 'administrator') {
      res.status(403).json({ error: 'Hanya Administrator penyelenggara yang dapat menambahkan akun tim.' });
      return;
    }

    const { fullName, email, role, assignedGate, password, organizationName, assignedEventIds } =
      req.body as {
        fullName: string;
        email: string;
        role: UserRole;
        assignedGate?: string;
        password?: string;
        organizationName?: string;
        assignedEventIds?: string[];
      };
    if (!fullName?.trim() || !email?.trim()) {
      res.status(400).json({ error: 'Nama lengkap dan email pengguna wajib diisi.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (store.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'Email pengguna sudah terdaftar.' });
      return;
    }
    const safeRole: UserRole = role === 'administrator' ? 'administrator' : 'user';

    let finalEventIds: string[];
    if (Array.isArray(assignedEventIds) && assignedEventIds.length > 0) {
      if (assignedEventIds.includes('*') && (!actor || hasAllEventsAccess(actor))) {
        finalEventIds = ['*'];
      } else {
        const filtered = assignedEventIds.filter(
          (evId) => evId !== '*' && (!actor || canUserAccessEvent(actor, evId))
        );
        finalEventIds = filtered.length > 0 ? filtered : [targetEvent.id];
      }
    } else {
      finalEventIds = [targetEvent.id];
    }

    const resolvedOrgName =
      organizationName?.trim() ||
      (finalEventIds[0] !== '*'
        ? store.events.find((e) => e.id === finalEventIds[0])?.organizerName
        : undefined) ||
      actor?.organizationName ||
      targetEvent.organizerName;

    const newUser: PlatformUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      fullName: fullName.trim(),
      email: cleanEmail,
      role: safeRole,
      organizationName: resolvedOrgName,
      assignedEventIds: finalEventIds,
      assignedGate:
        assignedGate || (safeRole === 'administrator' ? 'Semua Gerbang' : targetEvent.gates[0]),
      active: true,
      createdAt: new Date().toISOString(),
      lastActiveAt: null,
    };
    if (!store.userPasswords) store.userPasswords = {};
    store.userPasswords[newUser.id] = hashPassword(
      password?.trim() || getDefaultPasswordForRole(safeRole)
    );
    store.users.unshift(newUser);
    pushNotification({
      eventId: finalEventIds[0] !== '*' ? finalEventIds[0] : undefined,
      type: 'security-alert',
      title: 'Pengguna Baru Ditambahkan',
      message: `${newUser.fullName} (${newUser.organizationName}) ditambahkan sebagai ${safeRole === 'administrator' ? 'Administrator' : 'User'}.`,
      severity: 'info',
    });
    persistStore();
    broadcast('user:created', newUser);
    res.json({ user: newUser });
  });

  app.patch('/api/users/:id', (req, res) => {
    const { actor } = resolveRequestContext(req);
    if (actor && actor.role !== 'administrator') {
      res.status(403).json({ error: 'Hanya Administrator penyelenggara yang dapat mengubah akun tim.' });
      return;
    }

    const { id } = req.params;
    const { fullName, role, assignedGate, active, password, organizationName, assignedEventIds } =
      req.body as Partial<PlatformUser> & { password?: string };
    const user = store.users.find((u) => u.id === id);
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }
    if (actor && !usersShareOrganizerScope(actor, user)) {
      res.status(403).json({ error: 'Tidak dapat mengubah akun milik penyelenggara event lain.' });
      return;
    }

    const activeAdmins = store.users.filter((u) => u.role === 'administrator' && u.active);
    const isLastActiveAdmin = user.role === 'administrator' && user.active && activeAdmins.length <= 1;
    if (isLastActiveAdmin && (role === 'user' || active === false)) {
      res.status(400).json({ error: 'Minimal harus ada 1 Administrator aktif di platform.' });
      return;
    }

    if (fullName?.trim()) user.fullName = fullName.trim();
    if ((role === 'administrator' || role === 'user') && !user.isOwner) user.role = role;
    if (organizationName?.trim()) user.organizationName = organizationName.trim();
    if (Array.isArray(assignedEventIds) && assignedEventIds.length > 0 && !user.isOwner) {
      if (assignedEventIds.includes('*') && (!actor || hasAllEventsAccess(actor))) {
        user.assignedEventIds = ['*'];
      } else {
        const filtered = assignedEventIds.filter(
          (evId) => evId !== '*' && (!actor || canUserAccessEvent(actor, evId))
        );
        if (filtered.length > 0) user.assignedEventIds = filtered;
      }
    }
    if (assignedGate) user.assignedGate = assignedGate;
    if (typeof active === 'boolean' && !user.isOwner) user.active = active;
    if (password?.trim()) {
      if (!store.userPasswords) store.userPasswords = {};
      store.userPasswords[user.id] = hashPassword(password.trim());
    }

    persistStore();
    broadcast('user:updated', user);
    res.json({ user });
  });

  app.delete('/api/users/:id', (req, res) => {
    const { actor } = resolveRequestContext(req);
    if (actor && actor.role !== 'administrator') {
      res.status(403).json({ error: 'Hanya Administrator penyelenggara yang dapat menghapus akun.' });
      return;
    }

    const { id } = req.params;
    const user = store.users.find((u) => u.id === id);
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }
    if (user.isOwner) {
      res.status(400).json({ error: 'Akun Pemilik Utama Platform tidak dapat dihapus.' });
      return;
    }
    if (actor && !usersShareOrganizerScope(actor, user)) {
      res.status(403).json({ error: 'Tidak dapat menghapus akun milik penyelenggara event lain.' });
      return;
    }
    const activeAdmins = store.users.filter((u) => u.role === 'administrator' && u.active);
    if (user.role === 'administrator' && user.active && activeAdmins.length <= 1) {
      res.status(400).json({ error: 'Tidak dapat menghapus Administrator aktif terakhir.' });
      return;
    }

    store.users = store.users.filter((u) => u.id !== id);
    if (store.userPasswords) delete store.userPasswords[id];
    persistStore();
    broadcast('user:deleted', { id });
    res.json({ ok: true, id });
  });

  app.post('/api/security/rotate-key', (req, res) => {
    const { actor, targetEvent } = resolveRequestContext(req);
    const newKeyHex = crypto.randomBytes(32).toString('hex');
    store.gateEncryptionKeyHex = newKeyHex;
    const nextKeyVersion = store.event.encryptionKeyVersion + 1;
    store.event.encryptionKeyVersion = nextKeyVersion;
    store.events.forEach((ev) => {
      ev.encryptionKeyVersion = nextKeyVersion;
    });

    // Re-encrypt all active attendees with the rotated AES-256-GCM key
    store.attendees = store.attendees.map((att) => {
      const qrToken = encryptTokenServer(
        {
          id: att.id,
          code: att.ticketCode,
          ev: att.eventId || store.event.id,
          tier: att.tier,
          name: att.fullName,
          gate: att.gateAssigned,
          ver: nextKeyVersion,
          ts: Math.floor(Date.now() / 1000),
        },
        newKeyHex
      );
      return { ...att, qrToken };
    });

    if (store.notificationRules.notifyOnSecurityAlert) {
      pushNotification({
        eventId: targetEvent.id,
        type: 'security-alert',
        title: `Rotasi Kunci AES-256-GCM (v${nextKeyVersion})`,
        message: `Kunci enkripsi utama diperbarui dan ${store.attendees.length} token gelang ditandatangani ulang.`,
        severity: 'warning',
      });
    }

    persistStore();
    const snapshot = getClientSnapshot(targetEvent.id, actor?.id);
    broadcastScopedSnapshots();
    res.json({ snapshot });
  });

  app.post('/api/security/verify-pin', (req, res) => {
    const { pin, newPin } = req.body as { pin: string; newPin?: string };
    if (!pin || hashPin(pin) !== store.securityPinHash) {
      res.status(401).json({ valid: false, error: 'PIN keamanan penyelenggara salah.' });
      return;
    }
    if (newPin && newPin.length >= 4) {
      store.securityPinHash = hashPin(newPin);
      persistStore();
    }
    res.json({ valid: true });
  });

  app.patch('/api/notifications/read', (req, res) => {
    const { id } = req.body as { id?: string };
    if (id) {
      const target = store.notifications.find((n) => n.id === id);
      if (target) target.read = true;
    } else {
      store.notifications.forEach((n) => {
        n.read = true;
      });
    }
    persistStore();
    broadcast('notifications:updated', store.notifications);
    res.json({ notifications: store.notifications });
  });

  app.patch('/api/notification-rules', (req, res) => {
    const rules = req.body as Partial<NotificationRules>;
    store.notificationRules = { ...store.notificationRules, ...rules };
    persistStore();
    broadcast('notification_rules:updated', store.notificationRules);
    res.json({ notificationRules: store.notificationRules });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: {
          server,
          path: '/vite-hmr',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`GelangPass server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
