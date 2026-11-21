import type { CoinAnalysis } from "./coinTypes";

export type CoinValidationIssue = {
  code: string;
  message: string;
  severity: "warning" | "blocking";
};

export type CoinValidation = {
  status: "CONFIRMADA" | "DUDOSA";
  issues: CoinValidationIssue[];
  confidenceScore: number;
};

/** Checks completeness and internal consistency only; it does not prove identity. */
export function validateCoinAnalysis(
  coin: CoinAnalysis,
  gradeWasFallback = false
): CoinValidation {
  const issues: CoinValidationIssue[] = [];

  const unknown = (v: string | undefined) =>
    !v ||
    /^(desconocido|no disponible|no identificad[oa]|s\/f|[-]|no apreciable|sin marca visible)$/i.test(
      v.trim()
    );

  if (gradeWasFallback) {
    issues.push({
      code: "GRADE_NOT_CONFIRMED",
      message:
        "El grado de conservación no fue confirmado por la IA; se muestra BC como valor conservador provisional.",
      severity: "warning",
    });
  }

  if (unknown(coin.pais)) {
    issues.push({
      code: "COUNTRY_MISSING",
      message: "País no identificado con suficiente evidencia.",
      severity: "warning",
    });
  }

  if (unknown(coin.denominacion)) {
    issues.push({
      code: "DENOMINATION_MISSING",
      message: "Denominación no confirmada.",
      severity: "blocking",
    });
  }

  if (unknown(coin.anio) || !/^\d{4}$/.test(coin.anio.trim())) {
    issues.push({
      code: "YEAR_UNCONFIRMED",
      message: "El año no está confirmado como un año de cuatro cifras.",
      severity: "warning",
    });
  }

  if (unknown(coin.ceca)) {
    issues.push({
      code: "MINT_MISSING",
      message: "Ceca no identificada; no debe inferirse.",
      severity: "warning",
    });
  }

  if (unknown(coin.tipo_canto)) {
    issues.push({
      code: "EDGE_MISSING",
      message: "El canto no se ha podido evaluar.",
      severity: "warning",
    });
  }

  for (const [field, value] of Object.entries(
    coin.especificaciones ?? {}
  )) {
    if (unknown(value)) {
      issues.push({
        code: `SPEC_${field.toUpperCase()}_MISSING`,
        message: `Especificación ${field} no confirmada.`,
        severity: "warning",
      });
    }
  }

  for (const grade of ["SC", "EBC", "MBC", "BC"] as const) {
    const range = coin.precios_por_grado?.[grade];

    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      !range.every((n) => Number.isFinite(n) && n >= 0) ||
      range[1] < range[0]
    ) {
      issues.push({
        code: `PRICE_${grade}_INVALID`,
        message: `Rango de precio ${grade} inválido.`,
        severity: "warning",
      });
    }
  }

  if (unknown(coin.explicacion)) {
    issues.push({
      code: "RATIONALE_MISSING",
      message: "Falta una explicación de las evidencias observadas.",
      severity: "warning",
    });
  }

  const blocking = issues.some(
    (i) => i.severity === "blocking"
  );

  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        issues.reduce(
          (sum, i) =>
            sum + (i.severity === "blocking" ? 30 : 12),
          0
        )
    )
  );

  return {
    status: blocking || score < 70 ? "DUDOSA" : "CONFIRMADA",
    issues,
    confidenceScore: score,
  };
}
