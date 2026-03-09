"use client";

import * as React from "react";
import { AdminUserManagement } from "./admin-user-management";
import { AdminSurveyManagement } from "./admin-survey-management";

type AdminTab = "roles" | "surveys";

export function AdminControlCenter({ currentUserId }: { currentUserId: string }) {
  const [activeTab, setActiveTab] = React.useState<AdminTab>("surveys");

  return (
    <main>
      <section className="panel admin-control-panel">
        <div className="detail-tabs admin-control-tabs" role="tablist" aria-label="Administration sections">
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeTab === "surveys" ? "active" : ""}`}
            aria-selected={activeTab === "surveys"}
            onClick={() => setActiveTab("surveys")}
          >
            Survey Administration
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeTab === "roles" ? "active" : ""}`}
            aria-selected={activeTab === "roles"}
            onClick={() => setActiveTab("roles")}
          >
            Role Management
          </button>
        </div>

        <div
          className={`admin-control-content ${
            activeTab === "surveys" ? "admin-control-content-surveys" : "admin-control-content-roles"
          }`}
        >
          {activeTab === "roles" ? (
            <AdminUserManagement currentUserId={currentUserId} />
          ) : (
            <AdminSurveyManagement />
          )}
        </div>
      </section>
    </main>
  );
}
