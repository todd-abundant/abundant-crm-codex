"use client";

import { useMemo, useState, type FormEvent } from "react";

type SkinId = string;

type SkinDeclarationMap = Record<string, string>;

type SkinCssRule = {
  selector: string;
  declarations: SkinDeclarationMap;
};

type SkinAnimationRule = {
  name: string;
  keyframes: Record<string, SkinDeclarationMap>;
  usage: SkinCssRule;
};

type SkinMotionSafetyRule = {
  selector: string;
  property: string;
  value: string;
};

type SkinMotionSafety = {
  adjustments: SkinMotionSafetyRule[];
};

type SkinPack = {
  id: string;
  label: string;
  description: string;
  version: string;
  tokens: SkinDeclarationMap;
  shellStyles: SkinCssRule[];
  componentOverrides: SkinCssRule[];
  animations: SkinAnimationRule[];
  motionSafety: SkinMotionSafety;
  interactionHints: string[];
  qaChecklist: string[];
};

type SkinDefinition = {
  id: SkinId;
  label: string;
  description: string;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type SearchRecord = {
  id: string;
  name: string;
  type: string;
  owner: string;
  tags: string[];
  notes: string;
};

type PlanStep = {
  id: string;
  title: string;
  details: string;
  state: "ready" | "working" | "done" | "blocked";
};

const CHAT_PROMPTS = [
  "I can map that to a reliable execution plan.",
  "What should the first validation be before saving any changes?",
  "Would you like me to split this into two safe stages?",
  "I can draft the workflow now and pause after each step."
];

const SKINS: SkinDefinition[] = [
  {
    id: "default",
    label: "Default",
    description: "Chat-first workflow with assistant suggestions and inline plan draft."
  },
  {
    id: "glass-aurora",
    label: "Glass Aurora",
    description: "Search-first editing flow with direct record inspection and quick edits."
  },
  {
    id: "slate-night",
    label: "Slate Night",
    description: "Execution-focused flow with explicit step control and progress."
  }
];

const LLM_REQUEST_PROMPT = `You are a senior product designer creating a complete Workbench UI skin for a React app.

You are writing to another developer who will paste your JSON directly into their preview lab.
Return **only** JSON (no prose, no markdown, no fences).

Context:
- The app route is /workbench (and this preview is an isolated skin lab shell).
- The shell element that changes theme has the selector: .workbench-beta-shell
- A skin is identified by setting data-skin attribute: .workbench-beta-shell[data-skin="<id>"].
- Existing interaction patterns to redesign:
  - Chat + plan drafting panel with assistant responses.
  - Search/filter + inline editing panel for records.
  - Execution board with ordered, stateful steps.
- Shared classes/regions you can target directly:
  - .chatbot-shell, .chatbot-header, h2
  - .chatbot-thread, .chatbot-message, .chatbot-message.user
  - .chatbot-inline-status, .chatbot-input-form, .chatbot-input
  - .chatbot-plan-card, .chatbot-step-note
  - .agent-plan-item and .agent-plan-item.current
  - .status, .status.ok, .status.error
  - .panel, .muted, .detail-label
- Keep design modern, clear, and fully usable: this is about interaction flow, not just colors.

Your output must include:
- id: stable slug
- label: short display name
- description: 1-2 sentence summary
- version: semver-style string
- tokens: CSS variable map (keys like --wb-page-background, --wb-fontFamily, --wb-text, etc)
- shellStyles: array of selector + declarations for shell-level rules
- componentOverrides: array of selector + declarations for behavior-critical components
- animations: array with keyframes + usage declarations
- motionSafety: { "adjustments": [ { selector, property, value } ] }
- interactionHints: array of strings
- qaChecklist: array of validation checks

Guidelines:
- Prefer practical interaction nudges (focus treatment, spacing hierarchy, state visibility, keyboard affordance clarity).
- Animation should be restrained and should not slow down typing or clicking.
- Include reduced-motion behavior through motionSafety.
- Do not use custom JavaScript.

Return exactly this JSON shape and nothing else.`;

const SKIN_PACK_TEMPLATE_JSON = JSON.stringify(
  {
    id: "my-workbench-skin",
    label: "My Workbench Skin",
    description:
      "A fresh approach to chat-first guidance, search/edit pacing, and execution feedback.",
    version: "1.0.0",
    tokens: {
      "--wb-fontFamily": "'Inter Tight', 'Inter', 'Segoe UI', Arial, sans-serif",
      "--wb-page-background": "linear-gradient(160deg, #f5f8ff 0%, #f9f4ff 100%)",
      "--wb-input-bg": "#ffffff",
      "--wb-text": "#14223f",
      "--wb-muted": "#4a5f80",
      "--wb-label": "#18315f",
      "--wb-border": "#c8d7ef",
      "--wb-panel-bg": "#ffffff",
      "--wb-panel-shadow": "0 14px 32px rgba(17, 37, 75, 0.12)",
      "--wb-panel-border": "rgba(128, 156, 214, 0.6)",
      "--wb-thread-bg": "#f5f8ff",
      "--wb-thread-border": "#bfd1ef",
      "--wb-message-bg": "#ffffff",
      "--wb-message-border": "#dbe7f8",
      "--wb-message-shadow": "0 8px 18px rgba(27, 52, 106, 0.09)",
      "--wb-message-user-bg": "linear-gradient(90deg, #2f6eff 0%, #22c3aa 100%)",
      "--wb-message-user-border": "#1f5ed0",
      "--wb-message-user-text": "#f6fbff"
    },
    shellStyles: [
      {
        selector: '.workbench-beta-shell[data-skin="my-workbench-skin"]',
        declarations: {
          "backdrop-filter": "saturate(1.08)",
          "scrollbar-color": "#7ea7e2 transparent"
        }
      }
    ],
    componentOverrides: [
      {
        selector: '.workbench-beta-shell[data-skin="my-workbench-skin"] .chatbot-message',
        declarations: {
          "border-radius": "14px",
          "transition": "border-color 140ms ease, transform 140ms ease"
        }
      },
      {
        selector: '.workbench-beta-shell[data-skin="my-workbench-skin"] .agent-plan-item.current',
        declarations: {
          "box-shadow": "0 10px 20px rgba(19, 60, 127, 0.16)"
        }
      }
    ],
    animations: [
      {
        name: "wb-sample-fade",
        keyframes: {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        },
        usage: {
          selector: '.workbench-beta-shell[data-skin="my-workbench-skin"] .chatbot-message',
          declarations: {
            animation: "wb-sample-fade 180ms ease"
          }
        }
      }
    ],
    motionSafety: {
      adjustments: [
        {
          selector: '.workbench-beta-shell[data-skin="my-workbench-skin"] .chatbot-message',
          property: "animation",
          value: "none"
        },
        {
          selector: '.workbench-beta-shell[data-skin="my-workbench-skin"] .chatbot-inline-status',
          property: "animation",
          value: "none"
        }
      ]
    },
    interactionHints: [
      "Split command entry, context review, and action confirmation into clearly distinct zones.",
      "Prioritize high-contrast focus and status clarity over extra chrome."
    ],
    qaChecklist: [
      "Verify thread readability on long messages and mobile width.",
      "Confirm status/error states remain obvious with no motion."
    ]
  },
  null,
  2
);

function copyToClipboard(text: string): Promise<boolean> {
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => false
  );
}

