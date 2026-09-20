import type { AdapterCallResult, ProductAdapter } from "./product-adapter.ts";

export async function authenticateAdapter(
  adapter: ProductAdapter,
  credentials: Record<string, unknown>,
): Promise<AdapterCallResult> {
  return adapter.authenticate(credentials);
}
