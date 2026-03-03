import type { NextConfig } from "next";

// Work around broken Node localStorage globals (for example when started with an
// invalid --localstorage-file flag). Some libraries gate on `typeof localStorage`
// and then call `getItem`, which crashes if the global is malformed.
{
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };

  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: memoryStorage,
    });
  } catch {
    // Fallback for runtimes where `defineProperty` on the global is restricted.
    (globalThis as { localStorage?: unknown }).localStorage = memoryStorage;
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["amqplib"],
};

export default nextConfig;
