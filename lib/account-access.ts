export type AccountAccess = {
  role: "user" | "admin";
  approved: boolean;
};

export function isApprovedAccount(access: AccountAccess | null | undefined) {
  return access?.approved === true;
}

export function pendingAccountMessage() {
  return "החשבון עדיין ממתין לאישור.";
}

export function signupCreatedMessage() {
  return "החשבון נוצר. לאחר אישור מנהל אפשר יהיה להיכנס.";
}

export function canSelfApprove() {
  return false;
}

export function isAdminAccess(access: AccountAccess | null | undefined) {
  return access?.role === "admin" && access.approved === true;
}

export function isSelfLockout(
  adminId: string,
  targetId: string,
  patch: { approved?: boolean; role?: "user" | "admin" },
) {
  return (
    adminId === targetId &&
    (patch.approved === false || patch.role === "user")
  );
}
