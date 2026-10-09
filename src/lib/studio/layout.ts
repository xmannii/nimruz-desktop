export type JustifiedBox = { index: number; width: number; height: number };
export type JustifiedRow = { height: number; boxes: JustifiedBox[] };

/**
 * Packs items with known aspect ratios (width / height) into rows that
 * exactly fill `containerWidth`, like a photo gallery. Each row's height is
 * chosen so the images keep their own proportions; the final, unfilled row
 * keeps the target height instead of stretching a lone image huge.
 */
export function computeJustifiedRows(
  ratios: number[],
  containerWidth: number,
  options: { targetHeight: number; gap: number; maxHeight?: number }
): JustifiedRow[] {
  const { targetHeight, gap } = options;
  const maxHeight = options.maxHeight ?? targetHeight * 1.6;
  if (containerWidth <= 0 || ratios.length === 0) return [];

  const rows: JustifiedRow[] = [];
  let start = 0;
  while (start < ratios.length) {
    let end = start;
    let ratioSum = 0;
    // Grow the row until it would be wider than the container at target height.
    while (end < ratios.length) {
      const ratio = safeRatio(ratios[end]);
      const gaps = (end - start) * gap;
      if (end > start && (ratioSum + ratio) * targetHeight + gaps >= containerWidth) {
        // The next item overfills the row: keep it only if that lands nearer
        // the target height than leaving the row a little short.
        const without = (containerWidth - (gaps - gap)) / ratioSum;
        const withIt = (containerWidth - gaps) / (ratioSum + ratio);
        const keep = without > maxHeight || Math.abs(Math.log(withIt / targetHeight)) <= Math.abs(Math.log(without / targetHeight));
        if (keep) {
          ratioSum += ratio;
          end += 1;
        }
        break;
      }
      ratioSum += ratio;
      end += 1;
    }
    const count = end - start;
    const gaps = (count - 1) * gap;
    const fills = ratioSum * targetHeight + gaps >= containerWidth;
    const height = fills
      ? Math.min(maxHeight, (containerWidth - gaps) / ratioSum)
      : Math.min(targetHeight, (containerWidth - gaps) / ratioSum);
    const boxes: JustifiedBox[] = [];
    for (let index = start; index < end; index += 1) {
      boxes.push({ index, width: safeRatio(ratios[index]) * height, height });
    }
    rows.push({ height, boxes });
    start = end;
  }
  return rows;
}

/**
 * A row height that fits about `perRow` items of this media's typical shape
 * across the container, so a gallery scales with the window: two landscape
 * videos side by side, more when they are portrait (capped by `maxHeight`).
 *
 * With `byArea`, `perRow` counts square-equivalent tiles instead: every tile
 * gets about the area of a (width / perRow) square, so wide media sit fewer
 * per row and tall media more, rather than wide ones shrinking to fit.
 */
export function pickTargetHeight(
  ratios: number[],
  containerWidth: number,
  options: { perRow: number; gap: number; minHeight: number; maxHeight: number; byArea?: boolean }
): number {
  const { perRow, gap, minHeight, maxHeight, byArea } = options;
  const sorted = ratios.map(safeRatio).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
  const count = Math.max(1, perRow);
  const slot = (containerWidth - (count - 1) * gap) / count;
  const height = byArea ? slot / Math.sqrt(median) : slot / median;
  return Math.min(maxHeight, Math.max(minHeight, height));
}

function safeRatio(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.max(value, 0.25), 4) : 1;
}
