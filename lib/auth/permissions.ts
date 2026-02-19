import { type UserRole } from "@prisma/client";

export type AppRole = UserRole;

export function hasRole(roles: AppRole[], role: AppRole) {
  return roles.includes(role);
}

export function canAccessAdmin(roles: AppRole[]) {
  return hasRole(roles, "ADMINISTRATOR");
}

export function canAccessWorkbenches(roles: AppRole[]) {
  return hasRole(roles, "USER");
}

export function normalizeRoles(roles: string[] | undefined | null): AppRole[] {
  if (!roles) return [];
  const valid = roles.filter(
    (role): role is AppRole => role === "EXECUTIVE" || role === "USER" || role === "ADMINISTRATOR"
  );
  return Array.from(new Set(valid));
}
