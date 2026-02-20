"use client";

import { useState } from "react";

type UserSettingsFormProps = {
  initialName: string;
  email: string;
};

export function UserSettingsForm({ initialName, email }: UserSettingsFormProps) {
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update your settings.");
      }

      setName(payload.user?.name || "");
      setStatus({ kind: "ok", text: "Profile updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update your settings."
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="settings-form">
      <label htmlFor="settings-email">Email</label>
      <input id="settings-email" value={email} disabled />

      <label htmlFor="settings-name">Display name</label>
      <input
        id="settings-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="How your name appears"
        maxLength={80}
      />

      <div className="settings-actions">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save settings"}
        </button>
      </div>

      {status ? <p className={status.kind === "ok" ? "settings-ok" : "settings-error"}>{status.text}</p> : null}
    </form>
  );
}
