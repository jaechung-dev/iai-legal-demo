import type { NextConfig } from "next";

// The Claude Code / Node 22 environment passes --localstorage-file without a
// valid path, creating a broken global localStorage that throws on any access.
// Replace it with a safe no-op so Next.js DevOverlay doesn't crash during SSR.
if (typeof globalThis.localStorage !== 'undefined') {
  try { (globalThis.localStorage as Storage).getItem('__probe__') } catch {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 },
      writable: true, configurable: true,
    })
  }
}

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
};

export default nextConfig;
