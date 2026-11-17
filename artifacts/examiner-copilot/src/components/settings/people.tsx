"use client";

import { format } from "date-fns";
import { Users } from "lucide-react";
import { getGetMeQueryKey, getListUsersQueryKey, useListUsers, useSetUserRole, type User } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError, errorMessage } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { ROLE_LABELS, useRole, type RoleValue } from "@/lib/role";
import { useInvalidate } from "@/lib/write-access";

/** Everyone who has signed in. Senior examiners assign roles; others can only look. */
export function People() {
  const { role: myRole, me } = useRole();
  const users = useListUsers();
  const setRole = useSetUserRole();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const canManage = myRole === "senior_examiner";

  const change = (u: User, next: RoleValue) => {
    setRole.mutate({ id: u.id, data: { role: next } }, {
      onSuccess: () => {
        invalidate([getListUsersQueryKey(), getGetMeQueryKey()]);
        toast({ title: `${u.name ?? u.email ?? "Person"} is now ${ROLE_LABELS[next]}` });
      },
      onError: (e) => toast({ title: "Role not changed", description: errorMessage(e), variant: "destructive" }),
    });
  };

  return (
    <section className="rounded-lg border border-card-border bg-card" data-testid="card-people">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Users className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-medium">People</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {canManage ? "New people start as Viewer." : "Only a senior examiner can change roles."}
        </span>
      </div>
      {users.isLoading ? <div className="p-4"><Skeleton className="h-16 w-full" /></div> : users.isError || !users.data ? (
        <div className="p-4"><QueryError title="Could not load people" error={users.error} onRetry={() => users.refetch()} retrying={users.isFetching} /></div>
      ) : (
        <ul className="divide-y divide-border">
          {users.data.items.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5" data-testid={`row-user-${u.id}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {u.name ?? u.email ?? `User ${u.id}`}
                  {u.id === me?.id ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email ?? "no email"} · last active {format(new Date(u.lastSeenAt), "d MMM yyyy")}</p>
              </div>
              {canManage ? (
                <Select value={u.role} onValueChange={(v) => change(u, v as RoleValue)} disabled={setRole.isPending}>
                  <SelectTrigger className="h-8 w-40 text-xs" aria-label={`Role for ${u.name ?? u.email ?? "this person"}`} data-testid={`select-user-role-${u.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABELS) as RoleValue[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground" data-testid={`text-user-role-${u.id}`}>{ROLE_LABELS[u.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
