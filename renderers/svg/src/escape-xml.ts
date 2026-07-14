const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/** Escapes text for safe placement inside SVG/XML element content or a double-quoted attribute value. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => XML_ESCAPES[char]!);
}
