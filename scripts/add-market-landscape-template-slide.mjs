#!/usr/bin/env node
import { google } from "googleapis";

const SLIDES_SCOPE = "https://www.googleapis.com/auth/presentations";
const TEMPLATE_ID_FLAG = "--template-id=";
const SOURCE_SLIDE_ID_FLAG = "--source-slide-id=";
const KEEP_MARKER_SLIDES_FLAG = "--keep-marker-slides";
const MARKER_TOKEN = "{{MARKET_LANDSCAPE_SLIDE_MARKER}}";
const DEFAULT_SOURCE_SLIDE_ID = "mlTemplate1772572238132";

function parseTemplateIdArg() {
  const flag = process.argv.find((arg) => arg.startsWith(TEMPLATE_ID_FLAG));
  if (!flag) return null;
  const value = flag.slice(TEMPLATE_ID_FLAG.length).trim();
  return value || null;
}

function parseSourceSlideIdArg() {
  const flag = process.argv.find((arg) => arg.startsWith(SOURCE_SLIDE_ID_FLAG));
  if (!flag) return DEFAULT_SOURCE_SLIDE_ID;
  const value = flag.slice(SOURCE_SLIDE_ID_FLAG.length).trim();
  return value || DEFAULT_SOURCE_SLIDE_ID;
}

function shouldKeepMarkerSlides() {
  return process.argv.includes(KEEP_MARKER_SLIDES_FLAG);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseServiceAccount(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed?.client_email || !parsed?.private_key) {
    throw new Error("GOOGLE_DOCS_SERVICE_ACCOUNT_JSON must include client_email and private_key.");
  }
  return {
    clientEmail: parsed.client_email,
    privateKey: String(parsed.private_key).replace(/\\n/g, "\n")
  };
}

function shapeText(shape) {
  return (shape?.text?.textElements || []).map((entry) => entry.textRun?.content || "").join("");
}

function extractTranslate(element, axis) {
  const transform = element?.transform;
  if (!transform || typeof transform !== "object") return 0;
  const key = axis === "x" ? "translateX" : "translateY";
  const value = transform[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function extractSize(element, axis) {
  const size = element?.size;
  if (!size || typeof size !== "object") return 0;
  const key = axis === "x" ? "width" : "height";
  const entry = size[key];
  const magnitude = entry?.magnitude;
  return typeof magnitude === "number" && Number.isFinite(magnitude) ? magnitude : 0;
}

function allElementsWithBounds(slide) {
  return (slide?.pageElements || []).map((element) => {
    const x = extractTranslate(element, "x");
    const y = extractTranslate(element, "y");
    const width = extractSize(element, "x");
    const height = extractSize(element, "y");
    return {
      objectId: element.objectId,
      element,
      text: shapeText(element.shape),
      x,
      y,
      width,
      height,
      centerX: x + width / 2,
      centerY: y + height / 2
    };
  });
}

function textElementsWithBounds(slide) {
  return allElementsWithBounds(slide)
    .filter((entry) => entry.element?.shape?.text)
    .map((entry) => ({
      ...entry,
      text: entry.text.trim()
    }))
    .filter((entry) => entry.text.length > 0);
}

function markerSlideIds(presentation) {
  const ids = [];
  for (const slide of presentation.slides || []) {
    const hasMarker = (slide.pageElements || []).some((element) => shapeText(element.shape).includes(MARKER_TOKEN));
    if (hasMarker && slide.objectId) ids.push(slide.objectId);
  }
  return ids;
}

function isCardElement(entry) {
  const text = entry.text;
  return (
    /illustrative vendors\s*:/i.test(text) &&
    /(category overview\s*:|business model\s*:|strengths\s*:|gaps\s*:|\{\{ml_primary_label\}\}\s*:|\{\{ml_secondary_label\}\}\s*:)/i.test(
      text
    )
  );
}

function groupCardsByRows(cards) {
  const rows = [];
  const sorted = [...cards].sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
  const averageHeight =
    sorted.length > 0 ? sorted.reduce((sum, card) => sum + (card.height || 0), 0) / sorted.length : 0;
  const yTolerance = Math.max(90, averageHeight * 0.25);

  for (const card of sorted) {
    let targetRow = null;
    for (const row of rows) {
      if (Math.abs(row.meanY - card.centerY) <= yTolerance) {
        targetRow = row;
        break;
      }
    }

    if (!targetRow) {
      targetRow = { meanY: card.centerY, cards: [] };
      rows.push(targetRow);
    }

    targetRow.cards.push(card);
    targetRow.meanY = targetRow.cards.reduce((sum, item) => sum + item.centerY, 0) / targetRow.cards.length;
  }

  rows.sort((a, b) => a.meanY - b.meanY);
  for (const row of rows) {
    row.cards.sort((a, b) => a.centerX - b.centerX);
  }

  return rows;
}

function parseCardLines(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const primaryLine =
    lines.find((line) => /^(category overview|strengths)\s*:/i.test(line)) ||
    lines.find((line) => /^\{\{ML_PRIMARY_LABEL\}\}\s*:/i.test(line)) ||
    lines.find((line) => /category overview\s*:/i.test(line)) ||
    "";
  const secondaryLine =
    lines.find((line) => /^(business model|gaps)\s*:/i.test(line)) ||
    lines.find((line) => /^\{\{ML_SECONDARY_LABEL\}\}\s*:/i.test(line)) ||
    lines.find((line) => /business model\s*:/i.test(line)) ||
    "";
  const vendorsLine = lines.find((line) => /^illustrative vendors\s*:/i.test(line)) || "";

  return {
    primaryLine,
    secondaryLine,
    vendorsLine
  };
}

function buildScopedReplaceRequests(slideId, pairs) {
  return pairs
    .filter((pair) => pair.find && pair.replaceWith && pair.find !== pair.replaceWith)
    .map((pair) => ({
      replaceAllText: {
        containsText: {
          text: pair.find,
          matchCase: true
        },
        replaceText: pair.replaceWith,
        pageObjectIds: [slideId]
      }
    }));
}

function uniqueObjectIds(entries) {
  const ids = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.objectId || seen.has(entry.objectId)) continue;
    seen.add(entry.objectId);
    ids.push(entry.objectId);
  }
  return ids;
}

