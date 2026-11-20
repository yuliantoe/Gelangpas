import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decryptWristbandTokenClient,
  encryptWristbandPayloadClient,
  generateTicketCode,
} from '../lib/crypto.ts';
import {
  clearSyncedOfflineCheckIns,
  clearSyncedOfflineOrders,
  getPendingOfflineCheckIns,
  getPendingOfflineOrders,
  loadSnapshotOffline,
  queueOfflineCheckIn,
  queueOfflineOrder,
  saveSnapshotOffline,
} from '../lib/offlineDb.ts';
import type {
  ActiveSessionInfo,
  AppStateSnapshot,
  Attendee,
  CheckInLog,
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
} from '../types/event.ts';
import { useOnlineStatus } from './useOnlineStatus.ts';

export interface CheckInResult {
  ok: boolean;
  status: 'verified' | 'duplicate-blocked' | 'revoked-blocked' | 'invalid-signature' | 'not-found';
  message: string;
  attendee?: Attendee;
  offlineQueued?: boolean;
}

export function useEventSync(sessionContext?: { userId?: string; eventId?: string }) {
  const activeUserId = sessionContext?.userId || '';
  const preferredEventId = sessionContext?.eventId || '';

  const { browserOnline, simulatedOffline, setSimulatedOffline, isOnline } = useOnlineStatus();
  const [snapshot, setSnapshot] = useState<AppStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);
  const [wsDisabled, setWsDisabled] = useState(false);
  const [pendingCheckIns, setPendingCheckIns] = useState<PendingOfflineCheckIn[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOfflineOrder[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [liveToast, setLiveToast] = useState<OrganizerNotification | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const snapshotEventIdRef = useRef<string>('');
  snapshotEventIdRef.current = preferredEventId || snapshot?.event.id || '';

  const getContextHeaders = useCallback(
    (extra?: Record<string, string>): Record<string, string> => {
      const headers: Record<string, string> = { ...(extra || {}) };
      if (activeUserId) headers['X-User-Id'] = activeUserId;
      const targetEv = preferredEventId || snapshotEventIdRef.current;
      if (targetEv) headers['X-Event-Id'] = targetEv;
      return headers;
    },
    [activeUserId, preferredEventId]
  );

  const showToast = useCallback((notif: OrganizerNotification) => {
    setLiveToast(notif);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setLiveToast(null);
    }, 5500);

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(notif.title, {
          body: notif.message,
          icon: '/pwa-192x192.png',
        });
      } catch {
        // Ignore browser notification failure in restricted frames
      }
    }
  }, []);

  const refreshPendingQueues = useCallback(async () => {
    const [chk, ord] = await Promise.all([
      getPendingOfflineCheckIns(),
      getPendingOfflineOrders(),
    ]);
    setPendingCheckIns(chk);
    setPendingOrders(ord);
  }, []);

  // Load initial state & re-sync when session user/event changes
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      await refreshPendingQueues();
      const cached = await loadSnapshotOffline();
      if (cached && !cancelled) {
        setSnapshot((prev) => prev || cached);
        setLoading(false);
      }

      if (isOnline) {
        try {
          const [res, healthRes] = await Promise.all([
            fetch('/api/state', {
              headers: getContextHeaders(),
            }),
            fetch('/api/health').catch(() => null),
          ]);
          if (healthRes?.ok && !cancelled) {
            const health = (await healthRes.json()) as { realtimeTransport?: string };
            if (health.realtimeTransport === 'http-polling') {
              setWsDisabled(true);
              setPollingActive(true);
            }
          }
          if (res.ok) {
            const data = (await res.json()) as AppStateSnapshot;
            if (!cancelled) {
              setSnapshot(data);
              setLoading(false);
            }
            await saveSnapshotOffline(data);
          }
        } catch {
          if (!cancelled && cached) {
            setLoading(false);
          }
        }
      } else if (!cancelled) {
        setLoading(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [isOnline, refreshPendingQueues, activeUserId, preferredEventId, getContextHeaders]);

  // Persist snapshot to IndexedDB whenever it updates
  useEffect(() => {
    if (snapshot) {
      saveSnapshotOffline(snapshot).catch(() => {});
    }
  }, [snapshot]);

  // WebSocket real-time synchronization (with automatic HTTP polling fallback on serverless hosts like Vercel)
  useEffect(() => {
    if (!isOnline) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      setPollingActive(false);
      return;
    }

    if (wsDisabled) {
      setWsConnected(false);
      setPollingActive(true);
      return;
    }

    let reconnectTimer: number | null = null;
    let unmounted = false;
    let consecutiveFailures = 0;

    function connect() {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams();
      if (activeUserId) params.set('userId', activeUserId);
      const targetEv = preferredEventId || snapshotEventIdRef.current;
      if (targetEv) params.set('eventId', targetEv);
      const query = params.toString() ? `?${params.toString()}` : '';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws${query}`);
      wsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        consecutiveFailures = 0;
        if (!unmounted) {
          setWsConnected(true);
          setPollingActive(false);
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setWsConnected(false);
        if (!opened) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= 2) {
            setWsDisabled(true);
            setPollingActive(true);
            return;
          }
        }
        reconnectTimer = window.setTimeout(connect, 2500);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; payload: unknown };
          setSnapshot((prev) => {
            if (!prev && msg.type !== 'init') return prev;
            switch (msg.type) {
              case 'init':
                return msg.payload as AppStateSnapshot;
              case 'attendee:created': {
                const att = msg.payload as Attendee;
                if (!prev) return prev;
                if (prev.attendees.some((a) => a.id === att.id)) return prev;
                return { ...prev, attendees: [att, ...prev.attendees] };
              }
              case 'attendee:updated': {
                const att = msg.payload as Attendee;
                if (!prev) return prev;
                return {
                  ...prev,
                  attendees: prev.attendees.map((a) => (a.id === att.id ? att : a)),
                };
              }
              case 'attendee:checked_in': {
                const { attendee, log } = msg.payload as { attendee: Attendee; log: CheckInLog };
                if (!prev) return prev;
                const logs = prev.checkInLogs.some((l) => l.id === log.id)
                  ? prev.checkInLogs
                  : [log, ...prev.checkInLogs];
                return {
                  ...prev,
                  attendees: prev.attendees.map((a) => (a.id === attendee.id ? attendee : a)),
                  checkInLogs: logs,
                };
              }
              case 'checkin:log': {
                const log = msg.payload as CheckInLog;
                if (!prev) return prev;
                if (prev.checkInLogs.some((l) => l.id === log.id)) return prev;
                return { ...prev, checkInLogs: [log, ...prev.checkInLogs] };
              }
              case 'payment:completed': {
                const tx = msg.payload as PaymentTransaction;
                if (!prev) return prev;
                if (prev.transactions.some((t) => t.id === tx.id)) return prev;
                return { ...prev, transactions: [tx, ...prev.transactions] };
              }
              case 'design:saved': {
                const { design, activeDesignId } = msg.payload as {
                  design: WristbandDesign;
                  activeDesignId: string;
                };
                if (!prev) return prev;
                const exists = prev.designs.some((d) => d.id === design.id);
                const designs = exists
                  ? prev.designs.map((d) => (d.id === design.id ? design : d))
                  : [design, ...prev.designs];
                return {
                  ...prev,
                  designs,
                  event: { ...prev.event, activeDesignId },
                };
              }
              case 'event:updated':
                if (!prev) return prev;
                return { ...prev, event: msg.payload as EventInfo };
              case 'user:created': {
                const usr = msg.payload as PlatformUser;
                if (!prev) return prev;
                if (prev.users.some((u) => u.id === usr.id)) return prev;
                return { ...prev, users: [usr, ...prev.users] };
              }
              case 'user:updated': {
                const usr = msg.payload as PlatformUser;
                if (!prev) return prev;
                return {
                  ...prev,
                  users: prev.users.map((u) => (u.id === usr.id ? usr : u)),
                };
              }
              case 'user:deleted': {
                const { id } = msg.payload as { id: string };
                if (!prev) return prev;
                return {
                  ...prev,
                  users: prev.users.filter((u) => u.id !== id),
                };
              }
              case 'notification:new': {
                const notif = msg.payload as OrganizerNotification;
                if (!prev) return prev;
                if (prev.notifications.some((n) => n.id === notif.id)) return prev;
                showToast(notif);
                return {
                  ...prev,
                  notifications: [notif, ...prev.notifications].slice(0, 80),
                };
              }
              case 'notifications:updated':
                if (!prev) return prev;
                return { ...prev, notifications: msg.payload as OrganizerNotification[] };
              case 'notification_rules:updated':
                if (!prev) return prev;
                return { ...prev, notificationRules: msg.payload as NotificationRules };
              case 'presence:updated':
                if (!prev) return prev;
                return { ...prev, onlineSessions: msg.payload as ActiveSessionInfo[] };
              case 'offline:batch_synced':
              case 'security:key_rotated':
              case 'snapshot:replaced':
                return msg.payload as AppStateSnapshot;
              default:
                return prev;
            }
          });
        } catch {
          // Ignore malformed WS message
        }
      };
    }

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [isOnline, wsDisabled, showToast, activeUserId, preferredEventId]);

  // HTTP Cloud Polling fallback when running in serverless mode (no WebSocket upgrade)
  useEffect(() => {
    if (!isOnline || !pollingActive) return;
    let cancelled = false;

    const pollState = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/state', {
          headers: getContextHeaders(),
        });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as AppStateSnapshot;
          setSnapshot(data);
        }
      } catch {
        // Ignore transient polling error
      }
    };

    const interval = window.setInterval(pollState, 6000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void pollState();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isOnline, pollingActive, getContextHeaders]);

  const syncNow = useCallback(async () => {
    if (!isOnline || syncing) return { syncedCheckIns: 0, syncedOrders: 0 };
    const [chk, ord] = await Promise.all([
      getPendingOfflineCheckIns(),
      getPendingOfflineOrders(),
    ]);
    if (chk.length === 0 && ord.length === 0) return { syncedCheckIns: 0, syncedOrders: 0 };

    setSyncing(true);
    try {
      const res = await fetch('/api/checkin/sync', {
        method: 'POST',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ checkIns: chk, orders: ord }),
      });
      if (!res.ok) throw new Error('Sync failed');
      const data = (await res.json()) as {
        syncedCheckIns: number;
        syncedOrders: number;
        snapshot: AppStateSnapshot;
      };
      await Promise.all([
        clearSyncedOfflineCheckIns(chk.map((c) => c.id)),
        clearSyncedOfflineOrders(ord.map((o) => o.id)),
      ]);
      await refreshPendingQueues();
      setSnapshot(data.snapshot);
      return { syncedCheckIns: data.syncedCheckIns, syncedOrders: data.syncedOrders };
    } finally {
      setSyncing(false);
    }
  }, [isOnline, syncing, refreshPendingQueues, getContextHeaders]);

  // Auto-sync when connectivity returns
  useEffect(() => {
    if (isOnline && (pendingCheckIns.length > 0 || pendingOrders.length > 0)) {
      syncNow().catch(() => {});
    }
  }, [isOnline, pendingCheckIns.length, pendingOrders.length, syncNow]);

  const performCheckIn = useCallback(
    async (input: {
      qrToken?: string;
      ticketCode?: string;
      gate: string;
    }): Promise<CheckInResult> => {
      if (!snapshot) {
        return { ok: false, status: 'not-found', message: 'Data acara belum dimuat.' };
      }

      if (isOnline) {
        try {
          const res = await fetch('/api/checkin', {
            method: 'POST',
            headers: getContextHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              qrToken: input.qrToken,
              ticketCode: input.ticketCode,
              gate: input.gate,
              deviceId: 'GATE-WEB-01',
            }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            status: CheckInResult['status'];
            message?: string;
            attendee?: Attendee;
            log?: CheckInLog;
          };
          if (data.attendee || data.log) {
            setSnapshot((prev) => {
              if (!prev) return prev;
              const nextLogs =
                data.log && !prev.checkInLogs.some((l) => l.id === data.log!.id)
                  ? [data.log!, ...prev.checkInLogs]
                  : prev.checkInLogs;
              return {
                ...prev,
                attendees: data.attendee
                  ? prev.attendees.map((a) => (a.id === data.attendee!.id ? data.attendee! : a))
                  : prev.attendees,
                checkInLogs: nextLogs,
              };
            });
          }
          if (data.ok && data.attendee) {
            return {
              ok: true,
              status: 'verified',
              message: `Verifikasi berhasil. Selamat datang, ${data.attendee.fullName}!`,
              attendee: data.attendee,
            };
          }
          return {
            ok: false,
            status: data.status || 'invalid-signature',
            message: data.message || 'Check-in ditolak oleh server.',
            attendee: data.attendee,
          };
        } catch {
          // Network failure mid-request: fall through to offline cryptographic verification
        }
      }

      // OFFLINE CRYPTOGRAPHIC VERIFICATION (Web Crypto AES-256-GCM + IndexedDB)
      let target: Attendee | undefined;
      const rawInput = (input.qrToken || input.ticketCode || '').trim();

      if (rawInput.startsWith('GP1.')) {
        const decrypted = await decryptWristbandTokenClient(
          rawInput,
          snapshot.gateEncryptionKeyHex
        );
        if (!decrypted.valid || !decrypted.payload) {
          return {
            ok: false,
            status: 'invalid-signature',
            message: decrypted.reason || 'QR gagal verifikasi AES-256-GCM secara offline.',
          };
        }
        target = snapshot.attendees.find(
          (a) => a.id === decrypted.payload!.id || a.ticketCode === decrypted.payload!.code
        );
        // Even if attendee was issued on another offline terminal with valid signature:
        if (!target) {
          const offlineVerifiedItem: PendingOfflineCheckIn = {
            id: `chk-off-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            qrToken: rawInput,
            ticketCode: decrypted.payload.code,
            attendeeId: decrypted.payload.id,
            fullName: decrypted.payload.name,
            tier: decrypted.payload.tier,
            gate: input.gate,
            timestamp: new Date().toISOString(),
            deviceId: 'GATE-OFFLINE-01',
          };
          await queueOfflineCheckIn(offlineVerifiedItem);
          await refreshPendingQueues();
          return {
            ok: true,
            status: 'verified',
            offlineQueued: true,
            message: `Terdekripsi offline (AES-256-GCM): ${decrypted.payload.name} (${decrypted.payload.tier}). Masuk antrean sinkronisasi.`,
          };
        }
      } else {
        const lookup = rawInput.toUpperCase();
        target = snapshot.attendees.find(
          (a) => a.ticketCode.toUpperCase() === lookup || a.id.toUpperCase() === lookup
        );
      }

      if (!target) {
        return {
          ok: false,
          status: 'not-found',
          message: 'Kode gelang tidak ada dalam cache lokal offline.',
        };
      }

      if (target.revoked) {
        return {
          ok: false,
          status: 'revoked-blocked',
          message: 'Gelang diblokir oleh penyelenggara.',
          attendee: target,
        };
      }

      if (target.checkedIn) {
        return {
          ok: false,
          status: 'duplicate-blocked',
          message: `Sudah check-in sebelumnya (${target.checkedInGate || 'gerbang lain'}).`,
          attendee: target,
        };
      }

      const nowIso = new Date().toISOString();
      const pendingItem: PendingOfflineCheckIn = {
        id: `chk-off-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        qrToken: target.qrToken,
        ticketCode: target.ticketCode,
        attendeeId: target.id,
        fullName: target.fullName,
        tier: target.tier,
        gate: input.gate,
        timestamp: nowIso,
        deviceId: 'GATE-OFFLINE-01',
      };

      await queueOfflineCheckIn(pendingItem);
      await refreshPendingQueues();

      const updatedAttendee: Attendee = {
        ...target,
        checkedIn: true,
        checkedInAt: nowIso,
        checkedInGate: input.gate,
        checkedInMode: 'offline-synced',
      };
      const newLog: CheckInLog = {
        id: pendingItem.id,
        attendeeId: target.id,
        ticketCode: target.ticketCode,
        fullName: target.fullName,
        tier: target.tier,
        gate: input.gate,
        timestamp: nowIso,
        mode: 'offline-synced',
        status: 'verified',
        deviceId: 'GATE-OFFLINE-01',
      };

      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              attendees: prev.attendees.map((a) => (a.id === target!.id ? updatedAttendee : a)),
              checkInLogs: [newLog, ...prev.checkInLogs],
            }
          : prev
      );

      return {
        ok: true,
        status: 'verified',
        offlineQueued: true,
        attendee: updatedAttendee,
        message: `Terverifikasi Offline — ${target.fullName} disimpan ke antrean sinkronisasi.`,
      };
    },
    [snapshot, isOnline, refreshPendingQueues, getContextHeaders]
  );

  const checkoutTicket = useCallback(
    async (input: {
      fullName: string;
      email: string;
      phone: string;
      tier: TicketTier;
      quantity: number;
      gateAssigned: string;
      paymentMethod: PaymentMethod;
    }): Promise<{ attendees: Attendee[]; transaction: PaymentTransaction; offline?: boolean }> => {
      if (isOnline) {
        const res = await fetch('/api/tickets/checkout', {
          method: 'POST',
          headers: getContextHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error || 'Gagal memproses pembayaran');
        }
        const data = (await res.json()) as {
          attendees: Attendee[];
          transaction: PaymentTransaction;
        };
        setSnapshot((prev) => {
          if (!prev) return prev;
          const existingAttIds = new Set(prev.attendees.map((a) => a.id));
          const newAttendees = data.attendees.filter((a) => !existingAttIds.has(a.id));
          const nextTransactions = prev.transactions.some((t) => t.id === data.transaction.id)
            ? prev.transactions
            : [data.transaction, ...prev.transactions];
          return {
            ...prev,
            attendees: [...newAttendees, ...prev.attendees],
            transactions: nextTransactions,
          };
        });
        return data;
      }

      if (!snapshot) throw new Error('Snapshot offline tidak tersedia.');
      const unitPrice = snapshot.event.ticketPrices[input.tier] ?? 0;
      const nowIso = new Date().toISOString();
      const createdAttendees: Attendee[] = [];

      for (let i = 0; i < input.quantity; i++) {
        const id = `att-off-${Date.now()}-${i}`;
        const ticketCode = generateTicketCode(input.tier);
        const holderName = input.quantity > 1 ? `${input.fullName} #${i + 1}` : input.fullName;
        const qrToken = await encryptWristbandPayloadClient(
          {
            id,
            code: ticketCode,
            ev: snapshot.event.id,
            tier: input.tier,
            name: holderName,
            gate: input.gateAssigned,
            ver: snapshot.event.encryptionKeyVersion,
            ts: Math.floor(Date.now() / 1000),
          },
          snapshot.gateEncryptionKeyHex
        );

        const order: PendingOfflineOrder = {
          id: `ord-${Date.now()}-${i}`,
          fullName: holderName,
          email: input.email,
          phone: input.phone,
          tier: input.tier,
          gateAssigned: input.gateAssigned,
          paymentMethod: input.paymentMethod,
          amountPaid: unitPrice,
          createdAt: nowIso,
          ticketCode,
          qrToken,
        };
        await queueOfflineOrder(order);

        createdAttendees.push({
          id,
          ticketCode,
          eventId: snapshot.event.id,
          fullName: holderName,
          email: input.email || '-',
          phone: input.phone || '-',
          tier: input.tier,
          gateAssigned: input.gateAssigned,
          qrToken,
          paymentStatus: unitPrice === 0 ? 'complimentary' : 'paid',
          paymentMethod: input.paymentMethod,
          amountPaid: unitPrice,
          checkedIn: false,
          checkedInAt: null,
          checkedInGate: null,
          checkedInMode: null,
          revoked: false,
          createdAt: nowIso,
        });
      }

      const tx: PaymentTransaction = {
        id: `tx-off-${Date.now()}`,
        invoiceNumber: `INV/OFF/${Date.now().toString().slice(-4)}`,
        attendeeId: createdAttendees[0].id,
        buyerName: input.fullName,
        buyerEmail: input.email || '-',
        tier: input.tier,
        quantity: input.quantity,
        amount: unitPrice * input.quantity,
        method: input.paymentMethod,
        status: 'settled',
        createdAt: nowIso,
        settledAt: nowIso,
        referenceCode: `OFF-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      };

      await refreshPendingQueues();
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              attendees: [...createdAttendees, ...prev.attendees],
              transactions: [tx, ...prev.transactions],
            }
          : prev
      );

      return { attendees: createdAttendees, transaction: tx, offline: true };
    },
    [isOnline, snapshot, refreshPendingQueues, getContextHeaders]
  );

  const batchCreateAttendees = useCallback(
    async (input: {
      prefixName: string;
      tier: TicketTier;
      count: number;
      gateAssigned: string;
    }) => {
      const res = await fetch('/api/attendees/batch', {
        method: 'POST',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Gagal membuat gelang massal.');
      const data = (await res.json()) as { created: Attendee[] };
      setSnapshot((prev) => {
        if (!prev) return prev;
        const existingIds = new Set(prev.attendees.map((a) => a.id));
        const added = data.created.filter((a) => !existingIds.has(a.id));
        return {
          ...prev,
          attendees: [...added, ...prev.attendees],
        };
      });
      return data;
    },
    [getContextHeaders]
  );

  const toggleAttendeeRevoked = useCallback(
    async (id: string, revoked: boolean) => {
      const res = await fetch(`/api/attendees/${id}`, {
        method: 'PATCH',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ revoked }),
      });
      if (!res.ok) throw new Error('Gagal mengubah status gelang.');
      const data = (await res.json()) as { attendee?: Attendee };
      if (data.attendee) {
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                attendees: prev.attendees.map((a) =>
                  a.id === data.attendee!.id ? data.attendee! : a
                ),
              }
            : prev
        );
      }
      return data;
    },
    [getContextHeaders]
  );

  const saveDesign = useCallback(
    async (design: WristbandDesign) => {
      const res = await fetch('/api/designs', {
        method: 'POST',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(design),
      });
      if (!res.ok) throw new Error('Gagal menyimpan desain gelang.');
      const data = (await res.json()) as {
        design: WristbandDesign;
        activeDesignId: string;
      };
      if (data.design) {
        setSnapshot((prev) => {
          if (!prev) return prev;
          const exists = prev.designs.some((d) => d.id === data.design.id);
          const designs = exists
            ? prev.designs.map((d) => (d.id === data.design.id ? data.design : d))
            : [data.design, ...prev.designs];
          return {
            ...prev,
            designs,
            event: { ...prev.event, activeDesignId: data.activeDesignId },
            events: prev.events
              ? prev.events.map((ev) =>
                  ev.id === prev.event.id ? { ...ev, activeDesignId: data.activeDesignId } : ev
                )
              : undefined,
          };
        });
      }
      return data;
    },
    [getContextHeaders]
  );

  const createEvent = useCallback(
    async (input: {
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
    }) => {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as {
        event?: EventInfo;
        snapshot?: AppStateSnapshot;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Gagal menambahkan acara baru.');
      if (data.snapshot) setSnapshot(data.snapshot);
      return data;
    },
    [getContextHeaders]
  );

  const activateEvent = useCallback(
    async (eventId: string) => {
      const res = await fetch(`/api/events/${eventId}/activate`, {
        method: 'POST',
        headers: getContextHeaders(),
      });
      const data = (await res.json()) as { snapshot?: AppStateSnapshot; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal mengaktifkan acara.');
      if (data.snapshot) setSnapshot(data.snapshot);
      return data.snapshot!;
    },
    [getContextHeaders]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
        headers: getContextHeaders(),
      });
      const data = (await res.json()) as { ok?: boolean; snapshot?: AppStateSnapshot; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus acara.');
      if (data.snapshot) setSnapshot(data.snapshot);
      return data;
    },
    [getContextHeaders]
  );

  const updateEventInfo = useCallback(
    async (eventId: string, patch: Partial<EventInfo>) => {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as {
        event?: EventInfo;
        snapshot?: AppStateSnapshot;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui info acara.');
      if (data.snapshot) setSnapshot(data.snapshot);
      return data;
    },
    [getContextHeaders]
  );

  const updateEventCategories = useCallback(
    async (eventId: string, categories: TicketCategory[]) => {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ categories }),
      });
      const data = (await res.json()) as {
        event?: EventInfo;
        snapshot?: AppStateSnapshot;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan kategori & harga tiket.');
      if (data.snapshot) setSnapshot(data.snapshot);
      return data;
    },
    [getContextHeaders]
  );

  const loginUser = useCallback(
    async (input: { email: string; password: string; expectedRole?: UserRole }) => {
      if (isOnline) {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          });
          const data = (await res.json()) as {
            user?: PlatformUser;
            recommendedEventId?: string;
            error?: string;
          };
          if (!res.ok) throw new Error(data.error || 'Gagal masuk ke panel penyelenggara.');
          return {
            user: data.user!,
            recommendedEventId: data.recommendedEventId || data.user!.assignedEventIds[0],
          };
        } catch (err) {
          if (err instanceof TypeError) {
            // Network drop -> fall through to offline cache auth
          } else {
            throw err;
          }
        }
      }

      if (!snapshot) throw new Error('Data akun offline belum tersedia.');
      const cleanEmail = input.email.trim().toLowerCase();
      const matched = snapshot.users.find((u) => u.email.toLowerCase() === cleanEmail);
      if (!matched) throw new Error('Email akun tidak ditemukan di cache offline.');
      if (!matched.active) throw new Error('Akun sedang dinonaktifkan.');
      if (input.expectedRole && matched.role !== input.expectedRole) {
        throw new Error(
          `Akun terdaftar sebagai ${matched.role === 'administrator' ? 'Administrator' : 'User'}.`
        );
      }
      const expectedDefault = matched.role === 'administrator' ? 'admin2026' : 'user2026';
      if (input.password !== expectedDefault) {
        throw new Error('Kata sandi salah pada mode offline (gunakan kata sandi default peran).');
      }
      const recommendedEventId =
        matched.assignedEventIds?.find((id) => id !== '*') || snapshot.event.id;
      return { user: matched, recommendedEventId };
    },
    [isOnline, snapshot]
  );

  const registerOrganizer = useCallback(
    async (input: {
      organizerName: string;
      fullName: string;
      email: string;
      password: string;
      eventTitle: string;
      eventVenue: string;
      eventDateLabel: string;
      capacity?: number;
    }) => {
      const res = await fetch('/api/auth/register-organizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as {
        user?: PlatformUser;
        event?: EventInfo;
        snapshot?: AppStateSnapshot;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Gagal mendaftarkan penyelenggara baru.');
      if (data.snapshot) setSnapshot(data.snapshot);
      return { user: data.user!, event: data.event!, snapshot: data.snapshot };
    },
    []
  );

  const addUser = useCallback(
    async (input: {
      fullName: string;
      email: string;
      role: UserRole;
      assignedGate: string;
      password?: string;
      organizationName?: string;
      assignedEventIds?: string[];
    }) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as { user?: PlatformUser; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal menambahkan pengguna.');
      if (data.user) {
        setSnapshot((prev) => {
          if (!prev) return prev;
          if (prev.users.some((u) => u.id === data.user!.id)) return prev;
          return { ...prev, users: [data.user!, ...prev.users] };
        });
      }
      return data.user!;
    },
    [getContextHeaders]
  );

  const updateUser = useCallback(
    async (id: string, patch: Partial<PlatformUser> & { password?: string }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: getContextHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { user?: PlatformUser; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui pengguna.');
      if (data.user) {
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                users: prev.users.map((u) => (u.id === data.user!.id ? data.user! : u)),
              }
            : prev
        );
      }
      return data.user!;
    },
    [getContextHeaders]
  );

  const deleteUser = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: getContextHeaders(),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus pengguna.');
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.filter((u) => u.id !== id),
            }
          : prev
      );
      return data;
    },
    [getContextHeaders]
  );

  const rotateEncryptionKey = useCallback(async () => {
    const res = await fetch('/api/security/rotate-key', {
      method: 'POST',
      headers: getContextHeaders(),
    });
    if (!res.ok) throw new Error('Gagal merotasi kunci AES-256-GCM.');
    const data = (await res.json()) as { snapshot: AppStateSnapshot };
    setSnapshot(data.snapshot);
    return data.snapshot;
  }, [getContextHeaders]);

  const markNotificationRead = useCallback(async (id?: string) => {
    const res = await fetch('/api/notifications/read', {
      method: 'PATCH',
      headers: getContextHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      const data = (await res.json()) as { notifications?: OrganizerNotification[] };
      if (data.notifications) {
        setSnapshot((prev) =>
          prev ? { ...prev, notifications: data.notifications! } : prev
        );
      }
    }
  }, [getContextHeaders]);

  const updateNotificationRules = useCallback(async (rules: Partial<NotificationRules>) => {
    const res = await fetch('/api/notification-rules', {
      method: 'PATCH',
      headers: getContextHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(rules),
    });
    if (res.ok) {
      const data = (await res.json()) as { notificationRules?: NotificationRules };
      if (data.notificationRules) {
        setSnapshot((prev) =>
          prev ? { ...prev, notificationRules: data.notificationRules! } : prev
        );
      }
    }
  }, [getContextHeaders]);

  return {
    snapshot,
    loading,
    browserOnline,
    simulatedOffline,
    setSimulatedOffline,
    isOnline,
    wsConnected,
    pollingActive,
    pendingCount: pendingCheckIns.length + pendingOrders.length,
    pendingCheckIns,
    pendingOrders,
    syncing,
    liveToast,
    dismissToast: () => setLiveToast(null),
    syncNow,
    performCheckIn,
    checkoutTicket,
    batchCreateAttendees,
    toggleAttendeeRevoked,
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
  };
}
