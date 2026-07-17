"use client";

import { useAppShell } from "@/components/app-shell-context";
import { CodexAccountCard } from "@/components/settings/codex-account-card";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { CodexAccountStatus } from "@/lib/codex";
import type { CredentialStatus } from "@/lib/desktop-api";
import {
  CODEX_PROVIDER_ID,
  OPENROUTER_PROVIDER_ID,
  type ModelConfig,
  type ProviderConfig,
} from "@/lib/models/catalog";
import { cn } from "@/lib/utils";
import {
  CpuIcon,
  KeyRoundIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RocketIcon,
  ServerIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const PROVIDER_PRESETS = [
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    authRequired: false,
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    authRequired: false,
  },
] as const;

type ProviderDraft = {
  id: string;
  name: string;
  baseUrl: string;
  authRequired: boolean;
  includeUsage: boolean;
  apiKey: string;
};

type ModelDraft = {
  id: string;
  providerId: string;
  modelId: string;
  name: string;
  fullName: string;
  description: string;
  supportsImages: boolean;
  supportsTools: boolean;
  supportsReasoningEffort: boolean;
  enabled: boolean;
};

function emptyProviderDraft(): ProviderDraft {
  return {
    id: nanoid(),
    name: "",
    baseUrl: "http://localhost:1234/v1",
    authRequired: false,
    includeUsage: true,
    apiKey: "",
  };
}

function emptyModelDraft(providerId: string): ModelDraft {
  return {
    id: nanoid(),
    providerId,
    modelId: "",
    name: "",
    fullName: "",
    description: "",
    supportsImages: false,
    supportsTools: true,
    supportsReasoningEffort: false,
    enabled: true,
  };
}

