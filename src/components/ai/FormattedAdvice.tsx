import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight Markdown renderer for AI-generated renewal guidance.
 * Handles headings (#, ##, ###), bold (**text**), bullet lists (*, -, •),
 * numbered lists (1. 2. ...), and paragraphs. No raw Markdown characters
 * are ever displayed.
 */

// Render inline formatting: **bold** and *italic*
function renderInline(text: string, keyPrefix: string) {
  const parts: React.ReactNode[] = [];
  // Match **bold** first, then *italic*
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined) {
      parts.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      );
    } else if (match[4] !== undefined) {
      parts.push(
        <em key={`${keyPrefix}-i${i}`} className="italic">
          {match[4]}
        </em>
      );
    }
    lastIndex = match.index + match[0].length;
    i++;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "paragraph"; text: string };

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (bullets.length) {
      blocks.push({ type: "bullets", items: bullets });
      bullets = [];
    }
    if (numbered.length) {
      blocks.push({ type: "numbered", items: numbered });
      numbered = [];
    }
    if (paragraph.length) {
      const text = paragraph.join(" ").trim();
      if (text) blocks.push({ type: "paragraph", text });
      paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line === "---" || line === "***") {
      flush();
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flush();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const bulletMatch = line.match(/^[*\-•]\s+(.*)$/);
    if (bulletMatch) {
      // switching list type flushes the other
      if (numbered.length) {
        blocks.push({ type: "numbered", items: numbered });
        numbered = [];
      }
      if (paragraph.length) {
        const text = paragraph.join(" ").trim();
        if (text) blocks.push({ type: "paragraph", text });
        paragraph = [];
      }
      bullets.push(bulletMatch[1].trim());
      continue;
    }

    const numberedMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (numberedMatch) {
      if (bullets.length) {
        blocks.push({ type: "bullets", items: bullets });
        bullets = [];
      }
      if (paragraph.length) {
        const text = paragraph.join(" ").trim();
        if (text) blocks.push({ type: "paragraph", text });
        paragraph = [];
      }
      numbered.push(numberedMatch[1].trim());
      continue;
    }

    // plain text line — continue current paragraph
    if (bullets.length || numbered.length) flush();
    paragraph.push(line);
  }

  flush();
  return blocks;
}

// Heuristic: highlight lines that carry deadlines/warnings
const WARNING_PATTERN =
  /\b(avoid|warning|important|deadline|late|penalt|fail|expir|must|do not|don't|otherwise|risk)\b/i;

export function FormattedAdvice({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <div className={cn("space-y-4 text-sm leading-relaxed", className)}>
      {blocks.map((block, idx) => {
        if (block.type === "heading") {
          const HeadingTag = block.level <= 2 ? "h4" : "h5";
          return (
            <HeadingTag
              key={idx}
              className={cn(
                "font-semibold text-foreground",
                block.level <= 2 ? "text-base" : "text-sm",
                idx > 0 && "pt-1"
              )}
            >
              {renderInline(block.text, `h${idx}`)}
            </HeadingTag>
          );
        }

        if (block.type === "bullets") {
          return (
            <ul key={idx} className="space-y-2">
              {block.items.map((item, i) => (
                <li key={i} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  />
                  <span className="min-w-0 flex-1 break-words text-muted-foreground">
                    {renderInline(item, `b${idx}-${i}`)}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "numbered") {
          return (
            <ol key={idx} className="space-y-2">
              {block.items.map((item, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-muted-foreground">
                    {renderInline(item, `n${idx}-${i}`)}
                  </span>
                </li>
              ))}
            </ol>
          );
        }

        // paragraph — highlight genuine warnings/deadlines
        if (WARNING_PATTERN.test(block.text) && block.text.length < 300) {
          return (
            <div
              key={idx}
              className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="min-w-0 flex-1 break-words text-foreground">
                {renderInline(block.text, `w${idx}`)}
              </p>
            </div>
          );
        }

        return (
          <p key={idx} className="break-words text-muted-foreground">
            {renderInline(block.text, `p${idx}`)}
          </p>
        );
      })}
    </div>
  );
}
