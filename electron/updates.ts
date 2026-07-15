import { app, shell } from "electron";
import {
  APP_NAME,
  GITHUB_LATEST_RELEASE_API,
} from "@/lib/branding";
import {
  isNewerVersion,
  pickReleaseAsset,
  type ReleaseAsset,
  type UpdateCheckResult,
} from "@/lib/updates";

type GitHubReleaseResponse = {
  tag_name?: string;
  html_url?: string;
  body?: string | null;
  published_at?: string | null;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
};

function currentAppVersion(): string {
  return app.getVersion();
}

function mapAssets(
  assets: GitHubReleaseResponse["assets"]
): ReleaseAsset[] {
  if (!Array.isArray(assets)) return [];
  return assets.flatMap((asset) => {
    if (
      typeof asset?.name !== "string" ||
      typeof asset.browser_download_url !== "string"
    ) {
      return [];
    }
    return [
      {
        name: asset.name,
        browser_download_url: asset.browser_download_url,
      },
    ];
  });
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = currentAppVersion();

  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `${APP_NAME}-Desktop/${currentVersion}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      return {
        status: "error",
        currentVersion,
        message:
          response.status === 404
            ? "هنوز نسخه‌ای منتشر نشده است."
            : `بررسی به‌روزرسانی ناموفق بود (${response.status}).`,
      };
    }

    const release = (await response.json()) as GitHubReleaseResponse;
    const latestVersion = release.tag_name?.trim();
    const releaseUrl = release.html_url?.trim();

    if (!latestVersion || !releaseUrl) {
      return {
        status: "error",
        currentVersion,
        message: "اطلاعات نسخه از گیت‌هاب ناقص بود.",
      };
    }

    if (!isNewerVersion(latestVersion, currentVersion)) {
      return {
        status: "up-to-date",
        currentVersion,
        latestVersion: latestVersion.replace(/^v/i, ""),
      };
    }

    const asset = pickReleaseAsset(
      mapAssets(release.assets),
      process.platform,
      process.arch
    );

    const notes =
      typeof release.body === "string" && release.body.trim().length > 0
        ? release.body.trim()
        : null;

    return {
      status: "available",
      currentVersion,
      latestVersion: latestVersion.replace(/^v/i, ""),
      releaseUrl,
      downloadUrl: asset?.browser_download_url ?? null,
      releaseNotes: notes,
      publishedAt: release.published_at ?? null,
    };
  } catch {
    return {
      status: "error",
      currentVersion,
      message: "اتصال برای بررسی به‌روزرسانی برقرار نشد.",
    };
  }
}

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    throw new Error("Only http(s) URLs can be opened.");
  }
  await shell.openExternal(url);
  return true;
}

export function getAppVersion(): string {
  return currentAppVersion();
}