export function ModelsSettingsSection({
  initialProviderId = OPENROUTER_PROVIDER_ID,
}: {
  initialProviderId?: string;
}) {
  const {
    providers,
    models,
    catalog,
    hasUsableModel,
    refreshCatalog,
    setCatalog,
    bumpCredentialRefresh,
  } = useAppShell();

  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    initialProviderId
  );
  const appliedInitialProviderId = useRef<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<
    Record<string, CredentialStatus>
  >({});
  const [codexStatus, setCodexStatus] = useState<CodexAccountStatus | null>(null);
  const [codexStatusLoading, setCodexStatusLoading] = useState(true);
  const [providerSheetOpen, setProviderSheetOpen] = useState(false);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(
    emptyProviderDraft()
  );
  const [editingProviderId, setEditingProviderId] = useState<string | null>(
    null
  );
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [modelDraft, setModelDraft] = useState<ModelDraft>(
    emptyModelDraft(OPENROUTER_PROVIDER_ID)
  );
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [providerToDelete, setProviderToDelete] =
    useState<ProviderConfig | null>(null);
  const [modelToDelete, setModelToDelete] = useState<ModelConfig | null>(null);
  const [removeAllModelsOpen, setRemoveAllModelsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers[0] ??
    null;

  const isCustomProvider = Boolean(
    selectedProvider && !selectedProvider.isBuiltin
  );
  const isCodexProvider = selectedProvider?.kind === "codex";

  const providerModels = useMemo(() => {
    const list = models.filter(
      (model) => model.providerId === selectedProvider?.id
    );
    if (!isCustomProvider || !search.trim()) return list;
    const query = search.trim().toLowerCase();
    return list.filter(
      (model) =>
        model.fullName.toLowerCase().includes(query) ||
        model.modelId.toLowerCase().includes(query)
    );
  }, [models, search, selectedProvider?.id, isCustomProvider]);

  const deletableProviderModels = useMemo(
    () =>
      models.filter(
        (model) =>
          model.providerId === selectedProvider?.id && model.source !== "builtin"
      ),
    [models, selectedProvider?.id]
  );

  useEffect(() => {
    if (
      appliedInitialProviderId.current !== initialProviderId &&
      providers.some((provider) => provider.id === initialProviderId)
    ) {
      appliedInitialProviderId.current = initialProviderId;
      setSelectedProviderId(initialProviderId);
    }
  }, [initialProviderId, providers]);

  useEffect(() => {
    if (
      selectedProviderId &&
      !providers.some((provider) => provider.id === selectedProviderId) &&
      providers[0]
    ) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  useEffect(() => {
    setSearch("");
  }, [selectedProviderId]);

  useEffect(() => {
    let cancelled = false;
    async function loadStatuses() {
      const entries = await Promise.all(
        providers
          .filter((provider) => provider.kind !== "codex")
          .map(async (provider) => {
            try {
              const status = await window.desktop.credentials.getStatus(
                provider.id
              );
              return [provider.id, status] as const;
            } catch {
              return null;
            }
          })
      );
      if (cancelled) return;
      const next: Record<string, CredentialStatus> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setProviderStatuses(next);
    }
    void loadStatuses();
    return () => {
      cancelled = true;
    };
  }, [providers]);

  useEffect(() => {
    let cancelled = false;

    const applyStatus = (status: CodexAccountStatus) => {
      if (cancelled) return;
      setCodexStatus(status);
      setCodexStatusLoading(false);
    };

    const unsubscribe = window.desktop.codex.onStatusChange((status) => {
      applyStatus(status);
      if (status.state === "connected") {
        void refreshCatalog().catch(() => undefined);
      }
    });

    void window.desktop.codex
      .getStatus()
      .then(async (status) => {
        applyStatus(status);
        if (status.state !== "connected" || cancelled) return;
        try {
          const result = await window.desktop.codex.syncModels();
          if (!cancelled) setCatalog(result.catalog);
        } catch {
          if (!cancelled) await refreshCatalog().catch(() => undefined);
        }
      })
      .catch((error: unknown) => {
        applyStatus({
          state: "unavailable",
          email: null,
          planType: null,
          message:
            error instanceof Error
              ? error.message
              : "بررسی وضعیت Codex ممکن نشد.",
        });
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refreshCatalog, setCatalog]);

  function openCreateProvider(preset?: (typeof PROVIDER_PRESETS)[number]) {
    setEditingProviderId(null);
    setProviderDraft({
      ...emptyProviderDraft(),
      name: preset?.label ?? "",
      baseUrl: preset?.baseUrl ?? "http://localhost:1234/v1",
      authRequired: preset?.authRequired ?? false,
    });
    setProviderSheetOpen(true);
  }

  function openEditProvider(provider: ProviderConfig) {
    setEditingProviderId(provider.id);
    setProviderDraft({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      authRequired: provider.authRequired,
      includeUsage: provider.includeUsage,
      apiKey: "",
    });
    setProviderSheetOpen(true);
  }

  async function saveProvider() {
    setBusy(true);
    try {
      const saved = await window.desktop.providers.saveProvider({
        id: editingProviderId ?? providerDraft.id,
        name: providerDraft.name,
        kind: "openai-compatible",
        baseUrl: providerDraft.baseUrl,
        authRequired: providerDraft.authRequired,
        includeUsage: providerDraft.includeUsage,
        enabled: true,
      });

      if (providerDraft.apiKey.trim()) {
        await window.desktop.credentials.setKey(
          saved.id,
          providerDraft.apiKey.trim()
        );
        bumpCredentialRefresh();
      }

      const catalog = await refreshCatalog();
      setCatalog(catalog);
      setSelectedProviderId(saved.id);
      setProviderSheetOpen(false);
      toast.success("ارائه‌دهنده ذخیره شد");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ذخیره ارائه‌دهنده ناموفق بود"
      );
    } finally {
      setBusy(false);
    }
  }

  async function testProvider(provider: ProviderConfig, apiKey?: string) {
    setBusy(true);
    try {
      const result = await window.desktop.credentials.testProvider({
        providerId: provider.id,
        baseUrl: provider.baseUrl,
        apiKey,
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "آزمون اتصال ناموفق بود"
      );
    } finally {
      setBusy(false);
    }
  }

  async function discoverAndImport(provider: ProviderConfig) {
    setBusy(true);
    try {
      const result = await window.desktop.providers.discoverModels({
        providerId: provider.id,
        import: true,
      });
      if (result.catalog) setCatalog(result.catalog);
      else await refreshCatalog();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "دریافت مدل‌ها ناموفق بود"
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleProviderEnabled(provider: ProviderConfig, enabled: boolean) {
    try {
      setCatalog({
        ...catalog,
        providers: providers.map((item) =>
          item.id === provider.id ? { ...item, enabled } : item
        ),
      });
      await window.desktop.providers.saveProvider({ ...provider, enabled });
      const next = await refreshCatalog();
      setCatalog(next);
    } catch (error) {
      await refreshCatalog().catch(() => undefined);
      toast.error(
        error instanceof Error ? error.message : "تغییر وضعیت ناموفق بود"
      );
    }
  }

  async function confirmDeleteProvider() {
    if (!providerToDelete) return;
    setBusy(true);
    try {
      await window.desktop.providers.deleteProvider(providerToDelete.id);
      await refreshCatalog();
      bumpCredentialRefresh();
      toast.success("ارائه‌دهنده حذف شد");
      setProviderToDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "حذف ارائه‌دهنده ناموفق بود"
      );
    } finally {
      setBusy(false);
    }
  }

  function openCreateModel() {
    if (!selectedProvider) return;
    setEditingModel(null);
    setModelDraft(emptyModelDraft(selectedProvider.id));
    setModelSheetOpen(true);
  }

  function openEditModel(model: ModelConfig) {
    setEditingModel(model);
    setModelDraft({
      id: model.id,
      providerId: model.providerId,
      modelId: model.modelId,
      name: model.name,
      fullName: model.fullName,
      description: model.description,
      supportsImages: model.supportsImages,
      supportsTools: model.supportsTools,
      supportsReasoningEffort: model.supportsReasoningEffort,
      enabled: model.enabled,
    });
    setModelSheetOpen(true);
  }

  async function saveModel() {
    setBusy(true);
    try {
      await window.desktop.providers.saveModel({
        ...(editingModel ?? {}),
        ...modelDraft,
        source: editingModel?.source ?? "manual",
        isDefault: editingModel?.isDefault ?? false,
      });
      await refreshCatalog();
      setModelSheetOpen(false);
      toast.success("مدل ذخیره شد");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ذخیره مدل ناموفق بود"
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleModelEnabled(model: ModelConfig, enabled: boolean) {
    try {
      await window.desktop.providers.saveModel({ ...model, enabled });
      await refreshCatalog();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تغییر وضعیت مدل ناموفق بود"
      );
    }
  }

  async function setDefaultModel(model: ModelConfig) {
    try {
      await window.desktop.providers.setDefaultModel(model.id);
      await refreshCatalog();
      toast.success(`«${model.fullName}» مدل پیش‌فرض شد`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تنظیم مدل پیش‌فرض ناموفق بود"
      );
    }
  }

  async function confirmDeleteModel() {
    if (!modelToDelete) return;
    setBusy(true);
    try {
      await window.desktop.providers.deleteModel(modelToDelete.id);
      await refreshCatalog();
      toast.success("مدل حذف شد");
      setModelToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف مدل ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemoveAllModels() {
    if (!selectedProvider) return;
    setBusy(true);
    try {
      const removed = await window.desktop.providers.deleteProviderModels(
        selectedProvider.id
      );
      await refreshCatalog();
      setRemoveAllModelsOpen(false);
      if (removed === 0) {
        toast.message("مدل قابل حذفی وجود نداشت");
      } else {
        toast.success(
          `${removed.toLocaleString("fa-IR")} مدل از «${selectedProvider.name}» حذف شد`
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "حذف مدل‌ها ناموفق بود"
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveOpenRouterKey(apiKey: string) {
    if (!apiKey.trim()) return;
    setBusy(true);
    try {
      await window.desktop.credentials.setKey(
        OPENROUTER_PROVIDER_ID,
        apiKey.trim()
      );
      bumpCredentialRefresh();
      const status = await window.desktop.credentials.getStatus(
        OPENROUTER_PROVIDER_ID
      );
      setProviderStatuses((current) => ({
        ...current,
        [OPENROUTER_PROVIDER_ID]: status,
      }));
      toast.success("کلید OpenRouter ذخیره شد");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ذخیره کلید ناموفق بود"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {!hasUsableModel ? (
        <ModelsGettingStarted
          codexConnected={codexStatus?.state === "connected"}
          openrouterConfigured={
            providerStatuses[OPENROUTER_PROVIDER_ID]?.configured ?? false
          }
          onSelectCodex={() => setSelectedProviderId(CODEX_PROVIDER_ID)}
          onSelectOpenRouter={() => setSelectedProviderId(OPENROUTER_PROVIDER_ID)}
          onAddPreset={(preset) => openCreateProvider(preset)}
        />
      ) : null}

      <SettingsSection
        title="ارائه‌دهنده‌ها"
        description="Codex با اشتراک ChatGPT و OpenRouter به‌صورت داخلی آماده‌اند. می‌توانید هر ارائه‌دهنده ابری یا محلی با API سازگار با OpenAI (مثل LM Studio، Ollama یا سرویس‌های ابری دیگر) را هم اضافه کنید."
        icon={ServerIcon}
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => openCreateProvider()}>
            <PlusIcon data-icon="inline-start" />
            افزودن ارائه‌دهنده
          </Button>
          {PROVIDER_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openCreateProvider(preset)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          هر سرویس ابری با API سازگار با OpenAI (مثل Together، Groq و …) را
          می‌توانید با «افزودن ارائه‌دهنده»، آدرس https و کلید API اضافه کنید.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {providers.map((provider) => {
            const status = providerStatuses[provider.id];
            const isCodex = provider.kind === "codex";
            const count = models.filter(
              (model) => model.providerId === provider.id
            ).length;
            const selected = selectedProvider?.id === provider.id;

            return (
              <div
                key={provider.id}
                className={cn(
                  "flex items-stretch rounded-2xl border transition-colors",
                  selected
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/70 bg-background hover:bg-muted/40"
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedProviderId(provider.id)}
                  className="min-w-0 flex-1 rounded-s-2xl px-3.5 py-3 text-right"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{provider.name}</span>
                      {provider.isBuiltin ? (
                        <Badge variant="secondary">داخلی</Badge>
                      ) : null}
                      {!provider.enabled ? (
                        <Badge variant="outline">غیرفعال</Badge>
                      ) : null}
                      {isCodex && codexStatus?.state === "connected" ? (
                        <Badge variant="secondary">اشتراک متصل</Badge>
                      ) : isCodex && codexStatus?.state === "unavailable" ? (
                        <Badge variant="destructive">در دسترس نیست</Badge>
                      ) : isCodex && codexStatus?.state === "error" ? (
                        <Badge variant="destructive">نیاز به اصلاح</Badge>
                      ) : isCodex ? (
                        <Badge variant="outline">
                          {codexStatusLoading ? "در حال بررسی" : "نیاز به ورود"}
                        </Badge>
                      ) : status?.configured ? (
                        <Badge variant="secondary">کلید دارد</Badge>
                      ) : provider.authRequired ? (
                        <Badge variant="outline">بدون کلید</Badge>
                      ) : (
                        <Badge variant="secondary">بدون احراز هویت</Badge>
                      )}
                    </div>
                    <p
                      className="mt-1 truncate text-xs text-muted-foreground"
                      dir={isCodex ? "rtl" : "ltr"}
                    >
                      {isCodex
                        ? "اشتراک ChatGPT · ورود مدیریت‌شده توسط OpenAI"
                        : provider.baseUrl}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {count.toLocaleString("fa-IR")} مدل
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center px-3.5 py-3">
                  <Switch
                    checked={provider.enabled}
                    onCheckedChange={(checked) =>
                      void toggleProviderEnabled(provider, checked)
                    }
                    aria-label={`فعال‌سازی ${provider.name}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {selectedProvider ? (
        <SettingsSection
          title={`مدل‌های ${selectedProvider.name}`}
          description={
            isCodexProvider
              ? "پس از اتصال حساب ChatGPT، مدل‌های مجاز برای طرح و فضای کاری شما مستقیماً از Codex همگام می‌شوند. مدل‌ها را اینجا فعال کنید یا مدل پیش‌فرض را تغییر دهید."
              : selectedProvider.isBuiltin
                ? "مدل‌های پیش‌فرض آماده‌اند. کلید OpenRouter را وارد کنید، مدل‌ها را فعال کنید و در صورت نیاز شناسه مدل را دستی اضافه کنید."
                : "مدل‌ها را از API وارد کنید یا دستی اضافه کنید، سپس مدل‌های موردنظر را فعال کنید (حداکثر ۲۰۰ مدل). فقط مدل‌های گفتگو (chat completions) وارد می‌شوند."
          }
          icon={CpuIcon}
        >
          {!isCodexProvider ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={openCreateModel}>
                <PlusIcon data-icon="inline-start" />
                افزودن مدل
              </Button>
              {isCustomProvider ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void discoverAndImport(selectedProvider)}
                  >
                    {busy ? (
                      <Loader2Icon
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <RefreshCwIcon data-icon="inline-start" />
                    )}
                    دریافت از /models
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void testProvider(selectedProvider)}
                  >
                    آزمون اتصال
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEditProvider(selectedProvider)}
                  >
                    ویرایش ارائه‌دهنده
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setProviderToDelete(selectedProvider)}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    حذف
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void testProvider(selectedProvider)}
                >
                  آزمون اتصال
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy || deletableProviderModels.length === 0}
                onClick={() => setRemoveAllModelsOpen(true)}
              >
                <Trash2Icon data-icon="inline-start" />
                حذف همه مدل‌ها
              </Button>
            </div>
          ) : null}

          {selectedProvider.id === OPENROUTER_PROVIDER_ID ? (
            <OpenRouterKeyField
              status={providerStatuses[OPENROUTER_PROVIDER_ID] ?? null}
              busy={busy}
              onSave={(key) => void saveOpenRouterKey(key)}
              onTest={(key) =>
                void testProvider(selectedProvider, key || undefined)
              }
              onClear={async () => {
                await window.desktop.credentials.clearKey(OPENROUTER_PROVIDER_ID);
                bumpCredentialRefresh();
                const status = await window.desktop.credentials.getStatus(
                  OPENROUTER_PROVIDER_ID
                );
                setProviderStatuses((current) => ({
                  ...current,
                  [OPENROUTER_PROVIDER_ID]: status,
                }));
                toast.success("کلید OpenRouter حذف شد");
              }}
            />
          ) : null}

          {isCodexProvider ? (
            <CodexAccountCard
              status={codexStatus}
              loading={codexStatusLoading}
              onStatusChange={setCodexStatus}
              onCatalogChange={setCatalog}
            />
          ) : null}

          {isCustomProvider ? (
            <Input
              className="mt-3"
              dir="rtl"
              value={search}
              placeholder="جستجو در مدل‌های این ارائه‌دهنده…"
              onChange={(event) => setSearch(event.target.value)}
            />
          ) : null}

          <div className="mt-3 flex flex-col gap-2">
            {providerModels.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {isCodexProvider ? (
                  <>
                    {codexStatus?.state === "connected"
                      ? "هنوز مدلی دریافت نشده است. «تازه‌سازی مدل‌ها» را بزنید و اگر مشکل ادامه داشت، دسترسی Codex در طرح یا فضای کاری ChatGPT را بررسی کنید."
                      : "برای دریافت مدل‌های Codex، ابتدا حساب ChatGPT خود را متصل کنید."}
                  </>
                ) : selectedProvider.isBuiltin ? (
                  <>
                    مدلی فعال نیست. کلید OpenRouter را وارد کنید و حداقل یک مدل
                    را روشن کنید؛ یا با «افزودن مدل» شناسه دلخواه OpenRouter را
                    اضافه کنید.
                  </>
                ) : search.trim() ? (
                  <>مدلی با این عبارت پیدا نشد.</>
                ) : (
                  <>
                    هنوز مدلی ندارید. ابتدا سرور محلی را اجرا کنید، سپس «دریافت
                    از /models» را بزنید یا مدل را دستی اضافه کنید.
                  </>
                )}
              </div>
            ) : (
              providerModels.map((model) => (
                <div
                  key={model.id}
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/15 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{model.fullName}</span>
                      {model.isDefault ? (
                        <Badge variant="secondary">پیش‌فرض</Badge>
                      ) : null}
                      {model.source === "builtin" ? (
                        <Badge variant="outline">
                          {isCodexProvider ? "همگام‌شده" : "داخلی"}
                        </Badge>
                      ) : model.source === "discovered" ? (
                        <Badge variant="outline">کشف‌شده</Badge>
                      ) : (
                        <Badge variant="outline">دستی</Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
                      {model.modelId}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {model.supportsTools ? (
                        <Badge variant="secondary">ابزار</Badge>
                      ) : null}
                      {model.supportsImages ? (
                        <Badge variant="secondary">تصویر</Badge>
                      ) : null}
                      {model.supportsReasoningEffort ? (
                        <Badge variant="secondary">استدلال</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Switch
                      checked={model.enabled}
                      onCheckedChange={(checked) =>
                        void toggleModelEnabled(model, checked)
                      }
                      aria-label={`فعال‌سازی ${model.fullName}`}
                    />
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="پیش‌فرض"
                        disabled={!model.enabled || model.isDefault}
                        onClick={() => void setDefaultModel(model)}
                      >
                        <StarIcon />
                      </Button>
                      {!isCodexProvider ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          title="ویرایش"
                          onClick={() => openEditModel(model)}
                        >
                          <PencilIcon />
                        </Button>
                      ) : null}
                      {!isCodexProvider && model.source !== "builtin" ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          title="حذف"
                          onClick={() => setModelToDelete(model)}
                        >
                          <Trash2Icon />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SettingsSection>
      ) : null}

      <Sheet open={providerSheetOpen} onOpenChange={setProviderSheetOpen}>
        <SheetContent
          side="right"
          className="w-full text-right sm:max-w-md"
          dir="rtl"
        >
          <SheetHeader className="text-right">
            <SheetTitle>
              {editingProviderId ? "ویرایش ارائه‌دهنده" : "افزودن ارائه‌دهنده"}
            </SheetTitle>
            <SheetDescription>
              آدرس پایه باید به مسیر /v1 ختم شود. برای سرویس‌های ابری از https
              استفاده کنید؛ برای اجرای محلی کلید API معمولاً اختیاری است.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="provider-name">نام</FieldLabel>
                <Input
                  id="provider-name"
                  dir="rtl"
                  value={providerDraft.name}
                  onChange={(event) =>
                    setProviderDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="provider-base-url">آدرس پایه</FieldLabel>
                <Input
                  id="provider-base-url"
                  dir="ltr"
                  value={providerDraft.baseUrl}
                  placeholder="http://localhost:1234/v1"
                  onChange={(event) =>
                    setProviderDraft((current) => ({
                      ...current,
                      baseUrl: event.target.value,
                    }))
                  }
                />
                <FieldDescription>
                  برای سرویس‌های ابری از https استفاده کنید. http فقط روی
                  localhost و شبکه خصوصی مجاز است.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="provider-api-key">کلید API (اختیاری)</FieldLabel>
                <Input
                  id="provider-api-key"
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  value={providerDraft.apiKey}
                  placeholder="sk-…"
                  onChange={(event) =>
                    setProviderDraft((current) => ({
                      ...current,
                      apiKey: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field className="flex flex-row items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
                <div>
                  <FieldLabel>نیاز به کلید API</FieldLabel>
                  <FieldDescription>
                    برای LM Studio و سرورهای محلی معمولاً خاموش کنید. برای
                    سرویس‌های ابری روشن بگذارید.
                  </FieldDescription>
                </div>
                <Switch
                  checked={providerDraft.authRequired}
                  onCheckedChange={(checked) =>
                    setProviderDraft((current) => ({
                      ...current,
                      authRequired: checked,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
          </div>
          <SheetFooter className="text-right">
            <Button
              type="button"
              disabled={busy || !providerDraft.name.trim()}
              onClick={() => void saveProvider()}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              ذخیره
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={modelSheetOpen} onOpenChange={setModelSheetOpen}>
        <SheetContent
          side="right"
          className="w-full text-right sm:max-w-md"
          dir="rtl"
        >
          <SheetHeader className="text-right">
            <SheetTitle>{editingModel ? "ویرایش مدل" : "افزودن مدل"}</SheetTitle>
            <SheetDescription>
              شناسه مدل همان slugی است که API می‌پذیرد، مثلاً
              openai/gpt-4o یا llama-3.2-3b.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="model-id">شناسه مدل (API)</FieldLabel>
                <Input
                  id="model-id"
                  dir="ltr"
                  value={modelDraft.modelId}
                  disabled={editingModel?.source === "builtin"}
                  onChange={(event) =>
                    setModelDraft((current) => ({
                      ...current,
                      modelId: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="model-name">نام کوتاه</FieldLabel>
                <Input
                  id="model-name"
                  dir="rtl"
                  value={modelDraft.name}
                  onChange={(event) =>
                    setModelDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="model-full-name">نام کامل</FieldLabel>
                <Input
                  id="model-full-name"
                  dir="rtl"
                  value={modelDraft.fullName}
                  onChange={(event) =>
                    setModelDraft((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                />
              </Field>
              {(
                [
                  ["supportsTools", "پشتیبانی از ابزارها"],
                  ["supportsImages", "پشتیبانی از تصویر"],
                  ["supportsReasoningEffort", "پشتیبانی از سطح استدلال"],
                  ["enabled", "فعال"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  className="flex flex-row items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                >
                  <FieldLabel>{label}</FieldLabel>
                  <Switch
                    checked={modelDraft[key]}
                    onCheckedChange={(checked) =>
                      setModelDraft((current) => ({
                        ...current,
                        [key]: checked,
                      }))
                    }
                  />
                </Field>
              ))}
            </FieldGroup>
          </div>
          <SheetFooter className="text-right">
            <Button
              type="button"
              disabled={busy || !modelDraft.modelId.trim()}
              onClick={() => void saveModel()}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              ذخیره مدل
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(providerToDelete)}
        onOpenChange={(open) => !open && setProviderToDelete(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف ارائه‌دهنده؟</AlertDialogTitle>
            <AlertDialogDescription>
              «{providerToDelete?.name}» و مدل‌هایش حذف می‌شوند. گفتگوهای قبلی
              ممکن است نیاز به انتخاب مدل دیگری داشته باشند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteProvider()}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(modelToDelete)}
        onOpenChange={(open) => !open && setModelToDelete(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مدل؟</AlertDialogTitle>
            <AlertDialogDescription>
              «{modelToDelete?.fullName}» از فهرست مدل‌ها حذف می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteModel()}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeAllModelsOpen}
        onOpenChange={(open) => !busy && setRemoveAllModelsOpen(open)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف همه مدل‌ها؟</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedProvider?.isBuiltin ? (
                <>
                  {deletableProviderModels.length.toLocaleString("fa-IR")} مدل
                  اضافه‌شده از «{selectedProvider.name}» حذف می‌شود. مدل‌های
                  داخلی OpenRouter حذف نمی‌شوند.
                </>
              ) : (
                <>
                  همه {deletableProviderModels.length.toLocaleString("fa-IR")}{" "}
                  مدل «{selectedProvider?.name}» حذف می‌شود. گفتگوهایی که از
                  این مدل‌ها استفاده می‌کنند ممکن است نیاز به انتخاب مدل دیگری
                  داشته باشند.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void confirmRemoveAllModels()}
            >
              {busy ? "در حال حذف…" : "حذف همه"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ModelsGettingStarted({
  codexConnected,
  openrouterConfigured,
  onSelectCodex,
  onSelectOpenRouter,
  onAddPreset,
}: {
  codexConnected: boolean;
  openrouterConfigured: boolean;
  onSelectCodex: () => void;
  onSelectOpenRouter: () => void;
  onAddPreset: (preset: (typeof PROVIDER_PRESETS)[number]) => void;
}) {
  return (
    <section
      dir="rtl"
      className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <RocketIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium text-foreground">شروع سریع</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            برای شروع گفتگو یک مسیر را انتخاب کنید: اشتراک ChatGPT با Codex،
            OpenRouter، اجرای محلی با LM Studio / Ollama، یا هر سرویس ابری دیگر
            با API سازگار با OpenAI. سپس حداقل یک مدل را فعال کنید.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={onSelectCodex}
          className="rounded-2xl border border-border/70 bg-background p-4 text-right transition-colors hover:border-primary/30 hover:bg-muted/30"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <SparklesIcon className="size-4 text-muted-foreground" />
            Codex (اشتراک ChatGPT)
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {codexConnected
              ? "حساب متصل است — مدل‌های Codex را تازه‌سازی و فعال کنید."
              : "با حساب ChatGPT وارد شوید تا مدل‌های مجاز طرح شما همگام شوند."}
          </p>
          <p className="mt-2 text-[11px] text-primary">
            ۱. ورود ChatGPT → ۲. همگام‌سازی مدل
          </p>
        </button>

        <button
          type="button"
          onClick={onSelectOpenRouter}
          className="rounded-2xl border border-border/70 bg-background p-4 text-right transition-colors hover:border-primary/30 hover:bg-muted/30"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            OpenRouter (ابری)
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {openrouterConfigured
              ? "کلید دارید — مدل‌های پیش‌فرض را فعال کنید."
              : "کلید API را وارد کنید و مدل‌های پیش‌فرض را روشن کنید."}{" "}
            برای سرویس ابری دیگر از «افزودن ارائه‌دهنده» استفاده کنید.
          </p>
          <p className="mt-2 text-[11px] text-primary">۱. کلید → ۲. فعال‌سازی مدل</p>
        </button>

        {PROVIDER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onAddPreset(preset)}
            className="rounded-2xl border border-border/70 bg-background p-4 text-right transition-colors hover:border-primary/30 hover:bg-muted/30"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <ServerIcon className="size-4 text-muted-foreground" />
              {preset.label} (محلی)
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              سرور {preset.label} را اجرا کنید، ارائه‌دهنده را اضافه کنید و
              مدل‌ها را از /models وارد کنید.
            </p>
            <p className="mt-2 text-[11px] text-primary" dir="ltr">
              {preset.baseUrl}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function OpenRouterKeyField({
  status,
  busy,
  onSave,
  onTest,
  onClear,
}: {
  status: CredentialStatus | null;
  busy: boolean;
  onSave: (key: string) => void;
  onTest: (key: string) => void;
  onClear: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="mt-3 rounded-2xl border border-border/70 bg-background px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <KeyRoundIcon className="size-4 text-muted-foreground" />
        کلید OpenRouter
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        وضعیت:{" "}
        {status?.configured
          ? `تنظیم‌شده ${status.hint ?? ""}`
          : "تنظیم‌نشده"}
      </p>
      <Field>
        <FieldLabel htmlFor="openrouter-key">کلید جدید</FieldLabel>
        <Input
          id="openrouter-key"
          dir="ltr"
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder="sk-or-v1-…"
          onChange={(event) => setApiKey(event.target.value)}
        />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !apiKey.trim() || status?.secure === false}
          onClick={() => onSave(apiKey)}
        >
          ذخیره کلید
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || (!apiKey.trim() && !status?.configured)}
          onClick={() => onTest(apiKey)}
        >
          آزمون
        </Button>
        {status?.configured ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void onClear()}
          >
            حذف کلید
          </Button>
        ) : null}
      </div>
    </div>
  );
}
