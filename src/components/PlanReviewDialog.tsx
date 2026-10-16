import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import {
  Bold,
  Columns3,
  Eye,
  EyeOff,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Rows3,
  Table as TableIcon,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReadOnlyMarkdown, proseClass } from "@/components/PlanView";
import { cn } from "@/lib/utils";
import type { RunRecord } from "@/lib/db";
import { generateFromPlan } from "@/lib/jobs";
import {
  editedOutline,
  fingerprint,
  fixedParts,
  headingLevel,
  isSubheading,
  requestedSections,
  sectionsOf,
} from "@/lib/plan-editor";
import type { PlanSegment } from "@/lib/types";

type Editors = Map<number, { editor: Editor; baseline: string }>;

/** The plan's toolbar, acting on the editor focused last. */
function Toolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor && {
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        bulletList: editor.isActive("bulletList"),
        orderedList: editor.isActive("orderedList"),
        table: editor.isActive("table"),
      },
  });
  const item = (
    label: string,
    icon: React.ReactNode,
    onClick: (editor: Editor) => void,
    pressed = false
  ) => (
    <Toggle
      size="sm"
      aria-label={label}
      title={label}
      pressed={pressed}
      disabled={!editor}
      onPressedChange={() => editor && onClick(editor)}
    >
      {icon}
    </Toggle>
  );
  const chain = (editor: Editor) => editor.chain().focus();

  return (
    <div className="sticky bottom-0 flex justify-center pt-3 pb-1">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-1 shadow-md">
        {item(
          "Bold",
          <Bold />,
          (e) => chain(e).toggleBold().run(),
          state?.bold
        )}
        {item(
          "Italic",
          <Italic />,
          (e) => chain(e).toggleItalic().run(),
          state?.italic
        )}
        {item(
          "Bullet list",
          <List />,
          (e) => chain(e).toggleBulletList().run(),
          state?.bulletList
        )}
        {item(
          "Numbered list",
          <ListOrdered />,
          (e) => chain(e).toggleOrderedList().run(),
          state?.orderedList
        )}
        {state?.table ? (
          <>
            {item("Add row", <Rows3 />, (e) => chain(e).addRowAfter().run())}
            {item("Add column", <Columns3 />, (e) =>
              chain(e).addColumnAfter().run()
            )}
            {item("Delete table", <Trash2 />, (e) =>
              chain(e).deleteTable().run()
            )}
          </>
        ) : (
          item("Insert table", <TableIcon />, (e) =>
            chain(e)
              .insertTable({ rows: 3, cols: 2, withHeaderRow: true })
              .run()
          )
        )}
        <span className="mx-1 w-px bg-border" />
        {item("Undo", <Undo2 />, (e) => chain(e).undo().run())}
        {item("Redo", <Redo2 />, (e) => chain(e).redo().run())}
      </div>
    </div>
  );
}

/** One editable segment, styled like a textarea. */
function SegmentEditor({
  text,
  className,
  onReady,
  onFocus,
}: {
  text: string;
  className?: string;
  onReady: (editor: Editor) => void;
  onFocus: (editor: Editor) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      TableKit,
      Markdown,
    ],
    content: text,
    contentType: "markdown",
    onFocus: ({ editor }) => onFocus(editor),
    editorProps: {
      attributes: {
        class: cn(
          proseClass,
          "min-h-16 rounded-md border border-input px-3 py-2 shadow-xs transition-[color,box-shadow] focus:border-ring focus:ring-[3px] focus:ring-ring/50 dark:bg-input/30"
        ),
      },
    },
  });
  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);
  return <EditorContent editor={editor} className={className} />;
}

/**
 * The plan as dialog headings, each with the editors of its text below. A
 * section whose field is not generated starts collapsed to its heading; its
 * editors stay mounted, only hidden, so expanding never loses an edit.
 */
