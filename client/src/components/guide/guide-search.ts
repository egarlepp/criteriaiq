import type { TFunction } from "i18next";
import {
  GLOSSARY_GROUPS,
  GUIDE_TOPICS,
  MAP_STATUSES,
  PROJECT_FIELD_GROUPS,
  RESOURCES,
  type GuideStatus,
  type GuideTopicKey,
} from "./guide-data";

export interface GuideSearchEntry {
  id: string;
  topic: GuideTopicKey;
  label: string;
  /** Extra text that matches but isn't shown (descriptions, definitions). */
  body: string;
}

/** Lower-cases and strips accents so "Statut" matches "statut" and "état" matches "etat". */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function buildGuideSearchIndex(
  t: TFunction,
  accountStatuses: GuideStatus[],
  projectStatuses: GuideStatus[],
): GuideSearchEntry[] {
  const entries: GuideSearchEntry[] = [];

  for (const topic of GUIDE_TOPICS) {
    entries.push({
      id: `topic:${topic.key}`,
      topic: topic.key,
      label: t(`guide.topics.${topic.key}.title`),
      body: t(`guide.topics.${topic.key}.description`),
    });
  }

  for (const group of PROJECT_FIELD_GROUPS) {
    for (const field of group.fields) {
      entries.push({
        id: `field:${field}`,
        topic: "projectInfo",
        label: t(`guide.projectInfo.fields.${field}.name`),
        body: t(`guide.projectInfo.fields.${field}.short`),
      });
    }
  }

  for (const status of accountStatuses) {
    entries.push({ id: `account-status:${status.name}`, topic: "statuses", label: status.name, body: status.description });
  }
  for (const status of projectStatuses) {
    entries.push({ id: `project-status:${status.name}`, topic: "statuses", label: status.name, body: status.description });
  }

  for (const status of MAP_STATUSES) {
    entries.push({
      id: `map-status:${status.key}`,
      topic: "map",
      label: t(`guide.map.status.${status.key}.label`),
      body: t(`guide.map.status.${status.key}.description`),
    });
  }

  for (const group of GLOSSARY_GROUPS) {
    for (const term of group.terms) {
      entries.push({
        id: `term:${group.key}.${term}`,
        topic: "glossary",
        label: t(`guide.glossary.groups.${group.key}.terms.${term}.term`),
        body: t(`guide.glossary.groups.${group.key}.terms.${term}.definition`),
      });
    }
  }

  for (const resource of RESOURCES) {
    entries.push({
      id: `resource:${resource.key}`,
      topic: "resources",
      label: t(`guide.resources.items.${resource.key}.title`),
      body: t(`guide.resources.items.${resource.key}.description`),
    });
  }

  return entries;
}

/**
 * Every whitespace-separated word of the query must appear in the entry.
 * Label matches rank above body-only matches; ties keep index order.
 */
export function searchGuide(index: GuideSearchEntry[], query: string, limit = 8): GuideSearchEntry[] {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const scored: { entry: GuideSearchEntry; score: number; order: number }[] = [];
  index.forEach((entry, order) => {
    const label = normalizeForSearch(entry.label);
    const haystack = `${label} ${normalizeForSearch(entry.body)}`;
    if (!words.every((word) => haystack.includes(word))) return;
    const labelHits = words.filter((word) => label.includes(word)).length;
    scored.push({ entry, score: labelHits, order });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((row) => row.entry);
}
