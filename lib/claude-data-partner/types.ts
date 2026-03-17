// ─── Source signals ──────────────────────────────────────────────────────────

export type SignalSource =
  | { kind: 'gmail'; messageId: string; threadId: string; subject: string; date: string }
  | { kind: 'calendar'; eventId: string; summary: string; date: string }
  | { kind: 'drive'; fileId: string; title: string }
  | { kind: 'freetext'; input: string };

// ─── Candidate records (extracted, not yet resolved) ─────────────────────────

export type EntityKind = 'Company' | 'HealthSystem' | 'CoInvestor' | 'Contact';

export type CandidateContact = {
  kind: 'Contact';
  name: string;
  email?: string;
  linkedinUrl?: string;
  title?: string;
  phone?: string;
  principalEntityKind?: 'HEALTH_SYSTEM' | 'CO_INVESTOR' | 'COMPANY';
  principalEntityName?: string;
  affiliations: CandidateAffiliation[];
  source: SignalSource;
  confidence: ConfidenceLevel;
};

export type CandidateCompany = {
  kind: 'Company';
  name: string;
  website?: string;
  hqCity?: string;
  hqState?: string;
  companyType?: string;
  primaryCategory?: string;
  leadSourceType?: string;
  leadSourceHealthSystemName?: string;
  description?: string;
  addToPipeline: boolean;
  pipelineFields?: Partial<CandidatePipeline>;
  source: SignalSource;
  confidence: ConfidenceLevel;
};

export type CandidatePipeline = {
  phase: string;
  category: string;
  intakeStage: string;
  intakeDecision: string;
  leadSourceType?: string;
  leadSourceEntityName?: string;
  leadSourceEntityKind?: string;
  ownerName?: string;
  nextStep?: string;
};

export type CandidateHealthSystem = {
  kind: 'HealthSystem';
  name: string;
  website?: string;
  hqCity?: string;
  hqState?: string;
  isAllianceMember?: boolean;
  isLimitedPartner?: boolean;
  source: SignalSource;
  confidence: ConfidenceLevel;
};

export type CandidateCoInvestor = {
  kind: 'CoInvestor';
  name: string;
  website?: string;
  isSeedInvestor?: boolean;
  isSeriesAInvestor?: boolean;
  investmentNotes?: string;
  source: SignalSource;
  confidence: ConfidenceLevel;
};

export type CandidateAffiliation = {
  entityKind: 'HEALTH_SYSTEM' | 'CO_INVESTOR' | 'COMPANY';
  entityName: string;
  roleType: string;
  title?: string;
};

export type CandidateLink =
  | { kind: 'CompanyHealthSystemLink'; companyName: string; healthSystemName: string; relationshipType: string; preliminaryInterest?: string; notes?: string; source: SignalSource }
  | { kind: 'CompanyCoInvestorLink'; companyName: string; coInvestorName: string; relationshipType: string; notes?: string; source: SignalSource };

export type CandidateNote = {
  kind: 'EntityNote';
  entityKind: 'COMPANY' | 'HEALTH_SYSTEM' | 'CO_INVESTOR' | 'CONTACT';
  entityName: string;
  note: string;
  affiliationsJson?: object;
  source: SignalSource;
  confidence: ConfidenceLevel;
};

export type CandidateOpportunity = {
  kind: 'CompanyOpportunity';
  companyName: string;
  healthSystemName?: string;
  type: string;
  title: string;
  stage: string;
  notes?: string;
  contactNames?: string[];
  source: SignalSource;
  confidence: ConfidenceLevel;
};

export type CandidateRecord =
  | CandidateContact
  | CandidateCompany
  | CandidateHealthSystem
  | CandidateCoInvestor
  | CandidateLink
  | CandidateNote
  | CandidateOpportunity;

export type CandidateSet = {
  candidates: CandidateRecord[];
  sourceWindow: { start: string; end: string };
  extractedAt: string;
};

// ─── Confidence ──────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

// ─── Resolution results ───────────────────────────────────────────────────────

export type ResolutionStatus =
  | 'RESOLVED_EXISTING'
  | 'RESOLVED_NEW'
  | 'AMBIGUOUS'
  | 'SKIPPED';

export type ResolvedRecord = {
  candidate: CandidateRecord;
  status: ResolutionStatus;
  existingId?: string;
  existingRecord?: object;
  ambiguousCandidates?: { id: string; label: string }[];
};

// ─── Change plan ──────────────────────────────────────────────────────────────

export type ChangeOperation = 'INSERT' | 'UPDATE' | 'UPSERT' | 'SKIP';

export type FieldDiff = {
  field: string;
  was: unknown;
  now: unknown;
};

export type PlannedChange = {
  id: string;
  operation: ChangeOperation;
  table: string;
  label: string;
  existingId?: string;
  diffs: FieldDiff[];
  source: SignalSource;
  confidence: ConfidenceLevel;
  userApproved: boolean;
  // Internal metadata for writer
  _candidate?: CandidateRecord;
  _resolvedId?: string;
  _dependsOn?: string[]; // ids of PlannedChange this depends on
};

export type ChangeGroup = {
  id: string;
  label: string;
  changes: PlannedChange[];
  mustApplyTogether: boolean;
};

export type ChangeSet = {
  groups: ChangeGroup[];
  totalChanges: number;
  generatedAt: string;
};

// ─── Write results ────────────────────────────────────────────────────────────

export type WriteResult = {
  changeId: string;
  success: boolean;
  recordId?: string;
  error?: string;
};

export type WriteLog = {
  results: WriteResult[];
  appliedAt: string;
};
