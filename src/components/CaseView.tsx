import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CaseResult,
  ContentPart,
  Procedure,
  ProcedureCategory,
} from "@/lib/types";

const RELEVANCE = {
  obligatory: "default",
  optional: "secondary",
  contraindicated: "destructive",
} as const;

export function Parts({ parts }: { parts: ContentPart[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {parts.map((part, i) => {
        if (part.type.startsWith("text/"))
          return (
            <p key={i} className="text-sm whitespace-pre-wrap">
              {part.value}
            </p>
          );
        const src = `data:${part.type};base64,${part.value}`;
        if (part.type.startsWith("image/"))
          return (
            <img
              key={i}
              src={src}
              alt={part.alt}
              className="max-w-full rounded-md border"
            />
          );
        return (
          <a
            key={i}
            href={src}
            download={part.alt || part.type}
            className="text-sm underline underline-offset-4"
          >
            {part.alt || part.type}
          </a>
        );
      })}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ProcedureItem({ procedure }: { procedure: Procedure }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{procedure.name}</span>
        <Badge variant={RELEVANCE[procedure.relevance]}>
          {procedure.relevance}
        </Badge>
      </div>
      <Parts parts={procedure.result} />
    </div>
  );
}

function Procedures({
  categories,
  procedures,
}: {
  categories: ProcedureCategory[];
  procedures: Procedure[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {categories.map((category, i) => (
        <div key={i} className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {category.name}
          </h4>
          <div className="ml-2 border-l pl-3">
            <Procedures
              categories={category.categories}
              procedures={category.procedures}
            />
          </div>
        </div>
      ))}
      {[...procedures]
        .sort((a, b) => a.order - b.order)
        .map((procedure, i) => (
          <ProcedureItem key={i} procedure={procedure} />
        ))}
    </div>
  );
}

export function CaseView({ result }: { result: CaseResult }) {
  const { patient, chiefComplaint, anamnesis, procedures } = result;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {patient && (
        <Section title="Patient">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["Name", patient.name],
                ["Age", `${patient.age} y`],
                ["Gender", patient.gender],
                ["Height", `${patient.height} cm`],
                ["Weight", `${patient.weight} kg`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd
                  className={cn(
                    "text-sm font-medium",
                    label === "Gender" && "capitalize"
                  )}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {chiefComplaint && (
        <Section title="Chief complaint">
          <blockquote className="border-l-2 pl-3">
            <Parts parts={chiefComplaint} />
          </blockquote>
        </Section>
      )}
      {anamnesis && (
        <Section title="Anamnesis">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(8rem,auto)_1fr]">
            {anamnesis.map((entry, i) => (
              <div key={i} className="contents">
                <dt className="text-sm font-medium text-muted-foreground">
                  {entry.category}
                </dt>
                <dd>
                  <Parts parts={entry.answer} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {procedures && (
        <Section title="Procedures">
          <Procedures
            categories={procedures.categories}
            procedures={procedures.procedures}
          />
        </Section>
      )}
    </div>
  );
}
