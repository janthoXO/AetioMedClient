import { useEffect, useState } from "react";
import { ask } from "@/lib/nats";
import type { AllowedLlms, GraphStructure } from "@/lib/types";

const cache = new Map<string, Promise<unknown>>();

/** One read of a server meta subject per page load, shared by all callers. */
function useMeta<T>(subject: string) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    if (!cache.has(subject)) {
      cache.set(
        subject,
        ask<T>(subject).catch((e) => {
          cache.delete(subject); // retry on next mount
          throw e;
        })
      );
    }
    let live = true;
    (cache.get(subject) as Promise<T>).then(
      (data) => live && setState({ data }),
      (e) => live && setState({ error: String(e) })
    );
    return () => {
      live = false;
    };
  }, [subject]);
  return state;
}

export const useAllowedLlms = () => useMeta<AllowedLlms>("meta.allowedLlms");
export const useFeatures = () => useMeta<string[]>("meta.features");
export const useGraph = () => useMeta<GraphStructure>("meta.graph");
