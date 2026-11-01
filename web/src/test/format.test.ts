import { describe, expect, it } from "vitest";
import {
  clientName,
  commodityLabel,
  fmtDate,
  fmtDateTime,
  fmtSize,
  humanize,
  pct,
  priceStatusLabel,
  signedAmount,
  toLocalInput,
  usd,
  userStatusLabel,
} from "@/lib/format";

describe("format helpers", () => {
  it("renders USD amounts with two decimals by default", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
  });

  it("renders compact USD amounts without decimals", () => {
    expect(usd(1234.5, 0)).toBe("$1,235");
  });

  it("renders a dash for missing money values", () => {
    expect(usd(null)).toBe("—");
    expect(usd(undefined, 0)).toBe("—");
  });

  it("formats percentages", () => {
    expect(pct(3.375)).toBe("3.38%");
    expect(pct(3.375, 3)).toBe("3.375%");
    expect(pct(null)).toBe("—");
  });

  it("formats dates and rejects invalid input", () => {
    expect(fmtDate("2026-10-31T00:00:00.000Z")).toBe("31 Oct 2026");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
  });

  it("formats date-times and rejects invalid input", () => {
    expect(fmtDateTime("2026-10-31T12:30:00.000Z")).toContain("2026");
    expect(fmtDateTime(null)).toBe("—");
    expect(fmtDateTime("nope")).toBe("—");
  });

  it("converts ISO timestamps to datetime-local values", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("nope")).toBe("");
    expect(toLocalInput("2026-10-31T12:30:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("formats file sizes", () => {
    expect(fmtSize(900)).toBe("1 KB");
    expect(fmtSize(1_500_000)).toBe("1.5 MB");
  });

  it("signs transaction amounts", () => {
    expect(signedAmount("WITHDRAWAL", 100)).toBe("−$100.00");
    expect(signedAmount("DEPOSIT", 100)).toBe("+$100.00");
    expect(signedAmount("INTEREST", 100)).toBe("+$100.00");
  });

  it("exposes enum labels", () => {
    expect(priceStatusLabel.MANUAL_OVERRIDE).toBe("Manual override");
    expect(commodityLabel.GOLD).toBe("Gold");
    expect(userStatusLabel.DISABLED).toBe("Disabled");
  });

  it("humanises audit actions", () => {
    expect(humanize("PRICE_OVERRIDDEN")).toBe("Price overridden");
    expect(humanize("SINGLE")).toBe("Single");
  });

  it("joins client names and handles missing users", () => {
    expect(clientName({ firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace");
    expect(clientName(null)).toBe("—");
  });
});
