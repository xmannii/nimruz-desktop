export function shouldExpandComposer(
  el: HTMLTextAreaElement,
  value: string,
  currentlyExpanded: boolean,
  collapsedWidth: number | null
) {
  if (!value) return false;

  const previousHeight = el.style.height;
  const previousWidth = el.style.width;
  const previousFlex = el.style.flex;
  const measurementWidth =
    currentlyExpanded && collapsedWidth
      ? collapsedWidth
      : el.getBoundingClientRect().width;

  el.style.flex = "none";
  el.style.width = `${measurementWidth}px`;
  el.style.height = "auto";

  const styles = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 28;
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) +
    Number.parseFloat(styles.paddingBottom);
  const contentHeight = el.scrollHeight;

  el.style.height = previousHeight;
  el.style.width = previousWidth;
  el.style.flex = previousFlex;

  return contentHeight > Math.ceil(lineHeight + verticalPadding) + 1;
}

/**
 * Files pasted into the composer (e.g. screenshots). Returns an empty list when
 * the clipboard also carries plain text, so regular text pastes stay untouched.
 * Clipboard images arrive as a generic "image.png"; give them a dated name.
 */
export function getPastedFiles(
  clipboard: Pick<DataTransfer, "files" | "getData">,
  now = new Date()
): File[] {
  const files = Array.from(clipboard.files ?? []);
  if (files.length === 0 || clipboard.getData("text/plain")) return [];

  const stamp = now
    .toISOString()
    .replace(/\.\d+Z$/, "")
    .replace(/[-:]/g, "")
    .replace("T", "-");

  return files.map((file, index) => {
    if (!file.type.startsWith("image/") || !/^image\.\w+$/i.test(file.name)) {
      return file;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const suffix = files.length > 1 ? `-${index + 1}` : "";
    return new File([file], `pasted-image-${stamp}${suffix}.${extension}`, {
      type: file.type,
      lastModified: file.lastModified,
    });
  });
}
