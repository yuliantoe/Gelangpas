import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  canUserAccessEvent,
  createGelangPassApp,
  store,
} from './src/server/app.ts';
import type { ActiveSessionInfo, AppStateSnapshot } from './src/types/event.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WsClientMeta {
  sessionId: string;
  eventId: string;
  userId: string;
  connectedAt: string;
}

async function startServer() {
  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Map<WebSocket, WsClientMeta>();
  let snapshotResolver: ((requestedEventId?: string, actorUserId?: string) => AppStateSnapshot) | null = null;

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

  function broadcastScopedSnapshots(_changedEventIds?: string[]) {
    if (!snapshotResolver) return;
    const resolveSnapshot = snapshotResolver;
    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const meta = wsClients.get(client);
      const snap = resolveSnapshot(meta?.eventId, meta?.userId || undefined);
      client.send(
        JSON.stringify({
          type: 'snapshot:replaced',
          payload: snap,
          timestamp: new Date().toISOString(),
        })
      );
    });
  }

  const { app, getClientSnapshot } = createGelangPassApp({
    broadcast,
    broadcastScopedSnapshots,
    getOnlineSessionsForEvent,
  });
  snapshotResolver = getClientSnapshot;

  const server = http.createServer(app);

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

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