function PlanSections({
  plan,
  requested,
  onReady,
  onActive,
}: {
  plan: PlanSegment[];
  requested: boolean[];
  onReady: (index: number, editor: Editor) => void;
  onActive: (editor: Editor | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(
    () => new Set(requested.flatMap((r, i) => (r === false ? [i] : [])))
  );
  const sections = sectionsOf(plan);

  const toggle = (section: number) => {
    const next = new Set(collapsed);
    if (!next.delete(section)) next.add(section);
    setCollapsed(next);
    // The toolbar must not reach into a section just hidden.
    onActive(null);
  };

  return plan.map((segment, i) => {
    const section = sections[i]!;
    const hidden = collapsed.has(section);
    if (segment.fixed) {
      const { heading, body } = fixedParts(segment.text);
      const sub = isSubheading(segment.text);
      const collapsible = !sub && !!heading && requested[section] === false;
      return (
        <div
          key={i}
          className={cn("flex flex-col gap-1", !sub && "pt-4 first:pt-0")}
        >
          {heading && (
            <div
              className={cn(
                "flex items-center gap-1.5",
                sub && "pt-1 pl-4",
                hidden && !sub && "text-muted-foreground"
              )}
            >
              {sub ? (
                <h4 className={cn("text-sm font-medium", hidden && "hidden")}>
                  {heading}
                </h4>
              ) : (
                <h3 className="text-base font-semibold">{heading}</h3>
              )}
              {collapsible && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={hidden ? "Show section" : "Hide section"}
                        aria-expanded={!hidden}
                        onClick={() => toggle(section)}
                      />
                    }
                  >
                    {hidden ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    This field is not generated. The section stays in the plan
                    to keep it coherent, and its content still shapes the
                    generated fields. Edit it only to steer them.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
          {body && (
            <ReadOnlyMarkdown
              markdown={body}
              className={cn("text-muted-foreground", hidden && "hidden")}
            />
          )}
        </div>
      );
    }
    // An empty introduction — text opening a deeper level, before the first
    // `##` or a section's first `###` — gets no editor; it goes back as is.
    const intro =
      headingLevel(plan[i + 1]?.text) > headingLevel(plan[i - 1]?.text);
    if (intro && segment.text.trim() === "") return null;
    const nested = isSubheading(plan[i - 1]?.text ?? "");
    return (
      <SegmentEditor
        key={i}
        text={segment.text}
        className={cn(nested && "pl-4", hidden && "hidden")}
        onReady={(editor) => onReady(i, editor)}
        onFocus={onActive}
      />
    );
  });
}

/**
 * Review of a plan-mode run's plan. Fixed headings are headings of the
 * dialog, the text between them is edited as rich text. Submitting starts a
 * new run from the plan; untouched sections go back exactly as they came.
 */
export function PlanReviewDialog({
  run,
  open,
  onOpenChange,
}: {
  run: RunRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Each editable segment's editor, with its fingerprint right after loading
  // — what "untouched" is measured against.
  const editors = useRef<Editors>(new Map());
  const [active, setActive] = useState<Editor | null>(null);
  const plan = run.plan?.plan;

  // Once per editor instance: a re-render must not re-take the baseline.
  const register = (index: number, editor: Editor) => {
    if (editors.current.get(index)?.editor !== editor) {
      editors.current.set(index, { editor, baseline: fingerprint(editor) });
    }
  };

  const isDirty = () =>
    !!plan &&
    editedOutline(plan, editors.current).some(
      (s, i) => s.text !== plan[i]!.text
    );

  const handleOpenChange = (next: boolean) => {
    if (!next && !submitting && isDirty()) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!plan) return;
    setSubmitting(true);
    try {
      const jobId = await generateFromPlan(
        run,
        editedOutline(plan, editors.current)
      );
      toast.success("Plan accepted, generating the case.");
      onOpenChange(false);
      navigate(`/cases/${run.caseId}/runs/${jobId}`);
    } catch (err) {
      toast.error(`Could not start generation: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review plan</DialogTitle>
            <DialogDescription>
              Edit the text under the headings. Sections of fields that are not
              generated are collapsed.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {plan && (
              <>
                {/* Keyed by run: another run loads into fresh editors. */}
                <div key={run.jobId} className="flex flex-col gap-2">
                  <PlanSections
                    plan={plan}
                    requested={requestedSections(run.request.generationFlags)}
                    onReady={register}
                    onActive={setActive}
                  />
                </div>
                <Toolbar editor={active} />
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Close
            </Button>
            <Button onClick={handleSubmit} disabled={!plan || submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              Generate case from plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to the plan have not been used yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => onOpenChange(false)}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
