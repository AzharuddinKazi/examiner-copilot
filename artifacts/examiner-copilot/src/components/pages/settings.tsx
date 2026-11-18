"use client";

import { format } from "date-fns";
import { Cpu, PlugZap } from "lucide-react";
import { useGetLlmStatus, useTestLlmConnection } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { QueryError, errorMessage } from "@/components/states";
import { StatusPill, ToolText } from "@/components/voice";
import { People } from "@/components/settings/people";
import { MakerCheckerModeCard } from "@/components/settings/maker-checker-mode";

function Row({ k, v, testId }: { k: string; v: React.ReactNode; testId: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-border py-1.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-right font-mono text-xs" data-testid={testId}>{v}</dd>
    </div>
  );
}

export function SettingsView() {
  const llm = useGetLlmStatus();
  const test = useTestLlmConnection();
  const result = test.data;

  return (
    <PageFrame
      eyebrow="Settings"
      question="How is this workspace set up?"
      primaryAction={
        <Button onClick={() => test.mutate({ data: {} })} disabled={test.isPending} data-testid="button-test-connection">
          <PlugZap aria-hidden /> {test.isPending ? "Testing…" : "Test connection"}
        </Button>
      }
      answer={
        <div className="space-y-3">
          {test.isPending ? <Skeleton className="h-14 w-full" /> : null}
          {test.isError ? (
            <div role="alert" className="rounded-lg border border-[hsl(var(--tone-bad)/0.3)] bg-[hsl(var(--tone-bad-bg))] p-4" data-testid="result-test-error">
              <StatusPill variant="error" label="Request failed" />
              <ToolText className="mt-2">{errorMessage(test.error)}</ToolText>
            </div>
          ) : null}
          {result && !test.isPending ? (
            <div role="status" className="rounded-lg border border-card-border bg-card p-4" data-testid="result-test">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill variant={result.ok ? "done" : "error"} label={result.ok ? "Connection works" : "Connection failed"} />
                <ToolText as="span" className="text-xs text-muted-foreground">checked {format(new Date(result.checkedAt), "HH:mm:ss")}</ToolText>
              </div>
              <ToolText className="mt-2" data-testid="text-test-detail">
                {result.ok ? `The model answered in ${result.latencyMs ?? "?"} ms.` : result.error ?? "The provider returned an error without detail."}
              </ToolText>
            </div>
          ) : null}
          {!result && !test.isPending && !test.isError ? (
            <p className="text-sm text-muted-foreground">Test the model connection to confirm the key and model work. It makes one minimal call and records it in the audit log.</p>
          ) : null}
        </div>
      }
      evidence={
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <People />
          <div className="space-y-4">
            <MakerCheckerModeCard />
            <section className="rounded-lg border border-card-border bg-card p-4" data-testid="card-provider">
              <div className="mb-3 flex items-center gap-2">
                <Cpu className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="text-sm font-medium">Model provider</h3>
                {llm.data ? <StatusPill className="ml-auto" variant={llm.data.configured ? "done" : "warning"} label={llm.data.configured ? "Configured" : "Not configured"} data-testid="status-provider" /> : null}
              </div>
              {llm.isLoading ? <Skeleton className="h-24 w-full" /> : llm.isError || !llm.data ? (
                <QueryError title="Could not read provider status" error={llm.error} onRetry={() => llm.refetch()} retrying={llm.isFetching} testId="error-provider" />
              ) : (
                <>
                  <dl>
                    <Row k="API key present" v={llm.data.keyPresent ? "yes" : "no"} testId="text-key-present" />
                  </dl>
                  <ToolText className="mt-3 text-xs" data-testid="text-provider-message">{llm.data.message}</ToolText>
                </>
              )}
            </section>
          </div>
        </div>
      }
      next={{ href: "/", label: "Overview" }}
    />
  );
}
