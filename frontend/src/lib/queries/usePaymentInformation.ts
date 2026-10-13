import { useQuery } from '@tanstack/react-query';
import { getPaymentInformation } from '@/lib/api/generated';
import { queryKeys } from './query-keys';

/** Pricing and the seller wallet of an agent, read live from chain by the registry. */
export function usePaymentInformation(agentIdentifier: string) {
  return useQuery({
    queryKey: queryKeys.paymentInformation(agentIdentifier),
    queryFn: async ({ signal }) => {
      const { data } = await getPaymentInformation({
        query: { agentIdentifier },
        signal,
        throwOnError: true,
      });
      // A proxy error page can arrive as a 200 with a non-JSON body.
      if (!data?.data?.agentIdentifier) throw new Error('Unexpected payment information response');
      return data.data;
    },
  });
}
