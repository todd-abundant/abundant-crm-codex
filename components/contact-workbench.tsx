"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AddRelationshipModal } from "./add-relationship-modal";
import { EntityLookupInput } from "./entity-lookup-input";
import { EntityDocumentsPane } from "./entity-documents-pane";
import { EntityNotesPane } from "./entity-notes-pane";

type ContactRoleType = "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "COMPANY_CONTACT" | "OTHER";
type AssociationType = "HEALTH_SYSTEM" | "CO_INVESTOR" | "COMPANY";
type DetailTab = "overview" | "relationships" | "opportunities" | "notes" | "documents";
type OpportunityStatusFilter = "open" | "closed";
type EntityKind = "HEALTH_SYSTEM" | "CO_INVESTOR" | "COMPANY";
type StatusMessage = { kind: "ok" | "error"; text: string };

type ContactRecord = {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  notes?: string | null;
  principalEntityType?: AssociationType | null;
  principalEntityId?: string | null;
  principalEntity?: {
    type: AssociationType;
    id: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  documentCount: number;
  healthSystemLinks: Array<{
    id: string;
    roleType: ContactRoleType;
    title?: string | null;
    healthSystemId: string;
    isKeyAllianceContact: boolean;
    isInformedAllianceContact: boolean;
    healthSystem: {
      id: string;
      name: string;
    };
  }>;
  coInvestorLinks: Array<{
    id: string;
    roleType: ContactRoleType;
    title?: string | null;
    coInvestorId: string;
    coInvestor: {
      id: string;
      name: string;
    };
  }>;
  companyLinks: Array<{
    id: string;
    roleType: ContactRoleType;
    title?: string | null;
    companyId: string;
    company: {
      id: string;
      name: string;
    };
  }>;
  opportunityLinks: Array<{
    id: string;
    role?: string | null;
    opportunity: {
      id: string;
      title: string;
      type: string;
      stage: string;
      estimatedCloseDate?: string | null;
      company: {
        id: string;
        name: string;
      };
      healthSystem?: {
        id: string;
        name: string;
      } | null;
    };
  }>;
};

type ReferenceData = {
  healthSystems: Array<{ id: string; name: string }>;
  coInvestors: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string }>;
  opportunities: Array<{
    id: string;
    title: string;
    type: string;
    stage: string;
    estimatedCloseDate?: string | null;
    company: {
      id: string;
      name: string;
    };
    healthSystem?: {
      id: string;
      name: string;
    } | null;
  }>;
};

type DetailDraft = {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  notes: string;
  principalEntityType: AssociationType | "";
  principalEntityId: string;
};

type EditingAssociation = {
  associationType: AssociationType;
  linkId: string;
  roleType: ContactRoleType;
  title: string;
  isKeyAllianceContact: boolean;
  isInformedAllianceContact: boolean;
};

type LookupFilters = {
  lookupQuery: string;
  entityType: AssociationType | "";
};

const roleTypeOptions: Array<{ value: ContactRoleType; label: string }> = [
  { value: "EXECUTIVE", label: "Executive" },
  { value: "VENTURE_PARTNER", label: "Venture Partner" },
  { value: "INVESTOR_PARTNER", label: "Investor Partner" },
  { value: "COMPANY_CONTACT", label: "Company Contact" },
  { value: "OTHER", label: "Other" }
];

const associationTypeOptions: Array<{ value: AssociationType; label: string }> = [
  { value: "HEALTH_SYSTEM", label: "Health System" },
  { value: "CO_INVESTOR", label: "Co-Investor" },
  { value: "COMPANY", label: "Company" }
];

const lookupEntityTypeOptions: Array<{ value: AssociationType | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "HEALTH_SYSTEM", label: "Health Systems" },
  { value: "CO_INVESTOR", label: "Co-Investors" },
  { value: "COMPANY", label: "Companies" }
];

function trim(value: string | null | undefined) {
  return (value || "").trim();
}

function normalize(value: string | null | undefined) {
  return trim(value).toLowerCase();
}

function roleTypeLabel(roleType: ContactRoleType) {
  const match = roleTypeOptions.find((option) => option.value === roleType);
  return match ? match.label : roleType;
}

