export function maskNickname(name: string, enabled: boolean) {
  if (!enabled) return name;

  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed ? "*" : "";
  if (trimmed.length === 2) return `${trimmed[0]}*`;

  return `${trimmed[0]}${"*".repeat(Math.max(1, trimmed.length - 2))}${trimmed[trimmed.length - 1]}`;
}
