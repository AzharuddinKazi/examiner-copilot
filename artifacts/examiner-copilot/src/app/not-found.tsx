import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-20">
      <p className="font-mono text-xs text-muted-foreground">404 · no such page</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Where were you heading?</h1>
      <p className="mt-2 text-sm text-muted-foreground">This address does not match any page in the workbench. The overview shows where the review stands.</p>
      <Button asChild className="mt-6" data-testid="link-not-found-home"><Link href="/">Go to overview</Link></Button>
    </div>
  );
}
