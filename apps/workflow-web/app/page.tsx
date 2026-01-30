'use client';

import { Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RunsTable } from '@/components/runs-table';
import { HooksTable } from '@/components/hooks-table';
import { WorkflowsList } from '@/components/workflows-list';
import { useTabState, type TabValue } from '@/lib/url-state';
import { Skeleton } from '@/components/ui/skeleton';

function DashboardContent() {
  const [tab, setTab] = useTabState();

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
      <TabsList>
        <TabsTrigger value="runs">Runs</TabsTrigger>
        <TabsTrigger value="hooks">Hooks</TabsTrigger>
        <TabsTrigger value="workflows">Workflows</TabsTrigger>
      </TabsList>

      <TabsContent value="runs" className="mt-6">
        <RunsTable />
      </TabsContent>

      <TabsContent value="hooks" className="mt-6">
        <HooksTable />
      </TabsContent>

      <TabsContent value="workflows" className="mt-6">
        <WorkflowsList />
      </TabsContent>
    </Tabs>
  );
}

function DashboardFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <Suspense fallback={<DashboardFallback />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
