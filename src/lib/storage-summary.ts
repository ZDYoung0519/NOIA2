export type LocalStorageEntrySummary = {
  key: string;
  bytes: number;
};

export type LocalStorageSummary = {
  totalBytes: number;
  entries: LocalStorageEntrySummary[];
};

const textEncoder = new TextEncoder();

function getUtf8Bytes(value: string) {
  return textEncoder.encode(value).length;
}

export function getLocalStorageSummary(): LocalStorageSummary {
  const entries: LocalStorageEntrySummary[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) {
      continue;
    }

    const value = localStorage.getItem(key) ?? "";
    entries.push({
      key,
      bytes: getUtf8Bytes(key) + getUtf8Bytes(value),
    });
  }

  entries.sort((left, right) => right.bytes - left.bytes || left.key.localeCompare(right.key));

  return {
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entries,
  };
}

export function formatStorageSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
