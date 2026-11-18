
    import { Button } from "@workspace/examination-design-system/components/ui/button";
    import { LegacyApp } from "./legacy/LegacyApp";
    import { useTheme } from "next-themes";
    import { useEffect, useState } from "react";

    export default function App() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

    return (
      <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 flex-none z-50">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded p-1">
               <img src="/cbuae-logo.svg" alt="CBUAE" className="h-4 block" onError={(e) => { e.currentTarget.style.display='none'; }} />
            </div>
            <span className="font-semibold text-sm">Examination Builder Replica</span>
          </div>
          <div>
            {mounted && (
              <Button variant="secondary" size="small" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                Toggle Theme
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1 relative">
          <LegacyApp />
        </div>
      </div>
    );
    }
    