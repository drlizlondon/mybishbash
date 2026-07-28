// Vitest global setup.
//
// `fake-indexeddb/auto` installs a spec-compliant in-process IndexedDB onto
// globalThis. The unit suite runs in the `node` environment, which has no
// IndexedDB of its own, so services/db (Phase 5) is untestable without it.
// It is a devDependency and never reaches the client bundle.
import "fake-indexeddb/auto";
