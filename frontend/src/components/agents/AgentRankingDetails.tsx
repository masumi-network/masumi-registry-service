import { Badge } from '@/components/ui/badge';
import type { RegistryEntry, RegistryEntryRanking } from '@/lib/api/generated';
import type { Network, SortBy } from '@/lib/agent-filters';
import {
  MATCH_SOURCE_LABELS,
  RANKING_COMPONENT_LABELS,
  RELEVANCE_REASON_LABELS,
  SORT_LABELS,
  formatAmount,
} from '@/lib/display-labels';
import {
  lowestPriceInUnit,
  rankingBreakdown,
  relevanceReason,
  type RankingComponentKey,
} from '@/lib/ranking-breakdown';
import { matchSources, type MatchedSource } from '@/lib/search-match';
import { cn } from '@/lib/utils';

/** What a row needs to explain itself: the view's search text, sort and price filter. */
export interface AgentRowView {
  query: string;
  /** The sortBy the request sent, undefined for the registry order. */
  sortBy: SortBy | undefined;
  priceUnit: string;
  minPrice: string;
  maxPrice: string;
  network: Network;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const SCORE_DIGITS = 2;

function MatchedOn({ matches }: { matches: MatchedSource[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground">Matched on</span>
      {matches.map((match) => (
        <Badge key={match.source} variant="secondary" className="font-medium">
          {MATCH_SOURCE_LABELS[match.source]}
          {match.fields.length > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">
              ({match.fields.join(', ')})
            </span>
          )}
        </Badge>
      ))}
    </div>
  );
}

/** The value the active sort compared, in words: the reason for this row's position. */
function sortKeyText(agent: RegistryEntry, view: AgentRowView): string {
  switch (view.sortBy) {
    case 'relevance':
      return RELEVANCE_REASON_LABELS[relevanceReason(agent, view.query)];
    case 'score':
      // The breakdown beside it states the score; repeating it here adds nothing.
      return agent.ranking ? '' : 'No score';
    case 'uptime':
      // The API ranks a never-checked agent (no rolling uptime) as 0%, after measured ones.
      return agent.uptimeCheckCount === 0 || !agent.ranking
        ? 'Never health-checked, so ranked last'
        : `Rolling uptime ${percent(agent.ranking.components.uptime)}`;
    case 'price': {
      const amount = lowestPriceInUnit(agent, view.priceUnit, {
        minAmount: view.minPrice || undefined,
        maxAmount: view.maxPrice || undefined,
      });
      if (amount === null) return `No price in ${view.priceUnit}`;
      const price = formatAmount(amount, view.priceUnit, view.network);
      return `Lowest price ${price.amount} ${price.unit}${price.inBaseUnits ? ' (base units)' : ''}`;
    }
    case 'recency':
      return `First seen ${agent.createdAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
    case undefined:
      return '';
  }
}

function ScoreBreakdown({ ranking, sortBy }: { ranking: RegistryEntryRanking; sortBy?: SortBy }) {
  const rows = rankingBreakdown(ranking);
  // Uptime is the one sort that compares a score component directly.
  const highlighted: RankingComponentKey | undefined = sortBy === 'uptime' ? 'uptime' : undefined;
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-muted-foreground">
        {sortBy === 'score' ? 'Ranked by score' : 'Score'}{' '}
        <span className="font-semibold tabular-nums text-foreground">
          {ranking.score.toFixed(SCORE_DIGITS)}
        </span>
        , the weighted mean of:
      </p>
      <dl className="grid grid-cols-[auto_minmax(3rem,8rem)_auto] items-center gap-x-2 gap-y-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              'contents text-muted-foreground',
              highlighted === row.key && 'font-semibold text-foreground',
            )}
          >
            <dt
              title={`${percent(row.value)} × weight ${row.weight} adds ${row.contribution.toFixed(SCORE_DIGITS)} to the score`}
            >
              {RANKING_COMPONENT_LABELS[row.key]}
            </dt>
            <dd aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full bg-primary/60',
                  highlighted === row.key && 'bg-primary',
                )}
                style={{ width: percent(Math.min(Math.max(row.value, 0), 1)) }}
              />
            </dd>
            <dd className="whitespace-nowrap tabular-nums">
              {percent(row.value)} <span className="text-muted-foreground">× {row.weight}</span>
              <span className="sr-only">
                , adds {row.contribution.toFixed(SCORE_DIGITS)} to the score
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Why a row is in the list and where it is: which part matched the search, the value the
 * sort compared, and the API's score components. Labels only: the order is the API's.
 */
export function AgentRankingDetails({ agent, view }: { agent: RegistryEntry; view: AgentRowView }) {
  const matches = view.query ? matchSources(agent, view.query) : [];
  const sortKey = sortKeyText(agent, view);
  if (matches.length === 0 && !sortKey && !agent.ranking) return null;

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3 rounded-md bg-muted/40 px-3 py-2 text-xs @3xl:col-span-full">
      {matches.length > 0 && <MatchedOn matches={matches} />}
      {sortKey && view.sortBy && (
        <p>
          <span className="text-muted-foreground">
            Ranked by {SORT_LABELS[view.sortBy].toLowerCase()}:{' '}
          </span>
          <span className="font-medium">{sortKey}</span>
        </p>
      )}
      {agent.ranking && <ScoreBreakdown ranking={agent.ranking} sortBy={view.sortBy} />}
    </div>
  );
}