const LLM_GROUNDUP_PACK: SkinPack = {
  id: "llm-motion-grid",
  label: "LLM Groundup Motion",
  description:
    "A kinetic interface with timeline-like pacing, richer motion, and stronger visual rhythm for command-heavy flows.",
  version: "1.0.0",
  tokens: {
    "--wb-fontFamily": "'Inter Tight', 'Inter', 'Segoe UI', Arial, sans-serif",
    "--wb-page-background":
      "radial-gradient(circle at 8% 0%, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 32%), radial-gradient(circle at 95% 2%, rgba(14, 165, 233, 0.14) 0%, rgba(14, 165, 233, 0) 30%), linear-gradient(180deg, #f5fbff 0%, #eff7ff 100%)",
    "--wb-input-bg": "#ffffff",
    "--wb-text": "#0f2035",
    "--wb-muted": "#48607f",
    "--wb-label": "#0a2f5a",
    "--wb-border": "#bfd3ea",
    "--wb-panel-bg": "#ffffff",
    "--wb-panel-shadow": "0 18px 40px rgba(8, 33, 67, 0.13)",
    "--wb-panel-border": "rgba(98, 146, 199, 0.38)",
    "--wb-thread-bg": "linear-gradient(180deg, #f9fcff 0%, #edf7ff 100%)",
    "--wb-thread-border": "rgba(117, 160, 212, 0.76)",
    "--wb-message-bg": "#ffffff",
    "--wb-message-border": "#d5e4f5",
    "--wb-message-shadow": "0 10px 24px rgba(13, 73, 128, 0.11)",
    "--wb-message-user-bg": "linear-gradient(105deg, #0e4ea0 0%, #0f9da2 100%)",
    "--wb-message-user-border": "#0f4f94",
    "--wb-message-user-text": "#f6fbff",
    "--wb-message-user-link": "#cbf4ef",
    "--wb-plan-note-bg": "rgba(245, 246, 255, 0.82)",
    "--wb-plan-note-border": "rgba(154, 182, 226, 0.75)",
    "--wb-item-bg": "rgba(247, 250, 255, 0.88)",
    "--wb-item-border": "#d0e0f2",
    "--wb-item-current-bg": "#dcecff",
    "--wb-item-current-border": "#79aeda",
    "--wb-item-selected-bg": "#f2f8ff",
    "--wb-issue": "#9f5a13",
    "--wb-result-failed": "#4d5c73",
    "--wb-spotlight-bg": "rgba(222, 237, 255, 0.85)",
    "--wb-spotlight-border": "#b8d4f6",
    "--wb-modal-bg": "#ffffff",
    "--wb-modal-backdrop": "rgba(6, 21, 49, 0.46)",
    "--wb-modal-shadow": "0 22px 48px rgba(8, 35, 76, 0.35)",
    "--wb-toolbar-note": "#4f6786",
    "--wb-success": "#0a846f",
    "--wb-danger": "#b23d3d",
    "--wb-secondary-bg": "#ffffff",
    "--wb-secondary-text": "#0a3f72"
  },
  shellStyles: [
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"]',
      declarations: {
        "--wb-fontFamily": "'Inter Tight', 'Inter', 'Segoe UI', Arial, sans-serif",
        "backdrop-filter": "saturate(1.12)",
        "scrollbar-color": "#87b8dc transparent"
      }
    }
  ],
  componentOverrides: [
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-shell',
      declarations: {
        "background":
          "linear-gradient(180deg, rgba(255, 255, 255, 0.86) 0%, rgba(246, 252, 255, 0.94) 100%)",
        "border": "1px solid var(--wb-panel-border)",
        "box-shadow": "0 28px 54px rgba(16, 40, 76, 0.15)",
        "border-radius": "18px",
        "padding": "14px",
        "animation": "wb-shell-reveal 300ms cubic-bezier(0.2, 0.9, 0.2, 1)"
      }
    },
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-header h2',
      declarations: {
        "letter-spacing": "0.01em",
        "font-weight": "750",
        "text-transform": "none"
      }
    },
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-thread',
      declarations: {
        "border-color": "var(--wb-thread-border)",
        "background": "var(--wb-thread-bg)",
        "border-radius": "14px",
        "padding": "14px"
      }
    },
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-message',
      declarations: {
        "border-radius": "14px",
        "border-width": "1.5px",
        "animation": "wb-message-fadein 190ms ease-out",
        "transform-origin": "left top"
      }
    },
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-message.user',
      declarations: {
        "border-radius": "16px",
        "transform-origin": "right top"
      }
    },
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] button.primary',
      declarations: {
        "border-radius": "999px",
        "padding-left": "14px",
        "padding-right": "14px",
        "box-shadow": "0 8px 18px rgba(13, 95, 150, 0.23)"
      }
    },
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] button.secondary',
      declarations: {
        "border-radius": "999px"
      }
    },
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .agent-plan-item',
      declarations: {
        "border-radius": "13px",
        "border-left": "4px solid var(--wb-item-border)"
      }
    },
    {
      selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .agent-plan-item.current',
      declarations: {
        "border-left-color": "#2f7fc7",
        "box-shadow": "0 12px 24px rgba(33, 92, 153, 0.14)"
      }
    }
  ],
  animations: [
    {
      name: "wb-shell-reveal",
      keyframes: {
        "0%": {
          transform: "translateY(6px) scale(0.985)",
          opacity: "0.82"
        },
        "100%": {
          transform: "translateY(0) scale(1)",
          opacity: "1"
        }
      },
      usage: {
        selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-shell',
        declarations: {
          animation: "wb-shell-reveal 300ms cubic-bezier(0.2, 0.9, 0.2, 1)"
        }
      }
    },
    {
      name: "wb-message-fadein",
      keyframes: {
        "0%": {
          transform: "translateY(6px)",
          opacity: "0"
        },
        "100%": {
          transform: "translateY(0)",
          opacity: "1"
        }
      },
      usage: {
        selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-message',
        declarations: {
          animation: "wb-message-fadein 170ms ease"
        }
      }
    },
    {
      name: "wb-spotlight",
      keyframes: {
        "0%": { background: "rgba(255,255,255,0.0)" },
        "50%": { background: "rgba(255,255,255,0.35)" },
        "100%": { background: "rgba(255,255,255,0.0)" }
      },
      usage: {
        selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-inline-status',
        declarations: {
          animation: "wb-spotlight 1700ms linear infinite"
        }
      }
    }
  ],
  motionSafety: {
    adjustments: [
      {
        selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-shell',
        property: "animation",
        value: "none"
      },
      {
        selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-message',
        property: "animation",
        value: "none"
      },
      {
        selector: '.workbench-beta-shell[data-skin="llm-motion-grid"] .chatbot-inline-status',
        property: "animation",
        value: "none"
      }
    ]
  },
  interactionHints: [
    "Use pacing-first transitions for every command-response boundary.",
    "Keep execution board and chat in separate visual regions so users can scan intent and results.",
    "Favor clear stage labels over dense metadata at entry point."
  ],
  qaChecklist: [
    "Focus states remain visible across the full shell.",
    "Motion timing does not block interaction (no >2 sec loops).",
    "Status and error colors maintain contrast on all message types."
  ]
};

