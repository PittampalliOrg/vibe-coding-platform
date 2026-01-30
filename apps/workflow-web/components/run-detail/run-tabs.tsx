'use client';

import { List, Workflow, AlignJustify } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface RunTabsProps {
  traceContent: React.ReactNode;
  graphContent: React.ReactNode;
  streamsContent: React.ReactNode;
  defaultTab?: 'trace' | 'graph' | 'streams';
}

export function RunTabs({
  traceContent,
  graphContent,
  streamsContent,
  defaultTab = 'trace',
}: RunTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="bg-muted/50">
        <TabsTrigger value="trace" className="gap-1.5 data-[state=active]:bg-background">
          <List className="h-4 w-4" />
          Trace
        </TabsTrigger>
        <TabsTrigger value="graph" className="gap-1.5 data-[state=active]:bg-background">
          <Workflow className="h-4 w-4" />
          Graph
        </TabsTrigger>
        <TabsTrigger value="streams" className="gap-1.5 data-[state=active]:bg-background">
          <AlignJustify className="h-4 w-4" />
          Streams
        </TabsTrigger>
      </TabsList>
      <TabsContent value="trace" className="mt-4">
        {traceContent}
      </TabsContent>
      <TabsContent value="graph" className="mt-4">
        {graphContent}
      </TabsContent>
      <TabsContent value="streams" className="mt-4">
        {streamsContent}
      </TabsContent>
    </Tabs>
  );
}
