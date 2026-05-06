export function safeNextPath(value: string | null): string {
  if (!value) return "/app";
  if (!value.startsWith("/") || value.startsWith("//")) return "/app";
  if (value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value)) return "/app";
  return value;
}
