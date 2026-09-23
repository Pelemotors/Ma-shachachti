/** Browser-safe business clock for shared and client-reachable modules. */
export const TIME_ZONE = "Asia/Jerusalem";

/** Real wall clock. Required for JWT, session refresh, OAuth, TLS, and timeouts. */
export function wallNow(): Date {
  return new Date();
}

export function wallNowMs() {
  return Date.now();
}

/** Production business time. QA persistence lives in product-clock-server. */
export function productNow(): Date {
  return wallNow();
}

export function productNowMs() {
  return productNow().getTime();
}

export function productIsoNow() {
  return productNow().toISOString();
}

export function productToday(timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(productNow());
}

export const ProductClock = {
  now: productNow,
  today: productToday,
  isoNow: productIsoNow,
  nowMs: productNowMs,
};

export const TechnicalClock = {
  now: wallNow,
  nowMs: wallNowMs,
};
