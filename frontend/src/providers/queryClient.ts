import { keepPreviousData, QueryClient } from "@tanstack/react-query";

// Created here (instead of letting <Refine> create its own) so authProvider
// can wipe it on logout: otherwise the next person to log in in this tab
// would briefly see the previous user's cached lists and `can` answers.
// The defaults are copied from what <Refine> sets on the client it creates,
// so handing it our own instance changes nothing else.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData, // keep the old page visible while the next one loads
    },
  },
});
