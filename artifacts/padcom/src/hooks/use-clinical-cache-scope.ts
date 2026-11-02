import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { COLLAB_EVENT } from "@/lib/collab-auth";

/**
 * Clinical server data is scoped to the current collaborator session.
 * The monotonic, non-secret scope separates cache generations without ever
 * placing the bearer token in a query key. Previous generations are removed
 * as soon as the in-session collaborator changes.
 */
export function useClinicalCacheScope(): number {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState(0);

  useEffect(() => {
    const clearClinicalCache = () => {
      queryClient.removeQueries({
        predicate: query => {
          const key = query.queryKey[0];
          return typeof key === "string" &&
            (key.startsWith("/api/clinical-access/locations") ||
             key.startsWith("/api/clinical-approvals"));
        },
      });
      setScope(previous => previous + 1);
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "padcom_collab_token") clearClinicalCache();
    };

    window.addEventListener(COLLAB_EVENT, clearClinicalCache);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(COLLAB_EVENT, clearClinicalCache);
      window.removeEventListener("storage", onStorage);
    };
  }, [queryClient]);

  return scope;
}
