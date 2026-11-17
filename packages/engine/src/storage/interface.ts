// Storage adapter contract.
//
// The engine persists through this interface so storage can be swapped
// without changing engine code. Adapters are synchronous and work on complete
// snapshots (schemaVersion, all items, all history):
//   load(): StoredSnapshot | null   null when no snapshot exists; throws if corrupt or inaccessible
//   save(snapshot): void            replaces the snapshot atomically; throws if the save fails
//
// The interface itself is declared once in ../types (design.md lists it there
// with the other core types). This module is the storage-side entry point that
// the adapters in this folder implement, so there is a single definition and
// no risk of two copies drifting apart.
//
// Source of truth: .kiro/specs/engine/design.md (Storage Adapter Interface)
// and .kiro/specs/engine/requirements.md (Requirement 12).

export type { StorageAdapter, StoredSnapshot } from "../types"
