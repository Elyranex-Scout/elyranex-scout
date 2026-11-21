import type { CoinValidation } from "./coinValidator";

export type AnalysisConfidence = {
  status: "CONFIRMADA" | "DUDOSA";
  score: number;
  label: string;
  warnings: string[];
};

export function toAnalysisConfidence(
  validation: CoinValidation
): AnalysisConfidence {
  return {
    status: validation.status,
    score: validation.confidenceScore,
    label:
      validation.status === "CONFIRMADA"
        ? "Datos suficientemente completos"
        : "Identificación pendiente de confirmación",
    warnings: validation.issues.map((issue) => issue.message),
  };
}
