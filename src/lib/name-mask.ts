export function maskNickname(nickname: string | null | undefined, enabled: boolean) {
  const safeNickname = nickname?.trim() ?? "";
  if (!enabled) {
    return safeNickname;
  }

  const chars = Array.from(safeNickname);
  if (chars.length === 0) {
    return "";
  }
  if (chars.length === 1) {
    return "*";
  }

  return `${chars[0]}${"*".repeat(chars.length - 1)}`;
}
