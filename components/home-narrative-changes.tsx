"use client";

import * as React from "react";
import { PipelineOpportunityDetailView } from "./pipeline-opportunity-detail";

type NarrativeOpportunityTarget = {
  companyId: string;
  opportunityId: string;
};

export type HomeNarrativeChangeEvent = {
  id: string;
  actorNames: string[];
  kindLabel: string;
  kindClass: string;
  narrative: string;
  pipelineBadgeClass: string;
  pipelineLabel: string;
  shouldPrefixActor: boolean;
  timestampIso: string;
  timestampLabel: string;
  opportunityTarget: NarrativeOpportunityTarget | null;
};

function formatActorNames(actorNames: string[]) {
  if (actorNames.length === 0) return null;
  if (actorNames.length === 1) return actorNames[0];
  if (actorNames.length === 2) return `${actorNames[0]} and ${actorNames[1]}`;
  return `${actorNames.slice(0, -1).join(", ")}, and ${actorNames[actorNames.length - 1]}`;
}

function eventNarrative(event: HomeNarrativeChangeEvent) {
  if (!event.shouldPrefixActor || event.actorNames.length !== 1) return event.narrative;
  return `${event.actorNames[0]} ${event.narrative}`;
}

function ActivityCard({ event }: { event: HomeNarrativeChangeEvent }) {
  const actorLabel = formatActorNames(event.actorNames) || "System";

  return (
    <>
      <div className="home-activity-badges">
        <span className={`home-activity-kind home-activity-kind-${event.kindClass}`}>{event.kindLabel}</span>
        <span className={`home-activity-pipeline home-activity-pipeline-${event.pipelineBadgeClass}`}>
          {event.pipelineLabel}
        </span>
      </div>
      <p className="home-activity-narrative">{eventNarrative(event)}</p>
      <div className="home-pipeline-activity-meta">
        <span>{actorLabel}</span>
        <time dateTime={event.timestampIso}>{event.timestampLabel}</time>
      </div>
    </>
  );
}

export function HomeNarrativeChanges({
  events,
  totalCount
}: {
  events: HomeNarrativeChangeEvent[];
  totalCount: number;
}) {
  const [selectedOpportunity, setSelectedOpportunity] = React.useState<NarrativeOpportunityTarget | null>(null);

  const closeOpportunity = React.useCallback(() => {
    setSelectedOpportunity(null);
  }, []);

  return (
    <>
      <aside className="panel home-pipeline-activity-panel">
        <header className="home-pipeline-activity-header">
          <h2>Narrative Changes</h2>
          <p className="muted">Reverse chronological activity stream across all three pipelines.</p>
        </header>

        <div className="home-pipeline-activity-scroll">
          {events.length === 0 ? (
            <p className="muted">No tracked changes in the last two weeks.</p>
          ) : (
            <ol className="home-pipeline-activity-list">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="home-pipeline-activity-item"
                  data-clickable={event.opportunityTarget ? "true" : "false"}
                >
                  {event.opportunityTarget ? (
                    <button
                      type="button"
                      className="home-pipeline-activity-button"
                      onClick={() => setSelectedOpportunity(event.opportunityTarget)}
                      aria-haspopup="dialog"
                      aria-label={`Open opportunity for activity: ${event.narrative}`}
                    >
                      <ActivityCard event={event} />
                    </button>
                  ) : (
                    <div className="home-pipeline-activity-card">
                      <ActivityCard event={event} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        {totalCount > events.length ? (
          <p className="muted">Showing latest {events.length} of {totalCount} events.</p>
        ) : null}
      </aside>

      {selectedOpportunity ? (
        <div className="pipeline-detail-backdrop" onMouseDown={closeOpportunity}>
          <PipelineOpportunityDetailView
            itemId={selectedOpportunity.companyId}
            inModal
            initialIntakeDetailTab="opportunities"
            initialOpportunityId={selectedOpportunity.opportunityId}
            closeContainerOnOpportunityClose
            onCloseModal={closeOpportunity}
          />
        </div>
      ) : null}
    </>
  );
}
