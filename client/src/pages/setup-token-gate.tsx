import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setSetupToken, setupFetch } from "@/lib/setup-token";

/**
 * Asks for the first-run setup token before the wizard can change anything.
 * The token is printed to the server log at startup (or is SETUP_TOKEN).
 */
export function SetupTokenGate({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const token = value.trim();
    if (!token) return;
    setChecking(true);
    setError(null);
    setSetupToken(token);
    try {
      const res = await setupFetch("/api/setup/verify-token", { method: "POST" });
      if (res.ok) {
        onUnlocked();
        return;
      }
      setError(res.status === 401 ? t("setup.token.invalid") : t("setup.token.checkFailed"));
    } catch {
      setError(t("setup.token.checkFailed"));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card data-testid="card-setup-token">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-5 h-5" />
          {t("setup.token.title")}
        </CardTitle>
        <CardDescription>{t("setup.token.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setup-token">{t("setup.token.label")}</Label>
            <Input
              id="setup-token"
              data-testid="input-setup-token"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("setup.token.placeholder")}
            />
            <p className="text-xs text-muted-foreground">{t("setup.token.hint")}</p>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert" data-testid="text-setup-token-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={checking || !value.trim()} data-testid="button-setup-token-submit">
            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LockOpen className="w-4 h-4 mr-2" />}
            {t("setup.token.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
