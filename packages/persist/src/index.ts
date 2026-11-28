// @decay-engine/persist: a versioned, write-guarded storage adapter for the
// engine, built around the engine's StorageAdapter interface (the engine
// itself is unchanged).

export { PersistError, type PersistErrorCode } from "./errors"
export { bumpRevision, readMeta, type Meta } from "./meta"
export { CURRENT_APP_DATA_VERSION, MIGRATIONS, migrateSnapshot, type Migration } from "./migrations"
export { quarantineSnapshot } from "./quarantine"
export { globalStorage, metaKey, snapshotKey, type StorageLike } from "./storage"
export { VersionedAdapter, type VersionedAdapterOptions } from "./versioned-adapter"
export { watchForeignChanges, type StorageEventTarget } from "./watch"
