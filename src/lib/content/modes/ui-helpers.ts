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
  if (rawValue === undefined && field?.defaultValue !== undefined) {
    return field.defaultValue;
  }
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
  const resetKeysToDefault = (keys: string[]) => {
    keys.forEach((resetKey) => {
      const resetField = fieldMap[resetKey];
      if (resetField?.defaultValue !== undefined) {
        next[resetKey] = resetField.deserialize
          ? resetField.deserialize(resetField.defaultValue)
          : resetField.defaultValue;
      } else {
        delete next[resetKey];
      }
    });
  };
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
    const resetRule = field?.resetsOnValue?.find((rule) => rule.when === value);
    if (resetRule) {
      resetKeysToDefault(resetRule.keys);
    }
    return next;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    delete next[key];
    return next;
  }
  next[key] = numeric;
  const resetRule = field?.resetsOnValue?.find((rule) => rule.when === numeric);
  if (resetRule) {
    resetKeysToDefault(resetRule.keys);
  }
  return next;
};

const resolveComparableValue = (
  fieldMap: Record<string, ContentModeField>,
  settings: Record<string, unknown>,
  key: string
) => {
  const raw = settings[key];
  if (raw !== undefined) return raw;
  const field = fieldMap[key];
  return field?.defaultValue;
};

const matchesRule = (
  value: unknown,
  rule: { equals?: string | number | boolean; notEquals?: string | number | boolean }
) => {
  if (rule.equals !== undefined) return value === rule.equals;
  if (rule.notEquals !== undefined) return value !== rule.notEquals;
  return false;
};

export const isFieldDisabled = (
  fieldMap: Record<string, ContentModeField>,
  settings: Record<string, unknown>,
  field: ContentModeField
) => {
  if (!field.disabledWhen) return false;
  const allRules = field.disabledWhen.all ?? [];
  const anyRules = field.disabledWhen.any ?? [];
  const allMatched =
    allRules.length > 0 &&
    allRules.every((rule) =>
      matchesRule(resolveComparableValue(fieldMap, settings, rule.key), rule)
    );
  const anyMatched =
    anyRules.length > 0 &&
    anyRules.some((rule) =>
      matchesRule(resolveComparableValue(fieldMap, settings, rule.key), rule)
    );
  return allMatched || anyMatched;
};
