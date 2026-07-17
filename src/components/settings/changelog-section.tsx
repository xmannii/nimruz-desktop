"use client";

import { ChangelogEntryCard } from "@/components/changelog-entry-card";
import { SettingsSection } from "@/components/settings/settings-section";
import { getAppChangelog } from "@/lib/app-changelog";
import { ScrollTextIcon } from "lucide-react";
import { useMemo } from "react";

export function ChangelogSettingsSection() {
  const entries = useMemo(() => getAppChangelog(), []);

  return (
    <SettingsSection
      title="تغییرات نسخه‌ها"
      description="هر آپدیت چی آورده — بدون اصطلاحات فنی."
      icon={ScrollTextIcon}
    >
      {entries.length > 0 ? (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <ChangelogEntryCard key={entry.version} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          هنوز یادداشت انتشاری ثبت نشده است.
        </p>
      )}
    </SettingsSection>
  );
}
