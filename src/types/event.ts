export type TicketTier = string;

export type UserRole = 'administrator' | 'user';

export interface PlatformUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  organizationName: string;
  assignedEventIds: string[];
  isOwner?: boolean;
  assignedGate: string;
  active: boolean;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface TicketCategory {
  id: string;
  name: string;
  price: number;
  defaultGate: string;
  quota: number;
  active: boolean;
}

export type PaymentMethod = 'QRIS' | 'Virtual Account BCA' | 'Virtual Account Mandiri' | 'GoPay / OVO' | 'Kartu Kredit' | 'Tunai Loket';

export type WristbandMaterial = 'tyvek' | 'woven' | 'silicone' | 'rfid-pvc';

export type WristbandPattern = 'solid' | 'diagonal' | 'geometric' | 'wave' | 'grid';

export type TicketPreviewLayout =
  | 'wristband'
  | 'concert-ticket'
  | 'boarding-pass'
  | 'gallery-pass'
  | 'invitation-card';

export interface WristbandDesign {
  id: string;
  eventId: string;
  name: string;
  themePreset: string;
  previewLayout?: TicketPreviewLayout;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  material: WristbandMaterial;
  pattern: WristbandPattern;
  widthMm: 19 | 25;
  showHolderName: boolean;
  showTierBadge: boolean;
  showPerforation: boolean;
  showSecurityMicrotext: boolean;
  sponsorLabel: string;
  customTagline: string;
  brandLogoDataUrl?: string | null;
  customBackgroundDataUrl?: string | null;
  customOverlayOpacity?: number;
  customBackgroundFit?: 'cover' | 'contain';
  hidePatternOnCustomBg?: boolean;
  isCustomUpload?: boolean;
  updatedAt: string;
}

export interface EventInfo {
  id: string;
  title: string;
  subtitle: string;
  organizerName: string;
  organizerEmail?: string;
  venue: string;
  dateLabel: string;
  capacity: number;
  gates: string[];
  activeDesignId: string;
  ticketPrices: Record<string, number>;
  categories: TicketCategory[];
  encryptionKeyVersion: number;
}

export interface Attendee {
  id: string;
  ticketCode: string;
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  tier: TicketTier;
  gateAssigned: string;
  qrToken: string;
  paymentStatus: 'paid' | 'pending' | 'complimentary';
  paymentMethod: PaymentMethod;
  amountPaid: number;
  checkedIn: boolean;
  checkedInAt: string | null;
  checkedInGate: string | null;
  checkedInMode: 'online' | 'offline-synced' | null;
  revoked: boolean;
  createdAt: string;
}

export interface CheckInLog {
  id: string;
  eventId?: string;
  attendeeId: string;
  ticketCode: string;
  fullName: string;
  tier: TicketTier;
  gate: string;
  timestamp: string;
  mode: 'online' | 'offline-synced';
  status: 'verified' | 'duplicate-blocked' | 'revoked-blocked' | 'invalid-signature';
  deviceId: string;
  verifiedByName?: string;
}

export interface PaymentTransaction {
  id: string;
  eventId?: string;
  invoiceNumber: string;
  attendeeId: string;
  buyerName: string;
  buyerEmail: string;
  tier: TicketTier;
  quantity: number;
  amount: number;
  method: PaymentMethod;
  status: 'settled' | 'pending';
  createdAt: string;
  settledAt: string;
  referenceCode: string;
}

export interface OrganizerNotification {
  id: string;
  eventId?: string;
  type: 'vip-arrival' | 'capacity-alert' | 'payment-settled' | 'security-alert' | 'offline-sync';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  severity: 'info' | 'success' | 'warning' | 'critical';
}

export interface NotificationRules {
  notifyOnVipArrival: boolean;
  notifyOnPayment: boolean;
  notifyOnSecurityAlert: boolean;
  notifyOnOfflineSync: boolean;
  capacityThresholdPercent: number;
  browserPushEnabled: boolean;
}

export interface DecryptedQrPayload {
  id: string;
  code: string;
  ev: string;
  tier: TicketTier;
  name: string;
  gate: string;
  ver: number;
  ts: number;
  sig: string;
}

export interface ActiveSessionInfo {
  sessionId: string;
  userId: string;
  fullName: string;
  role: UserRole;
  organizationName: string;
  assignedGate: string;
  eventId: string;
  connectedAt: string;
}

export interface AppStateSnapshot {
  event: EventInfo;
  events?: EventInfo[];
  designs: WristbandDesign[];
  attendees: Attendee[];
  checkInLogs: CheckInLog[];
  transactions: PaymentTransaction[];
  notifications: OrganizerNotification[];
  notificationRules: NotificationRules;
  users: PlatformUser[];
  onlineSessions?: ActiveSessionInfo[];
  gateEncryptionKeyHex: string;
  securityPinConfigured: boolean;
}

export interface PendingOfflineCheckIn {
  id: string;
  qrToken: string;
  ticketCode: string;
  attendeeId: string;
  fullName: string;
  tier: TicketTier;
  gate: string;
  timestamp: string;
  deviceId: string;
}

export interface PendingOfflineOrder {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  tier: TicketTier;
  gateAssigned: string;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  createdAt: string;
  ticketCode: string;
  qrToken: string;
}
