import { storage } from "@/src/utils/storage";

export const AI_KEY = "groq_api_key";
export const MIN_PROFIT_KEY = "min_profit_green";
export const DEFAULT_MIN_PROFIT = 15;

export async function loadMinProfit(): Promise<number> {
  const v = await storage.getItem(MIN_PROFIT_KEY, DEFAULT_MIN_PROFIT);
  return typeof v === "number" ? v : DEFAULT_MIN_PROFIT;
}

export async function loadAiKey(): Promise<string> {
  const v = await storage.secureGet(AI_KEY, "");
  return typeof v === "string" ? v : "";
}
