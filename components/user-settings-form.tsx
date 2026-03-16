"use client";

import { useState } from "react";

type UserSettingsFormProps = {
  initialName: string;
  email: string;
  initialStakeholderDigestSubscribed: boolean;
};

export function UserSettingsForm({
  initialName,
  email,
  initialStakeholderDigestSubscribed
}: UserSettingsFormProps) {
  const [name, setName] = useState(initialName);
  const [stakeholderDigestSubscribed, setStakeholderDigestSubscribed] = useState(initialStakeholderDigestSubscribed);
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
        body: JSON.stringify({ name, stakeholderDigestSubscribed })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update your settings.");
      }

      setName(payload.user?.name || "");
      setStakeholderDigestSubscribed(Boolean(payload.user?.stakeholderDigestSubscribed));
      setStatus({ kind: "ok", text: "Settings updated." });
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

      <label htmlFor="settings-stakeholder-digest">Weekly stakeholder digest</label>
      <label
        htmlFor="settings-stakeholder-digest"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 12px",
          border: "1px solid #d4e1ef",
          borderRadius: 12,
          background: "#f8fbfe"
        }}
      >
        <input
          id="settings-stakeholder-digest"
          type="checkbox"
          checked={stakeholderDigestSubscribed}
          onChange={(event) => setStakeholderDigestSubscribed(event.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          Receive the weekly stakeholder signals digest every Monday morning with top items across co-investors,
          contacts, companies, and health systems.
        </span>
      </label>

      <div className="settings-actions">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save settings"}
        </button>
      </div>

      {status ? <p className={status.kind === "ok" ? "settings-ok" : "settings-error"}>{status.text}</p> : null}
    </form>
  );
}
