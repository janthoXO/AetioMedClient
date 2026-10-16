import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { cn } from "@/lib/utils";
import type { PlanSegment } from "@/lib/types";

/** Typography shared by the plan's editors and read-only views. */
export const proseClass =
  "text-sm leading-relaxed outline-none [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-medium [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1 [&_table]:my-2 [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-6";

/** Markdown rendered by a non-editable tiptap editor. */
export function ReadOnlyMarkdown({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit, TableKit, Markdown],
    content: markdown,
    contentType: "markdown",
    editable: false,
    editorProps: { attributes: { class: cn(proseClass, className) } },
  });
  useEffect(() => {
    editor?.commands.setContent(markdown, { contentType: "markdown" });
  }, [editor, markdown]);
  return <EditorContent editor={editor} />;
}

export function PlanView({ plan }: { plan: PlanSegment[] }) {
  return (
    <ReadOnlyMarkdown
      markdown={plan
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join("\n\n")}
    />
  );
}
