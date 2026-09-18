import { decodeAppRoute, encodeAppRoute, type AppRouteState } from "../app-route-state.ts";

const APP_HOSTS = new Set([
  "mashachachti.co.il",
  "www.mashachachti.co.il",
  "localhost",
  "127.0.0.1",
]);

export function parseDeepLink(href: string): AppRouteState | null {
  try {
    const hasScheme = href.includes("://");
    const url = new URL(hasScheme ? href : `https://mashachachti.co.il${href.startsWith("/") ? href : `/${href}`}`);
    if (hasScheme && url.protocol === "https:" && !APP_HOSTS.has(url.hostname)) {
      return null;
    }
    if (url.pathname === "/login") {
      const next = url.searchParams.get("next");
      return next ? parseDeepLink(next) : { view: "home", date: null, sessionId: null };
    }
    if (url.pathname === "/" || url.pathname === "/app") {
      return decodeAppRoute(url.searchParams);
    }
    return null;
  } catch {
    return null;
  }
}

const PUBLIC_RESUME_PATHS = new Set([
  "/account-deletion",
  "/privacy",
]);

export function resumePathAfterAuth(href: string) {
  try {
    const hasScheme = href.includes("://");
    const url = new URL(
      hasScheme
        ? href
        : `https://mashachachti.co.il${href.startsWith("/") ? href : `/${href}`}`,
    );
    if (PUBLIC_RESUME_PATHS.has(url.pathname)) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    // fall through
  }
  const parsed = parseDeepLink(href);
  return parsed ? encodeAppRoute(parsed) : "/app";
}

export function loginPathWithResume(currentHref: string) {
  const resume = resumePathAfterAuth(currentHref);
  if (resume === "/app") return "/login";
  return `/login?next=${encodeURIComponent(resume)}`;
}
