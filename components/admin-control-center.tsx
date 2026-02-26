"use client";

import * as React from "react";
import { AdminUserManagement } from "./admin-user-management";
import { AdminSurveyManagement } from "./admin-survey-management";

type AdminTab = "roles" | "surveys";

export function AdminControlCenter({ currentUserId }: { currentUserId: string }) {
  const [activeTab, setActiveTab] = React.useState<AdminTab>("roles");

  return (
    <main>
      <section className="hero">
        <h1>Administration</h1>
        <p>Manage user permissions and webinar survey templates/sessions.</p>
      </section>

      <section className="panel">
        <div className="detail-tabs" role="tablist" aria-label="Administration sections">
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeTab === "roles" ? "active" : ""}`}
            aria-selected={activeTab === "roles"}
            onClick={() => setActiveTab("roles")}
          >
            Role Management
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeTab === "surveys" ? "active" : ""}`}
            aria-selected={activeTab === "surveys"}
            onClick={() => setActiveTab("surveys")}
          >
            Survey Management
          </button>
        </div>

        {activeTab === "roles" ? (
          <AdminUserManagement currentUserId={currentUserId} />
        ) : (
          <AdminSurveyManagement />
        )}
      </section>
    </main>
  );
}
