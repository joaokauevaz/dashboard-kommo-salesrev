import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  saveCredentials,
  getCredentials,
  clearCredentials,
  getAccountInfo,
  saveAccountInfo,
  isConnected,
} from "@/lib/kommo-storage";
import { testConnection } from "@/lib/kommo-api";
import {
  Link2,
  Link2Off,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
} from "lucide-react";

export default function Integracoes() {
  const [subdomain, setSubdomain] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const creds = getCredentials();
    if (creds) {
      setSubdomain(creds.subdomain);
      setApiToken(creds.apiToken);
      setConnected(isConnected());
      const acc = getAccountInfo();
      if (acc) setAccountName(acc.name);
    }
  }, []);

  async function handleConnect() {
    if (!subdomain.trim() || !apiToken.trim()) {
      toast.error("Preencha o subdomínio e o token da API");
      return;
    }

    setTesting(true);
    try {
      saveCredentials({ subdomain: subdomain.trim(), apiToken: apiToken.trim() });
      const result = await testConnection();

      if (result.success && result.account) {
        saveAccountInfo(result.account);
        setAccountName(result.account.name);
        setConnected(true);
        toast.success(`Conectado à conta: ${result.account.name}`);
      } else {
        clearCredentials();
        setConnected(false);
        toast.error(result.error || "Falha na conexão com a Kommo");
      }
    } catch (err) {
      clearCredentials();
      setConnected(false);
      toast.error(err instanceof Error ? err.message : "Erro ao conectar");
    } finally {
      setTesting(false);
    }
  }

  function handleDisconnect() {
    clearCredentials();
    setConnected(false);
    setAccountName("");
    setSubdomain("");
    setApiToken("");
    toast.info("Desconectado da Kommo");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground mt-1">
          Configure sua conexão com a Kommo CRM
        </p>
      </div>

      {/* Connection Card */}
      <Card className="border-2 border-border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-psi-wine-light flex items-center justify-center">
                <Link2 className="w-5 h-5 text-psi-wine" />
              </div>
              <div>
                <CardTitle className="text-lg">Kommo CRM</CardTitle>
                <CardDescription>Integração via API privada</CardDescription>
              </div>
            </div>
            <Badge
              variant={connected ? "default" : "secondary"}
              className={
                connected
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-gray-100 text-gray-500"
              }
            >
              {connected ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Conectado
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Desconectado
                </span>
              )}
            </Badge>
          </div>
          {connected && accountName && (
            <p className="text-sm text-muted-foreground mt-2 ml-[52px]">
              Conta: <span className="font-medium text-foreground">{accountName}</span>
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Subdomain */}
          <div className="space-y-2">
            <Label htmlFor="subdomain">Subdomínio</Label>
            <div className="flex items-center gap-2">
              <Input
                id="subdomain"
                placeholder="seudominio"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                disabled={connected}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                .kommo.com
              </span>
            </div>
          </div>

          {/* API Token */}
          <div className="space-y-2">
            <Label htmlFor="token">Token da API</Label>
            <div className="relative">
              <Input
                id="token"
                type={showToken ? "text" : "password"}
                placeholder="Cole o token da integração privada"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                disabled={connected}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {!connected ? (
              <Button
                onClick={handleConnect}
                disabled={testing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4 mr-2" />
                    Conectar
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleDisconnect}
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Link2Off className="w-4 h-4 mr-2" />
                Desconectar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Setup Guide */}
      <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
        <Card className="border border-border shadow-sm">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Como obter o token da Kommo?</CardTitle>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    guideOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  <span>
                    Acesse sua conta Kommo e vá em{" "}
                    <strong className="text-foreground">Configurações → Integrações</strong>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <span>
                    Clique em <strong className="text-foreground">+ Criar integração</strong>{" "}
                    → Selecione <strong className="text-foreground">Integração privada</strong>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  <span>
                    Dê um nome (ex: "Dashboard PSI"), marque todas as permissões e salve
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    4
                  </span>
                  <span>
                    Copie o <strong className="text-foreground">Long-lived token</strong> gerado
                    e cole no campo acima
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    5
                  </span>
                  <span>
                    O subdomínio é a parte antes de ".kommo.com" na URL da sua conta
                  </span>
                </li>
              </ol>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Supabase config info */}
      <Card className="border border-amber-200 bg-amber-50/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <ExternalLink className="w-4 h-4 text-amber-600" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800">Configuração Supabase</p>
              <p className="text-xs text-amber-600">
                Este dashboard precisa de um projeto Supabase com a Edge Function{" "}
                <code className="bg-amber-100 px-1 rounded">kommo-engine</code> deployada.
                Configure as variáveis <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code>{" "}
                e <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> no arquivo{" "}
                <code className="bg-amber-100 px-1 rounded">.env</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