function buildSkinPackCss(pack: SkinPack) {
  function declarationsToCss(declarations: SkinDeclarationMap) {
    return Object.entries(declarations)
      .map(([property, value]) => `${property}: ${value};`)
      .join("\n  ");
  }

  const shellRule: SkinCssRule = {
    selector: `.workbench-beta-shell[data-skin="${pack.id}"]`,
    declarations: pack.tokens
  };

  const ruleCss = [shellRule, ...pack.shellStyles, ...pack.componentOverrides]
    .map((rule) => `${rule.selector} {\n  ${declarationsToCss(rule.declarations)}\n}`)
    .join("\n\n");

  const animationCss = pack.animations
    .map((animation) => {
      const keyframeBody = Object.entries(animation.keyframes)
        .map(([frame, values]) => `${frame} {\n  ${declarationsToCss(values)}\n}`)
        .join("\n\n");

      return `@keyframes ${animation.name} {\n${keyframeBody}\n}\n${animation.usage.selector} {\n  ${declarationsToCss(animation.usage.declarations)}\n}`;
    })
    .join("\n\n");

  const motionSafetyRules = (pack.motionSafety?.adjustments || [])
    .map((entry) => `${entry.selector} {\n  ${entry.property}: ${entry.value};\n}`)
    .join("\n\n");

  const motionSafetyCss = motionSafetyRules
    ? `@media (prefers-reduced-motion: reduce) {\n${motionSafetyRules}\n}`
    : "";

  return [ruleCss, animationCss, motionSafetyCss].filter(Boolean).join("\n\n");
}

