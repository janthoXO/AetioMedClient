import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Stethoscope } from "lucide-react";
import { GenerateDialog } from "@/components/GenerateDialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { db } from "@/lib/db";

export default function HomePage() {
  const [open, setOpen] = useState(false);
  const count = useLiveQuery(() => db.cases.count());

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Stethoscope />
        </EmptyMedia>
        <EmptyTitle>
          {count === 0 ? "Generate your first case" : "No case selected"}
        </EmptyTitle>
        <EmptyDescription>
          {count === 0
            ? "Enter a diagnosis and let the server generate a case."
            : "Pick a case in the sidebar or create a new one."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => setOpen(true)}>
          <Plus data-icon="inline-start" />
          New case
        </Button>
      </EmptyContent>
      <GenerateDialog open={open} onOpenChange={setOpen} />
    </Empty>
  );
}
