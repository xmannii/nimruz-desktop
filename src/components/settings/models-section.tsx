"use client";

import { useAppShell } from "@/components/app-shell-context";
import {
  Anthropic,
  Gemini,
  LMStudio,
  Ollama,
  OpenAI,
  OpenRouter,
} from "@/components/provider-logos";
import { CodexAccountCard } from "@/components/settings/codex-account-card";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Link, useNavigate } from "@tanstack/react-router";
import type { CodexAccountStatus } from "@/lib/codex";
import type { CredentialStatus } from "@/lib/desktop-api";
import {
  CODEX_PROVIDER_ID,
  OPENROUTER_PROVIDER_ID,
  type ModelConfig,
  type ProviderConfig,
  type ProviderKind,
} from "@/lib/models/catalog";
import { cn } from "@/lib/utils";
import {
  CircleCheckIcon,
  ChevronDownIcon,
  CloudIcon,
  CpuIcon,
  EllipsisIcon,
  ImageIcon,
  KeyRoundIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RocketIcon,
  ServerIcon,
  StarIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const PROVIDER_PRESETS = [
  {
    id: "openai",
    label: "OpenAI API",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    authRequired: true,
    description: "اتصال مستقیم با کلید API و صورت‌حساب OpenAI",
    location: "cloud",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    authRequired: true,
    description: "اتصال مستقیم به مدل‌های Claude",
    location: "cloud",
  },
  {
    id: "google",
    label: "Google Gemini",
    kind: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authRequired: true,
    description: "اتصال مستقیم به مدل‌های Gemini",
    location: "cloud",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    kind: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    authRequired: false,
    description: "اجرای مدل‌های دانلودشده روی دستگاه",
    location: "local",
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    authRequired: false,
    description: "اجرای مدل‌های محلی با Ollama",
    location: "local",
  },
] as const;

const CLOUD_PROVIDER_PRESETS = PROVIDER_PRESETS.filter(
  (preset) => preset.location === "cloud"
);
const LOCAL_PROVIDER_PRESETS = PROVIDER_PRESETS.filter(
  (preset) => preset.location === "local"
);

type ProviderDraft = {
  id: string;
  name: string;
  kind: Exclude<ProviderKind, "openrouter" | "codex">;
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
};

type ProviderLogoKey =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google"
  | "lmstudio"
  | "ollama"
  | "compatible";

const DARK_PROVIDER_LOGOS = new Set<ProviderLogoKey>([
  "openrouter",
  "openai",
  "anthropic",
  "ollama",
]);

function emptyProviderDraft(): ProviderDraft {
  return {
    id: nanoid(),
    name: "",
    kind: "openai-compatible",
    baseUrl: "",
    authRequired: true,
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
  };
}

function modelIdExample(provider: ProviderConfig | null): string {
  if (!provider) return "gpt-4.1-mini";
  if (provider.kind === "openrouter") return "openai/gpt-4.1-mini";

  const searchable = `${provider.name} ${provider.baseUrl}`.toLowerCase();
  if (searchable.includes("ollama")) return "llama3.2";
  if (searchable.includes("lm studio") || searchable.includes("lmstudio")) {
    return "local-model";
  }

  return provider.kind === "google"
    ? "gemini-2.5-flash"
    : provider.kind === "anthropic"
      ? "claude-sonnet-4-5"
      : "gpt-4.1-mini";
}

export function ModelsSettingsSection({
  initialProviderId = OPENROUTER_PROVIDER_ID,
  view = "overview",
}: {
  initialProviderId?: string;
  view?: "overview" | "models" | "providers" | "add";
}) {
  const navigate = useNavigate();
  const {
    providers,
    models,
    catalog,
    refreshCatalog,
    setCatalog,
    bumpCredentialRefresh,
  } = useAppShell();

  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    initialProviderId
  );
  const appliedInitialProviderId = useRef<string | null>(null);
  const providerDetailsRef = useRef<HTMLDivElement | null>(null);
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
  const [showAllModels, setShowAllModels] = useState(false);

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers[0] ??
    null;
  const modelDraftProvider =
    providers.find((provider) => provider.id === modelDraft.providerId) ??
    selectedProvider;
  const addableProviders = providers.filter(
    (provider) => provider.kind !== "codex"
  );
  const selectedAddProvider =
    selectedProvider?.kind !== "codex"
      ? selectedProvider
      : (addableProviders[0] ?? null);

  const isCustomProvider = Boolean(
    selectedProvider && !selectedProvider.isBuiltin
  );
  const isCodexProvider = selectedProvider?.kind === "codex";

  const providerModelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models) {
      counts.set(model.providerId, (counts.get(model.providerId) ?? 0) + 1);
    }
    return counts;
  }, [models]);

  const visibleModelGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const groups: Array<{
      provider: ProviderConfig;
      models: ModelConfig[];
    }> = [];

    for (const provider of providers) {
      const matchingModels = models.filter((model) => {
        if (model.providerId !== provider.id) return false;
        if (!showAllModels && (!provider.enabled || !model.enabled)) {
          return false;
        }
        if (!query) return true;
        return (
          model.fullName.toLowerCase().includes(query) ||
          model.modelId.toLowerCase().includes(query) ||
          provider.name.toLowerCase().includes(query)
        );
      });
      if (matchingModels.length > 0) {
        groups.push({ provider, models: matchingModels });
      }
    }

    return groups;
  }, [models, providers, search, showAllModels]);

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
      name: preset?.label ?? "API سازگار با OpenAI",
      kind: preset?.kind ?? "openai-compatible",
      baseUrl: preset?.baseUrl ?? "",
      authRequired: preset?.authRequired ?? true,
    });
    setProviderSheetOpen(true);
  }

  function openCreateLocalCompatibleProvider() {
    setEditingProviderId(null);
    setProviderDraft({
      ...emptyProviderDraft(),
      name: "سرور محلی سازگار با OpenAI",
      authRequired: false,
    });
    setProviderSheetOpen(true);
  }

  function openEditProvider(provider: ProviderConfig) {
    setEditingProviderId(provider.id);
    setProviderDraft({
      id: provider.id,
      name: provider.name,
      kind:
        provider.kind === "openrouter" || provider.kind === "codex"
          ? "openai-compatible"
          : provider.kind,
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
        kind: providerDraft.kind,
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
      if (view === "overview") {
        await navigate({
          to: "/settings/models/providers",
          search: { provider: saved.id },
        });
      }
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

  function selectProvider(providerId: string) {
    setSelectedProviderId(providerId);
    window.requestAnimationFrame(() => {
      providerDetailsRef.current?.scrollIntoView({ block: "start" });
    });
    if (view === "providers") {
      void navigate({
        to: "/settings/models/providers",
        search: { provider: providerId },
        replace: true,
      });
    } else if (view === "add") {
      void navigate({
        to: "/settings/models/add",
        search: { provider: providerId },
        replace: true,
      });
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

  function openCreateModelForProvider(provider: ProviderConfig) {
    setEditingModel(null);
    setModelDraft(emptyModelDraft(provider.id));
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
    });
    setModelSheetOpen(true);
  }

  async function saveModel() {
    const normalizedModelId = modelDraft.modelId.trim();
    const fallbackName =
      normalizedModelId.split("/").filter(Boolean).at(-1) ?? normalizedModelId;
    const displayName =
      modelDraft.fullName.trim() || modelDraft.name.trim() || fallbackName;

    setBusy(true);
    try {
      await window.desktop.providers.saveModel({
        ...(editingModel ?? {}),
        ...modelDraft,
        modelId: normalizedModelId,
        name: modelDraft.name.trim() || displayName,
        fullName: displayName,
        supportsTools: true,
        supportsReasoningEffort:
          editingModel?.supportsReasoningEffort ?? false,
        enabled: editingModel?.enabled ?? true,
        source: editingModel?.source ?? "manual",
        isDefault: editingModel?.isDefault ?? false,
      });
      await refreshCatalog();
      setModelSheetOpen(false);
      toast.success(
        editingModel
          ? `تغییرات «${displayName}» ذخیره شد`
          : `«${displayName}» اضافه و فعال شد`
      );
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
      {view === "overview" ? (
        <ModelsConnectionGuide
          codexConnected={codexStatus?.state === "connected"}
          openrouterConfigured={
            providerStatuses[OPENROUTER_PROVIDER_ID]?.configured ?? false
          }
          onSelectCodex={() =>
            void navigate({
              to: "/settings/models/providers",
              search: { provider: CODEX_PROVIDER_ID },
            })
          }
          onSelectOpenRouter={() =>
            void navigate({
              to: "/settings/models/providers",
              search: { provider: OPENROUTER_PROVIDER_ID },
            })
          }
          onAddCompatible={() => openCreateProvider()}
          onAddLocalCompatible={openCreateLocalCompatibleProvider}
          onAddPreset={(preset) => openCreateProvider(preset)}
        />
      ) : null}

      {view === "add" ? (
        <SettingsSection
          title="افزودن مدل"
          description="ارائه‌دهنده مقصد را انتخاب کنید، سپس مدل‌ها را خودکار دریافت کنید یا یک شناسه را دستی وارد کنید."
          icon={PlusIcon}
        >
          <Card size="sm">
            <CardHeader>
              <CardTitle>۱. انتخاب ارائه‌دهنده</CardTitle>
              <CardDescription>
                مدل جدید زیر این اتصال ذخیره می‌شود و از کلید API همین
                ارائه‌دهنده استفاده می‌کند.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="add-model-provider">
                  ارائه‌دهنده مقصد
                </FieldLabel>
                <Select
                  value={selectedAddProvider?.id ?? null}
                  onValueChange={(value) => {
                    if (value) selectProvider(value);
                  }}
                >
                  <SelectTrigger
                    id="add-model-provider"
                    className="w-full max-w-full"
                    aria-label="انتخاب ارائه‌دهنده مقصد"
                  >
                    <ServerIcon aria-hidden="true" />
                    <SelectValue>
                      {selectedAddProvider?.name ?? "یک ارائه‌دهنده انتخاب کنید"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    dir="rtl"
                  >
                    <SelectGroup>
                      <SelectLabel>ارائه‌دهنده‌های قابل استفاده</SelectLabel>
                      {addableProviders.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          <ServerIcon aria-hidden="true" />
                          {provider.name}
                          {!provider.enabled ? (
                            <Badge variant="outline">غیرفعال</Badge>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  ارائه‌دهنده‌ای را انتخاب کنید که شناسه مدل متعلق به آن است.
                </FieldDescription>
              </Field>
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-3 border-t">
              <p className="text-xs text-muted-foreground">
                {selectedAddProvider
                  ? `${(providerModelCounts.get(selectedAddProvider.id) ?? 0).toLocaleString("fa-IR")} مدل اکنون برای این اتصال ثبت شده است.`
                  : "هنوز ارائه‌دهنده‌ای برای افزودن مدل وجود ندارد."}
              </p>
              {selectedAddProvider ? (
                <Badge
                  variant={selectedAddProvider.enabled ? "secondary" : "outline"}
                >
                  {selectedAddProvider.enabled
                    ? "اتصال فعال"
                    : "اتصال غیرفعال"}
                </Badge>
              ) : null}
            </CardFooter>
          </Card>

          {selectedAddProvider ? (
            <AddModelsCard
              provider={selectedAddProvider}
              modelCount={
                providerModelCounts.get(selectedAddProvider.id) ?? 0
              }
              automaticImport={Boolean(!selectedAddProvider.isBuiltin)}
              busy={busy}
              onDiscover={() =>
                void discoverAndImport(selectedAddProvider)
              }
              onAddManual={() =>
                openCreateModelForProvider(selectedAddProvider)
              }
            />
          ) : (
            <Alert>
              <ServerIcon />
              <AlertTitle>ابتدا یک ارائه‌دهنده اضافه کنید</AlertTitle>
              <AlertDescription>
                بدون ارائه‌دهنده، نیمروز نمی‌داند مدل را از کدام API اجرا کند.
              </AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  render={
                    <Link
                      to="/settings/models/providers"
                      search={{ provider: undefined }}
                    />
                  }
                >
                  افزودن ارائه‌دهنده
                </Button>
              </AlertAction>
            </Alert>
          )}
        </SettingsSection>
      ) : null}

      {view === "providers" ? (
        <>
          <SettingsSection
            title="افزودن ارائه‌دهنده جدید"
            description="ابتدا نوع اتصال را انتخاب کنید؛ تنظیمات لازم در پنل بعدی نمایش داده می‌شود."
            icon={PlusIcon}
          >
            <AddProviderCard
              onAddCompatible={() => openCreateProvider()}
              onAddLocalCompatible={openCreateLocalCompatibleProvider}
              onAddPreset={(preset) => openCreateProvider(preset)}
              onSelectOpenRouter={() => selectProvider(OPENROUTER_PROVIDER_ID)}
            />
          </SettingsSection>

          <SettingsSection
            title="ارائه‌دهنده‌های موجود"
            description="برای تنظیم کلید، آزمون اتصال یا افزودن مدل، یکی از ارائه‌دهنده‌ها را انتخاب کنید."
            icon={ServerIcon}
          >
            <div className="flex flex-col gap-2">
              {providers.map((provider) => {
            const status = providerStatuses[provider.id];
            const isCodex = provider.kind === "codex";
            const count = providerModelCounts.get(provider.id) ?? 0;
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
                  onClick={() => selectProvider(provider.id)}
                  className="min-w-0 flex-1 rounded-s-2xl px-3.5 py-3 text-right outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <ProviderMark provider={provider} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {provider.name}
                        </span>
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
                            {codexStatusLoading
                              ? "در حال بررسی"
                              : "نیاز به ورود"}
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
            <div ref={providerDetailsRef} className="scroll-mt-4">
              <SettingsSection
          title={`تنظیم ${selectedProvider.name}`}
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
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void testProvider(selectedProvider)}
              >
                <CircleCheckIcon data-icon="inline-start" />
                آزمون اتصال
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`گزینه‌های ${selectedProvider.name}`}
                    />
                  }
                >
                  <EllipsisIcon data-icon="inline-start" />
                  بیشتر
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" dir="rtl">
                  <DropdownMenuGroup>
                    {isCustomProvider ? (
                      <DropdownMenuItem
                        onClick={() => openEditProvider(selectedProvider)}
                      >
                        <PencilIcon />
                        ویرایش ارائه‌دهنده
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                  {isCustomProvider || deletableProviderModels.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        {deletableProviderModels.length > 0 ? (
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={busy}
                            onClick={() => setRemoveAllModelsOpen(true)}
                          >
                            <Trash2Icon />
                            حذف مدل‌های اضافه‌شده
                          </DropdownMenuItem>
                        ) : null}
                        {isCustomProvider ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setProviderToDelete(selectedProvider)}
                          >
                            <Trash2Icon />
                            حذف ارائه‌دهنده
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
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

          {!isCodexProvider ? (
            <Alert>
              <PlusIcon />
              <AlertTitle>می‌خواهید مدل جدیدی اضافه کنید؟</AlertTitle>
              <AlertDescription>
                صفحه افزودن مدل، «{selectedProvider.name}» را از قبل به‌عنوان
                ارائه‌دهنده مقصد انتخاب می‌کند.
              </AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  render={
                    <Link
                      to="/settings/models/add"
                      search={{ provider: selectedProvider.id }}
                    />
                  }
                >
                  رفتن به افزودن مدل
                </Button>
              </AlertAction>
            </Alert>
          ) : (
            <Alert>
              <CpuIcon />
              <AlertTitle>
                {(providerModelCounts.get(selectedProvider.id) ?? 0).toLocaleString(
                  "fa-IR"
                )}{" "}
                مدل برای این ارائه‌دهنده
              </AlertTitle>
              <AlertDescription>
                فعال‌سازی و انتخاب مدل پیش‌فرض در صفحه مدل‌ها انجام می‌شود.
              </AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      to="/settings/models/active"
                      search={{ provider: selectedProvider.id }}
                    />
                  }
                >
                  مشاهده مدل‌ها
                </Button>
              </AlertAction>
            </Alert>
          )}
              </SettingsSection>
            </div>
          ) : null}
        </>
      ) : null}

      {view === "models" ? (
        <SettingsSection
          title="مدل‌ها"
          description="مدل‌ها بر اساس ارائه‌دهنده گروه‌بندی شده‌اند. در حالت پیش‌فرض فقط مدل‌های فعال نمایش داده می‌شوند."
          icon={CpuIcon}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="search"
              name="model-search"
              autoComplete="off"
              aria-label="جستجو در مدل‌ها"
              value={search}
              placeholder="جستجوی نام یا شناسه مدل…"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="sm:shrink-0"
              onClick={() => setShowAllModels((current) => !current)}
            >
              {showAllModels ? "فقط مدل‌های فعال" : "نمایش همه مدل‌ها"}
            </Button>
          </div>

          {visibleModelGroups.length > 0 ? (
            <div className="flex flex-col gap-6">
              {visibleModelGroups.map((group) => (
                <section
                  key={group.provider.id}
                  className="flex flex-col gap-2 [content-visibility:auto]"
                >
                  <div className="flex items-center gap-3">
                    <ProviderMark provider={group.provider} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium">
                        {group.provider.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {group.models.length.toLocaleString("fa-IR")} مدل
                      </p>
                    </div>
                    {!group.provider.enabled ? (
                      <Badge variant="outline">ارائه‌دهنده غیرفعال</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.models.map((model) => (
                      <ModelSettingsRow
                        key={model.id}
                        model={model}
                        isCodexProvider={group.provider.kind === "codex"}
                        onToggleEnabled={(enabled) =>
                          void toggleModelEnabled(model, enabled)
                        }
                        onSetDefault={() => void setDefaultModel(model)}
                        onEdit={() => openEditModel(model)}
                        onDelete={() => setModelToDelete(model)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <Alert>
              <CpuIcon />
              <AlertTitle>مدلی برای نمایش وجود ندارد</AlertTitle>
              <AlertDescription>
                {search.trim()
                  ? "عبارت دیگری را جستجو کنید یا نمایش همه مدل‌ها را روشن کنید."
                  : "ابتدا یک ارائه‌دهنده را متصل و حداقل یک مدل را فعال کنید."}
              </AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      to="/settings/models/providers"
                      search={{ provider: undefined }}
                    />
                  }
                >
                  مدیریت ارائه‌دهنده‌ها
                </Button>
              </AlertAction>
            </Alert>
          )}
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
                  name="provider-name"
                  dir="rtl"
                  autoComplete="off"
                  value={providerDraft.name}
                  placeholder="نام ارائه‌دهنده…"
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
                  name="provider-base-url"
                  dir="ltr"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={providerDraft.baseUrl}
                  placeholder="https://api.example.com/v1…"
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
                <FieldLabel htmlFor="provider-kind">نوع API</FieldLabel>
                <select
                  id="provider-kind"
                  name="provider-kind"
                  dir="ltr"
                  value={providerDraft.kind}
                  onChange={(event) =>
                    setProviderDraft((current) => ({
                      ...current,
                      kind: event.target.value as ProviderDraft["kind"],
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic Messages</option>
                  <option value="google">Google Gemini</option>
                  <option value="openai-compatible">
                    OpenAI-compatible
                  </option>
                </select>
                <FieldDescription>
                  انتخاب نوع درست، احراز هویت و قالب ابزارهای بومی همان
                  ارائه‌دهنده را فعال می‌کند.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="provider-api-key">کلید API (اختیاری)</FieldLabel>
                <Input
                  id="provider-api-key"
                  name="provider-api-key"
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
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
                  aria-label="نیاز به کلید API"
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
              disabled={
                busy ||
                !providerDraft.name.trim() ||
                !providerDraft.baseUrl.trim()
              }
              onClick={() => void saveProvider()}
            >
              {busy ? (
                <Loader2Icon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : null}
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
            <SheetTitle>
              {editingModel ? "ویرایش مدل" : "افزودن دستی مدل"}
            </SheetTitle>
            <SheetDescription>
              فقط شناسه مدل در API الزامی است. نام نمایشی را می‌توانید به
              انتخاب خودتان وارد کنید.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <Alert>
              <CpuIcon />
              <AlertTitle>
                مقصد: {modelDraftProvider?.name ?? "ارائه‌دهنده انتخاب‌شده"}
              </AlertTitle>
              <AlertDescription>
                مدل پس از افزودن فعال می‌شود. پشتیبانی ابزار نیز برای حالت
                ایجنت به‌صورت پیش‌فرض روشن است.
              </AlertDescription>
            </Alert>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="model-id">شناسه مدل در API</FieldLabel>
                <Input
                  id="model-id"
                  name="model-id"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={modelDraft.modelId}
                  disabled={editingModel?.source === "builtin"}
                  placeholder={modelIdExample(modelDraftProvider)}
                  onChange={(event) =>
                    setModelDraft((current) => ({
                      ...current,
                      modelId: event.target.value,
                    }))
                  }
                />
                <FieldDescription>
                  شناسه را دقیقاً از مستندات یا فهرست مدل‌های{" "}
                  {modelDraftProvider?.name ?? "ارائه‌دهنده"} کپی کنید؛ برای
                  نمونه:{" "}
                  <span dir="ltr">{modelIdExample(modelDraftProvider)}</span>
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="model-full-name">
                  نام نمایشی (اختیاری)
                </FieldLabel>
                <Input
                  id="model-full-name"
                  name="model-full-name"
                  dir="rtl"
                  autoComplete="off"
                  value={modelDraft.fullName}
                  placeholder="مثلاً GPT-4.1 Mini"
                  onChange={(event) =>
                    setModelDraft((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                />
                <FieldDescription>
                  اگر خالی بماند، نام از روی شناسه مدل ساخته می‌شود.
                </FieldDescription>
              </Field>
              <Field className="flex flex-row items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
                <div>
                  <FieldLabel htmlFor="model-supports-images">
                    ورودی تصویر
                  </FieldLabel>
                  <FieldDescription>
                    فقط وقتی روشن کنید که مدل می‌تواند تصویر را مستقیماً
                    تحلیل کند.
                  </FieldDescription>
                </div>
                <Switch
                  id="model-supports-images"
                  checked={modelDraft.supportsImages}
                  onCheckedChange={(checked) =>
                    setModelDraft((current) => ({
                      ...current,
                      supportsImages: checked,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
          </div>
          <SheetFooter className="gap-2 text-right">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setModelSheetOpen(false)}
            >
              انصراف
            </Button>
            <Button
              type="button"
              disabled={busy || !modelDraft.modelId.trim()}
              onClick={() => void saveModel()}
            >
              {busy ? (
                <Loader2Icon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : null}
              {editingModel ? "ذخیره تغییرات" : "افزودن و فعال‌کردن مدل"}
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

function ModelSettingsRow({
  model,
  isCodexProvider,
  onToggleEnabled,
  onSetDefault,
  onEdit,
  onDelete,
}: {
  model: ModelConfig;
  isCodexProvider: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/15 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{model.fullName}</span>
          {model.isDefault ? (
            <Badge variant="secondary">پیش‌فرض</Badge>
          ) : null}
          {!model.enabled ? <Badge variant="outline">غیرفعال</Badge> : null}
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
        <p
          className="mt-1 truncate text-xs text-muted-foreground"
          dir="ltr"
        >
          {model.modelId}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isCodexProvider || model.supportsTools ? (
            <Badge variant="secondary">
              <WrenchIcon />
              حالت ایجنت
            </Badge>
          ) : (
            <Badge variant="outline">فقط گفت‌وگو</Badge>
          )}
          {model.supportsImages ? (
            <Badge variant="secondary">
              <ImageIcon />
              ورودی تصویر
            </Badge>
          ) : null}
          {model.supportsReasoningEffort ? (
            <Badge variant="secondary">استدلال</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Switch
          checked={model.enabled}
          onCheckedChange={onToggleEnabled}
          aria-label={`فعال‌سازی ${model.fullName}`}
        />
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            title="پیش‌فرض"
            aria-label={`انتخاب ${model.fullName} به‌عنوان مدل پیش‌فرض`}
            disabled={!model.enabled || model.isDefault}
            onClick={onSetDefault}
          >
            <StarIcon />
          </Button>
          {!isCodexProvider ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="ویرایش"
              aria-label={`ویرایش ${model.fullName}`}
              onClick={onEdit}
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
              aria-label={`حذف ${model.fullName}`}
              onClick={onDelete}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AddModelsCard({
  provider,
  modelCount,
  automaticImport,
  busy,
  onDiscover,
  onAddManual,
}: {
  provider: ProviderConfig;
  modelCount: number;
  automaticImport: boolean;
  busy: boolean;
  onDiscover: () => void;
  onAddManual: () => void;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>۲. افزودن مدل به {provider.name}</CardTitle>
        <CardDescription>
          {automaticImport
            ? "دریافت خودکار روش پیشنهادی است. اگر API مدل را در فهرست برنگرداند، شناسه دقیق آن را دستی وارد کنید."
            : "شناسه دقیق مدل را از ارائه‌دهنده کپی کنید. مدل پس از افزودن فعال و آماده انتخاب می‌شود."}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">
            {modelCount.toLocaleString("fa-IR")} مدل
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        {automaticImport ? (
          <Button
            type="button"
            className="sm:flex-1"
            disabled={busy}
            onClick={onDiscover}
          >
            {busy ? (
              <Loader2Icon
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            دریافت و افزودن خودکار
            <Badge variant="secondary">پیشنهادی</Badge>
          </Button>
        ) : null}
        <Button
          type="button"
          variant={automaticImport ? "outline" : "default"}
          className="sm:flex-1"
          disabled={busy}
          onClick={onAddManual}
        >
          <PlusIcon data-icon="inline-start" />
          افزودن دستی با شناسه مدل
        </Button>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 border-t">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <WrenchIcon className="size-3.5" aria-hidden="true" />
          پشتیبانی ابزار برای حالت ایجنت خودکار روشن می‌شود.
        </p>
        <Button
          size="sm"
          variant="ghost"
          render={
            <Link
              to="/settings/models/active"
              search={{ provider: provider.id }}
            />
          }
        >
          مشاهده مدل‌های افزوده‌شده
        </Button>
      </CardFooter>
    </Card>
  );
}

function AddProviderCard({
  onAddCompatible,
  onAddLocalCompatible,
  onAddPreset,
  onSelectOpenRouter,
}: {
  onAddCompatible: () => void;
  onAddLocalCompatible: () => void;
  onAddPreset: (preset: (typeof PROVIDER_PRESETS)[number]) => void;
  onSelectOpenRouter: () => void;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>روش اتصال را انتخاب کنید</CardTitle>
        <CardDescription>
          برای APIهای اینترنتی «سرویس ابری» و برای Ollama، LM Studio یا
          سرورهای داخل شبکه «مدل محلی» را انتخاب کنید.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">مرحله ۱ از ۲</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" />}>
            <CloudIcon data-icon="inline-start" />
            افزودن سرویس ابری
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" dir="rtl">
            <DropdownMenuGroup>
              <DropdownMenuLabel>روش پیشنهادی</DropdownMenuLabel>
              <DropdownMenuItem onClick={onAddCompatible}>
                <ProviderLogoMark
                  logo="compatible"
                  className="size-6 rounded-md"
                />
                API سازگار با OpenAI
                <Badge variant="secondary" className="ms-auto">
                  پیشنهادی
                </Badge>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>اتصال مستقیم</DropdownMenuLabel>
              {CLOUD_PROVIDER_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => onAddPreset(preset)}
                >
                  <ProviderLogoMark
                    logo={preset.id}
                    className="size-6 rounded-md"
                  />
                  {preset.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="outline" />}
          >
            <ServerIcon data-icon="inline-start" />
            افزودن مدل محلی
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" dir="rtl">
            <DropdownMenuGroup>
              <DropdownMenuLabel>برنامه‌های محلی</DropdownMenuLabel>
              {LOCAL_PROVIDER_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => onAddPreset(preset)}
                >
                  <ProviderLogoMark
                    logo={preset.id}
                    className="size-6 rounded-md"
                  />
                  {preset.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onAddLocalCompatible}>
                <ProviderLogoMark
                  logo="compatible"
                  className="size-6 rounded-md"
                />
                سرور محلی دیگر
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 border-t">
        <p className="text-xs text-muted-foreground">
          OpenRouter از قبل آماده است؛ فقط کلید API آن را تنظیم کنید.
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onSelectOpenRouter}>
          تنظیم OpenRouter
        </Button>
      </CardFooter>
    </Card>
  );
}

function ModelsConnectionGuide({
  codexConnected,
  openrouterConfigured,
  onSelectCodex,
  onSelectOpenRouter,
  onAddCompatible,
  onAddLocalCompatible,
  onAddPreset,
}: {
  codexConnected: boolean;
  openrouterConfigured: boolean;
  onSelectCodex: () => void;
  onSelectOpenRouter: () => void;
  onAddCompatible: () => void;
  onAddLocalCompatible: () => void;
  onAddPreset: (preset: (typeof PROVIDER_PRESETS)[number]) => void;
}) {
  return (
    <SettingsSection
      title="می‌خواهید چطور به مدل‌ها متصل شوید؟"
      description="بین سرویس‌های ابری و مدل‌های محلی انتخاب کنید. OpenRouter و APIهای سازگار با OpenAI ساده‌ترین مسیرهای پیشنهادی‌اند."
      icon={RocketIcon}
    >
      <Alert>
        <WrenchIcon />
        <AlertTitle>حالت ایجنت به فراخوانی ابزار نیاز دارد</AlertTitle>
        <AlertDescription>
          نیمروز پشتیبانی ابزار را برای مدل‌های اضافه‌شده به‌صورت پیش‌فرض روشن
          می‌کند. هنگام افزودن مدل فقط مشخص می‌کنید که ورودی تصویر را می‌پذیرد
          یا نه.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <CloudIcon className="size-4" aria-hidden="true" />
              </span>
              سرویس‌های ابری
            </CardTitle>
            <CardDescription>
              بدون دانلود مدل؛ مناسب راه‌اندازی سریع و دسترسی به مدل‌های قدرتمند
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <ProviderChoiceButton
              logo="openrouter"
              title="OpenRouter"
              description={
                openrouterConfigured
                  ? "کلید متصل است؛ مدل‌ها را مدیریت کنید."
                  : "یک کلید برای مدل‌های چندین شرکت"
              }
              recommended
              onClick={onSelectOpenRouter}
            />
            <ProviderChoiceButton
              logo="compatible"
              title="API سازگار با OpenAI"
              description="سرویس ابری یا درگاه سازمانی با endpoint استاندارد"
              recommended
              onClick={onAddCompatible}
            />
            {CLOUD_PROVIDER_PRESETS.map((preset) => (
              <ProviderChoiceButton
                key={preset.id}
                logo={preset.id}
                title={preset.label}
                description={preset.description}
                onClick={() => onAddPreset(preset)}
              />
            ))}
            <ProviderChoiceButton
              logo="openai"
              title="Codex با اشتراک ChatGPT"
              description={
                codexConnected
                  ? "حساب متصل است؛ مدل‌های Codex را مدیریت کنید."
                  : "ورود با ChatGPT و همگام‌سازی مدل‌های مجاز"
              }
              onClick={onSelectCodex}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <ServerIcon className="size-4" aria-hidden="true" />
              </span>
              مدل‌های محلی
            </CardTitle>
            <CardDescription>
              اجرای مدل روی دستگاه؛ مناسب حریم خصوصی و کار بدون سرویس ابری
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {LOCAL_PROVIDER_PRESETS.map((preset) => (
              <ProviderChoiceButton
                key={preset.id}
                logo={preset.id}
                title={preset.label}
                description={preset.description}
                onClick={() => onAddPreset(preset)}
              />
            ))}
            <ProviderChoiceButton
              logo="compatible"
              title="سرور محلی دیگر"
              description="هر سرور محلی با API سازگار با OpenAI"
              recommended
              onClick={onAddLocalCompatible}
            />
          </CardContent>
        </Card>
      </div>
    </SettingsSection>
  );
}

function ProviderChoiceButton({
  logo,
  title,
  description,
  recommended = false,
  onClick,
}: {
  logo: ProviderLogoKey;
  title: string;
  description: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full min-w-0 justify-start whitespace-normal py-3 text-right"
      onClick={onClick}
    >
      <ProviderLogoMark logo={logo} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {recommended ? (
            <Badge variant="secondary">پیشنهادی</Badge>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </Button>
  );
}

function ProviderLogoMark({
  logo,
  className,
}: {
  logo: ProviderLogoKey;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-xl",
        DARK_PROVIDER_LOGOS.has(logo)
          ? "bg-neutral-950 text-white"
          : "bg-muted text-muted-foreground",
        className
      )}
      aria-hidden="true"
    >
      {logo === "openrouter" ? (
        <OpenRouter className="size-4" />
      ) : logo === "openai" ? (
        <OpenAI className="size-4" />
      ) : logo === "anthropic" ? (
        <Anthropic className="size-4" />
      ) : logo === "google" ? (
        <Gemini className="size-4" />
      ) : logo === "lmstudio" ? (
        <LMStudio className="size-4" />
      ) : logo === "ollama" ? (
        <Ollama className="size-4" />
      ) : (
        <CloudIcon className="size-4" />
      )}
    </span>
  );
}

function ProviderMark({ provider }: { provider: ProviderConfig }) {
  const searchable = `${provider.name} ${provider.baseUrl}`.toLowerCase();
  const logo: ProviderLogoKey =
    provider.kind === "openrouter"
      ? "openrouter"
      : provider.kind === "openai" || provider.kind === "codex"
        ? "openai"
        : provider.kind === "anthropic"
          ? "anthropic"
          : provider.kind === "google"
            ? "google"
            : searchable.includes("ollama")
              ? "ollama"
              : searchable.includes("lm studio") ||
                  searchable.includes("lmstudio")
                ? "lmstudio"
                : "compatible";

  return <ProviderLogoMark logo={logo} className="size-9" />;
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
