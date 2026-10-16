import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getLlmSettings,
  setLlmSettings,
  type LlmSettings,
} from "@/lib/settings";
import { PROVIDER_LABELS, type LLMProvider } from "@/lib/types";

const PROVIDERS: LLMProvider[] = ["ollama", "google", "openai"];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [settings, setSettings] = useState<LlmSettings>(getLlmSettings);

  const change = (
    provider: LLMProvider,
    key: "url" | "apiKey",
    value: string
  ) =>
    setSettings((s) => ({
      ...s,
      [provider]: { ...s[provider], [key]: value },
    }));

  const save = () => {
    setLlmSettings(settings);
    toast.success("Settings saved");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            URL and API key are sent with each request as its llmConfig and are
            stored only in this browser's localStorage. The server runs in
            Docker, so for Ollama use e.g. https://ollama.com (with an API key)
            or http://host.docker.internal:11434, not localhost.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={PROVIDERS[0]}>
          <TabsList className="w-full">
            {PROVIDERS.map((p) => (
              <TabsTrigger key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </TabsTrigger>
            ))}
          </TabsList>
          {PROVIDERS.map((p) => (
            <TabsContent key={p} value={p} className="pt-2">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${p}-url`}>URL</FieldLabel>
                  <Input
                    id={`${p}-url`}
                    value={settings[p]?.url ?? ""}
                    onChange={(e) => change(p, "url", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${p}-key`}>API key</FieldLabel>
                  <Input
                    id={`${p}-key`}
                    type="password"
                    autoComplete="off"
                    value={settings[p]?.apiKey ?? ""}
                    onChange={(e) => change(p, "apiKey", e.target.value)}
                  />
                </Field>
              </FieldGroup>
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
