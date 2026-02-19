"use client";

import { useEffect, useMemo, useState } from "react";

type UserRole = "EXECUTIVE" | "USER" | "ADMINISTRATOR";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "EXECUTIVE", label: "Executive" },
  { value: "USER", label: "User" },
  { value: "ADMINISTRATOR", label: "Administrator" }
];

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US");
}

export function AdminUserManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, UserRole>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function loadUsers() {
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load users");
      }

      const records = Array.isArray(payload.users) ? (payload.users as AdminUser[]) : [];
      setUsers(records);
      setRoleDrafts(
        records.reduce<Record<string, UserRole>>((accumulator, user) => {
          accumulator[user.id] = user.role;
          return accumulator;
        }, {})
      );
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load users"
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const hasUnsavedChanges = useMemo(
    () => users.some((user) => roleDrafts[user.id] && roleDrafts[user.id] !== user.role),
    [roleDrafts, users]
  );

  async function saveRole(userId: string) {
    const nextRole = roleDrafts[userId];
    if (!nextRole) return;

    setSavingId(userId);
    setStatus(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update role");
      }

      setUsers((previous) =>
        previous.map((user) => {
          if (user.id !== userId) return user;
          return { ...user, role: payload.user.role as UserRole };
        })
      );
      setStatus({ kind: "ok", text: "Role updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update role"
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main>
      <section className="hero">
        <h1>Administration</h1>
        <p>Manage users and role assignments for local beta access.</p>
      </section>

      <section className="panel">
        <h2>User Role Management</h2>
        <p className="muted">
          Role changes apply to new requests. Existing signed-in users may need to sign out and back in.
        </p>

        <div className="actions">
          <button className="secondary" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {hasUnsavedChanges ? <p className="muted">You have unsaved role changes.</p> : null}
        </div>

        {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}

        {loading ? (
          <p className="muted">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="muted">No users found yet. Sign in with Google to create the first user.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const selectedRole = roleDrafts[user.id] || user.role;
                const changed = selectedRole !== user.role;
                const isSelf = user.id === currentUserId;
                const saveDisabled = !changed || savingId === user.id || (isSelf && selectedRole !== "ADMINISTRATOR");

                return (
                  <tr key={user.id}>
                    <td>{user.name || "-"}</td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        value={selectedRole}
                        onChange={(event) => {
                          setRoleDrafts((previous) => ({
                            ...previous,
                            [user.id]: event.target.value as UserRole
                          }));
                        }}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{user.isActive ? "Active" : "Inactive"}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>
                      <button
                        className="primary small"
                        onClick={() => void saveRole(user.id)}
                        disabled={saveDisabled}
                        title={isSelf && selectedRole !== "ADMINISTRATOR" ? "Cannot remove your own admin role." : ""}
                      >
                        {savingId === user.id ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
