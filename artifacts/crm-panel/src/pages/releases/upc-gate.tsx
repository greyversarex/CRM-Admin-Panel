import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useImportReleaseByUpc } from "@workspace/api-client-react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type GateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; upc: string }
  | { kind: "error"; message: string };

type CheckUpcResponse = {
  available: boolean;
  upc?: string;
  code?: string;
};

export default function ReleaseUpcGate() {
  const [, setLocation] = useLocation();
  const { t } = useLang();
  const L = t.upcGate;
  const importByUpc = useImportReleaseByUpc();
  const [input, setInput] = useState("");
  const [state, setState] = useState<GateState>({ kind: "idle" });

  const busy = state.kind === "checking" || importByUpc.isPending;
  const normalizedInput = input.trim().replace(/[-\s]/g, "");

  function messageForCode(code?: string): string {
    if (code === "already_exists") return L.alreadyExists;
    if (code === "invalid_check_digit") return L.invalidCheckDigit;
    if (code === "invalid_format" || code === "invalid_length" || code === "invalid_upc") {
      return L.invalidFormat;
    }
    if (code === "not_found") return L.notFound;
    if (code === "spotify_upstream_error" || code === "lookup_failed") return L.lookupFailed;
    return L.genericError;
  }

  function startFromScratch() {
    setLocation("/releases/new/details");
  }

  function resetUpc() {
    setInput("");
    setState({ kind: "idle" });
  }

  async function verifyUpc(event: FormEvent) {
    event.preventDefault();
    if (!normalizedInput || busy) return;
    setState({ kind: "checking" });

    try {
      const response = await fetch(`/api/releases/check-upc?upc=${encodeURIComponent(input)}`, {
        credentials: "include",
      });
      const data = await response.json() as CheckUpcResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "check_failed");

      if (data.available && data.upc) {
        setInput(data.upc);
        setState({ kind: "available", upc: data.upc });
      } else {
        setState({ kind: "error", message: messageForCode(data.code) });
      }
    } catch {
      setState({ kind: "error", message: L.genericError });
    }
  }

  async function transferRelease() {
    if (state.kind !== "available" || importByUpc.isPending) return;

    try {
      const created = await importByUpc.mutateAsync({
        data: { upc: state.upc, source: "all" },
      });
      setLocation(`/releases/${created.id}`);
    } catch (error: any) {
      const payload = error?.response?.data;
      const code = String(payload?.error ?? "");
      const hasLocalizedMessage = [
        "already_exists", "not_found", "spotify_upstream_error",
        "lookup_failed", "invalid_upc",
      ].includes(code);
      setState({
        kind: "error",
        message: hasLocalizedMessage
          ? messageForCode(code)
          : String(payload?.message ?? L.genericError),
      });
    }
  }

  return (
    <Layout>
      <div className="mx-auto min-h-[calc(100vh-8rem)] max-w-4xl px-4 py-7 md:py-9">
        <button
          type="button"
          onClick={() => setLocation("/releases")}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {L.back}
        </button>

        <main className="mx-auto flex max-w-lg flex-col items-center pt-8 text-center md:pt-12">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{L.title}</h1>
          <p className="mt-2 text-base font-medium text-foreground/85">{L.question}</p>

          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {L.newReleaseHelp}
          </p>
          <Button
            type="button"
            onClick={startFromScratch}
            variant="secondary"
            className="mt-4 h-10 px-5"
            data-testid="button-need-upc"
          >
            {L.needUpc}
          </Button>

          <p className="mt-7 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {L.transferHelp}
          </p>

          <form onSubmit={verifyUpc} className="mt-6 flex w-full flex-col items-center">
            <div className="w-full max-w-[280px] text-left">
              <label
                htmlFor="release-upc"
                className="mb-1 block text-xs font-medium text-foreground/80"
              >
                {L.upcLabel}
              </label>
              <Input
                id="release-upc"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setState({ kind: "idle" });
                }}
                placeholder={L.placeholder}
                inputMode="numeric"
                autoComplete="off"
                disabled={busy}
                className={cn(
                  "h-10 rounded-md bg-card/70 font-mono text-sm tracking-wide",
                  state.kind === "error" && "border-destructive/70 focus-visible:ring-destructive/40",
                  state.kind === "available" && "border-emerald-500/60 focus-visible:ring-emerald-500/30",
                )}
                data-testid="input-release-upc"
              />

              {state.kind === "error" && (
                <p className="mt-2 text-xs leading-relaxed text-destructive" role="alert">
                  {state.message}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={startFromScratch}
              className="mt-4 text-sm font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
            >
              {L.dontKnow}
            </button>

            {state.kind === "available" ? (
              <>
                <button
                  type="button"
                  onClick={resetUpc}
                  disabled={importByUpc.isPending}
                  className="mt-8 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                >
                  {L.useDifferent}
                </button>
                <p className="mt-8 text-sm font-medium text-emerald-400">{L.available}</p>
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  {L.transferNotice}
                </p>
                <Button
                  type="button"
                  onClick={transferRelease}
                  disabled={importByUpc.isPending}
                  className="mt-4 h-10 min-w-44 bg-emerald-500 px-6 text-white shadow-sm hover:bg-emerald-600"
                  data-testid="button-transfer-by-upc"
                >
                  {importByUpc.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{L.importing}</>
                  ) : L.transfer}
                </Button>
              </>
            ) : (
              <>
                {state.kind === "error" && (
                  <button
                    type="button"
                    onClick={resetUpc}
                    className="mt-8 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {L.useDifferent}
                  </button>
                )}
                <Button
                  type="submit"
                  disabled={!normalizedInput || busy}
                  className="mt-9 h-10 min-w-40 bg-primary px-6 text-primary-foreground shadow-sm hover:bg-primary/90 disabled:bg-primary/35 disabled:text-primary-foreground/70"
                  data-testid="button-verify-upc"
                >
                  {state.kind === "checking" ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{L.verifying}</>
                  ) : L.verify}
                </Button>
              </>
            )}
          </form>

          <p className="mt-8 max-w-md text-[11px] leading-relaxed text-muted-foreground/65">
            {L.equivalenceNote}
          </p>
        </main>
      </div>
    </Layout>
  );
}
