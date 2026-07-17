"use client";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Spinner } from "@/components/ui/spinner";
import {
  WORKSPACE_MENTION,
  type ComposerAttachment,
} from "@/lib/chat/composer-context";
import { classifyFile, fileExtension, type FileCategory } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import {
  FileCodeIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  ImageIcon,
  LayersIcon,
  TableIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";

type ComposerContextChipsProps = {
  /** Files uploaded via the composer's attach button. */
  attachments?: ComposerAttachment[];
  onRemoveAttachment?: (id: string) => void;
  /** Typed `@path` references parsed from the message text. */
  mentions?: string[];
  onRemoveMention?: (mention: string) => void;
  /** Show a transient uploading card while files are being imported. */
  isImporting?: boolean;
  className?: string;
};

function categoryLabel(category: FileCategory, path: string): string {
  const ext = fileExtension(path);
  switch (category) {
    case "markdown":
      return "Markdown";
    case "code":
      return ext.toUpperCase() || "Code";
    case "csv":
      return "CSV";
    case "json":
      return "JSON";
    case "image":
      return ext.toUpperCase() || "Image";
    case "binary":
      return ext.toUpperCase() || "File";
    default:
      return "Text";
  }
}

function iconForCategory(category: FileCategory): LucideIcon {
  switch (category) {
    case "code":
      return FileCodeIcon;
    case "csv":
      return TableIcon;
    case "json":
      return FileJsonIcon;
    case "image":
      return ImageIcon;
    case "markdown":
    case "text":
      return FileTextIcon;
    default:
      return FileIcon;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString("fa-IR")} بایت`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toLocaleString("fa-IR", {
      maximumFractionDigits: 1,
    })} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fa-IR", {
    maximumFractionDigits: 1,
  })} مگابایت`;
}

function mentionLabel(mention: string): string {
  if (mention === WORKSPACE_MENTION) return "کل فضای کاری";
  return mention.split("/").filter(Boolean).at(-1) ?? mention;
}

function mentionDescription(mention: string): string {
  if (mention === WORKSPACE_MENTION) return "زمینهٔ پروژه";
  const category = classifyFile(mention);
  const typeLabel = categoryLabel(category, mention);
  return mention.includes("/") ? `${typeLabel} · ${mention}` : typeLabel;
}

function iconForMention(mention: string): LucideIcon {
  if (mention === WORKSPACE_MENTION) return LayersIcon;
  return iconForCategory(classifyFile(mention));
}

export function ComposerContextChips({
  attachments = [],
  onRemoveAttachment,
  mentions = [],
  onRemoveMention,
  isImporting = false,
  className,
}: ComposerContextChipsProps) {
  if (attachments.length === 0 && mentions.length === 0 && !isImporting)
    return null;

  return (
    <AttachmentGroup
      dir="rtl"
      className={cn("w-full px-2 pt-2", className)}
      role="group"
      aria-label="پیوست‌ها و زمینه‌ها"
    >
      {isImporting ? (
        <Attachment state="uploading" size="sm" className="min-w-44">
          <AttachmentMedia>
            <Spinner />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>در حال افزودن فایل…</AttachmentTitle>
            <AttachmentDescription>بارگذاری به فضای کاری</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      ) : null}

      {attachments.map((attachment) => {
        const Icon = iconForCategory(attachment.category);
        return (
          <Attachment
            key={attachment.id}
            size="sm"
            state="done"
            className="min-w-40 max-w-64"
            title={attachment.name}
          >
            <AttachmentMedia>
              {attachment.category === "image" && attachment.dataUrl ? (
                <img
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  className="size-full rounded-[inherit] object-cover"
                />
              ) : (
                <Icon />
              )}
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{attachment.name}</AttachmentTitle>
              <AttachmentDescription>
                {`${categoryLabel(attachment.category, attachment.name)} · ${formatSize(
                  attachment.sizeBytes
                )}`}
              </AttachmentDescription>
            </AttachmentContent>
            {onRemoveAttachment ? (
              <AttachmentActions>
                <AttachmentAction
                  type="button"
                  aria-label={`حذف ${attachment.name}`}
                  onClick={() => onRemoveAttachment(attachment.id)}
                >
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            ) : null}
          </Attachment>
        );
      })}

      {mentions.map((mention) => {
        const Icon = iconForMention(mention);
        const label = mentionLabel(mention);
        return (
          <Attachment
            key={mention}
            size="sm"
            state="done"
            className="min-w-40 max-w-64"
            title={mention}
          >
            <AttachmentMedia>
              <Icon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{label}</AttachmentTitle>
              <AttachmentDescription>
                {mentionDescription(mention)}
              </AttachmentDescription>
            </AttachmentContent>
            {onRemoveMention ? (
              <AttachmentActions>
                <AttachmentAction
                  type="button"
                  aria-label={`حذف ${label}`}
                  onClick={() => onRemoveMention(mention)}
                >
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            ) : null}
          </Attachment>
        );
      })}
    </AttachmentGroup>
  );
}
