import { useApiUrl, useCustom } from "@refinedev/core";
import type { TicketField, TicketFields } from "../types";

// Ticket form metadata from `GET /tickets/fields` — the same data the AI
// assistant is grounded on, so tooltips and AI answers can't disagree.
// It only changes with a deploy: fetch once per session (staleTime Infinity).
export const useTicketFields = () => {
  const apiUrl = useApiUrl();
  const { result, query } = useCustom<TicketFields>({
    url: `${apiUrl}/tickets/fields`,
    method: "get",
    queryOptions: { staleTime: Infinity },
  });

  const fields = result.data?.fields ?? [];
  const field = (name: string): TicketField | undefined => fields.find((f) => f.name === name);

  return {
    fields,
    rules: result.data?.rules ?? [],
    field,
    /** Form.Item `tooltip` for a field (undefined while loading → no icon). */
    help: (name: string) => field(name)?.help,
    /** Form.Item `label`, with a fallback while the metadata loads. */
    label: (name: string, fallback: string) => field(name)?.label ?? fallback,
    isLoading: query.isLoading,
  };
};
