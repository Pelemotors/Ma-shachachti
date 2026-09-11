"use client";

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export function ensurePushServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return Promise.reject(new Error("service_worker_unsupported"));
  }
  registrationPromise ??= navigator.serviceWorker
    .register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    })
    .catch((error) => {
      registrationPromise = null;
      throw error;
    });
  return registrationPromise;
}
