import type { InputSchema } from "./input-validator.ts";
import type { PermissionManifest } from "./permission-policy.ts";
import type { RecorderEvent } from "../recorder/browser-recorder.ts";
import type { Assertion } from "../replay/assertion-evaluator.ts";

export interface RawEvent {
  type: string;
  key?: string;
  targetId?: string;
  url?: string;
  stateChange?: string;
  selectorCandidates?: string[];
}

export interface NormalizedEvent {
  type: string;
  value?: string;
  targetId?: string;
  url?: string;
  stateChange?: string;
  selectorCandidates?: string[];
  originalType?: string;
}

export interface NormalizedRecordedDraft {
  steps: Array<Record<string, unknown>>;
  permissions: PermissionManifest;
  inputs: InputSchema;
  assertions: Assertion[];
  warnings: string[];
}

function selectorPriority(candidate: string): number {
  if (candidate.startsWith("role=")) {
    return 0;
  }

  if (candidate.startsWith("text=")) {
    return 1;
  }

  if (/^css=#.+\d/u.test(candidate)) {
    return 3;
  }

  return 2;
}

function normalizeSelectorCandidates(candidates: string[] | undefined): string[] | undefined {
  if (!candidates || candidates.length === 0) {
    return undefined;
  }

  return [...new Set(candidates)].sort((left, right) => selectorPriority(left) - selectorPriority(right));
}

function isSupportedEvent(type: string): boolean {
  return [
    "keypress",
    "hover",
    "click",
    "navigate",
    "stateChange",
    "input",
    "doubleClick",
    "select",
    "download",
    "checkbox"
  ].includes(type);
}

export function normalizeEvents(events: RawEvent[]): NormalizedEvent[] {
  const normalized: NormalizedEvent[] = [];
  let index = 0;

  while (index < events.length) {
    const current = events[index];

    if (current.type === "hover") {
      index += 1;
      continue;
    }

    if (current.type === "keypress") {
      let value = "";
      const targetId = current.targetId;
      let end = index;

      while (end < events.length && events[end].type === "keypress" && events[end].targetId === targetId) {
        value += events[end].key ?? "";
        end += 1;
      }

      normalized.push({
        type: "browser.input",
        targetId,
        value,
        selectorCandidates: normalizeSelectorCandidates(current.selectorCandidates)
      });
      index = end;
      continue;
    }

    if (current.type === "click") {
      const previous = normalized[normalized.length - 1];
      if (previous?.type === "browser.click" && previous.targetId === current.targetId) {
        index += 1;
        continue;
      }

      normalized.push({
        type: "browser.click",
        targetId: current.targetId,
        selectorCandidates: normalizeSelectorCandidates(current.selectorCandidates)
      });

      const next = events[index + 1];
      if (next?.type === "navigate") {
        normalized.push({
          type: "browser.waitFor",
          stateChange: "navigation"
        });
      }

      index += 1;
      continue;
    }

    if (current.type === "navigate") {
      normalized.push({
        type: "browser.navigate",
        url: current.url
      });
      index += 1;
      continue;
    }

    if (current.type === "stateChange") {
      normalized.push({
        type: "browser.stateChange",
        stateChange: current.stateChange,
        url: current.url
      });
      index += 1;
      continue;
    }

    if (isSupportedEvent(current.type)) {
      normalized.push({
        type: `browser.${current.type}`,
        targetId: current.targetId,
        url: current.url,
        selectorCandidates: normalizeSelectorCandidates(current.selectorCandidates)
      });
      index += 1;
      continue;
    }

    normalized.push({
      type: "unsupported",
      originalType: current.type,
      targetId: current.targetId,
      selectorCandidates: normalizeSelectorCandidates(current.selectorCandidates)
    });
    index += 1;
  }

  return normalized;
}

export function normalizeRecordedEvents(events: RecorderEvent[]): NormalizedRecordedDraft {
  const normalized = coalesceRecordedReplayEvents(normalizeEvents(
    events
      .filter((event) => event.type !== "pause" && event.type !== "resume")
      .map((event) => ({
        type: event.type === "checkbox" ? "click" : event.type,
        targetId: event.locator,
        url: event.url,
        key: event.value,
        selectorCandidates: event.selectorCandidates ?? (event.locator ? [event.locator] : undefined)
      }))
  ));

  const permissions = collectPermissions(events);
  const warnings = events
    .filter((event) => event.type === "unsupported")
    .map((event) => `unsupported:${event.originalType ?? "unknown"}`);

  return {
    steps: normalized
      .filter((event) => event.type !== "unsupported" && event.type !== "browser.stateChange")
      .map((event, index) => normalizedEventToStep(event, events[index], index)),
    permissions,
    inputs: {},
    assertions: [],
    warnings
  };
}

function normalizedEventToStep(
  event: NormalizedEvent,
  originalEvent: RecorderEvent | undefined,
  index: number
): Record<string, unknown> {
  switch (event.type) {
    case "browser.navigate":
      return {
        id: `step-${(index + 1).toString().padStart(3, "0")}`,
        type: "browser.navigate",
        with: {
          url: event.url
        }
      };
    case "browser.input":
      return {
        id: `step-${(index + 1).toString().padStart(3, "0")}`,
        type: "browser.input",
        target: {
          locatorCandidates: event.selectorCandidates ?? []
        },
        with: {
          value: originalEvent?.value ?? event.value ?? ""
        },
        secret: originalEvent?.secret ?? false
      };
    case "browser.select":
      return {
        id: `step-${(index + 1).toString().padStart(3, "0")}`,
        type: "browser.select",
        target: {
          locatorCandidates: event.selectorCandidates ?? []
        },
        with: {
          value: originalEvent?.value ?? ""
        }
      };
    case "browser.click":
    case "browser.waitFor":
      return {
        id: `step-${(index + 1).toString().padStart(3, "0")}`,
        type: event.type,
        ...(event.selectorCandidates
          ? {
              target: {
                locatorCandidates: event.selectorCandidates
              }
            }
          : {})
      };
    case "browser.download":
      return {
        id: `step-${(index + 1).toString().padStart(3, "0")}`,
        type: "browser.download",
        ...(event.selectorCandidates
          ? {
              target: {
                locatorCandidates: event.selectorCandidates
              }
            }
          : {}),
        with: {
          fileName: originalEvent?.fileName
        }
      };
    default:
      return {
        id: `step-${(index + 1).toString().padStart(3, "0")}`,
        type: event.type
      };
  }
}

function coalesceRecordedReplayEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  const output: NormalizedEvent[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const current = events[index];
    const next = events[index + 1];
    const afterNext = events[index + 2];

    if (current.type === "browser.click" && next?.type === "browser.download") {
      output.push({
        ...next,
        selectorCandidates: next.selectorCandidates ?? current.selectorCandidates
      });
      index += 1;
      continue;
    }

    if (current.type === "browser.click" && next?.type === "browser.waitFor" && !next.selectorCandidates && afterNext?.type === "browser.navigate") {
      output.push(current);
      index += 1;
      continue;
    }

    output.push(current);
  }

  return output;
}

function collectPermissions(events: RecorderEvent[]): PermissionManifest {
  const origins = [...new Set(events.flatMap((event) => (event.url ? [new URL(event.url).origin] : [])))];
  return origins.length > 0
    ? {
        browser: {
          domains: {
            allow: origins
          }
        }
      }
    : {};
}
