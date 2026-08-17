export const sanitizeDocumentNote = (value: unknown): string => {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  if (/^\s*[\[{]/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) || (parsed !== null && typeof parsed === 'object')) {
        return '';
      }
    } catch {
      // Not valid JSON; continue with plain-text validation below.
    }
  }

  const structuredPatterns = [
    /"category"\s*:\s*"[^"]+"/i,
    /"items"\s*:\s*\[/i,
    /"requiredDocuments"\s*:/i,
    /"checklist"\s*:/i,
    /"renewal_requirements"\s*:/i,
  ];

  if (structuredPatterns.some((pattern) => pattern.test(trimmed))) {
    return '';
  }

  return trimmed.replace(/\s+/g, ' ').slice(0, 5000);
};
