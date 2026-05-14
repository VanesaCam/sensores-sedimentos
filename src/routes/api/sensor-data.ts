import { createFileRoute } from "@tanstack/react-router";

type SensorPayload = {
  sensorId: string;
  distancia: number;
  tipo: "agua" | "sedimento";
};

// Buffer en memoria — endpoint de respaldo para pruebas directas.
// En Cloudflare Workers no persiste entre invocaciones; aceptable para QA.
const buffer: Array<SensorPayload & { at: number; nivel: number }> = [];
const REFERENCIA_CM = 90;

export const Route = createFileRoute("/api/sensor-data")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Partial<SensorPayload>;
          if (
            typeof body.sensorId !== "string" ||
            typeof body.distancia !== "number" ||
            (body.tipo !== "agua" && body.tipo !== "sedimento")
          ) {
            return Response.json(
              { ok: false, error: "Payload inválido" },
              { status: 400 },
            );
          }
          const nivel = Math.max(0, REFERENCIA_CM - body.distancia);
          const entry = {
            sensorId: body.sensorId,
            distancia: body.distancia,
            tipo: body.tipo,
            nivel,
            at: Date.now(),
          };
          buffer.unshift(entry);
          if (buffer.length > 50) buffer.length = 50;
          return Response.json({ ok: true, entry });
        } catch (err) {
          return Response.json(
            {
              ok: false,
              error: err instanceof Error ? err.message : "Error",
            },
            { status: 500 },
          );
        }
      },
      GET: async () => Response.json({ ok: true, entries: buffer }),
    },
  },
});