function coerceSkinDeclarationMap(raw: unknown): SkinDeclarationMap {
  if (!raw || typeof raw !== "object") return {};
  const values = raw as Record<string, unknown>;
  const result: SkinDeclarationMap = {};

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

function coerceRules(raw: unknown): SkinCssRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Partial<SkinCssRule>;
      if (typeof item.selector !== "string" || item.selector.trim().length === 0) return null;
      const declarations = coerceSkinDeclarationMap(item.declarations);
      return declarations ? { selector: item.selector, declarations } : null;
    })
    .filter((entry): entry is SkinCssRule => Boolean(entry));
}

function parseSkinPack(raw: string): SkinPack {
  const parsed = JSON.parse(raw) as Partial<SkinPack>;
  const shellStyles = coerceRules(parsed.shellStyles);
  const componentOverrides = coerceRules(parsed.componentOverrides);
  const animations = Array.isArray(parsed.animations)
    ? parsed.animations
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const candidate = entry as Partial<SkinAnimationRule>;
          if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) return null;
          if (!candidate.usage || typeof candidate.usage !== "object" || typeof candidate.usage.selector !== "string") return null;

          const keyframes = typeof candidate.keyframes === "object" && candidate.keyframes !== null ? candidate.keyframes : {};
          const usageDecls = coerceSkinDeclarationMap(candidate.usage?.declarations);
          if (Object.keys(usageDecls).length === 0) return null;

          return {
            name: candidate.name,
            keyframes:
              Object.entries(keyframes).length > 0
                ? Object.fromEntries(
                    Object.entries(keyframes)
                      .filter((entry): entry is [string, unknown] => typeof entry[0] === "string")
                      .map(([frame, values]) => [frame, coerceSkinDeclarationMap(values)] as [string, SkinDeclarationMap])
                  )
                : {},
            usage: { selector: candidate.usage.selector, declarations: usageDecls }
          };
        })
        .filter((entry): entry is SkinAnimationRule => Boolean(entry))
    : [];

  return {
    id:
      typeof parsed.id === "string" && parsed.id.trim().length > 0
        ? parsed.id
        : LLM_GROUNDUP_PACK.id,
    label:
      typeof parsed.label === "string" && parsed.label.trim().length > 0
        ? parsed.label
        : LLM_GROUNDUP_PACK.label,
    description:
      typeof parsed.description === "string" && parsed.description.trim().length > 0
        ? parsed.description
        : LLM_GROUNDUP_PACK.description,
    version:
      typeof parsed.version === "string" && parsed.version.trim().length > 0
        ? parsed.version
        : LLM_GROUNDUP_PACK.version,
    tokens:
      parsed.tokens && typeof parsed.tokens === "object"
        ? coerceSkinDeclarationMap(parsed.tokens)
        : LLM_GROUNDUP_PACK.tokens,
    shellStyles,
    componentOverrides,
    animations,
    motionSafety:
      parsed.motionSafety && Array.isArray(parsed.motionSafety.adjustments)
        ? parsed.motionSafety
        : { adjustments: [] },
    interactionHints: Array.isArray(parsed.interactionHints) ? parsed.interactionHints : [],
    qaChecklist: Array.isArray(parsed.qaChecklist) ? parsed.qaChecklist : []
  };
}

