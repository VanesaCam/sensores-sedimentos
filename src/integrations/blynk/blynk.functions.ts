import { createServerFn } from "@tanstack/react-start";

export type BlynkReading = {
  v1_agua: number;
  v2_sedimento: number;
  v3_estado: string;
  ok: boolean;
  error: string | null;
  timestamp: number;
};

const BLYNK_BASE = "https://blynk.cloud/external/api";

async function readPin(token: string, pin: string): Promise<string> {
  const url = `${BLYNK_BASE}/get?token=${encodeURIComponent(token)}&${pin}`;
  const res = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!res.ok) throw new Error(`Blynk ${pin} HTTP ${res.status}`);
  return (await res.text()).trim();
}

export const getBlynkReading = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlynkReading> => {
    const token = process.env.BLYNK_AUTH_TOKEN;
    const ts = Date.now();
    if (!token) {
      return {
        v1_agua: 0,
        v2_sedimento: 0,
        v3_estado: "SIN TOKEN",
        ok: false,
        error: "BLYNK_AUTH_TOKEN no configurado",
        timestamp: ts,
      };
    }
    try {
      const [v1, v2, v3] = await Promise.all([
        readPin(token, "V1"),
        readPin(token, "V2"),
        readPin(token, "V3"),
      ]);
      return {
        v1_agua: Number.parseFloat(v1) || 0,
        v2_sedimento: Number.parseFloat(v2) || 0,
        v3_estado: v3 || "OK",
        ok: true,
        error: null,
        timestamp: ts,
      };
    } catch (err) {
      return {
        v1_agua: 0,
        v2_sedimento: 0,
        v3_estado: "ERROR",
        ok: false,
        error: err instanceof Error ? err.message : "Error desconocido",
        timestamp: ts,
      };
    }
  },
);

// Sugerencia de mantenimiento predictivo basada en EAAB NS-085.
// Listo para sustituirse por Genkit / Lovable AI Gateway.
export const getMaintenanceSuggestion = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { sensorId: string; v1_agua: number; v2_sedimento: number }) => data,
  )
  .handler(async ({ data }) => {
    const { sensorId, v1_agua, v2_sedimento } = data;
    const reglas: string[] = [];
    let prioridad: "baja" | "media" | "alta" | "critica" = "baja";

    if (v1_agua >= 60) {
      prioridad = "critica";
      reglas.push(
        "Nivel de agua >= 60 cm: riesgo inminente de inundación según NS-085 EAAB. Despachar cuadrilla de succión en menos de 2 horas.",
      );
    } else if (v1_agua >= 40) {
      prioridad = "alta";
      reglas.push(
        "Nivel de agua entre 40-60 cm: capacidad hidráulica reducida. Programar limpieza preventiva en 24 h.",
      );
    } else if (v1_agua >= 20) {
      prioridad = prioridad === "baja" ? "media" : prioridad;
      reglas.push("Flujo elevado pero estable. Continuar monitoreo cada 5 min.");
    }

    if (v2_sedimento >= 15) {
      prioridad = "critica";
      reglas.push(
        "Sedimento >= 15 cm: obstrucción detectada. Activar protocolo de hidrosuccionador (NS-085, sección 4.3).",
      );
    } else if (v2_sedimento >= 10) {
      prioridad = prioridad === "baja" || prioridad === "media" ? "alta" : prioridad;
      reglas.push("Acumulación de sedimentos creciente. Inspección visual recomendada.");
    }

    if (reglas.length === 0) {
      reglas.push("Operación dentro de parámetros nominales. Sin acción requerida.");
    }

    return {
      sensorId,
      prioridad,
      norma: "EAAB NS-085",
      generado: new Date().toISOString(),
      recomendaciones: reglas,
    };
  });
