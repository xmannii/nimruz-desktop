import assert from "node:assert/strict";
import test from "node:test";
import { placeTourCard } from "./tour";

const viewport = { width: 1200, height: 800 };
const card = { width: 320, height: 180 };

test("uses the preferred side when it fits", () => {
  const composer = { top: 650, left: 300, width: 600, height: 110 };
  const placed = placeTourCard(composer, card, viewport, "top");
  assert.equal(placed.side, "top");
  assert.equal(placed.top, 650 - 12 - 180);
  assert.equal(placed.left, 300 + 300 - 160);
});

test("flips to the opposite side when the preferred one is too tight", () => {
  const headerButton = { top: 8, left: 40, width: 32, height: 32 };
  const placed = placeTourCard(headerButton, card, viewport, "top");
  assert.equal(placed.side, "bottom");
  assert.equal(placed.top, 8 + 32 + 12);
});

test("keeps the card inside the viewport", () => {
  const nearEdge = { top: 8, left: 4, width: 32, height: 32 };
  const placed = placeTourCard(nearEdge, card, viewport, "bottom");
  assert.equal(placed.left, 12);
});

test("falls back to the side with most room", () => {
  // A tall sidebar on the right: no room above or below, plenty to the left.
  const sidebar = { top: 10, left: 900, width: 280, height: 780 };
  const placed = placeTourCard(sidebar, card, viewport, "top");
  assert.equal(placed.side, "left");
  assert.equal(placed.left, 900 - 12 - 320);
});
