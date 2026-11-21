
export const CATEGORIES = ["Coleccionismo", "Electrónica", "Ropa", "Hogar", "Juguetes", "Otros"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Demand = "Alta" | "Media" | "Baja";

export type Analysis = {
  nombre: string;
  marca: string;
  modelo_edicion: string;
  estado: string;
  categoria: Category;
  precio_nuevo: number;
  ver: number;
  demanda: Demand;
  explicacion: string;
};

export type StampAnalysis = {
  tipo_pieza: "sello";
  pais: string;
  serie_tematica: string;
  anio: string;
  valor_facial: string;
  color_impresion: string;
  numero_catalogo: string;
  rareza: "Muy común" | "Común" | "Escaso" | "Raro" | "Muy raro";
  evaluacion_dentado: string;
  estado_estimado: "MNH (**)" | "MH (*)" | "Sin goma" | "Usado (O)";
  precios_por_estado: {
    "MNH (**)": [number, number];
    "MH (*)": [number, number];
    "Sin goma": [number, number];
    "Usado (O)": [number, number];
  };
  explicacion: string;
};

export type CardAnalysis = {
  tipo_pieza: "carta";
  juego_o_coleccion: string;
  nombre_carta: string;
  expansion_set: string;
  numero_carta: string;
  idioma: string;
  rareza: string;
  autenticidad: "Original aparente" | "Posible réplica / Proxy" | "No determinable";
  estado_estimado: "Near Mint (NM)" | "Excellent (EX)" | "Good (GD)" | "Played (PL)";
  precios_por_estado: {
    "Near Mint (NM)": [number, number];
    "Excellent (EX)": [number, number];
    "Good (GD)": [number, number];
    "Played (PL)": [number, number];
  };
  explicacion: string;
};

export type GeneratedListing = {
  titulo: string;
  descripcion: string;
  plataforma_sugerida: string;
};
