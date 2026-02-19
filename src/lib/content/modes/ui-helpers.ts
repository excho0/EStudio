import type { ContentModeField, ContentModeSection } from "./ui-registry";

const getValueAtPath = (obj: Record<string, unknown>, path: string) => {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const setValueAtPath = (
  obj: Record<string, unknown>,
  path: string,
  value: unknown
) => {
  const parts = path.split(".");
  const [firstPart] = parts;
  if (!firstPart) return;
  if (parts.length === 1) {
    obj[firstPart] = value;
    return;
  }
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!part) continue;
    const existing = current[part];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (!leaf) return;
  current[leaf] = value;
};

const deleteValueAtPath = (obj: Record<string, unknown>, path: string) => {
  const parts = path.split(".");
  const [firstPart] = parts;
  if (!firstPart) return;
  if (parts.length === 1) {
    delete obj[firstPart];
    return;
  }
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const existing = current[part];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      return;
    }
    current = existing as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (!leaf) return;
  delete current[leaf];
};

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
  const rawValue = getValueAtPath(settings, key);
  if (rawValue === undefined && field?.defaultValue !== undefined) {
    return field.defaultValue;
  }
  if (field?.serialize) {
    return field.serialize(rawValue);
  }
  if (typeof rawValue === "boolean") return rawValue;
  if (typeof rawValue === "number") return rawValue;
  if (typeof rawValue === "string") {
    if (field?.input === "select") return rawValue;
    return Number(rawValue);
  }
  if (field?.input === "select") {
    return (
      (typeof field.defaultValue === "string" ? field.defaultValue : undefined) ?? ""
    );
  }
  return field?.input === "toggle" ? false : 0;
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
        const resetValue = resetField.deserialize
          ? resetField.deserialize(resetField.defaultValue)
          : resetField.defaultValue;
        setValueAtPath(next, resetKey, resetValue);
      } else {
        deleteValueAtPath(next, resetKey);
      }
    });
  };
  if (typeof value === "string" && value.trim() === "") {
    deleteValueAtPath(next, key);
    return next;
  }
  const field = fieldMap[key];
  if (field?.deserialize) {
    setValueAtPath(next, key, field.deserialize(value));
    return next;
  }
  if (typeof value === "boolean") {
    setValueAtPath(next, key, value);
    const resetRule = field?.resetsOnValue?.find((rule) => rule.when === value);
    if (resetRule) {
      resetKeysToDefault(resetRule.keys);
    }
    return next;
  }
  if (field?.input === "select") {
    setValueAtPath(next, key, String(value));
    const resetRule = field?.resetsOnValue?.find((rule) => rule.when === value);
    if (resetRule) {
      resetKeysToDefault(resetRule.keys);
    }
    return next;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    deleteValueAtPath(next, key);
    return next;
  }
  setValueAtPath(next, key, numeric);
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
  const raw = getValueAtPath(settings, key);
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

export type FieldActionHandler = (
  field: ContentModeField
) => void | Promise<void>;

export type ResolveFieldActionInput = {
  field: ContentModeField;
  disabled: boolean;
  loadingMap?: Record<string, boolean>;
  handlers?: Record<string, FieldActionHandler | undefined>;
};

export const resolveFieldActionState = ({
  field,
  disabled,
  loadingMap,
  handlers,
}: ResolveFieldActionInput) => {
  if (field.input !== "action" || !field.action) {
    return null;
  }
  const action = field.action;
  return {
    action,
    loading: Boolean(loadingMap?.[action.id]),
    disabled,
    handler: handlers?.[action.id],
  };
};
