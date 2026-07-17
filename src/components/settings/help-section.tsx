"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { APP_NAME_FA } from "@/lib/branding";
import {
  HELP_GUIDE_INTRO,
  HELP_TOPICS,
  type HelpTopicBlock,
} from "@/lib/help-guide";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  CpuIcon,
  FolderKanbanIcon,
  KeyRoundIcon,
  LightbulbIcon,
  MessageSquareTextIcon,
  PaletteIcon,
  RocketIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserRoundIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

const TOPIC_ICONS: Record<string, LucideIcon> = {
  overview: SparklesIcon,
  "getting-started": RocketIcon,
  chat: MessageSquareTextIcon,
  workspaces: FolderKanbanIcon,
  "agent-tools": WrenchIcon,
  models: CpuIcon,
  "research-agents": SearchIcon,
  personalization: UserRoundIcon,
  memories: BrainIcon,
  experts: BotIcon,
  skills: BookOpenIcon,
  appearance: PaletteIcon,
  privacy: ShieldCheckIcon,
  tips: LightbulbIcon,
};

function HelpBlock({ block }: { block: HelpTopicBlock }) {
  if (block.type === "paragraph") {
    return (
      <p className="text-sm leading-7 text-foreground/90">{block.text}</p>
    );
  }

  if (block.type === "tip") {
    return (
      <div className="rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3">
        <p className="flex gap-2 text-sm leading-7 text-foreground/90">
          <LightbulbIcon className="mt-1 size-4 shrink-0 text-primary" />
          <span>{block.text}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {block.title ? (
        <p className="text-sm font-medium text-foreground">{block.title}</p>
      ) : null}
      <ul className="space-y-2">
        {block.items.map((item) => (
          <li
            key={item}
            className="flex gap-2.5 text-sm leading-7 text-foreground/90"
          >
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-foreground/40" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HelpTopicCard({
  id,
  title,
  summary,
  blocks,
}: {
  id: string;
  title: string;
  summary: string;
  blocks: HelpTopicBlock[];
}) {
  const Icon = TOPIC_ICONS[id] ?? BookOpenIcon;

  return (
    <article
      id={id}
      className="scroll-mt-24 rounded-2xl border border-border/70 bg-muted/15 px-4 py-4 sm:px-5 sm:py-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground ring-1 ring-border/60">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-base font-medium tracking-tight text-foreground">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {summary}
            </p>
          </div>
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <HelpBlock key={`${id}-${index}`} block={block} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export function HelpSettingsSection() {
  const { openOnboarding } = useAppShell();

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title={HELP_GUIDE_INTRO.title}
        description={HELP_GUIDE_INTRO.lead}
        icon={BookOpenIcon}
      >
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
          <p className="text-sm leading-7 text-muted-foreground">
            {HELP_GUIDE_INTRO.note}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={openOnboarding}
            >
              <RocketIcon className="size-3.5" />
              نمایش تور شروع
            </Button>
          </div>
        </div>
      </SettingsSection>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">فهرست مطالب</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            روی هر بخش بزنید تا مستقیم به همان قسمت بروید.
          </p>
        </div>
        <nav
          aria-label="فهرست راهنما"
          className="flex flex-wrap gap-2"
        >
          {HELP_TOPICS.map((topic) => (
            <a
              key={topic.id}
              href={`#${topic.id}`}
              className={cn(
                "rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground/85 transition-colors",
                "hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
              )}
            >
              {topic.title}
            </a>
          ))}
        </nav>
      </section>

      <section className="flex flex-col gap-4">
        {HELP_TOPICS.map((topic) => (
          <HelpTopicCard key={topic.id} {...topic} />
        ))}
      </section>

      <p className="pb-2 text-center text-xs leading-6 text-muted-foreground">
        {APP_NAME_FA} — راهنما همیشه از تنظیمات → راهنما در دسترس است.
      </p>
    </div>
  );
}
