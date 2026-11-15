import type { Analysis } from "@/src/ai";

export type Light = "green" | "amber" | "red";

export type Verdict = {
  light: Light;
  profit: number;
  maxPay: number;
  assumedPrice: boolean;
};

const round = (n: number) => Math.round(n * 100) / 100;

// asking: seller's price, or null when not entered (then we assume paying the recommended max, VER x 0.40).
export function computeVerdict(a: Analysis, asking: number | null, minProfit: number): Verdict {
  const ver = a.ver;
  const assumedPrice = asking === null;
  const price = asking ?? ver * 0.4;
  const profit = round(ver - price);
  const highRatio = !assumedPrice && price > 0 && ver >= 2.5 * price;
  const goodDemand = a.demanda === "Alta" || a.demanda === "Media";

  if (ver < 10 || profit < 5) return { light: "red", profit, maxPay: round(ver * 0.4), assumedPrice };
  if ((profit >= minProfit || highRatio) && goodDemand)
    return { light: "green", profit, maxPay: round(ver * 0.4), assumedPrice };
  return { light: "amber", profit, maxPay: round(ver * 0.45), assumedPrice };
}

export const euro = (n: number) =>
  `${n.toLocaleString("es-ES", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
