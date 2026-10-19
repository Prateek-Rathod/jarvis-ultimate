import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

interface MarkdownNode {
  type: string;
  value?: string;
  ordered?: boolean;
  start?: number | null;
  alt?: string;
  children?: MarkdownNode[];
}

const markdownProcessor = unified().use(remarkParse).use(remarkGfm);
const ordinalWords = ["First", "Second", "Third", "Fourth", "Fifth"];

function inlineText(node: MarkdownNode): string {
  if (node.type === "break") return ". ";
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  if (node.type === "image") return node.alt ?? "";
  if (node.type === "html" || node.type === "imageReference") return "";
  return (node.children ?? []).map(inlineText).join("");
}

function finishSentence(value: string): string {
  const sentence = value.trim().replace(/[:;]$/, ".");
  if (!sentence) return "";
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`;
}

function blockText(node: MarkdownNode): string {
  const children = node.children ?? [];
  switch (node.type) {
    case "paragraph":
    case "heading":
      return finishSentence(children.map(inlineText).join(""));
    case "blockquote":
      return children.map(blockText).filter(Boolean).join(" ");
    case "list": {
      const items = children.map((item) =>
        (item.children ?? []).map(blockText).filter(Boolean).join(" "),
      );
      if (node.ordered) {
        const start = node.start ?? 1;
        return items
          .map((item, index) => {
            const ordinal = ordinalWords[start + index - 1] ?? `Item ${start + index}`;
            return `${ordinal}, ${item.charAt(0).toLowerCase()}${item.slice(1)}`;
          })
          .join(" ");
      }
      return items.join(" ");
    }
    case "table": {
      const [header, ...rows] = children;
      const headings = (header?.children ?? []).map((cell) => inlineText(cell).trim());
      return rows
        .map((row) =>
          (row.children ?? [])
            .map((cell, index) => {
              const value = inlineText(cell).trim();
              const heading = headings[index];
              return heading ? `${heading}: ${value}` : value;
            })
            .filter(Boolean)
            .join(". "),
        )
        .map(finishSentence)
        .join(" ");
    }
    case "code":
      return "A code example is shown in the chat.";
    case "html":
    case "thematicBreak":
      return "";
    default:
      return children.map(blockText).filter(Boolean).join(" ");
  }
}

export function markdownToSpeech(markdown: string): string {
  const tree = markdownProcessor.parse(markdown) as MarkdownNode;
  return (tree.children ?? []).map(blockText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