const INITIAL_RECORDS: SearchRecord[] = [
  {
    id: "acme-health",
    name: "Acme Health",
    type: "Health System",
    owner: "Maya",
    tags: ["clinical", "east"],
    notes: "Core referral partner for pilot cohort."
  },
  {
    id: "northstar-biotech",
    name: "Northstar Biotech",
    type: "Co-Investor",
    owner: "Jordan",
    tags: ["active", "seed"],
    notes: "Prefers monthly pipeline summaries."
  },
  {
    id: "wellspring",
    name: "Wellspring Care",
    type: "Company",
    owner: "Alex",
    tags: ["expansion"],
    notes: "Potential second-wave expansion partner."
  },
  {
    id: "brightline",
    name: "Brightline Contacts",
    type: "Contact",
    owner: "Pat",
    tags: ["support", "onboarding"],
    notes: "Needs cleaner outreach language."
  }
];

const INITIAL_PLAN: PlanStep[] = [
  {
    id: "step-create",
    title: "Create new contact and link to co-investor",
    details: "Validate required fields and dedupe against existing contacts.",
    state: "ready"
  },
  {
    id: "step-plan",
    title: "Generate draft execution plan",
    details: "Group tasks by entity and dependency before execute.",
    state: "ready"
  },
  {
    id: "step-run",
    title: "Run selected actions",
    details: "Execute actions one-by-one with checkpoints.",
    state: "ready"
  }
];

function chatPreviewShell(skinId: SkinId) {
  function ChatPreview() {
    const [messages, setMessages] = useState<Message[]>([
      {
        id: "wb-intro",
        role: "assistant",
        text: "Tell me what workflow you want to draft."
      }
    ]);
    const [input, setInput] = useState("");
    const [replyIndex, setReplyIndex] = useState(0);

    function sendMessage(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const nextText = input.trim();
      if (!nextText) return;

      setMessages((current) => [
        ...current,
        {
          id: `u-${Date.now()}`,
          role: "user",
          text: nextText
        }
      ]);
      setInput("");
      const reply = CHAT_PROMPTS[Math.min(replyIndex, CHAT_PROMPTS.length - 1)];
      setReplyIndex((current) => Math.min(current + 1, CHAT_PROMPTS.length));
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: reply
        }
      ]);
    }

    return (
      <section className="chatbot-shell" style={{ margin: 0, minHeight: "320px", height: "340px", padding: "10px" }}>
        <div className="chatbot-header">
          <div>
            <h2 style={{ margin: 0 }}>Workbench Chat</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              conversational + assistant-guided plan drafting
            </p>
          </div>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setMessages([{ id: "wb-intro", role: "assistant", text: "Tell me what workflow you want to draft." }])}>
              Reset thread
            </button>
          </div>
        </div>

        <div className="chatbot-thread" style={{ flex: "1", minHeight: 0, overflow: "auto" }}>
          {messages.map((message) => (
            <article key={message.id} className={`chatbot-message ${message.role}`}>
              <p>{message.text}</p>
            </article>
          ))}
          <p className="chatbot-inline-status status ok">Editing path: 1. ask → 2. draft → 3. execute</p>
        </div>

        <form className="chatbot-input-form" onSubmit={sendMessage}>
          <label htmlFor={`chat-input-${skinId}`}>Tell the assistant what to change</label>
          <textarea
            id={`chat-input-${skinId}`}
            className="chatbot-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Example: add a new contact to Northstar and link to Acme Health"
          />
          <div className="actions">
            <button type="submit" className="primary">
              Send
            </button>
          </div>
        </form>
      </section>
    );
  }

  return <ChatPreview />;
}

