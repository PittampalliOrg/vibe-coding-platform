'use client';

import { parseAsString, useQueryState } from 'nuqs';

export type TabValue = 'runs' | 'hooks' | 'workflows';

export function useTabState() {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsString.withDefault('runs')
  );

  return [tab as TabValue, setTab] as const;
}

export function useWorkflowFilter() {
  const [workflowName, setWorkflowName] = useQueryState(
    'workflow',
    parseAsString.withDefault('')
  );

  return [workflowName, setWorkflowName] as const;
}

export function useStatusFilter() {
  const [status, setStatus] = useQueryState(
    'status',
    parseAsString.withDefault('')
  );

  return [status, setStatus] as const;
}

export function useSortOrder() {
  const [sortOrder, setSortOrder] = useQueryState(
    'sort',
    parseAsString.withDefault('desc')
  );

  return [sortOrder as 'asc' | 'desc', setSortOrder] as const;
}
