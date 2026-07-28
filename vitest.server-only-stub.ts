// Vitest runs outside Next.js's bundler, which is what normally makes the real
// "server-only" package a no-op in server code. Alias it to this empty stub
// (see vitest.config.ts) so server-only modules are still unit-testable.
export {};
