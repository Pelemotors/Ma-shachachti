const E164 = /^\+[1-9][0-9]{7,14}$/;

export function normalizePhoneE164(input: string | null | undefined): string | null {
  if (input == null) return null;
  const raw = input.trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  let candidate = digits;
  if (candidate.startsWith("00")) candidate = `+${candidate.slice(2)}`;
  if (candidate.startsWith("0") && candidate.length === 10) {
    candidate = `+972${candidate.slice(1)}`;
  }
  if (!candidate.startsWith("+") && candidate.length === 9 && candidate.startsWith("5")) {
    candidate = `+972${candidate}`;
  }
  if (!E164.test(candidate)) {
    throw new Error("invalid_phone");
  }
  return candidate;
}

export function phonesMatch(a: string, b: string) {
  return normalizePhoneE164(a) === normalizePhoneE164(b);
}