function searchAndEditPreviewShell(skinId: SkinId) {
  function SearchAndEditPreview() {
    const [records, setRecords] = useState<SearchRecord[]>(INITIAL_RECORDS);
    const [query, setQuery] = useState("acme");
    const [selectedId, setSelectedId] = useState(INITIAL_RECORDS[0].id);
    const [editName, setEditName] = useState(INITIAL_RECORDS[0].name);
    const [editNotes, setEditNotes] = useState(INITIAL_RECORDS[0].notes);
    const filtered = useMemo(
      () =>
        records.filter((entry) =>
          [entry.name, entry.type, entry.owner, ...entry.tags].some((value) =>
            value.toLowerCase().includes(query.toLowerCase())
          )
        ),
      [records, query]
    );

    const selectedRecord = records.find((entry) => entry.id === selectedId) || filtered[0];

    function selectRecord(entry: SearchRecord) {
      setSelectedId(entry.id);
      setEditName(entry.name);
      setEditNotes(entry.notes);
    }

    function applyEdit() {
      if (!selectedRecord) return;
      setRecords((current) =>
        current.map((entry) =>
          entry.id === selectedRecord.id ? { ...entry, name: editName, notes: editNotes } : entry
        )
      );
    }

    return (
      <section
        style={{
          display: "grid",
          gap: "10px",
          minHeight: "320px",
          height: "340px",
          gridTemplateRows: "auto 1fr"
        }}
      >
        <div className="panel" style={{ margin: 0, padding: "10px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
            <input
              aria-label="Search records"
              placeholder="Search records..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ minWidth: "200px", maxWidth: "320px", flex: "1 1 220px" }}
            />
            <button type="button" className="ghost" onClick={() => setQuery("")}>
              Clear
            </button>
            <span className="muted" style={{ marginLeft: "auto" }}>
              {filtered.length} of {records.length} visible
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            minHeight: 0
          }}
        >
          <section className="panel" style={{ margin: 0, padding: "8px", overflow: "auto" }}>
            {filtered.length === 0 ? (
              <p className="muted">No matches. Try a different term.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "8px" }}>
                {filtered.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => selectRecord(entry)}
                      className="inline-expand-toggle"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        borderColor: entry.id === selectedRecord?.id ? "var(--wb-border)" : undefined,
                        background: entry.id === selectedRecord?.id ? "var(--wb-message-bg)" : undefined
                      }}
                    >
                      <div>
                        <strong>{entry.name}</strong>
                        <p className="inline-truncation-hint" style={{ marginTop: "4px" }}>
                          {entry.type} · Owner: {entry.owner}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" style={{ margin: 0, padding: "8px", display: "grid", gap: "8px" }}>
            <h3 style={{ margin: 0 }}>Record Editor</h3>
            {!selectedRecord ? (
              <p className="muted">Select a row to inspect and edit.</p>
            ) : (
              <>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span className="detail-label">Name</span>
                  <input value={editName} onChange={(event) => setEditName(event.target.value)} />
                </label>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span className="detail-label">Notes</span>
                  <textarea
                    style={{ minHeight: "98px" }}
                    value={editNotes}
                    onChange={(event) => setEditNotes(event.target.value)}
                  />
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" className="primary" onClick={applyEdit}>
                    Save edits
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setRecords((current) => [
                        ...current,
                        {
                          id: `new-${Date.now()}`,
                          name: `${editName} Duplicate`,
                          type: selectedRecord.type,
                          owner: selectedRecord.owner,
                          tags: [...selectedRecord.tags],
                          notes: editNotes
                        }
                      ]);
                    }}
                  >
                    Duplicate
                  </button>
                </div>
                <p className="inline-truncation-hint">
                  Tags: {selectedRecord.tags.join(", ")} · Updated on demand
                </p>
              </>
            )}
          </section>
        </div>
      </section>
    );
  }

  return <SearchAndEditPreview />;
}

