/**
 * File storage for the mock API. Photos are too big for localStorage, so they
 * go to IndexedDB, keyed by photo id. Handler tests run in Node, which has no
 * IndexedDB, so there they fall back to memory. Replaced by S3/R2 later.
 */
const DB_NAME = "pedia-dental:mock-files";
const STORE = "files";
const memory = new Map<string, Blob>();
const hasIdb = typeof indexedDB !== "undefined";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(mode: IDBTransactionMode) {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await request(open);
  const tx = db.transaction(STORE, mode);
  // An open connection blocks deleteDatabase, which made "Reset demo data" hang.
  tx.oncomplete = tx.onabort = tx.onerror = () => db.close();
  return tx.objectStore(STORE);
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  if (!hasIdb) return void memory.set(id, blob);
  await request((await store("readwrite")).put(blob, id));
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  if (!hasIdb) return memory.get(id);
  return request((await store("readonly")).get(id) as IDBRequest<Blob | undefined>);
}

export async function deleteBlob(id: string): Promise<void> {
  if (!hasIdb) return void memory.delete(id);
  await request((await store("readwrite")).delete(id));
}

export async function clearBlobs(): Promise<void> {
  if (!hasIdb) return memory.clear();
  await request(indexedDB.deleteDatabase(DB_NAME));
}
