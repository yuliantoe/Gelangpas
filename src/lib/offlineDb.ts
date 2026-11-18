import { openDB, type IDBPDatabase } from 'idb';
import type {
  AppStateSnapshot,
  PendingOfflineCheckIn,
  PendingOfflineOrder,
} from '../types/event.ts';

const DB_NAME = 'gelangpass-offline-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('snapshot')) {
          db.createObjectStore('snapshot');
        }
        if (!db.objectStoreNames.contains('pendingCheckIns')) {
          db.createObjectStore('pendingCheckIns', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pendingOrders')) {
          db.createObjectStore('pendingOrders', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveSnapshotOffline(snapshot: AppStateSnapshot): Promise<void> {
  const db = await getDb();
  await db.put('snapshot', snapshot, 'latest');
}

export async function loadSnapshotOffline(): Promise<AppStateSnapshot | null> {
  const db = await getDb();
  const data = await db.get('snapshot', 'latest');
  return (data as AppStateSnapshot) ?? null;
}

export async function queueOfflineCheckIn(item: PendingOfflineCheckIn): Promise<void> {
  const db = await getDb();
  await db.put('pendingCheckIns', item);
}

export async function getPendingOfflineCheckIns(): Promise<PendingOfflineCheckIn[]> {
  const db = await getDb();
  return (await db.getAll('pendingCheckIns')) as PendingOfflineCheckIn[];
}

export async function clearSyncedOfflineCheckIns(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('pendingCheckIns', 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function queueOfflineOrder(order: PendingOfflineOrder): Promise<void> {
  const db = await getDb();
  await db.put('pendingOrders', order);
}

export async function getPendingOfflineOrders(): Promise<PendingOfflineOrder[]> {
  const db = await getDb();
  return (await db.getAll('pendingOrders')) as PendingOfflineOrder[];
}

export async function clearSyncedOfflineOrders(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('pendingOrders', 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}
