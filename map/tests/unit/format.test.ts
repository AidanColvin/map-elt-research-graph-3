import { describe, it, expect } from "vitest";
import { usd, pct, yoy, lastN, latest, valueFor } from "@/lib/format";
import type { YearValue } from "@/lib/types";

describe("usd", () => {
  it("formats trillions with 2 decimals", () => {
    expect(usd(1.24e12)).toBe("$1.24T");
  });

  it("formats billions with 1 decimal", () => {
    expect(usd(416.2e9)).toBe("$416.2B");
  });

  it("formats millions with 1 decimal", () => {
    expect(usd(5.3e6)).toBe("$5.3M");
  });

  it("formats thousands with 1 decimal", () => {
    expect(usd(1500)).toBe("$1.5K");
  });

  it("formats sub-thousand with no decimals", () => {
    expect(usd(950)).toBe("$950");
  });

  it("preserves a negative sign", () => {
    expect(usd(-2.5e9)).toBe("-$2.5B");
  });

  it("returns 'n/a' for null", () => {
    expect(usd(null)).toBe("n/a");
  });

  it("returns 'n/a' for undefined", () => {
    expect(usd(undefined)).toBe("n/a");
  });

  it("returns 'n/a' for NaN", () => {
    expect(usd(NaN)).toBe("n/a");
  });
});

describe("pct", () => {
  it("formats a fraction as a percent with 1 decimal by default", () => {
    expect(pct(0.469)).toBe("46.9%");
  });

  it("honors a custom digit count", () => {
    expect(pct(0.46912, 2)).toBe("46.91%");
  });

  it("returns 'n/a' for null/undefined/NaN", () => {
    expect(pct(null)).toBe("n/a");
    expect(pct(undefined)).toBe("n/a");
    expect(pct(NaN)).toBe("n/a");
  });
});

describe("yoy", () => {
  it("formats positive growth with a leading +", () => {
    expect(yoy(114, 100)).toBe("+14.0%");
  });

  it("formats a decline with a leading -", () => {
    expect(yoy(96.6, 100)).toBe("-3.4%");
  });

  it("normalizes by the absolute value of the prior period", () => {
    // (curr - prev) / |prev| with a negative base
    expect(yoy(-50, -100)).toBe("+50.0%");
  });

  it("returns 'n/a' when the prior value is zero", () => {
    expect(yoy(100, 0)).toBe("n/a");
  });
});

describe("lastN", () => {
  const series: YearValue[] = [
    { fy: 2020, val: 1 },
    { fy: 2021, val: 2 },
    { fy: 2022, val: 3 },
    { fy: 2023, val: 4 },
  ];

  it("returns the last n entries, oldest first", () => {
    expect(lastN(series, 2)).toEqual([
      { fy: 2022, val: 3 },
      { fy: 2023, val: 4 },
    ]);
  });

  it("returns the whole series when n exceeds its length", () => {
    expect(lastN(series, 10)).toEqual(series);
  });
});

describe("latest", () => {
  it("returns the most recent entry", () => {
    expect(
      latest([
        { fy: 2021, val: 5 },
        { fy: 2022, val: 9 },
      ]),
    ).toEqual({ fy: 2022, val: 9 });
  });

  it("returns undefined for an empty series", () => {
    expect(latest([])).toBeUndefined();
  });
});

describe("valueFor", () => {
  const series: YearValue[] = [
    { fy: 2021, val: 5 },
    { fy: 2022, val: 9 },
  ];

  it("returns the value for a present fiscal year", () => {
    expect(valueFor(series, 2022)).toBe(9);
  });

  it("returns undefined for an absent fiscal year", () => {
    expect(valueFor(series, 1999)).toBeUndefined();
  });
});