function associationTypeLabel(associationType: AssociationType) {
  const match = associationTypeOptions.find((option) => option.value === associationType);
  return match ? match.label : associationType;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function isClosedOpportunityStage(stage: string) {
  const normalized = normalize(stage);
  if (!normalized) return false;
  if (normalized.includes("closed")) return true;
  return normalized === "won" || normalized === "lost";
}

function formatOpportunityDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function defaultRoleTypeForAssociation(associationType: AssociationType): ContactRoleType {
  if (associationType === "HEALTH_SYSTEM") return "EXECUTIVE";
  if (associationType === "CO_INVESTOR") return "INVESTOR_PARTNER";
  return "COMPANY_CONTACT";
}

function toEntityKind(associationType: AssociationType): EntityKind {
  if (associationType === "HEALTH_SYSTEM") return "HEALTH_SYSTEM";
  if (associationType === "CO_INVESTOR") return "CO_INVESTOR";
  return "COMPANY";
}

function initialFilters(): LookupFilters {
  return {
    lookupQuery: "",
    entityType: ""
  };
}

function lookupOptionsForAssociationType(referenceData: ReferenceData, associationType: AssociationType) {
  if (associationType === "HEALTH_SYSTEM") return referenceData.healthSystems;
  if (associationType === "CO_INVESTOR") return referenceData.coInvestors;
  return referenceData.companies;
}

function findSeededPrincipalEntityId(referenceData: ReferenceData, associationType: AssociationType, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return "";
  const options = lookupOptionsForAssociationType(referenceData, associationType);

  const exactMatch = options.find((option) => normalize(option.name) === normalizedQuery);
  if (exactMatch) return exactMatch.id;

  const startsWithMatch = options.find((option) => normalize(option.name).startsWith(normalizedQuery));
  return startsWithMatch?.id || "";
}

function EntityTypeIcon({
  associationType,
  className
}: {
  associationType: AssociationType | "ALL";
  className?: string;
}) {
  if (associationType === "HEALTH_SYSTEM") {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
        <rect x="3.5" y="2.5" width="13" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 6.2V11.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7.2 9H12.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (associationType === "CO_INVESTOR") {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
        <circle cx="7.1" cy="7.2" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12.9" cy="7.2" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3.8 15.5C4.3 13.4 5.8 12.4 7.9 12.4H8.3C10.4 12.4 11.9 13.4 12.4 15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M10.6 15.5C11 14 12.2 13.1 13.8 13.1H14C15.6 13.1 16.8 14 17.2 15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (associationType === "COMPANY") {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
        <rect x="3.2" y="3.2" width="8.4" height="13.6" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 6.2H8.8M6 9.2H8.8M6 12.2H8.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="12.6" y="6.1" width="4.2" height="10.7" rx="1.1" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="9" cy="9" r="5.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.1 13.1L16.2 16.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function draftFromRecord(record: ContactRecord): DetailDraft {
  return {
    name: record.name || "",
    title: record.title || "",
    email: record.email || "",
    phone: record.phone || "",
    linkedinUrl: record.linkedinUrl || "",
    notes: record.notes || "",
    principalEntityType: record.principalEntityType || "",
    principalEntityId: record.principalEntityId || ""
  };
}

function formatOpportunityLabel(item: ReferenceData["opportunities"][number]) {
  const parts = [
    item.company.name,
    item.title,
    humanize(item.stage),
    item.healthSystem?.name || null
  ].filter(Boolean);

  return parts.join(" · ");
}

function upsertEntityOption(
  options: Array<{ id: string; name: string }>,
  nextOption: { id: string; name: string }
) {
  if (options.some((option) => option.id === nextOption.id)) {
    return options;
  }

  return [...options, nextOption].sort((a, b) => a.name.localeCompare(b.name));
}

export function ContactWorkbench() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnToRecordId = React.useMemo(() => searchParams.get("returnRecordId"), [searchParams]);
  const returnToActiveTab = React.useMemo(() => {
    const raw = searchParams.get("returnActiveTab");
    if (
      raw === "overview" ||
      raw === "relationships" ||
      raw === "opportunities" ||
      raw === "notes" ||
      raw === "documents"
    ) {
      return raw;
    }
    return null;
  }, [searchParams]);
  const [records, setRecords] = React.useState<ContactRecord[]>([]);
  const [referenceData, setReferenceData] = React.useState<ReferenceData>({
    healthSystems: [],
    coInvestors: [],
    companies: [],
    opportunities: []
  });
  const [loadingRecords, setLoadingRecords] = React.useState(false);
  const [loadingReferenceData, setLoadingReferenceData] = React.useState(false);
  const [status, setStatus] = React.useState<StatusMessage | null>(null);

  const [filters, setFilters] = React.useState<LookupFilters>(initialFilters);
  const [activeDetailTab, setActiveDetailTab] = React.useState<DetailTab>("overview");
  const [selectedRecordId, setSelectedRecordId] = React.useState<string | null>(null);

  const [detailDraft, setDetailDraft] = React.useState<DetailDraft | null>(null);
  const [savingOverview, setSavingOverview] = React.useState(false);
  const [deletingContact, setDeletingContact] = React.useState(false);

  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createTitle, setCreateTitle] = React.useState("");
  const [createEmail, setCreateEmail] = React.useState("");
  const [createPhone, setCreatePhone] = React.useState("");
  const [createLinkedinUrl, setCreateLinkedinUrl] = React.useState("");
  const [createNotes, setCreateNotes] = React.useState("");
  const [createPrincipalType, setCreatePrincipalType] = React.useState<AssociationType>("HEALTH_SYSTEM");
  const [createPrincipalEntityId, setCreatePrincipalEntityId] = React.useState("");
  const [createPrincipalRoleType, setCreatePrincipalRoleType] = React.useState<ContactRoleType>("EXECUTIVE");
  const [createPrincipalRelationshipTitle, setCreatePrincipalRelationshipTitle] = React.useState("");
  const [creatingContact, setCreatingContact] = React.useState(false);

  const [showAddHealthSystemLookup, setShowAddHealthSystemLookup] = React.useState(false);
  const [showAddCoInvestorLookup, setShowAddCoInvestorLookup] = React.useState(false);
  const [showAddCompanyLookup, setShowAddCompanyLookup] = React.useState(false);
  const [newHealthSystemAssociationId, setNewHealthSystemAssociationId] = React.useState("");
  const [newHealthSystemAssociationIsKeyAllianceContact, setNewHealthSystemAssociationIsKeyAllianceContact] =
    React.useState(false);
  const [newHealthSystemAssociationIsInformedAllianceContact, setNewHealthSystemAssociationIsInformedAllianceContact] =
    React.useState(false);
  const [newCoInvestorAssociationId, setNewCoInvestorAssociationId] = React.useState("");
  const [newCompanyAssociationId, setNewCompanyAssociationId] = React.useState("");
  const [savingAssociation, setSavingAssociation] = React.useState(false);

  const [editingAssociation, setEditingAssociation] = React.useState<EditingAssociation | null>(null);
  const [savingEditedAssociation, setSavingEditedAssociation] = React.useState(false);
  const [deletingAssociationKey, setDeletingAssociationKey] = React.useState<string | null>(null);

  const [opportunityModalOpen, setOpportunityModalOpen] = React.useState(false);
  const [newOpportunityId, setNewOpportunityId] = React.useState("");
  const [newOpportunityRole, setNewOpportunityRole] = React.useState("");
  const [opportunitySearchTerm, setOpportunitySearchTerm] = React.useState("");
  const [savingOpportunity, setSavingOpportunity] = React.useState(false);
  const [contactOpportunityStatusFilter, setContactOpportunityStatusFilter] =
    React.useState<OpportunityStatusFilter>("open");

  const [editingOpportunityLinkId, setEditingOpportunityLinkId] = React.useState<string | null>(null);
  const [editingOpportunityRole, setEditingOpportunityRole] = React.useState("");
  const [savingEditedOpportunity, setSavingEditedOpportunity] = React.useState(false);
  const [deletingOpportunityLinkId, setDeletingOpportunityLinkId] = React.useState<string | null>(null);
  const returnTo = React.useMemo(() => {
    const queryParams = new URLSearchParams(searchParams);
    if (selectedRecordId) {
      queryParams.set("returnRecordId", selectedRecordId);
    }
    if (activeDetailTab) {
      queryParams.set("returnActiveTab", activeDetailTab);
    }
    const query = queryParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [searchParams, pathname, selectedRecordId, activeDetailTab]);

  const selectedRecord = React.useMemo(
    () => records.find((record) => record.id === selectedRecordId) || null,
    [records, selectedRecordId]
  );

  const filteredOpportunityOptions = React.useMemo(() => {
    const normalizedTerm = normalize(opportunitySearchTerm);
    if (!normalizedTerm) return referenceData.opportunities;

    return referenceData.opportunities.filter((item) => {
      return (
        normalize(item.title).includes(normalizedTerm) ||
        normalize(item.company.name).includes(normalizedTerm) ||
        normalize(item.healthSystem?.name).includes(normalizedTerm)
      );
    });
  }, [opportunitySearchTerm, referenceData.opportunities]);

  const filteredOpportunityLinks = React.useMemo(() => {
    const links = selectedRecord?.opportunityLinks || [];
    if (contactOpportunityStatusFilter === "open") {
      return links.filter((link) => !isClosedOpportunityStage(link.opportunity.stage));
    }

    return links.filter((link) => isClosedOpportunityStage(link.opportunity.stage));
  }, [contactOpportunityStatusFilter, selectedRecord?.opportunityLinks]);

  const hasNoMatchesForLookup =
    !loadingRecords &&
    records.length === 0 &&
    (trim(filters.lookupQuery).length > 0 || Boolean(filters.entityType));

  const createPrincipalOptions = React.useMemo(() => {
    if (createPrincipalType === "HEALTH_SYSTEM") return referenceData.healthSystems;
    if (createPrincipalType === "CO_INVESTOR") return referenceData.coInvestors;
    return referenceData.companies;
  }, [createPrincipalType, referenceData]);

  const overviewPrincipalOptions = React.useMemo(() => {
    if (!detailDraft?.principalEntityType) return [];
    if (detailDraft.principalEntityType === "HEALTH_SYSTEM") return referenceData.healthSystems;
    if (detailDraft.principalEntityType === "CO_INVESTOR") return referenceData.coInvestors;
    return referenceData.companies;
  }, [detailDraft?.principalEntityType, referenceData]);

  const overviewDirty = React.useMemo(() => {
    if (!selectedRecord || !detailDraft) return false;
    const original = draftFromRecord(selectedRecord);
    return (
      original.name !== detailDraft.name ||
      original.title !== detailDraft.title ||
      original.email !== detailDraft.email ||
      original.phone !== detailDraft.phone ||
      original.linkedinUrl !== detailDraft.linkedinUrl ||
      original.notes !== detailDraft.notes ||
      original.principalEntityType !== detailDraft.principalEntityType ||
      original.principalEntityId !== detailDraft.principalEntityId
    );
  }, [detailDraft, selectedRecord]);

  const loadRecords = React.useCallback(
    async (options?: {
      preferredRecordId?: string | null;
      overrideFilters?: Partial<LookupFilters>;
    }) => {
      const effectiveFilters: LookupFilters = {
        ...filters,
        ...(options?.overrideFilters || {})
      };

      setLoadingRecords(true);

      try {
        const params = new URLSearchParams();
        const lookupQuery = trim(effectiveFilters.lookupQuery);
        if (lookupQuery) {
          params.set("q", lookupQuery);
        }

        if (effectiveFilters.entityType) {
          params.set("entityType", effectiveFilters.entityType);
        }

        const queryString = params.toString();
        const endpoint = queryString ? `/api/contacts?${queryString}` : "/api/contacts";
        const res = await fetch(endpoint, { cache: "no-store" });
        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload.error || "Failed to load contacts");
        }

        const list = Array.isArray(payload.contacts) ? (payload.contacts as ContactRecord[]) : [];
        setRecords(list);
        setSelectedRecordId((current) => {
          const desired = options?.preferredRecordId !== undefined ? options.preferredRecordId : current;
          if (desired && list.some((record) => record.id === desired)) {
            return desired;
          }
          return list.length > 0 ? list[0].id : null;
        });
      } catch (error) {
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load contacts"
        });
      } finally {
        setLoadingRecords(false);
      }
    },
    [filters]
  );

  const loadReferenceData = React.useCallback(async () => {
    setLoadingReferenceData(true);

    try {
      const res = await fetch("/api/contacts/reference-data", { cache: "no-store" });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to load relationship options");
      }

      setReferenceData({
        healthSystems: Array.isArray(payload.healthSystems) ? payload.healthSystems : [],
        coInvestors: Array.isArray(payload.coInvestors) ? payload.coInvestors : [],
        companies: Array.isArray(payload.companies) ? payload.companies : [],
        opportunities: Array.isArray(payload.opportunities) ? payload.opportunities : []
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load relationship options"
      });
    } finally {
      setLoadingReferenceData(false);
    }
  }, []);

  React.useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRecords();
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [loadRecords]);

  React.useEffect(() => {
    if (!selectedRecord) {
      setDetailDraft(null);
      return;
    }

    setDetailDraft(draftFromRecord(selectedRecord));
    if (returnToActiveTab && selectedRecord.id === returnToRecordId) {
      setActiveDetailTab(returnToActiveTab);
    }
  }, [returnToActiveTab, returnToRecordId, selectedRecord]);

  React.useEffect(() => {
    if (records.length === 0) {
      setSelectedRecordId(null);
      return;
    }

    if (!selectedRecordId) {
      if (returnToRecordId && records.some((record) => record.id === returnToRecordId)) {
        setSelectedRecordId(returnToRecordId);
        return;
      }

      setSelectedRecordId(records[0].id);
      return;
    }

    if (!records.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(records[0].id);
    }
  }, [records, returnToRecordId, selectedRecordId]);

  React.useEffect(() => {
    if (activeDetailTab !== "overview") return;
    if (!selectedRecord || !detailDraft) return;
    if (!overviewDirty) return;
    if (savingOverview) return;
    if (!trim(detailDraft.name)) return;
    if (detailDraft.principalEntityType && !detailDraft.principalEntityId) return;

    const draftSnapshot = detailDraft;
    const timeout = window.setTimeout(() => {
      void saveOverview(draftSnapshot);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [activeDetailTab, detailDraft, overviewDirty, savingOverview, selectedRecord]);

  React.useEffect(() => {
    setCreatePrincipalRoleType(defaultRoleTypeForAssociation(createPrincipalType));
    setCreatePrincipalEntityId("");
    setCreatePrincipalRelationshipTitle("");
  }, [createPrincipalType]);

  function updateReferenceDataForEntity(associationType: AssociationType, option: { id: string; name: string }) {
    setReferenceData((current) => {
      if (associationType === "HEALTH_SYSTEM") {
        return {
          ...current,
          healthSystems: upsertEntityOption(current.healthSystems, option)
        };
      }

      if (associationType === "CO_INVESTOR") {
        return {
          ...current,
          coInvestors: upsertEntityOption(current.coInvestors, option)
        };
      }

      return {
        ...current,
        companies: upsertEntityOption(current.companies, option)
      };
    });
  }

  function openCreateContactModal(seedName?: string) {
    const preferredPrincipalType = filters.entityType || "HEALTH_SYSTEM";
    const preferredPrincipalId = findSeededPrincipalEntityId(
      referenceData,
      preferredPrincipalType,
      seedName || filters.lookupQuery
    );

    setCreateName(seedName || trim(filters.lookupQuery));
    setCreateTitle("");
    setCreateEmail("");
    setCreatePhone("");
    setCreateLinkedinUrl("");
    setCreateNotes("");
    setCreatePrincipalType(preferredPrincipalType);
    setCreatePrincipalEntityId(preferredPrincipalId);
    setCreatePrincipalRoleType(defaultRoleTypeForAssociation(preferredPrincipalType));
    setCreatePrincipalRelationshipTitle("");
    setCreateModalOpen(true);
  }

  async function createContact() {
    if (!trim(createName)) {
      setStatus({ kind: "error", text: "Contact name is required." });
      return;
    }

    if (!createPrincipalEntityId) {
      setStatus({ kind: "error", text: "Select a principal entity for this contact." });
      return;
    }

    setCreatingContact(true);
    setStatus(null);

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          title: createTitle,
          email: createEmail,
          phone: createPhone,
          linkedinUrl: createLinkedinUrl,
          notes: createNotes,
          principalEntityType: createPrincipalType,
          principalEntityId: createPrincipalEntityId,
          principalRoleType: createPrincipalRoleType,
          principalRelationshipTitle: createPrincipalRelationshipTitle
        })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to create contact");
      }

      const createdContact = payload.contact as { id: string; name: string } | undefined;
      const resolution = payload.resolution as { matchedBy?: string; wasCreated?: boolean } | undefined;

      setCreateModalOpen(false);
      await loadRecords({ preferredRecordId: createdContact?.id || null });
      setStatus({
        kind: "ok",
        text: resolution?.wasCreated
          ? `${createdContact?.name || "Contact"} created.`
          : `${createdContact?.name || "Contact"} matched existing record by ${resolution?.matchedBy || "identity"}.`
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create contact"
      });
    } finally {
      setCreatingContact(false);
    }
  }

  async function saveOverview(draftOverride?: DetailDraft) {
    const draft = draftOverride ?? detailDraft;
    if (!selectedRecord || !draft) return;

    if (!trim(draft.name)) {
      setStatus({ kind: "error", text: "Contact name is required." });
      return;
    }

    if (draft.principalEntityType && !draft.principalEntityId) {
      setStatus({ kind: "error", text: "Select a principal entity record." });
      return;
    }

    setSavingOverview(true);

    try {
      const res = await fetch(`/api/contacts/${selectedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          title: draft.title,
          email: draft.email,
          phone: draft.phone,
          linkedinUrl: draft.linkedinUrl,
          notes: draft.notes,
          principalEntityType: draft.principalEntityType || null,
          principalEntityId: draft.principalEntityId || null
        })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to update contact");
      }

      await loadRecords({ preferredRecordId: selectedRecord.id });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update contact"
      });
    } finally {
      setSavingOverview(false);
    }
  }

  async function deleteSelectedContact() {
    if (!selectedRecord) return;
    if (!window.confirm(`Delete ${selectedRecord.name}?`)) return;

    setDeletingContact(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/contacts/${selectedRecord.id}`, { method: "DELETE" });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete contact");
      }

      await loadRecords({ preferredRecordId: null });
      setStatus({ kind: "ok", text: `${selectedRecord.name} deleted.` });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete contact"
      });
    } finally {
      setDeletingContact(false);
    }
  }

  function closeAssociationLookup(associationType: AssociationType) {
    if (associationType === "HEALTH_SYSTEM") {
      setShowAddHealthSystemLookup(false);
      setNewHealthSystemAssociationId("");
      setNewHealthSystemAssociationIsKeyAllianceContact(false);
      setNewHealthSystemAssociationIsInformedAllianceContact(false);
      return;
    }

    if (associationType === "CO_INVESTOR") {
      setShowAddCoInvestorLookup(false);
      setNewCoInvestorAssociationId("");
      return;
    }

    setShowAddCompanyLookup(false);
    setNewCompanyAssociationId("");
  }

  function openAssociationLookup(associationType: AssociationType) {
    setStatus(null);
    setShowAddHealthSystemLookup(associationType === "HEALTH_SYSTEM");
    setShowAddCoInvestorLookup(associationType === "CO_INVESTOR");
    setShowAddCompanyLookup(associationType === "COMPANY");
    setNewHealthSystemAssociationId("");
    setNewHealthSystemAssociationIsKeyAllianceContact(false);
    setNewHealthSystemAssociationIsInformedAllianceContact(false);
    setNewCoInvestorAssociationId("");
    setNewCompanyAssociationId("");
  }

  async function addAssociation(associationType: AssociationType, targetId: string) {
    if (!selectedRecord) return;
    if (!targetId) {
      setStatus({ kind: "error", text: "Select a record to associate." });
      return;
    }

    setSavingAssociation(true);
    setStatus(null);
  
    try {
      const associationPayload: Record<string, unknown> = {
        associationType,
        targetId,
        roleType: defaultRoleTypeForAssociation(associationType),
        title: ""
      };

      if (associationType === "HEALTH_SYSTEM") {
        associationPayload.isKeyAllianceContact = newHealthSystemAssociationIsKeyAllianceContact;
        associationPayload.isInformedAllianceContact = newHealthSystemAssociationIsInformedAllianceContact;
      }

      const res = await fetch(`/api/contacts/${selectedRecord.id}/associations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(associationPayload)
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to add association");
      }

      closeAssociationLookup(associationType);
      await loadRecords({ preferredRecordId: selectedRecord.id });
      setStatus({ kind: "ok", text: `${associationTypeLabel(associationType)} relationship added.` });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add association"
      });
    } finally {
      setSavingAssociation(false);
    }
  }

  function beginEditAssociation(
    associationType: AssociationType,
    link: {
      id: string;
      roleType: ContactRoleType;
      title?: string | null;
      isKeyAllianceContact?: boolean;
      isInformedAllianceContact?: boolean;
    }
  ) {
    setEditingAssociation({
      associationType,
      linkId: link.id,
      roleType: link.roleType,
      title: link.title || "",
      isKeyAllianceContact: Boolean(link.isKeyAllianceContact),
      isInformedAllianceContact: Boolean(link.isInformedAllianceContact)
    });
  }

  async function saveEditedAssociation() {
    if (!selectedRecord || !editingAssociation) return;
    const associationPayload: Record<string, unknown> = {
      associationType: editingAssociation.associationType,
      linkId: editingAssociation.linkId,
      roleType: editingAssociation.roleType,
      title: editingAssociation.title
    };

    if (editingAssociation.associationType === "HEALTH_SYSTEM") {
      associationPayload.isKeyAllianceContact = editingAssociation.isKeyAllianceContact;
      associationPayload.isInformedAllianceContact = editingAssociation.isInformedAllianceContact;
    }

    setSavingEditedAssociation(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/contacts/${selectedRecord.id}/associations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(associationPayload)
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to update association");
      }

      setEditingAssociation(null);
      await loadRecords({ preferredRecordId: selectedRecord.id });
      setStatus({ kind: "ok", text: "Association updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update association"
      });
    } finally {
      setSavingEditedAssociation(false);
    }
  }

  async function deleteAssociation(associationType: AssociationType, linkId: string) {
    if (!selectedRecord) return;
    if (!window.confirm("Remove this association?")) return;

    const associationKey = `${associationType}:${linkId}`;
    setDeletingAssociationKey(associationKey);
    setStatus(null);

    try {
      const res = await fetch(`/api/contacts/${selectedRecord.id}/associations`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          associationType,
          linkId
        })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete association");
      }

      if (editingAssociation?.associationType === associationType && editingAssociation.linkId === linkId) {
        setEditingAssociation(null);
      }

      await loadRecords({ preferredRecordId: selectedRecord.id });
      setStatus({ kind: "ok", text: "Association removed." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete association"
      });
    } finally {
      setDeletingAssociationKey(null);
    }
  }

  async function addOpportunityLink() {
    if (!selectedRecord) return;
    if (!newOpportunityId) {
      setStatus({ kind: "error", text: "Select an opportunity." });
      return;
    }

    setSavingOpportunity(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/contacts/${selectedRecord.id}/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: newOpportunityId,
          role: newOpportunityRole
        })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to add opportunity link");
      }

      setOpportunityModalOpen(false);
      setOpportunitySearchTerm("");
      setNewOpportunityId("");
      setNewOpportunityRole("");
      await loadRecords({ preferredRecordId: selectedRecord.id });
      setStatus({ kind: "ok", text: "Opportunity link added." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add opportunity link"
      });
    } finally {
      setSavingOpportunity(false);
    }
  }

  async function saveEditedOpportunity() {
    if (!selectedRecord || !editingOpportunityLinkId) return;

    setSavingEditedOpportunity(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/contacts/${selectedRecord.id}/opportunities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId: editingOpportunityLinkId,
          role: editingOpportunityRole
        })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to update opportunity link");
      }

      setEditingOpportunityLinkId(null);
      setEditingOpportunityRole("");
      await loadRecords({ preferredRecordId: selectedRecord.id });
      setStatus({ kind: "ok", text: "Opportunity link updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update opportunity link"
      });
    } finally {
      setSavingEditedOpportunity(false);
    }
  }

  async function deleteOpportunityLink(linkId: string) {
    if (!selectedRecord) return;
    if (!window.confirm("Remove this opportunity link?")) return;

    setDeletingOpportunityLinkId(linkId);
    setStatus(null);

    try {
      const res = await fetch(`/api/contacts/${selectedRecord.id}/opportunities`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to remove opportunity link");
      }

      if (editingOpportunityLinkId === linkId) {
        setEditingOpportunityLinkId(null);
        setEditingOpportunityRole("");
      }

      await loadRecords({ preferredRecordId: selectedRecord.id });
      setStatus({ kind: "ok", text: "Opportunity link removed." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to remove opportunity link"
      });
    } finally {
      setDeletingOpportunityLinkId(null);
    }
  }

  return (
    <main>
      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}

      <section className="grid health-system-workbench-layout">
        <aside className="panel health-system-list-panel contact-lookup-panel">
          <h2>Contact Lookup</h2>

          <div className="contact-lookup-shell">
            <div className="contact-lookup-search">
              <EntityTypeIcon associationType="ALL" className="contact-lookup-search-icon" />
              <input
                value={filters.lookupQuery}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    lookupQuery: event.target.value
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && hasNoMatchesForLookup) {
                    event.preventDefault();
                    openCreateContactModal();
                  }
                }}
                placeholder="Search name, title, email, phone, or linked entity"
                aria-label="Search contacts"
              />
              {trim(filters.lookupQuery) ? (
                <button
                  type="button"
                  className="ghost small contact-lookup-clear"
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      lookupQuery: ""
                    }))
                  }
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="contact-lookup-type-filter-group" role="toolbar" aria-label="Filter by entity type">
              {lookupEntityTypeOptions.map((option) => {
                const isActive = filters.entityType === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    className={`contact-lookup-type-filter ${isActive ? "active" : ""}`}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        entityType: option.value
                      }))
                    }
                    aria-pressed={isActive}
                  >
                    <EntityTypeIcon
                      associationType={option.value || "ALL"}
                      className="contact-lookup-type-filter-icon"
                    />
                  </button>
                );
              })}
            </div>

            <div className="contact-lookup-meta">
              <p className="muted">Smart lookup spans contact fields and linked entities.</p>
              <div className="actions contact-lookup-actions">
                <button type="button" className="secondary" onClick={() => openCreateContactModal()}>
                  Add Contact
                </button>
                {loadingReferenceData ? <span className="muted">Loading options...</span> : null}
              </div>
            </div>
          </div>

          {hasNoMatchesForLookup ? (
            <div className="contact-lookup-empty">
              <p>No contacts matched this search.</p>
              <button type="button" className="primary" onClick={() => openCreateContactModal()}>
                Create "{trim(filters.lookupQuery) || "New Contact"}"
              </button>
            </div>
          ) : null}

          <div className="health-system-panel-scroll">
            {loadingRecords ? <p className="muted">Loading contacts...</p> : null}
            {!loadingRecords && records.length === 0 ? <p className="muted">No contacts found.</p> : null}

            {!loadingRecords ? (
              <div className="list-container contact-list-container">
                {records.map((record) => {
                  const associationCount =
                    record.healthSystemLinks.length + record.coInvestorLinks.length + record.companyLinks.length;
                  const hasKeyAllianceContact = record.healthSystemLinks.some((link) => link.isKeyAllianceContact);
                  const hasInformedAllianceContact = record.healthSystemLinks.some(
                    (link) => link.isInformedAllianceContact
                  );
                  const entityTypeCounts: Array<{
                    type: AssociationType;
                    label: string;
                    count: number;
                  }> = [
                    { type: "HEALTH_SYSTEM", label: "HS", count: record.healthSystemLinks.length },
                    { type: "CO_INVESTOR", label: "CI", count: record.coInvestorLinks.length },
                    { type: "COMPANY", label: "Co", count: record.companyLinks.length }
                  ];

                  return (
                    <button
                      key={record.id}
                      type="button"
                      className={`list-row contact-list-row ${selectedRecordId === record.id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedRecordId(record.id);
                        setActiveDetailTab("overview");
                      }}
                    >
                      <div className="list-row-main contact-list-row-main">
                        <div className="contact-list-row-head">
                          <strong>{record.name}</strong>
                          <span className="flag-pill">{record.opportunityLinks.length} opps</span>
                        </div>
                        <p className="muted">{record.title || record.email || "No title/email yet"}</p>

                        <div className="contact-list-entity-pills">
                          {entityTypeCounts.map((entry) => (
                            <span
                              key={entry.type}
                              className={`contact-list-entity-pill ${entry.count > 0 ? "has-links" : "is-empty"}`}
                            >
                              <EntityTypeIcon associationType={entry.type} className="contact-list-entity-pill-icon" />
                              <span>
                                {entry.count} {entry.label}
                              </span>
                            </span>
                          ))}
                        </div>

                        <p className="contact-list-principal">
                          {record.principalEntity ? record.principalEntity.name : "No principal"}
                        </p>
                      </div>

                      <div className="list-row-meta contact-list-row-meta">
                        <p className="contact-list-summary">
                          {associationCount} links · {record.noteCount} notes · {record.documentCount} docs
                        </p>
                        {(hasKeyAllianceContact || hasInformedAllianceContact) ? (
                          <div className="contact-list-alliance-flags">
                            {hasKeyAllianceContact ? (
                              <span className="flag-pill" title="Key Alliance Contact">
                                Key
                              </span>
                            ) : null}
                            {hasInformedAllianceContact ? (
                              <span className="flag-pill" title="Informed Alliance Contact">
                                Informed
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="panel health-system-detail-panel entity-detail-panel">
          {selectedRecord ? (
            <div className="health-system-panel-scroll">
              <div className="detail-head detail-head-minimal">
                <h3>{selectedRecord.name}</h3>
              </div>

              <div className="detail-tabs" role="tablist" aria-label="Contact detail sections">
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "overview" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "overview"}
                  onClick={() => setActiveDetailTab("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "relationships" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "relationships"}
                  onClick={() => setActiveDetailTab("relationships")}
                >
                  Relationships
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "opportunities" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "opportunities"}
                  onClick={() => setActiveDetailTab("opportunities")}
                >
                  Opportunities
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "notes" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "notes"}
                  onClick={() => setActiveDetailTab("notes")}
                >
                  Notes
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "documents" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "documents"}
                  onClick={() => setActiveDetailTab("documents")}
                >
                  Documents
                </button>
              </div>

              {activeDetailTab === "overview" && detailDraft ? (
                <div className="detail-card">
                  <div className="detail-section">
                    <p className="detail-label">Principal Entity</p>
                    <p className="muted">
                      {selectedRecord.principalEntity
                        ? `${associationTypeLabel(selectedRecord.principalEntity.type)} · ${selectedRecord.principalEntity.name}`
                        : "No principal entity selected yet."}
                    </p>
                    <div className="detail-grid">
                      <div>
                        <label>Principal Type</label>
                        <select
                          value={detailDraft.principalEntityType}
                          onChange={(event) =>
                            setDetailDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    principalEntityType: event.target.value as AssociationType | "",
                                    principalEntityId: ""
                                  }
                                : current
                            )
                          }
                        >
                          <option value="">Not set</option>
                          {associationTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Principal Record</label>
                        {detailDraft.principalEntityType ? (
                          <EntityLookupInput
                            entityKind={toEntityKind(detailDraft.principalEntityType as AssociationType)}
                            value={detailDraft.principalEntityId}
                            onChange={(nextValue) =>
                              setDetailDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      principalEntityId: nextValue
                                    }
                                  : current
                              )
                            }
                            initialOptions={overviewPrincipalOptions.map((item) => ({ id: item.id, name: item.name }))}
                            allowEmpty
                            emptyLabel="No principal record selected"
                            placeholder={`Select ${associationTypeLabel(detailDraft.principalEntityType as AssociationType)}`}
                            onEntityCreated={(option) =>
                              updateReferenceDataForEntity(detailDraft.principalEntityType as AssociationType, {
                                id: option.id,
                                name: option.name
                              })
                            }
                          />
                        ) : (
                          <p className="muted">Select a principal type first.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <div>
                      <label>Name</label>
                      <input
                        value={detailDraft.name}
                        onChange={(event) =>
                          setDetailDraft((current) => (current ? { ...current, name: event.target.value } : current))
                        }
                        placeholder="Contact name"
                      />
                    </div>
                    <div>
                      <label>Title</label>
                      <input
                        value={detailDraft.title}
                        onChange={(event) =>
                          setDetailDraft((current) => (current ? { ...current, title: event.target.value } : current))
                        }
                        placeholder="Job title"
                      />
                    </div>
                    <div>
                      <label>Email</label>
                      <input
                        value={detailDraft.email}
                        onChange={(event) =>
                          setDetailDraft((current) => (current ? { ...current, email: event.target.value } : current))
                        }
                        placeholder="name@company.com"
                      />
                    </div>
                    <div>
                      <label>Phone</label>
                      <input
                        value={detailDraft.phone}
                        onChange={(event) =>
                          setDetailDraft((current) => (current ? { ...current, phone: event.target.value } : current))
                        }
                        placeholder="(555) 555-5555"
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label>LinkedIn URL</label>
                      <input
                        value={detailDraft.linkedinUrl}
                        onChange={(event) =>
                          setDetailDraft((current) =>
                            current ? { ...current, linkedinUrl: event.target.value } : current
                          )
                        }
                        placeholder="https://linkedin.com/in/..."
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label>Internal Notes</label>
                      <textarea
                        value={detailDraft.notes}
                        onChange={(event) =>
                          setDetailDraft((current) => (current ? { ...current, notes: event.target.value } : current))
                        }
                        placeholder="Internal context and reminders"
                        rows={4}
                      />
                    </div>
                  </div>

                  <div className="detail-section entity-delete-section">
                    <div className="actions">
                      <button
                        type="button"
                        className="ghost small danger"
                        onClick={() => void deleteSelectedContact()}
                        disabled={deletingContact}
                      >
                        {deletingContact ? "Deleting..." : "Delete Contact"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeDetailTab === "relationships" ? (
                <div className="detail-section">
                  <p className="detail-label">Health Systems</p>
                  <div className="actions actions-flush">
                    <button
                      type="button"
                      className="ghost small contact-add-link"
                      onClick={() => {
                        if (showAddHealthSystemLookup) {
                          closeAssociationLookup("HEALTH_SYSTEM");
                          return;
                        }
                        openAssociationLookup("HEALTH_SYSTEM");
                      }}
                    >
                      {showAddHealthSystemLookup ? "Cancel" : "Add Health System"}
                    </button>
                  </div>
                  {showAddHealthSystemLookup ? (
                    <div className="actions relationship-inline-add">
                      <EntityLookupInput
                        entityKind="HEALTH_SYSTEM"
                        value={newHealthSystemAssociationId}
                        onChange={(nextId) => {
                          setNewHealthSystemAssociationId(nextId);
                        }}
                        initialOptions={referenceData.healthSystems.map((item) => ({ id: item.id, name: item.name }))}
                        className="relationship-inline-lookup"
                        placeholder="Search health systems (or Add New)"
                        disabled={savingAssociation}
                        autoOpenCreateOnEnterNoMatch
                        onEntityCreated={(option) =>
                          updateReferenceDataForEntity("HEALTH_SYSTEM", { id: option.id, name: option.name })
                        }
                      />
                      <div className="detail-grid">
                        <div className="inline-edit-field">
                          <label>Key Alliance Contact</label>
                          <input
                            type="checkbox"
                            checked={newHealthSystemAssociationIsKeyAllianceContact}
                            onChange={(event) =>
                              setNewHealthSystemAssociationIsKeyAllianceContact(event.target.checked)
                            }
                            disabled={savingAssociation}
                          />
                        </div>
                        <div className="inline-edit-field">
                          <label>Informed Alliance Contact</label>
                          <input
                            type="checkbox"
                            checked={newHealthSystemAssociationIsInformedAllianceContact}
                            onChange={(event) =>
                              setNewHealthSystemAssociationIsInformedAllianceContact(event.target.checked)
                            }
                            disabled={savingAssociation}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void addAssociation("HEALTH_SYSTEM", newHealthSystemAssociationId)}
                        disabled={savingAssociation || !newHealthSystemAssociationId}
                      >
                        {savingAssociation ? "Adding..." : "Add Health System"}
                      </button>
                    </div>
                  ) : null}
                  {selectedRecord.healthSystemLinks.length === 0 ? <p className="muted">No health system links.</p> : null}
                  {selectedRecord.healthSystemLinks.map((link) => {
                    const associationKey = `HEALTH_SYSTEM:${link.id}`;
                    const isEditing =
                      editingAssociation?.associationType === "HEALTH_SYSTEM" && editingAssociation.linkId === link.id;
                    const isDeleting = deletingAssociationKey === associationKey;
                    return (
                      <div key={link.id} className="detail-list-item">
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>{link.healthSystem.name}</strong>
                            <p className="muted">
                              {roleTypeLabel(link.roleType)}
                              {link.title ? ` · ${link.title}` : ""}
                            </p>
                            {(link.isKeyAllianceContact || link.isInformedAllianceContact) ? (
                              <div className="contact-list-inline-flags">
                                {link.isKeyAllianceContact ? <span className="flag-pill">Key Alliance Contact</span> : null}
                                {link.isInformedAllianceContact ? (
                                  <span className="flag-pill">Informed Alliance Contact</span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="contact-row-actions">
                            <button type="button" className="ghost small" onClick={() => beginEditAssociation("HEALTH_SYSTEM", link)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => void deleteAssociation("HEALTH_SYSTEM", link.id)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? "Removing..." : "Delete"}
                            </button>
                          </div>
                        </div>
                        {isEditing && editingAssociation ? (
                          <div className="detail-card">
                            <div className="detail-grid">
                              <div>
                                <label>Role</label>
                                <select
                                  value={editingAssociation.roleType}
                                  onChange={(event) =>
                                    setEditingAssociation((current) =>
                                      current ? { ...current, roleType: event.target.value as ContactRoleType } : current
                                    )
                                  }
                                >
                                  {roleTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label>Relationship Title</label>
                                <input
                                  value={editingAssociation.title}
                                  onChange={(event) =>
                                    setEditingAssociation((current) =>
                                      current ? { ...current, title: event.target.value } : current
                                    )
                                  }
                                  placeholder="Relationship title"
                                />
                              </div>
                              <div className="inline-edit-field">
                                <label>Key Alliance Contact</label>
                                <input
                                  type="checkbox"
                                  checked={editingAssociation.isKeyAllianceContact}
                                  onChange={(event) =>
                                    setEditingAssociation((current) =>
                                      current
                                        ? {
                                            ...current,
                                            isKeyAllianceContact: event.target.checked
                                          }
                                        : current
                                    )
                                  }
                                />
                              </div>
                              <div className="inline-edit-field">
                                <label>Informed Alliance Contact</label>
                                <input
                                  type="checkbox"
                                  checked={editingAssociation.isInformedAllianceContact}
                                  onChange={(event) =>
                                    setEditingAssociation((current) =>
                                      current
                                        ? {
                                            ...current,
                                            isInformedAllianceContact: event.target.checked
                                          }
                                        : current
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <div className="actions">
                              <button type="button" className="primary" onClick={() => void saveEditedAssociation()} disabled={savingEditedAssociation}>
                                {savingEditedAssociation ? "Saving..." : "Save Association"}
                              </button>
                              <button type="button" className="ghost small" onClick={() => setEditingAssociation(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  <p className="detail-label">Co-Investors</p>
                  <div className="actions actions-flush">
                    <button
                      type="button"
                      className="ghost small contact-add-link"
                      onClick={() => {
                        if (showAddCoInvestorLookup) {
                          closeAssociationLookup("CO_INVESTOR");
                          return;
                        }
                        openAssociationLookup("CO_INVESTOR");
                      }}
                    >
                      {showAddCoInvestorLookup ? "Cancel" : "Add Co-Investor"}
                    </button>
                  </div>
                  {showAddCoInvestorLookup ? (
                    <div className="actions relationship-inline-add">
                      <EntityLookupInput
                        entityKind="CO_INVESTOR"
                        value={newCoInvestorAssociationId}
                        onChange={(nextId) => {
                          setNewCoInvestorAssociationId(nextId);
                          if (!nextId || savingAssociation) return;
                          void addAssociation("CO_INVESTOR", nextId);
                        }}
                        initialOptions={referenceData.coInvestors.map((item) => ({ id: item.id, name: item.name }))}
                        className="relationship-inline-lookup"
                        placeholder="Search co-investors (or Add New)"
                        disabled={savingAssociation}
                        autoOpenCreateOnEnterNoMatch
                        onEntityCreated={(option) =>
                          updateReferenceDataForEntity("CO_INVESTOR", { id: option.id, name: option.name })
                        }
                      />
                    </div>
                  ) : null}
                  {selectedRecord.coInvestorLinks.length === 0 ? <p className="muted">No co-investor links.</p> : null}
                  {selectedRecord.coInvestorLinks.map((link) => {
                    const associationKey = `CO_INVESTOR:${link.id}`;
                    const isEditing =
                      editingAssociation?.associationType === "CO_INVESTOR" && editingAssociation.linkId === link.id;
                    const isDeleting = deletingAssociationKey === associationKey;
                    return (
                      <div key={link.id} className="detail-list-item">
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>{link.coInvestor.name}</strong>
                            <p className="muted">
                              {roleTypeLabel(link.roleType)}
                              {link.title ? ` · ${link.title}` : ""}
                            </p>
                          </div>
                          <div className="contact-row-actions">
                            <button type="button" className="ghost small" onClick={() => beginEditAssociation("CO_INVESTOR", link)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => void deleteAssociation("CO_INVESTOR", link.id)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? "Removing..." : "Delete"}
                            </button>
                          </div>
                        </div>
                        {isEditing && editingAssociation ? (
                          <div className="detail-card">
                            <div className="detail-grid">
                              <div>
                                <label>Role</label>
                                <select
                                  value={editingAssociation.roleType}
                                  onChange={(event) =>
                                    setEditingAssociation((current) =>
                                      current ? { ...current, roleType: event.target.value as ContactRoleType } : current
                                    )
                                  }
                                >
                                  {roleTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label>Relationship Title</label>
                                <input
                                  value={editingAssociation.title}
                                  onChange={(event) =>
                                    setEditingAssociation((current) =>
                                      current ? { ...current, title: event.target.value } : current
                                    )
                                  }
                                  placeholder="Relationship title"
                                />
                              </div>
                            </div>
                            <div className="actions">
                              <button type="button" className="primary" onClick={() => void saveEditedAssociation()} disabled={savingEditedAssociation}>
                                {savingEditedAssociation ? "Saving..." : "Save Association"}
                              </button>
                              <button type="button" className="ghost small" onClick={() => setEditingAssociation(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  <p className="detail-label">Companies</p>
                  <div className="actions actions-flush">
                    <button
                      type="button"
                      className="ghost small contact-add-link"
                      onClick={() => {
                        if (showAddCompanyLookup) {
                          closeAssociationLookup("COMPANY");
                          return;
                        }
                        openAssociationLookup("COMPANY");
                      }}
                    >
                      {showAddCompanyLookup ? "Cancel" : "Add Company"}
                    </button>
                  </div>
                  {showAddCompanyLookup ? (
                    <div className="actions relationship-inline-add">
                      <EntityLookupInput
                        entityKind="COMPANY"
                        value={newCompanyAssociationId}
                        onChange={(nextId) => {
                          setNewCompanyAssociationId(nextId);
                          if (!nextId || savingAssociation) return;
                          void addAssociation("COMPANY", nextId);
                        }}
                        initialOptions={referenceData.companies.map((item) => ({ id: item.id, name: item.name }))}
                        className="relationship-inline-lookup"
                        placeholder="Search companies (or Add New)"
                        disabled={savingAssociation}
                        autoOpenCreateOnEnterNoMatch
                        companyCreateDefaults={{
                          companyType: "STARTUP",
                          primaryCategory: "OTHER",
                          leadSourceType: "OTHER",
                          leadSourceOther: "Added from contact relationship"
                        }}
                        onEntityCreated={(option) =>
                          updateReferenceDataForEntity("COMPANY", { id: option.id, name: option.name })
                        }
                      />
                    </div>
                  ) : null}
                  {selectedRecord.companyLinks.length === 0 ? <p className="muted">No company links.</p> : null}
                  {selectedRecord.companyLinks.map((link) => {
                    const associationKey = `COMPANY:${link.id}`;
                    const isEditing =
                      editingAssociation?.associationType === "COMPANY" && editingAssociation.linkId === link.id;
                    const isDeleting = deletingAssociationKey === associationKey;
                    return (
                      <div key={link.id} className="detail-list-item">
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>{link.company.name}</strong>
                            <p className="muted">
                              {roleTypeLabel(link.roleType)}
                              {link.title ? ` · ${link.title}` : ""}
                            </p>
                          </div>
                          <div className="contact-row-actions">
                            <button type="button" className="ghost small" onClick={() => beginEditAssociation("COMPANY", link)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => void deleteAssociation("COMPANY", link.id)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? "Removing..." : "Delete"}
                            </button>
                          </div>
                        </div>
                        {isEditing && editingAssociation ? (
                          <div className="detail-card">
                            <div className="detail-grid">
                              <div>
                                <label>Role</label>
                                <select
                                  value={editingAssociation.roleType}
                                  onChange={(event) =>
                                    setEditingAssociation((current) =>
                                      current ? { ...current, roleType: event.target.value as ContactRoleType } : current
                                    )
                                  }
                                >
                                  {roleTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label>Relationship Title</label>
                                <input
                                  value={editingAssociation.title}
                                  onChange={(event) =>
                                    setEditingAssociation((current) =>
                                      current ? { ...current, title: event.target.value } : current
                                    )
                                  }
                                  placeholder="Relationship title"
                                />
                              </div>
                            </div>
                            <div className="actions">
                              <button type="button" className="primary" onClick={() => void saveEditedAssociation()} disabled={savingEditedAssociation}>
                                {savingEditedAssociation ? "Saving..." : "Save Association"}
                              </button>
                              <button type="button" className="ghost small" onClick={() => setEditingAssociation(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {activeDetailTab === "opportunities" ? (
                <div className="detail-section opportunity-section">
                  <p className="detail-label">Opportunities</p>
                  <div className="opportunity-filter-bar" role="radiogroup" aria-label="Filter opportunities by status">
                    <p className="opportunity-filter-label">Status</p>
                    <div className="opportunity-filter-options">
                      {(
                        [
                          { value: "open", label: "Open" },
                          { value: "closed", label: "Closed" }
                        ] as const
                      ).map((option) => {
                        const active = contactOpportunityStatusFilter === option.value;
                        return (
                          <label
                            key={option.value}
                            className={`opportunity-filter-option ${active ? "active" : ""}`}
                            htmlFor={`contact-opportunities-filter-${selectedRecord.id}-${option.value}`}
                          >
                            <span>{option.label}</span>
                            <input
                              id={`contact-opportunities-filter-${selectedRecord.id}-${option.value}`}
                              type="radio"
                              name={`contact-opportunities-filter-${selectedRecord.id}`}
                              value={option.value}
                              checked={active}
                              onChange={() => setContactOpportunityStatusFilter(option.value)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {selectedRecord.opportunityLinks.length === 0 ? <p className="muted">No opportunity links yet.</p> : null}
                  {selectedRecord.opportunityLinks.length > 0 && filteredOpportunityLinks.length === 0 ? (
                    <p className="muted">
                      {contactOpportunityStatusFilter === "open" ? "No open opportunities." : "No closed opportunities."}
                    </p>
                  ) : null}

                  {filteredOpportunityLinks.length > 0 ? (
                    <div className="table-wrap report-table-wrap">
                      <table className="table table-dense report-table">
                        <thead>
                          <tr>
                            <th>Company</th>
                            <th>Opportunity</th>
                            <th>Health System</th>
                            <th>Type</th>
                            <th>Stage</th>
                            <th>Role</th>
                            <th>Expected Close</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOpportunityLinks.map((link) => {
                            const isEditing = editingOpportunityLinkId === link.id;
                            const isDeleting = deletingOpportunityLinkId === link.id;

                            return (
                              <React.Fragment key={link.id}>
                                <tr>
                                  <td>{link.opportunity.company.name}</td>
                                  <td>
                                    <a
                                      href={`/pipeline/${link.opportunity.company.id}?returnTo=${encodeURIComponent(
                                        returnTo
                                      )}&opportunityId=${encodeURIComponent(link.opportunity.id)}`}
                                      className="report-opportunity-link"
                                    >
                                      {link.opportunity.title}
                                    </a>
                                  </td>
                                  <td>{link.opportunity.healthSystem?.name || "-"}</td>
                                  <td>{humanize(link.opportunity.type)}</td>
                                  <td>{humanize(link.opportunity.stage)}</td>
                                  <td>{link.role || "-"}</td>
                                  <td>{formatOpportunityDate(link.opportunity.estimatedCloseDate)}</td>
                                  <td>
                                    <div className="actions" style={{ marginTop: 0 }}>
                                      <button
                                        type="button"
                                        className="ghost small"
                                        onClick={() => {
                                          setEditingOpportunityLinkId(link.id);
                                          setEditingOpportunityRole(link.role || "");
                                        }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="ghost small"
                                        onClick={() => void deleteOpportunityLink(link.id)}
                                        disabled={isDeleting}
                                      >
                                        {isDeleting ? "Removing..." : "Remove"}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {isEditing ? (
                                  <tr>
                                    <td colSpan={8}>
                                      <div className="detail-card">
                                        <div className="detail-grid">
                                          <div>
                                            <label>Role</label>
                                            <input
                                              value={editingOpportunityRole}
                                              onChange={(event) => setEditingOpportunityRole(event.target.value)}
                                              placeholder="Role in opportunity"
                                            />
                                          </div>
                                        </div>
                                        <div className="actions">
                                          <button
                                            type="button"
                                            className="primary"
                                            onClick={() => void saveEditedOpportunity()}
                                            disabled={savingEditedOpportunity}
                                          >
                                            {savingEditedOpportunity ? "Saving..." : "Save Link"}
                                          </button>
                                          <button
                                            type="button"
                                            className="ghost small"
                                            onClick={() => {
                                              setEditingOpportunityLinkId(null);
                                              setEditingOpportunityRole("");
                                            }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeDetailTab === "notes" ? (
                <EntityNotesPane entityPath="contacts" entityId={selectedRecord.id} onStatus={setStatus} />
              ) : null}

              {activeDetailTab === "documents" ? (
                <EntityDocumentsPane entityPath="contacts" entityId={selectedRecord.id} onStatus={setStatus} />
              ) : null}
            </div>
          ) : (
            <p className="muted">
              {loadingRecords ? "Loading contacts..." : "Use lookup to find or create a contact."}
            </p>
          )}
        </section>
      </section>

      <AddRelationshipModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={() => void createContact()}
        isSubmitting={creatingContact}
        submitDisabled={!trim(createName) || !createPrincipalEntityId}
        title="Create Contact"
        subtitle="Create a contact and set their principal entity association."
        submitLabel="Create Contact"
      >
        <div className="detail-grid">
          <div>
            <label>Name</label>
            <input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Contact name" />
          </div>
          <div>
            <label>Title</label>
            <input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Job title" />
          </div>
          <div>
            <label>Email</label>
            <input value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} placeholder="name@company.com" />
          </div>
          <div>
            <label>Phone</label>
            <input value={createPhone} onChange={(event) => setCreatePhone(event.target.value)} placeholder="(555) 555-5555" />
          </div>
          <div>
            <label>LinkedIn URL</label>
            <input
              value={createLinkedinUrl}
              onChange={(event) => setCreateLinkedinUrl(event.target.value)}
              placeholder="https://linkedin.com/in/..."
            />
          </div>
          <div>
            <label>Internal Notes</label>
            <input
              value={createNotes}
              onChange={(event) => setCreateNotes(event.target.value)}
              placeholder="Internal context"
            />
          </div>
          <div>
            <label>Principal Entity Type</label>
            <select
              value={createPrincipalType}
              onChange={(event) => setCreatePrincipalType(event.target.value as AssociationType)}
            >
              {associationTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Principal Role</label>
            <select
              value={createPrincipalRoleType}
              onChange={(event) => setCreatePrincipalRoleType(event.target.value as ContactRoleType)}
            >
              {roleTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Principal Entity</label>
            <EntityLookupInput
              entityKind={toEntityKind(createPrincipalType)}
              value={createPrincipalEntityId}
              onChange={setCreatePrincipalEntityId}
              initialOptions={createPrincipalOptions.map((item) => ({ id: item.id, name: item.name }))}
              placeholder={`Search or add ${associationTypeLabel(createPrincipalType)}`}
              onEntityCreated={(option) =>
                updateReferenceDataForEntity(createPrincipalType, { id: option.id, name: option.name })
              }
              autoOpenCreateOnEnterNoMatch
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Principal Relationship Title</label>
            <input
              value={createPrincipalRelationshipTitle}
              onChange={(event) => setCreatePrincipalRelationshipTitle(event.target.value)}
              placeholder="Optional relationship title"
            />
          </div>
        </div>
      </AddRelationshipModal>

      <AddRelationshipModal
        open={opportunityModalOpen}
        onClose={() => setOpportunityModalOpen(false)}
        onSubmit={() => void addOpportunityLink()}
        isSubmitting={savingOpportunity}
        submitDisabled={!newOpportunityId}
        title="Add Opportunity Link"
        subtitle={loadingReferenceData ? "Loading opportunity options..." : "Link this contact to a pipeline opportunity."}
        submitLabel="Add Link"
      >
        <div className="detail-grid">
          <div>
            <label>Search Opportunities</label>
            <input
              value={opportunitySearchTerm}
              onChange={(event) => setOpportunitySearchTerm(event.target.value)}
              placeholder="Search company, title, or health system"
            />
          </div>
          <div>
            <label>Role</label>
            <input
              value={newOpportunityRole}
              onChange={(event) => setNewOpportunityRole(event.target.value)}
              placeholder="Role in this opportunity"
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Opportunity</label>
            <select value={newOpportunityId} onChange={(event) => setNewOpportunityId(event.target.value)}>
              <option value="">Select opportunity</option>
              {filteredOpportunityOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {formatOpportunityLabel(option)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </AddRelationshipModal>
    </main>
  );
}
