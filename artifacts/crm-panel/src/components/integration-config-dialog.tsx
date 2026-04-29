import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, Save, KeyRound, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

export interface ConfigurableIntegration {
  code: string;
  name: string;
  category: string;
  config?: Record<string, unknown>;
  credentialFields?: { fieldKey: string; masked: string }[];
}

type Transport = "local-fs" | "sftp";
type AuthMode = "password" | "private_key";

type AckFileResult = {
  filename: string;
  preview: string;
  status: "ingested" | "duplicate" | "error";
  ackId?: string;
  messageStatus?: string;
  errorMessage?: string;
};

type PollResult = {
  transport: string;
  found: number;
  files: AckFileResult[];
  error?: string;
};

const FALLBACK_DEFAULTS = {
  transport: "local-fs" as Transport,
  port: "22",
  remotePath: "/incoming",
  outboxPath: "",
  partyIdSender: "PADPIDA-2024053004-T",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function AckFileRow({ f }: { f: AckFileResult }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor =
    f.status === "ingested" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
    : f.status === "duplicate" ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
    : "bg-rose-500/15 border-rose-500/30 text-rose-300";
  const statusLabel = f.status === "ingested" ? "принят" : f.status === "duplicate" ? "дубликат" : "ошибка";

  return (
    <div className={`rounded border p-2 text-xs ${statusColor}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 flex-1 text-left font-mono"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <span className="truncate">{f.filename}</span>
        </button>
        <Badge variant="outline" className="text-[10px] border-current shrink-0">{statusLabel}</Badge>
        {f.ackId && <span className="opacity-70 shrink-0">ack {f.ackId}</span>}
        {f.messageStatus && <span className="opacity-70 shrink-0">→ {f.messageStatus}</span>}
      </div>
      {expanded && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all opacity-80 leading-relaxed">
          {f.errorMessage ?? f.preview}
        </pre>
      )}
    </div>
  );
}

export function IntegrationConfigDialog({
  integration,
  open,
  onOpenChange,
  onSaved,
}: {
  integration: ConfigurableIntegration | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();

  // ── config (cleartext, jsonb на бэке) ──────────────────────────────────
  const [transport, setTransport] = useState<Transport>(FALLBACK_DEFAULTS.transport);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(FALLBACK_DEFAULTS.port);
  const [username, setUsername] = useState("");
  const [remotePath, setRemotePath] = useState(FALLBACK_DEFAULTS.remotePath);
  const [outboxPath, setOutboxPath] = useState(FALLBACK_DEFAULTS.outboxPath);
  const [partyIdSender, setPartyIdSender] = useState(FALLBACK_DEFAULTS.partyIdSender);
  const [partyIdRecipient, setPartyIdRecipient] = useState("");

  // ── credentials (AES-GCM на бэке, никогда не возвращаются обратно) ─────
  const [authMode, setAuthMode] = useState<AuthMode>("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── ack-опрос ────────────────────────────────────────────────────────────
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<PollResult | null>(null);

  // Каждый раз при открытии диалога — заполняем форму из текущей интеграции.
  useEffect(() => {
    if (!open || !integration) return;
    const cfg = (integration.config ?? {}) as Record<string, string | undefined>;
    setTransport((cfg.transport as Transport) ?? FALLBACK_DEFAULTS.transport);
    setHost(cfg.host ?? "");
    setPort(String(cfg.port ?? FALLBACK_DEFAULTS.port));
    setUsername(cfg.username ?? "");
    setRemotePath(cfg.remotePath ?? FALLBACK_DEFAULTS.remotePath);
    setOutboxPath(cfg.outboxPath ?? "");
    setPartyIdSender(cfg.partyIdSender ?? FALLBACK_DEFAULTS.partyIdSender);
    setPartyIdRecipient(cfg.partyIdRecipient ?? "");

    const fieldKeys = (integration.credentialFields ?? []).map((f) => f.fieldKey);
    setAuthMode(fieldKeys.includes("private_key") ? "private_key" : "password");
    setPassword("");
    setPrivateKey("");
    setPassphrase("");
    setTestResult(null);
    setPollResult(null);
  }, [open, integration]);

  if (!integration) return null;

  const isSftp = transport === "sftp";

  const buildConfigPayload = (): Record<string, string | null> => {
    if (transport === "local-fs") {
      return {
        transport: "local-fs",
        host: null, port: null, username: null,
        remotePath: null, outboxPath: null,
        partyIdSender: partyIdSender.trim() || null,
        partyIdRecipient: partyIdRecipient.trim() || null,
      };
    }
    return {
      transport: "sftp",
      host: host.trim(),
      port: port.trim() || "22",
      username: username.trim(),
      remotePath: remotePath.trim() || "/incoming",
      outboxPath: outboxPath.trim() || null,
      partyIdSender: partyIdSender.trim() || null,
      partyIdRecipient: partyIdRecipient.trim() || null,
    };
  };

  const buildCredentialsPayload = (): Record<string, string> | null => {
    if (transport !== "sftp") return null;
    if (authMode === "password") {
      if (!password) return {};
      return { password, passphrase: passphrase.trim() };
    }
    if (!privateKey) return {};
    return { private_key: privateKey, passphrase: passphrase.trim() };
  };

  const validateBeforeSave = (): string | null => {
    if (transport === "sftp") {
      if (!host.trim()) return "Заполните host";
      if (!username.trim()) return "Заполните username";
      const haveSavedCreds = (integration.credentialFields ?? []).length > 0;
      const userTyped = (authMode === "password" ? password : privateKey).length > 0;
      if (!haveSavedCreds && !userTyped) {
        return authMode === "password" ? "Введите password" : "Вставьте приватный ключ";
      }
    }
    return null;
  };

  const saveConfigAndCreds = async () => {
    await api(`/api/integrations/${integration.code}/config`, {
      method: "PATCH",
      body: JSON.stringify({ config: buildConfigPayload() }),
    });
    const creds = buildCredentialsPayload();
    if (creds && Object.values(creds).some((v) => v && v.length > 0)) {
      await api(`/api/integrations/${integration.code}/credentials`, {
        method: "POST",
        body: JSON.stringify({ fields: creds }),
      });
    }
  };

  const onSave = async () => {
    const err = validateBeforeSave();
    if (err) { toast({ variant: "destructive", title: "Не сохранено", description: err }); return; }
    setBusy(true);
    try {
      await saveConfigAndCreds();
      toast({ title: "Сохранено", description: `Конфигурация ${integration.name} обновлена` });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка сохранения", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      await saveConfigAndCreds();
      const r = await api<{ ok: boolean; message?: string }>(`/api/integrations/${integration.code}/test`, { method: "POST" });
      setTestResult({ ok: r.ok, message: r.message ?? (r.ok ? "OK" : "Ошибка") });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const onPollAcks = async () => {
    setPolling(true);
    setPollResult(null);
    try {
      // Сначала сохраняем свежий конфиг, чтобы опрос шёл по актуальным настройкам.
      await saveConfigAndCreds().catch(() => { /* Если ошибка сохранения — продолжаем с тем, что в БД */ });
      const r = await api<PollResult>(`/api/integrations/${integration.code}/poll-acks`, { method: "POST" });
      setPollResult(r);
    } catch (e) {
      setPollResult({ transport, found: 0, files: [], error: e instanceof Error ? e.message : String(e) });
    } finally {
      setPolling(false);
    }
  };

  const savedCredsCount = integration.credentialFields?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Конфигурация интеграции — {integration.name}</DialogTitle>
          <DialogDescription>
            <code className="text-xs">{integration.code}</code> · категория {integration.category}.
            Конфиг (host/port/path) хранится в открытом виде, креды — зашифрованы AES-256-GCM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Transport */}
          <div className="space-y-1.5">
            <Label htmlFor="transport">Транспорт доставки</Label>
            <Select value={transport} onValueChange={(v) => setTransport(v as Transport)}>
              <SelectTrigger id="transport"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local-fs">local-fs — локальная директория (dev/test)</SelectItem>
                <SelectItem value="sftp">sftp — реальная отгрузка партнёру</SelectItem>
              </SelectContent>
            </Select>
            {transport === "local-fs" && (
              <p className="text-[11px] text-muted-foreground">Файлы пишутся в <code>artifacts/api-server/.ddex-out/{integration.code}/</code>. Никаких внешних соединений не открывается — удобно для проверок.</p>
            )}
          </div>

          {/* Party IDs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="party-sender">Sender PartyId (DPID отправителя)</Label>
              <Input id="party-sender" value={partyIdSender} onChange={(e) => setPartyIdSender(e.target.value)} placeholder="PADPIDA-…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party-rec">Recipient PartyId (DPID партнёра)</Label>
              <Input id="party-rec" value={partyIdRecipient} onChange={(e) => setPartyIdRecipient(e.target.value)} placeholder="PADPIDA-…" />
            </div>
          </div>

          {isSftp && (
            <>
              <div className="border-t border-border/50 pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SFTP — соединение</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="sftp-host">Host</Label>
                  <Input id="sftp-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="ingest.partner.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sftp-port">Port</Label>
                  <Input id="sftp-port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sftp-user">Username</Label>
                  <Input id="sftp-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="tajikmusic" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sftp-remote">Remote base path</Label>
                  <Input id="sftp-remote" value={remotePath} onChange={(e) => setRemotePath(e.target.value)} placeholder="/incoming" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sftp-outbox">
                  Outbox path <span className="text-[10px] text-muted-foreground">(опционально — если партнёр кладёт ack в отдельную папку)</span>
                </Label>
                <Input
                  id="sftp-outbox"
                  value={outboxPath}
                  onChange={(e) => setOutboxPath(e.target.value)}
                  placeholder="/outbox (по умолчанию — ../outbox относительно remote base)"
                />
              </div>

              <div className="border-t border-border/50 pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5" /> Аутентификация
                  {savedCredsCount > 0 && (
                    <Badge variant="outline" className="text-[10px] font-mono uppercase">
                      сохранено: {integration.credentialFields?.map((f) => f.fieldKey).join(", ")}
                    </Badge>
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-mode">Метод</Label>
                <Select value={authMode} onValueChange={(v) => setAuthMode(v as AuthMode)}>
                  <SelectTrigger id="auth-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="password">Пароль</SelectItem>
                    <SelectItem value="private_key">Приватный SSH-ключ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {authMode === "password" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="sftp-pass">Password {savedCredsCount > 0 && <span className="text-[10px] text-muted-foreground">(оставьте пустым, чтобы не менять)</span>}</Label>
                  <Input id="sftp-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="sftp-key">Private key (PEM, OpenSSH либо PKCS#8)</Label>
                    <Textarea
                      id="sftp-key"
                      rows={6}
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;…&#10;-----END OPENSSH PRIVATE KEY-----"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sftp-passphrase">Passphrase для ключа (если есть)</Label>
                    <Input id="sftp-passphrase" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                  </div>
                </>
              )}

              {/* ── Ручной опрос outbox ──────────────────────────────────── */}
              <div className="border-t border-border/50 pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Опрос outbox (ack)</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Подключается к SFTP, читает XML-файлы подтверждений из <code>{outboxPath || "../outbox"}</code>, импортирует их в систему.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={polling || busy}
                    onClick={onPollAcks}
                    className="shrink-0 ml-3"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${polling ? "animate-spin" : ""}`} />
                    {polling ? "Опрашиваю…" : "Опросить outbox"}
                  </Button>
                </div>

                {pollResult && (
                  <div className="mt-3 space-y-2">
                    {pollResult.error ? (
                      <div className="rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 p-2.5 text-xs">
                        <p className="font-medium">Ошибка опроса</p>
                        <p className="opacity-90 mt-1">{pollResult.error}</p>
                      </div>
                    ) : pollResult.found === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Новых ack-файлов не найдено — outbox пуст или недоступен.</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Найдено файлов: <strong className="text-foreground">{pollResult.found}</strong>
                        </p>
                        <div className="space-y-1.5">
                          {pollResult.files.map((f) => (
                            <AckFileRow key={f.filename} f={f} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`rounded-md border p-3 text-sm ${testResult.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
              <p className="font-medium">{testResult.ok ? "Тест успешен" : "Тест не прошёл"}</p>
              <p className="text-xs opacity-90 mt-1 break-words">{testResult.message}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button variant="outline" disabled={busy || polling} onClick={onTest}>
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" /> Сохранить и проверить
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={busy || polling} onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button disabled={busy || polling} onClick={onSave}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Сохранить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
