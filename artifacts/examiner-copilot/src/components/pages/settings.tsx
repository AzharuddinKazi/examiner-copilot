"use client";

import { format } from "date-fns";
import { Cpu, Database, Lock, PlugZap } from "lucide-react";
import { useGetLlmStatus, useGetWorkspaceStatus, useTestLlmConnection } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { QueryError, errorMessage } from "@/components/states";
import { StatusPill, ToolText } from "@/components/voice";
import { useRole } from "@/lib/role";

function Row({ k, v, testId }: { k: string; v: React.ReactNode; testId: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-border py-1.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-right font-mono text-xs" data-testid={testId}>{v}</dd>
    </div>
  );
}

export function SettingsView() {
  const { role } = useRole();
  const llm = useGetLlmStatus();
  const ws = useGetWorkspaceStatus();
  const test = useTestLlmConnection();
  const result = test.data;

  return (
    <PageFrame
      eyebrow="Settings"
      question="How is this workspace set up?"
      primaryAction={
        <Button onClick={() => test.mutate({ data: { role } })} disabled={test.isPending} data-testid="button-test-connection">
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
                {result.ok ? `${result.model ?? "model"} answered in ${result.latencyMs ?? "?"} ms.` : result.error ?? "The provider returned an error without detail."}
              </ToolText>
            </div>
          ) : null}
          {!result && !test.isPending && !test.isError ? (
            <p className="text-sm text-muted-foreground">Test the model connection to confirm the key and model work. It makes one minimal call and records it with your self-selected role.</p>
          ) : null}
        </div>
      }
      evidence={
        <div className="grid gap-3 md:grid-cols-2">
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
                  <Row k="Provider" v={llm.data.provider} testId="text-provider" />
                  <Row k="API key present" v={llm.data.keyPresent ? "yes" : "no"} testId="text-key-present" />
                  <Row k="Model" v={llm.data.model ?? "not set"} testId="text-model" />
                </dl>
                <ToolText className="mt-3 text-xs" data-testid="text-provider-message">{llm.data.message}</ToolText>
              </>
            )}
          </section>
          <section className="rounded-lg border border-card-border bg-card p-4" data-testid="card-workspace-mode">
            <div className="mb-3 flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" aria-hidden />
              <h3 className="text-sm font-medium">Workspace mode</h3>
            </div>
            {ws.isLoading ? <Skeleton className="h-24 w-full" /> : ws.isError || !ws.data ? (
              <QueryError title="Could not read workspace mode" error={ws.error} onRetry={() => ws.refetch()} retrying={ws.isFetching} testId="error-workspace" />
            ) : (
              <>
                <dl>
                  <Row k="Dataset" v={ws.data.mode === "live" ? "Live data" : "Demo data"} testId="text-mode" />
                  <Row k="Switched" v={ws.data.switchedAt ? format(new Date(ws.data.switchedAt), "d MMM yyyy, HH:mm") : "never"} testId="text-switched-at" />
                  <Row k="Switched by (unverified)" v={ws.data.switchedByRole ?? "—"} testId="text-switched-by" />
                </dl>
                {ws.data.oneWay ? (
                  <p className="mt-3 rounded-md bg-[hsl(var(--tone-warn-bg))] p-2.5 text-xs text-[hsl(var(--tone-warn))]" data-testid="text-one-way">
                    Switching to live is one-way. Once live, the workspace cannot return to demo data.
                  </p>
                ) : null}
                {ws.data.mode === "demo" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" disabled data-testid="button-switch-live"><Lock aria-hidden /> Switch to live data</Button>
                    <span className="text-xs text-muted-foreground">Live switch is enabled in a later milestone</span>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      }
      next={{ href: "/", label: "Overview" }}
    />
  );
}