function executionBoardPreviewShell(skinId: SkinId) {
  function ExecutionBoardPreview() {
    const [steps, setSteps] = useState<PlanStep[]>(INITIAL_PLAN);
    const [activeStepId, setActiveStepId] = useState<string>(INITIAL_PLAN[0].id);

    function setStepState(stepId: string, nextState: PlanStep["state"]) {
      setSteps((current) =>
        current.map((entry) => (entry.id === stepId ? { ...entry, state: nextState } : entry))
      );
    }

    function moveStep(stepId: string, direction: -1 | 1) {
      setSteps((current) => {
        const index = current.findIndex((entry) => entry.id === stepId);
        if (index < 0) return current;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= current.length) return current;
        const next = [...current];
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        return next;
      });
    }

    const doneCount = steps.filter((entry) => entry.state === "done").length;
    const selectedIndex = steps.findIndex((entry) => entry.id === activeStepId);
    const selectedStep = selectedIndex >= 0 ? steps[selectedIndex] : null;

    return (
      <section className="panel" style={{ margin: 0, display: "grid", gap: "10px", minHeight: "320px", height: "340px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
          <p className="detail-label" style={{ margin: 0 }}>
            Execution board
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Progress: {doneCount}/{steps.length}
          </p>
        </div>

        <div style={{ display: "grid", gap: "8px", overflow: "auto", minHeight: 0 }}>
          {steps.map((step, index) => (
            <article
              key={step.id}
              className={`agent-plan-item ${step.id === activeStepId ? "current" : ""}`}
              style={{ padding: "10px", border: "1px solid var(--wb-item-border)", borderRadius: "10px" }}
            >
              <p style={{ margin: "0 0 6px" }}>
                <strong>{index + 1}. {step.title}</strong>
              </p>
              <p style={{ margin: "0 0 8px" }} className="muted">
                {step.details}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                <button type="button" className="secondary" onClick={() => moveStep(step.id, -1)}>
                  Move up
                </button>
                <button type="button" className="secondary" onClick={() => moveStep(step.id, 1)}>
                  Move down
                </button>
                <button type="button" className="ghost" onClick={() => setStepState(step.id, "done")}>
                  Mark done
                </button>
                <button type="button" className="ghost" onClick={() => setStepState(step.id, "blocked")}>
                  Flag blocked
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="chatbot-plan-card">
          <p className="chatbot-step-note">
            Selected: {selectedStep?.title || "none"}
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (steps.length === 0) return;
                const nextIndex = (selectedIndex + 1) % steps.length;
                setActiveStepId(steps[nextIndex].id);
              }}
              disabled={steps.length === 0}
            >
              Next step
            </button>
            <button type="button" className="ghost" onClick={() => setStepState(activeStepId, "working")}>
              Start selected
            </button>
          </div>
        </div>
      </section>
    );
  }

  return <ExecutionBoardPreview />;
}

function renderSkinInteraction(skinId: SkinId) {
  if (skinId === "default") return chatPreviewShell(skinId);
  if (skinId === "glass-aurora") return searchAndEditPreviewShell(skinId);
  return executionBoardPreviewShell(skinId);
}

function SkinPreviewCard({ skin }: { skin: SkinDefinition }) {
  return (
    <article className="panel" style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <h2 style={{ margin: 0 }}>{skin.label}</h2>
        <p style={{ margin: 0, color: "var(--colorMute)" }}>{skin.description}</p>
      </div>

      <div
        className="workbench-beta-shell"
        data-skin={skin.id}
        style={{
          display: "block",
          background: "var(--wb-page-background)",
          padding: "8px",
          border: "1px solid var(--colorBorder)",
          borderRadius: "14px"
        }}
      >
        {renderSkinInteraction(skin.id)}
      </div>
    </article>
  );
}

export default function SkinLabPage() {
  const [activePack, setActivePack] = useState<SkinPack>(LLM_GROUNDUP_PACK);
  const [packSource, setPackSource] = useState(() => JSON.stringify(LLM_GROUNDUP_PACK, null, 2));
  const [packError, setPackError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const packCss = useMemo(() => buildSkinPackCss(activePack), [activePack]);

  function applyPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const nextPack = parseSkinPack(packSource);
      setActivePack(nextPack);
      setPackError(null);
    } catch (error) {
      setPackError(error instanceof Error ? error.message : "Invalid skin pack JSON.");
    }
  }

  function copyPrompt() {
    void copyToClipboard(LLM_REQUEST_PROMPT).then((ok) => {
      setCopyFeedback(ok ? "Prompt copied." : "Copy blocked by browser.");
    });
  }

  function copyTemplate() {
    void copyToClipboard(SKIN_PACK_TEMPLATE_JSON).then((ok) => {
      setCopyFeedback(ok ? "Starter JSON copied." : "Copy blocked by browser.");
    });
  }

  function loadTemplate() {
    setPackSource(SKIN_PACK_TEMPLATE_JSON);
    setPackError(null);
  }

  const activePackPreviews = [
    {
      id: "chat",
      label: "Chat-first interaction",
      element: chatPreviewShell(activePack.id)
    },
    {
      id: "search",
      label: "Search + edit interaction",
      element: searchAndEditPreviewShell(activePack.id)
    },
    {
      id: "execution",
      label: "Execution board",
      element: executionBoardPreviewShell(activePack.id)
    }
  ];

  const briefDownloadHref = `data:text/plain;charset=utf-8,${encodeURIComponent(LLM_REQUEST_PROMPT)}`;

  return (
    <main style={{ display: "grid", gap: "14px", paddingTop: "12px" }}>
      <style dangerouslySetInnerHTML={{ __html: packCss }} />

      <section className="panel">
        <h1 style={{ margin: "0 0 8px" }}>Workbench Skin Lab</h1>
        <p style={{ margin: 0, maxWidth: "70ch", color: "var(--colorMute)" }}>
          Each skin below is a full interaction pattern — not just a color theme.
          Prototype editing, searching, and execution behavior before deciding on a direction.
        </p>
        <p style={{ margin: "8px 0 0", color: "var(--colorMute)" }}>
          Paste JSON from another LLM that follows the Skin Pack contract to test a complete style +
          interaction system in one pass.
        </p>
      </section>

      <section className="panel" style={{ display: "grid", gap: "10px" }}>
        <h2 style={{ margin: 0 }}>LLM Skin Pack brief</h2>
        <p style={{ margin: 0, color: "var(--colorMute)" }}>
          Paste this into another model to get a complete redesign that covers interaction style, component behavior, motion, and QA direction.
        </p>
        <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--colorMute)" }}>
          Think of this as the “Skin Pack brief file” to hand to the model.
        </p>
        <textarea
          value={LLM_REQUEST_PROMPT}
          readOnly
          style={{ width: "100%", minHeight: "190px", fontFamily: "monospace", fontSize: "0.84rem" }}
        />
        <div className="actions">
          <button type="button" className="secondary" onClick={copyPrompt}>
            Copy LLM prompt
          </button>
          <a
            href={briefDownloadHref}
            download="skin-pack-brief.txt"
            className="top-nav-link top-nav-link-quiet"
            style={{
              alignSelf: "center",
              textDecoration: "none",
              border: "1px solid var(--wb-border)",
              borderRadius: "8px",
              padding: "8px 12px"
            }}
          >
            Download brief file
          </a>
          <button type="button" className="ghost" onClick={copyTemplate}>
            Copy starter JSON
          </button>
          <button type="button" className="ghost" onClick={loadTemplate}>
            Load starter JSON
          </button>
        </div>
        {copyFeedback ? <p className="muted" style={{ margin: 0 }}>{copyFeedback}</p> : null}
      </section>

      <section className="panel" style={{ display: "grid", gap: "10px" }}>
        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ color: "var(--wb-label)", fontSize: "0.85rem", fontWeight: 700 }}>
            LLM skin pack JSON
          </span>
          <p style={{ margin: 0, color: "var(--colorMute)" }}>
            Replace this with output from another model and hit “Apply pack”.
          </p>
        </label>
        <form onSubmit={applyPack} style={{ display: "grid", gap: "8px" }}>
          <textarea
            value={packSource}
            onChange={(event) => setPackSource(event.target.value)}
            style={{ width: "100%", minHeight: "220px", fontFamily: "monospace", fontSize: "0.85rem" }}
          />
          <div className="actions">
            <button type="submit" className="primary">
              Apply pack
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setPackSource(JSON.stringify(LLM_GROUNDUP_PACK, null, 2));
                setActivePack(LLM_GROUNDUP_PACK);
                setPackError(null);
              }}
            >
              Reset to sample
            </button>
          </div>
        </form>
        {packError ? (
          <p className="chatbot-inline-status status error" style={{ margin: 0 }}>
            {packError}
          </p>
        ) : null}
      </section>

      <section className="panel" style={{ display: "grid", gap: "8px" }}>
        <div>
          <h2 style={{ margin: 0 }}>{activePack.label}</h2>
          <p style={{ margin: "4px 0 0", color: "var(--colorMute)" }}>{activePack.description}</p>
        </div>

        <div
          style={{
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))"
          }}
        >
          {activePackPreviews.map((preview) => (
            <article key={preview.id} className="panel" style={{ display: "grid", gap: "8px" }}>
              <p style={{ margin: 0, color: "var(--wb-label)" }}>{preview.label}</p>
              <div
                className="workbench-beta-shell"
                data-skin={activePack.id}
                style={{
                  display: "block",
                  background: "var(--wb-page-background)",
                  padding: "8px",
                  border: "1px solid var(--colorBorder)",
                  borderRadius: "14px"
                }}
              >
                {preview.element}
              </div>
            </article>
          ))}
        </div>

        <div style={{ display: "grid", gap: "4px", color: "var(--colorMute)" }}>
          {activePack.interactionHints.length === 0 ? null : (
            <section>
              <h3 style={{ margin: "4px 0" }}>Interaction direction</h3>
              <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {activePack.interactionHints.map((entry, index) => (
                  <li key={`${activePack.id}-hint-${index}`}>{entry}</li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 style={{ margin: "4px 0" }}>QA checks</h3>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {activePack.qaChecklist.map((entry, index) => (
                <li key={`${activePack.id}-qa-${index}`}>{entry}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>

      <section style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {SKINS.map((skin) => (
          <SkinPreviewCard key={skin.id} skin={skin} />
        ))}
      </section>
    </main>
  );
}
