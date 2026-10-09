export type TourSide = "top" | "bottom" | "left" | "right";

export type TourRect = { top: number; left: number; width: number; height: number };

export type TourPlacement = { top: number; left: number; side: TourSide };

const OPPOSITE: Record<TourSide, TourSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/**
 * Places the tour card beside a highlighted element: the preferred side
 * first, then the opposite side, then whichever side has the most room.
 * The result is clamped so the card always stays inside the viewport.
 */
export function placeTourCard(
  target: TourRect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  preferred: TourSide,
  { gap = 12, margin = 12 }: { gap?: number; margin?: number } = {}
): TourPlacement {
  const room: Record<TourSide, number> = {
    top: target.top - margin,
    bottom: viewport.height - (target.top + target.height) - margin,
    left: target.left - margin,
    right: viewport.width - (target.left + target.width) - margin,
  };
  const needs = (side: TourSide) =>
    (side === "top" || side === "bottom" ? card.height : card.width) + gap;

  const order: TourSide[] = [preferred, OPPOSITE[preferred]];
  const side =
    order.find((candidate) => room[candidate] >= needs(candidate)) ??
    (Object.keys(room) as TourSide[]).reduce((best, candidate) =>
      room[candidate] - needs(candidate) > room[best] - needs(best) ? candidate : best
    );

  let top: number;
  let left: number;
  if (side === "top" || side === "bottom") {
    top = side === "top" ? target.top - gap - card.height : target.top + target.height + gap;
    left = target.left + target.width / 2 - card.width / 2;
  } else {
    left = side === "left" ? target.left - gap - card.width : target.left + target.width + gap;
    top = target.top + target.height / 2 - card.height / 2;
  }

  return {
    side,
    top: clamp(top, margin, viewport.height - card.height - margin),
    left: clamp(left, margin, viewport.width - card.width - margin),
  };
}

function clamp(value: number, min: number, max: number) {
  return max < min ? min : Math.min(Math.max(value, min), max);
}
