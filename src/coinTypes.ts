export type CoinAnalysis = {
  tipo_pieza: "moneda";
  pais: string;
  denominacion: string;
  anio: string;
  ceca: string;
  metal: string;
  tirada_estimada: string;
  rareza: "Muy común" | "Común" | "Escasa" | "Rara" | "Muy rara";
  tipo_canto: string;
  especificaciones: {
    peso_g: string;
    diametro_mm: string;
    grosor_mm: string;
  };
  grado_estimado: "SC" | "EBC" | "MBC" | "BC";
  precios_por_grado: {
    SC: [number, number];
    EBC: [number, number];
    MBC: [number, number];
    BC: [number, number];
  };
  rotacion_anverso?: number;
  rotacion_reverso?: number;
  explicacion: string;
};
