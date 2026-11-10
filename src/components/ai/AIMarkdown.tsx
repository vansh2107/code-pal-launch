import { Fragment, memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Renders inline markdown: **bold**, *italic*, `code`. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyPrefix}-${i++}`;
    if (t.startsWith("**") || t.startsWith("__")) out.push(<strong key={k} className="font-semibold text-foreground">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: { text: string; depth: number }[] }
  | { kind: "hr" };

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flush(); blocks.push({ kind: "hr" }); continue; }
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); blocks.push({ kind: "h", level: h[1].length, text: h[2] }); continue; }
    const depth = Math.floor((line.length - line.trimStart().length) / 2);
    const ul = trimmed.match(/^[-*•]\s+(.*)$/);
    const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const text = (ul || ol)![1];
      const prev = blocks[blocks.length - 1];
      if (prev && (prev.kind === "ul" || prev.kind === "ol") && (prev.kind === kind || depth > 0)) prev.items.push({ text, depth });
      else blocks.push({ kind, items: [{ text, depth }] });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

interface AIMarkdownProps {
  content: string;
  className?: string;
  size?: "xs" | "sm";
}

/** Clean, theme-consistent formatter for all AI-generated text. */
export const AIMarkdown = memo(function AIMarkdown({ content, className, size = "sm" }: AIMarkdownProps) {
  if (!content) return null;
  const blocks = parse(content);
  const body = size === "xs" ? "text-xs" : "text-sm";
  return (
    <div className={cn("space-y-3 break-words min-w-0 leading-relaxed text-foreground/90", body, className)}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.kind === "hr") return <hr key={k} className="border-border" />;
        if (b.kind === "h") {
          const cls = b.level <= 2 ? "text-base font-semibold" : "text-[0.95rem] font-semibold";
          return <h4 key={k} className={cn(cls, "text-foreground pt-1")}>{renderInline(b.text, k)}</h4>;
        }
        if (b.kind === "p") return <p key={k}>{renderInline(b.text, k)}</p>;
        const Tag = b.kind === "ol" ? "ol" : "ul";
        let n = 0;
        return (
          <Tag key={k} className="space-y-1.5">
            {b.items.map((it, j) => {
              const top = it.depth === 0;
              if (top) n++;
              return (
                <li key={j} className="flex items-start gap-2" style={{ paddingLeft: it.depth * 16 }}>
                  {b.kind === "ol" && top ? (
                    <span className="shrink-0 min-w-[1.25rem] h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center mt-0.5">{n}</span>
                  ) : (
                    <span className={cn("shrink-0 rounded-full mt-2", top ? "h-1.5 w-1.5 bg-primary" : "h-1 w-1 bg-muted-foreground")} />
                  )}
                  <span className="min-w-0 flex-1"><Fragment>{renderInline(it.text, `${k}-${j}`)}</Fragment></span>
                </li>
              );
            })}
          </Tag>
        );
      })}
    </div>
  );
});
