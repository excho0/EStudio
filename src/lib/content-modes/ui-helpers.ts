import type { ContentModeField, ContentModeSection } from "./ui-registry";

export const buildFieldMap = (sections: ContentModeSection[]) => {
  const entries: Record<string, ContentModeField> = {};
  sections.forEach((section) => {
    section.fields.forEach((field) => {
      entries[field.key] = field;
    });
    section.groups?.forEach((group) => {
      group.fields.forEach((field) => {
        entries[field.key] = field;
      });
    });
  });
  return entries;
};

export const getFieldValue = (
  fieldMap: Record<string, ContentModeField>,
  settings: Record<string, unknown>,
  key: string
) => {
  const field = fieldMap[key];
  const rawValue = settings[key];
  if (field?.serialize) {
    return field.serialize(rawValue);
  }
  if (typeof rawValue === "boolean") return rawValue;
  if (typeof rawValue === "number" || typeof rawValue === "string") {
    return Number(rawValue);
  }
  return 0;
};

export const applyFieldValue = (
  fieldMap: Record<string, ContentModeField>,
  settings: Record<string, unknown>,
  key: string,
  value: string | number | boolean
) => {
  const next = { ...settings };
  if (typeof value === "string" && value.trim() === "") {
    delete next[key];
    return next;
  }
  const field = fieldMap[key];
  if (field?.deserialize) {
    next[key] = field.deserialize(value);
    return next;
  }
  if (typeof value === "boolean") {
    next[key] = value;
    return next;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    delete next[key];
    return next;
  }
  next[key] = numeric;
  return next;
};
