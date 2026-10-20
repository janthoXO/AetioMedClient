import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { InputGroupAddon } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAllowedLlms } from "@/hooks/useMeta";
import { db } from "@/lib/db";
import { searchIcd, type IcdEntity } from "@/lib/icd";
import { startRun } from "@/lib/jobs";
import type {
  Difficulty,
  GenerationFlag,
  GenerationMode,
  GenerationRequest,
  LLMProvider,
} from "@/lib/types";
import { FLAG_LABELS, PROVIDER_LABELS } from "@/lib/types";

type Option<T> = { value: T; label: string; hint?: string };
type Llm = { provider: LLMProvider; model: string };

// Mirrors the server's LANGUAGES (ISO 639-1, default en,de); there is no meta endpoint.
const LANGUAGES = ["en", "de"];

const FIELDS = Object.entries(FLAG_LABELS).map(([flag, label]) => ({
  flag: flag as GenerationFlag,
  label,
}));

const MODES: Option<GenerationMode>[] = [
  {
    value: "normal",
    label: "Normal",
    hint: "The case is generated end to end.",
  },
  {
    value: "plan",
    label: "Plan",
    hint: "Stops after the plan so you can edit it before the case is generated.",
  },
];

const DIFFICULTIES: Option<Difficulty>[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

type Instructions = Record<GenerationFlag | "general", string>;
const NO_INSTRUCTIONS: Instructions = {
  patient: "",
  chiefComplaint: "",
  anamnesis: "",
  procedures: "",
  general: "",
};
const ALL_GENERATE = Object.fromEntries(
  FIELDS.map(({ flag }) => [flag, true])
) as Record<GenerationFlag, boolean>;

/** A single-choice toggle group; the selected option's hint is shown by the caller. */
function OptionToggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      aria-label={label}
      value={[value]}
      // Base UI reports an empty array when the active item is clicked again.
      onValueChange={([v]) => v && onChange(v as T)}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Diagnosis input that searches ICD-11 as you type. Picking a result fills the
 * text with its title and keeps its code; editing the text drops the code, so
 * free text (e.g. with no ICD container) is still sent as a plain diagnosis.
 */
function DiagnosisSearch({
  diagnosis,
  icd,
  language,
  onChange,
}: {
  diagnosis: string;
  icd: IcdEntity | null;
  language: string;
  onChange: (diagnosis: string, icd: IcdEntity | null) => void;
}) {
  const [results, setResults] = useState<IcdEntity[]>([]);
  const [error, setError] = useState<string>();
  const q = diagnosis.trim();
  const searching = q.length >= 2 && q !== icd?.title;

  useEffect(() => {
    if (!searching) return;
    const ac = new AbortController();
    const t = setTimeout(
      () =>
        searchIcd(q, language, ac.signal).then(
          (r) => {
            setResults(r);
            setError(undefined);
          },
          (e) => !ac.signal.aborted && setError(String(e))
        ),
      250
    );
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, language, searching]);

  return (
    <>
      <Combobox
        items={q.length >= 2 ? results : []}
        filter={null}
        value={icd}
        onValueChange={(v) => v && onChange(v.title, v)}
        inputValue={diagnosis}
        // Only typing touches the code: picking an item also sets the input
        // (to the title), in the same event as onValueChange.
        onInputValueChange={(v, { reason }) =>
          reason === "input-change" &&
          onChange(v, icd && v === icd.title ? icd : null)
        }
        itemToStringLabel={(e: IcdEntity) => e.title}
        isItemEqualToValue={(a: IcdEntity, b: IcdEntity) => a.code === b.code}
      >
        <ComboboxInput
          id="diagnosis"
          placeholder="Search ICD-11, e.g. Myocardial infarction"
          showTrigger={false}
          className="w-full"
        >
          {icd && (
            <InputGroupAddon align="inline-end">
              <Badge variant="secondary" className="font-mono">
                {icd.code}
              </Badge>
            </InputGroupAddon>
          )}
        </ComboboxInput>
        <ComboboxContent>
          <ComboboxEmpty>{q.length >= 2 && "No ICD-11 match"}</ComboboxEmpty>
          <ComboboxList>
            {(e: IcdEntity) => (
              <ComboboxItem key={e.code} value={e}>
                <span className="flex-1">{e.title}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {e.code}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error ? (
        <FieldDescription className="text-destructive">
          {error}. Is the ICD container running? Free text is sent as is.
        </FieldDescription>
      ) : (
        q !== "" &&
        !icd && (
          <FieldDescription>
            No ICD-11 entry picked: sent as free text without a code.
          </FieldDescription>
        )
      )}
    </>
  );
}

/** A textarea hidden behind a link-style button until asked for. */
function RevealableTextarea({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  // Starts open when it already holds text, e.g. after toggling the field away and back.
  const [shown, setShown] = useState(value !== "");
  if (!shown) {
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="self-start px-0 text-muted-foreground"
        onClick={() => setShown(true)}
      >
        <Plus data-icon="inline-start" />
        {label}
      </Button>
    );
  }
  // Closing only hides the textarea, so it is refused while it holds text
  // that would still be sent without being visible.
  const canClose = value === "";
  return (
    <div className="relative w-full">
      <Textarea
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        value={value}
        className="pr-8"
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        disabled={!canClose}
        title={canClose ? "Close" : "Clear the text to close"}
        aria-label="Close instructions"
        className="absolute top-2 right-2 rounded-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        onClick={() => setShown(false)}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function GenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { data: allowed, error } = useAllowedLlms();
  const [diagnosis, setDiagnosis] = useState("");
  const [icd, setIcd] = useState<IcdEntity | null>(null);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [mode, setMode] = useState<GenerationMode>("normal");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [enabled, setEnabled] = useState(ALL_GENERATE);
  const [instructions, setInstructions] = useState(NO_INSTRUCTIONS);
  const [selected, setSelected] = useState<Llm[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const providers = Object.entries(allowed ?? {}).filter(
    ([, models]) => models && models.length > 0
  ) as [LLMProvider, string[]][];
  const serverDefault = allowed !== undefined && providers.length === 0;
  const flags = FIELDS.filter((f) => enabled[f.flag]).map((f) => f.flag);
  const canSubmit =
    diagnosis.trim() !== "" &&
    flags.length > 0 &&
    (serverDefault || selected.length > 0) &&
    !submitting;

  const selectedModels = (provider: LLMProvider) =>
    selected.filter((s) => s.provider === provider).map((s) => s.model);
  const setSelectedModels = (provider: LLMProvider, models: string[]) =>
    setSelected((cur) => [
      ...cur.filter((s) => s.provider !== provider),
      ...models.map((model) => ({ provider, model })),
    ]);

  const reset = () => {
    setDiagnosis("");
    setIcd(null);
    setLanguage(LANGUAGES[0]);
    setMode("normal");
    setDifficulty("medium");
    setEnabled(ALL_GENERATE);
    setInstructions(NO_INSTRUCTIONS);
    setSelected([]);
  };

  const submit = async () => {
    const userInstructions = Object.fromEntries(
      (["general", ...flags] as const)
        .map((k) => [k, instructions[k].trim()] as const)
        .filter(([, v]) => v !== "")
    );
    const request: GenerationRequest = {
      diagnosis: diagnosis.trim(),
      ...(icd && { icd: icd.code }),
      generationFlags: flags,
      ...(Object.keys(userInstructions).length > 0 && { userInstructions }),
      language,
      difficulty,
      mode,
    };
    setSubmitting(true);
    try {
      const caseId = (await db.cases.add({
        createdAt: new Date(),
        request,
      } as Parameters<typeof db.cases.add>[0])) as number;
      await Promise.all(
        serverDefault
          ? [startRun(caseId, request)]
          : selected.map((llm) => startRun(caseId, request, llm))
      );
      onOpenChange(false);
      reset();
      navigate(`/cases/${caseId}`);
    } catch (e) {
      toast.error(`Could not start generation: ${e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New case</DialogTitle>
          <DialogDescription>
            URLs and API keys for the LLM providers are set in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="diagnosis">Diagnosis</FieldLabel>
              <DiagnosisSearch
                diagnosis={diagnosis}
                icd={icd}
                language={language}
                onChange={(d, i) => {
                  setDiagnosis(d);
                  setIcd(i);
                }}
              />
            </Field>

            <Field>
              <FieldLabel>Language</FieldLabel>
              <Select
                value={language}
                onValueChange={(v) => v && setLanguage(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Mode</FieldLabel>
              <OptionToggle
                label="Mode"
                options={MODES}
                value={mode}
                onChange={setMode}
              />
              <FieldDescription>
                {MODES.find((o) => o.value === mode)?.hint}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Difficulty</FieldLabel>
              <OptionToggle
                label="Difficulty"
                options={DIFFICULTIES}
                value={difficulty}
                onChange={setDifficulty}
              />
            </Field>

            <Separator />

            <Field>
              <FieldLabel>Fields to generate</FieldLabel>
              <div className="divide-y rounded-lg border">
                {FIELDS.map(({ flag, label }) => (
                  // The instructions button sits right of the label; an open
                  // textarea is full width and wraps onto its own line.
                  <div
                    key={flag}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
                  >
                    <Checkbox
                      id={`field-${flag}`}
                      checked={enabled[flag]}
                      onCheckedChange={(c) =>
                        setEnabled((m) => ({ ...m, [flag]: c }))
                      }
                    />
                    <FieldLabel
                      htmlFor={`field-${flag}`}
                      className={`h-7 flex-1 font-normal ${enabled[flag] ? "" : "text-muted-foreground"}`}
                    >
                      {label}
                    </FieldLabel>
                    {enabled[flag] && (
                      <RevealableTextarea
                        label="Instructions"
                        placeholder={`Additional instructions for ${label}...`}
                        value={instructions[flag]}
                        onChange={(v) =>
                          setInstructions((i) => ({ ...i, [flag]: v }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </Field>

            <RevealableTextarea
              label="Add general instructions"
              placeholder="General instructions for the generation..."
              value={instructions.general}
              onChange={(v) => setInstructions((i) => ({ ...i, general: v }))}
            />

            <Separator />

            <Field>
              <FieldLabel>LLMs</FieldLabel>
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load allowed LLMs</AlertTitle>
                  <AlertDescription>
                    {error}. Is NATS reachable at VITE_NATS_URL?
                  </AlertDescription>
                </Alert>
              ) : !allowed ? (
                <Skeleton className="h-16 w-full" />
              ) : serverDefault ? (
                <p className="text-sm text-muted-foreground">
                  Server default LLM
                </p>
              ) : (
                <>
                  <FieldDescription>
                    Each selected LLM becomes one run, so you can compare them.
                  </FieldDescription>
                  <Tabs defaultValue={providers[0][0]}>
                    <TabsList className="w-full">
                      {providers.map(([provider]) => {
                        const n = selectedModels(provider).length;
                        return (
                          <TabsTrigger key={provider} value={provider}>
                            {PROVIDER_LABELS[provider]}
                            {n > 0 && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {n}
                              </span>
                            )}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                    {providers.map(([provider, models]) => (
                      <TabsContent key={provider} value={provider}>
                        <div className="divide-y rounded-lg border">
                          {models.map((model) => {
                            const id = `llm-${provider}-${model}`;
                            const picked = selectedModels(provider);
                            return (
                              <div
                                key={model}
                                className="flex items-center gap-3 px-3 py-2"
                              >
                                <Checkbox
                                  id={id}
                                  checked={picked.includes(model)}
                                  onCheckedChange={(c) =>
                                    setSelectedModels(
                                      provider,
                                      c
                                        ? [...picked, model]
                                        : picked.filter((m) => m !== model)
                                    )
                                  }
                                />
                                <FieldLabel
                                  htmlFor={id}
                                  className="h-7 flex-1 font-mono font-normal"
                                >
                                  {model}
                                </FieldLabel>
                              </div>
                            );
                          })}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </>
              )}
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Spinner data-icon="inline-start" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