async function runBatchUpdate(slides, presentationId, label, requests) {
  if (!requests || requests.length === 0) return;
  try {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests }
    });
  } catch (error) {
    const message =
      error?.response?.data?.error?.message || (error instanceof Error ? error.message : String(error));
    throw new Error(`${label} failed: ${message}`);
  }
}

async function main() {
  const templateId = parseTemplateIdArg() || requiredEnv("GOOGLE_INTAKE_SLIDES_TEMPLATE_ID");
  const sourceSlideId = parseSourceSlideIdArg();
  const keepMarkerSlides = shouldKeepMarkerSlides();
  const credentials = parseServiceAccount(requiredEnv("GOOGLE_DOCS_SERVICE_ACCOUNT_JSON"));

  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: [SLIDES_SCOPE]
  });
  const slides = google.slides({ version: "v1", auth });

  const fields =
    "slides(objectId,pageElements(objectId,size(width,height),transform(translateX,translateY,scaleX,scaleY,unit),shape/text/textElements(textRun/content)))";

  const presentation = await slides.presentations.get({
    presentationId: templateId,
    fields
  });

  const sourceSlide = (presentation.data.slides || []).find((slide) => slide.objectId === sourceSlideId);
  if (!sourceSlide) {
    throw new Error(
      `Source slide '${sourceSlideId}' was not found. Pass a valid slide id with ${SOURCE_SLIDE_ID_FLAG}<id>.`
    );
  }

  const oldMarkerSlideIds = markerSlideIds(presentation.data);
  const newSlideId = `mlTemplate${Date.now()}`;
  const markerShapeId = `mlMarker${Date.now()}`;

  await runBatchUpdate(slides, templateId, "Duplicate source slide", [
    {
      duplicateObject: {
        objectId: sourceSlideId,
        objectIds: {
          [sourceSlideId]: newSlideId
        }
      }
    }
  ]);

  const afterDuplicate = await slides.presentations.get({
    presentationId: templateId,
    fields
  });
  const duplicatedSlide = (afterDuplicate.data.slides || []).find((slide) => slide.objectId === newSlideId);
  if (!duplicatedSlide) {
    throw new Error("Duplicated slide was not found after copy.");
  }

  const textElements = textElementsWithBounds(duplicatedSlide);
  const allElements = allElementsWithBounds(duplicatedSlide);
  const cardElements = textElements.filter(isCardElement);

  const rows = groupCardsByRows(cardElements);
  if (rows.length < 2 || rows[0].cards.length < 2 || rows[1].cards.length < 2) {
    throw new Error("Could not detect a 2-row layout with at least 2 card boxes per row on the source slide.");
  }

  const selectedCards = [
    { token: "R0C0", entry: rows[0].cards[0] },
    { token: "R0C1", entry: rows[0].cards[1] },
    { token: "R1C0", entry: rows[1].cards[0] },
    { token: "R1C1", entry: rows[1].cards[1] }
  ];

  const selectedCardIds = new Set(selectedCards.map((item) => item.entry.objectId));
  const droppedCards = cardElements.filter((entry) => !selectedCardIds.has(entry.objectId));

  const headerCandidate = [...textElements].sort((a, b) => a.y - b.y || b.width * b.height - a.width * a.height)[0];
  const findNearest = (candidates, targetX, targetY) => {
    if (!candidates || candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      const distanceA = Math.abs(a.centerX - targetX) + Math.abs(a.centerY - targetY);
      const distanceB = Math.abs(b.centerX - targetX) + Math.abs(b.centerY - targetY);
      return distanceA - distanceB;
    })[0];
  };

  const titleCandidates = textElements.filter(
    (entry) =>
      !isCardElement(entry) &&
      entry.objectId !== headerCandidate?.objectId &&
      !/market landscape/i.test(entry.text) &&
      !/\{\{MARKET_LANDSCAPE_/i.test(entry.text) &&
      !/illustrative vendors/i.test(entry.text)
  );
  const titleByCardId = new Map();
  for (const selected of selectedCards) {
    const matchingTitles = titleCandidates.filter(
      (entry) =>
        entry.centerY < selected.entry.centerY - selected.entry.height * 0.05 &&
        entry.centerY > selected.entry.centerY - selected.entry.height * 0.55 &&
        Math.abs(entry.centerX - selected.entry.centerX) <= Math.max(300000, selected.entry.width * 0.75)
    );
    const nearestTitle = findNearest(matchingTitles, selected.entry.centerX, selected.entry.y);
    if (nearestTitle?.objectId) {
      titleByCardId.set(selected.entry.objectId, nearestTitle);
    }
  }

  const replacePairs = [];

  if (headerCandidate) {
    const headerLines = headerCandidate.text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of headerLines) {
      if (/^\{\{MARKET_LANDSCAPE_SECTION_LABEL\}\}$/i.test(line)) continue;
      if (/^\{\{MARKET_LANDSCAPE_HEADLINE\}\}$/i.test(line)) continue;
      if (/^\{\{MARKET_LANDSCAPE_SUBHEADLINE\}\}$/i.test(line)) continue;
      if (/market landscape/i.test(line)) {
        replacePairs.push({ find: line, replaceWith: "{{MARKET_LANDSCAPE_SECTION_LABEL}}" });
      } else {
        replacePairs.push({ find: line, replaceWith: "{{MARKET_LANDSCAPE_HEADLINE}}" });
      }
    }
  }
  for (const card of selectedCards) {
    const titleEntry = titleByCardId.get(card.entry.objectId);
    if (titleEntry?.text) {
      replacePairs.push({ find: titleEntry.text, replaceWith: `{{ML_${card.token}_TITLE}}` });
    }
    const lines = parseCardLines(card.entry.text);
    if (lines.primaryLine) {
      replacePairs.push({
        find: lines.primaryLine,
        replaceWith: `{{ML_PRIMARY_LABEL}}: {{ML_${card.token}_PRIMARY_BODY}}`
      });
    }
    if (lines.secondaryLine) {
      replacePairs.push({
        find: lines.secondaryLine,
        replaceWith: `{{ML_SECONDARY_LABEL}}: {{ML_${card.token}_SECONDARY_BODY}}`
      });
    }
    if (lines.vendorsLine) {
      replacePairs.push({
        find: lines.vendorsLine,
        replaceWith: `Illustrative Vendors: {{ML_${card.token}_VENDORS}}`
      });
    }
  }

  const replacementRequests = buildScopedReplaceRequests(newSlideId, replacePairs);
  if (replacementRequests.length > 0) {
    await runBatchUpdate(slides, templateId, "Replace placeholder text", replacementRequests);
  }

  const deleteIds = new Set();

  for (const id of uniqueObjectIds(droppedCards)) {
    deleteIds.add(id);
  }

  if (droppedCards.length > 0) {
    const cutoffX = Math.min(...droppedCards.map((entry) => entry.x)) - 6;
    const boardTop = Math.min(...cardElements.map((entry) => entry.y)) - 90;
    const boardBottom = Math.max(...cardElements.map((entry) => entry.y + entry.height)) + 20;

    for (const entry of allElements) {
      if (!entry.objectId) continue;
      if (entry.y < boardTop || entry.y > boardBottom) continue;
      if (entry.x >= cutoffX || entry.centerX >= cutoffX) {
        deleteIds.add(entry.objectId);
      }
    }
  }

  const deleteRequests = Array.from(deleteIds).map((objectId) => ({
    deleteObject: { objectId }
  }));

  if (deleteRequests.length > 0) {
    await runBatchUpdate(slides, templateId, "Remove extra third-column elements", deleteRequests);
  }

  await runBatchUpdate(slides, templateId, "Add marker token", [
    {
      createShape: {
        objectId: markerShapeId,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: newSlideId,
          size: {
            width: { magnitude: 320, unit: "PT" },
            height: { magnitude: 14, unit: "PT" }
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 22,
            translateY: 528,
            unit: "PT"
          }
        }
      }
    },
    {
      insertText: {
        objectId: markerShapeId,
        insertionIndex: 0,
        text: MARKER_TOKEN
      }
    }
  ]);

  if (!keepMarkerSlides && oldMarkerSlideIds.length > 0) {
    const toDelete = oldMarkerSlideIds.filter((slideId) => slideId !== newSlideId);
    if (toDelete.length > 0) {
      await runBatchUpdate(
        slides,
        templateId,
        "Delete old marker slides",
        toDelete.map((slideId) => ({
          deleteObject: { objectId: slideId }
        }))
      );
    }
  }

  console.log("Market Landscape placeholder slide created with 2x2 mapping.");
  console.log(`Source slide id: ${sourceSlideId}`);
  console.log(`New placeholder slide id: ${newSlideId}`);
  console.log(`https://docs.google.com/presentation/d/${templateId}/edit`);
}

main().catch((error) => {
  console.error("Failed to add Market Landscape slide:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
