import { openDB, type IDBPDatabase } from 'idb';
import type { BoinvRow, ProdStdRow, ItemppRow, ItemStdRow, BomRow, DesignWasteRow, StoredFileMetadata, FileType } from './types';

const DB_NAME = 'forecast-hub';
const DB_VERSION = 2;

type StoreMap = {
  boinv: BoinvRow;
  prodstd: ProdStdRow;
  itempp: ItemppRow;
  itemstd: ItemStdRow;
  bom: BomRow;
  designwaste: DesignWasteRow;
  metadata: StoredFileMetadata;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('boinv', { autoIncrement: true });
          db.createObjectStore('prodstd', { autoIncrement: true });
          db.createObjectStore('itempp', { autoIncrement: true });
          db.createObjectStore('metadata', { keyPath: 'fileType' });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('itemstd')) {
            db.createObjectStore('itemstd', { autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('bom')) {
            db.createObjectStore('bom', { autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('designwaste')) {
            db.createObjectStore('designwaste', { autoIncrement: true });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function saveRows<K extends keyof Omit<StoreMap, 'metadata'>>(
  store: K,
  rows: StoreMap[K][]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  await os.clear();
  for (const row of rows) {
    await os.add(row);
  }
  await tx.done;
}

export async function loadRows<K extends keyof Omit<StoreMap, 'metadata'>>(
  store: K
): Promise<StoreMap[K][]> {
  const db = await getDB();
  return db.getAll(store) as Promise<StoreMap[K][]>;
}

export async function saveMetadata(meta: StoredFileMetadata): Promise<void> {
  const db = await getDB();
  await db.put('metadata', meta);
}

export async function loadMetadata(fileType: FileType): Promise<StoredFileMetadata | undefined> {
  const db = await getDB();
  return db.get('metadata', fileType);
}

export async function loadAllMetadata(): Promise<StoredFileMetadata[]> {
  const db = await getDB();
  return db.getAll('metadata');
}
