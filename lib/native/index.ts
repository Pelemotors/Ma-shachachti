import { createCapacitorNativeCapability } from "./capacitor-adapter.ts";
import type { NativeCapability } from "./contracts.ts";

let singleton: NativeCapability | null = null;

export function nativeCapability(): NativeCapability {
  if (!singleton) singleton = createCapacitorNativeCapability();
  return singleton;
}

export type { NativeCapability, NativePlatform, PermissionState } from "./contracts.ts";
