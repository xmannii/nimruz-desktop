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
