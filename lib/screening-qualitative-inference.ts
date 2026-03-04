import OpenAI from "openai";

export type ScreeningFeedbackSentiment = "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE";

type InferenceResult = {
  topic: string;
  sentiment: ScreeningFeedbackSentiment;
  source: "ai" | "fallback";
};

const SENTIMENT_VALUES: ScreeningFeedbackSentiment[] = ["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE"];

const inferenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    topic: { type: "string" },
    sentiment: {
      type: "string",
      enum: SENTIMENT_VALUES
    }
  },
  required: ["topic", "sentiment"]
};

function compactText(value?: string | null): string {
  return (value || "").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractJsonPayload(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  const strictParsed = parseJsonObject(trimmed);
  if (Object.keys(strictParsed).length > 0) {
    return strictParsed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseJsonObject(trimmed.slice(start, end + 1));
  }

  return {};
}

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function normalizeSentiment(value: unknown): ScreeningFeedbackSentiment {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "POSITIVE") return "POSITIVE";
  if (normalized === "NEGATIVE") return "NEGATIVE";
  if (normalized === "MIXED") return "MIXED";
  return "NEUTRAL";
}

function normalizeTopic(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "";
  return trimmed.slice(0, 80);
}

function inferSentimentFallback(text: string): ScreeningFeedbackSentiment {
  const normalized = text.toLowerCase();
  const positiveSignals = [
    "strong",
    "great",
    "good",
    "excited",
    "promising",
    "valuable",
    "helpful",
    "clear fit",
    "high impact",
    "interested"
  ];
  const negativeSignals = [
    "concern",
    "concerned",
    "risk",
    "difficult",
    "hard",
    "unclear",
    "expensive",
    "costly",
    "challenging",
    "skeptical",
    "not ready",
    "low impact"
  ];

  const positiveHits = positiveSignals.filter((entry) => normalized.includes(entry)).length;
  const negativeHits = negativeSignals.filter((entry) => normalized.includes(entry)).length;

  if (positiveHits > 0 && negativeHits > 0) return "MIXED";
  if (positiveHits >= 2 && negativeHits === 0) return "POSITIVE";
  if (negativeHits >= 2 && positiveHits === 0) return "NEGATIVE";
  if (positiveHits === 1 && negativeHits === 0) return "POSITIVE";
  if (negativeHits === 1 && positiveHits === 0) return "NEGATIVE";
  return "NEUTRAL";
}

function inferTopicFallback(text: string): string {
  const normalized = text.toLowerCase();
  const topicMatchers: Array<{ topic: string; pattern: RegExp }> = [
    { topic: "Implementation Feasibility", pattern: /\b(integration|workflow|ehr|staffing|adoption|onboard)\b/i },
    { topic: "Clinical Impact", pattern: /\b(patient|clinical|outcome|care quality|quality)\b/i },
    { topic: "Financial Value", pattern: /\b(roi|cost|budget|financial|savings|price)\b/i },
    { topic: "Co-Development Interest", pattern: /\b(pilot|co-?develop|partnership|collaborat)\b/i },
    { topic: "Product Value Proposition", pattern: /\b(value|useful|benefit|solution|fit)\b/i }
  ];

  const matched = topicMatchers.find((entry) => entry.pattern.test(normalized));
  if (matched) return matched.topic;
  return "Overall Impression";
}

export async function inferQualitativeFeedbackFromImpression(params: {
  impression: string;
  surveyTitle?: string | null;
}): Promise<InferenceResult> {
  const impression = compactText(params.impression);
  const fallback: InferenceResult = {
    topic: inferTopicFallback(impression),
    sentiment: inferSentimentFallback(impression),
    source: "fallback"
  };

  if (!impression) return fallback;

  const client = getOpenAIClient();
  if (!client) return fallback;

  const model =
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.OPENAI_SEARCH_MODEL ||
    "gpt-4.1-mini";

  try {
    const response = await client.responses.create({
      model,
      text: {
        format: {
          type: "json_schema",
          name: "screening_impression_inference",
          schema: inferenceSchema,
          strict: false
        }
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Classify a short screening survey impression. " +
                "Return a concise topic phrase (2-6 words) and sentiment enum. " +
                "Sentiment must be one of POSITIVE, MIXED, NEUTRAL, NEGATIVE."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Survey title: ${compactText(params.surveyTitle) || "Unknown"}\n` +
                `Impression: ${impression}`
            }
          ]
        }
      ]
    } as any);

    const parsed = extractJsonPayload(response.output_text || "{}");
    const topic = normalizeTopic(parsed.topic) || fallback.topic;
    const sentiment = normalizeSentiment(parsed.sentiment);
    return {
      topic,
      sentiment,
      source: "ai"
    };
  } catch (error) {
    console.error("infer_qualitative_feedback_from_impression_error", error);
    return fallback;
  }
}
