export const normalizeStorageKey = (key: string) => {
  const segments = key.split("/");
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized.join("/");
};

