"use client";

import { useGetScoringSettings, useListComplaints } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageFrame } from "@/components/page-frame";
import { SettingsTab } from "@/components/scoring/settings-tab";
import { ComplaintsTab } from "@/components/scoring/complaints-tab";

export function ScoringView() {
  const rubric = useGetScoringSettings("scoring");
  const complaints = useListComplaints();
  const c = rubric.data?.content as { version?: string; themes?: string[] } | undefined;
  const nComplaints = (complaints.data?.items ?? []).reduce((n, x) => n + x.count, 0);
  const banks = new Set((complaints.data?.items ?? []).map((x) => x.bankId)).size;
  return (
    <PageFrame
      eyebrow="Library · Scoring and complaints"
      question="How are findings turned into ratings?"
      primaryAction={null}
      answer={
        <p className="text-base" data-testid="text-scoring-answer">
          {c
            ? <>Each rule gets a rating from 1 (Strong) to 4 (Weak) from its outcome and severity. Rule ratings are averaged into {c.themes?.length ?? 0} themes, and themes into one product rating. {nComplaints ? <>{nComplaints} complaints from {banks} banks are shown next to theme ratings; they never change a score.</> : "No complaint data is loaded yet."}</>
            : "Loading the scoring rubric…"}
        </p>
      }
      labels={{ evidence: "Settings and data" }}
      evidence={
        <Tabs defaultValue="rubric">
          <TabsList>
            <TabsTrigger value="rubric" data-testid="tab-rubric">Scoring rubric</TabsTrigger>
            <TabsTrigger value="roles" data-testid="tab-roles">Document roles</TabsTrigger>
            <TabsTrigger value="complaints" data-testid="tab-complaints">Complaints</TabsTrigger>
          </TabsList>
          <TabsContent value="rubric" className="mt-4"><SettingsTab kind="scoring" /></TabsContent>
          <TabsContent value="roles" className="mt-4"><SettingsTab kind="document_roles" /></TabsContent>
          <TabsContent value="complaints" className="mt-4"><ComplaintsTab /></TabsContent>
        </Tabs>
      }
      next={{ href: "/library/rulebook", label: "Rulebook" }}
    />
  );
}
