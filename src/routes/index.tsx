import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Activity,
  Droplets,
  Layers,
  Radio,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import {
  getBlynkReading,
  getMaintenanceSuggestion,
  type BlynkReading,
} from "@/integrations/blynk/blynk.functions";
import type { Locality } from "@/components/SewerMap";
import { LevelGauge } from "@/components/LevelGauge";

const SewerMap = lazy(() =>
  import("@/components/SewerMap").then((m) => ({ default: m.SewerMap })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AQUA-CTRL · Monitoreo de Alcantarillado Bogotá · NS-085 EAAB" },
      {
        name: "description",
        content:
          "Dashboard de monitoreo de alcantarillado en tiempo real para Bogotá basado en Blynk IoT y la Norma Técnica NS-085 de la EAAB. Universidad Central.",
      },
    ],
  }),
  component: Dashboard,
});

const PROFUNDIDAD_TOTAL = 90; // cm de referencia (boca del pozo)
const UMBRAL_AGUA = 60;
const UMBRAL_SEDIMENTO = 15;

const ESTUDIANTES = [
  { id: "S-01", responsable: "Rodriguez", localidad: "Chapinero", lat: 4.6533, lng: -74.0636 },
  { id: "S-02", responsable: "Garcia", localidad: "Suba", lat: 4.7569, lng: -74.0934 },
  { id: "S-03", responsable: "Caminos", localidad: "Kennedy", lat: 4.6286, lng: -74.1611 },
  { id: "S-04", responsable: "Lozano", localidad: "Usaquén", lat: 4.7036, lng: -74.0306 },
  { id: "S-05", responsable: "Bustos", localidad: "Engativá", lat: 4.7106, lng: -74.1147 },
] as const;

type HistoryEntry = BlynkReading & { id: number };

function Dashboard() {
  const fetchReading = useServerFn(getBlynkReading);
  const suggest = useServerFn(getMaintenanceSuggestion);

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["blynk-reading"],
    queryFn: () => fetchReading(),
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  });

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedSensor, setSelectedSensor] = useState<string>(ESTUDIANTES[0].id);
  const [alertFlash, setAlertFlash] = useState(false);

  // Acumular histórico
  useEffect(() => {
    if (!data || !data.ok) return;
    setHistory((prev) => [{ ...data, id: data.timestamp }, ...prev].slice(0, 30));
  }, [data]);

  // Detección de obstrucción súbita: salto >= 8 cm en sedimento entre 2 lecturas
  useEffect(() => {
    if (history.length < 2) return;
    const [a, b] = history;
    if (a.v2_sedimento - b.v2_sedimento >= 8) {
      setAlertFlash(true);
      const t = setTimeout(() => setAlertFlash(false), 8000);
      return () => clearTimeout(t);
    }
  }, [history]);

  const reading: BlynkReading =
    data ?? {
      v1_agua: 0,
      v2_sedimento: 0,
      v3_estado: "—",
      ok: false,
      error: null,
      timestamp: Date.now(),
    };

  // Replicar la lectura de Blynk a los 5 sensores con pequeñas variaciones
  // (en producción cada sensor tendría su propio token / device).
  const localities: Locality[] = useMemo(() => {
    return ESTUDIANTES.map((s, i) => {
      const jitter = (i - 2) * 1.5;
      const v1 = Math.max(0, reading.v1_agua + jitter);
      const v2 = Math.max(0, reading.v2_sedimento + jitter * 0.3);
      const estado = v1 >= UMBRAL_AGUA || v2 >= UMBRAL_SEDIMENTO ? "ALERTA" : "OK";
      return { ...s, v1_agua: v1, v2_sedimento: v2, estado };
    });
  }, [reading]);

  const criticos = localities.filter(
    (l) => l.v1_agua >= UMBRAL_AGUA || l.v2_sedimento >= UMBRAL_SEDIMENTO,
  ).length;

  const distanciaSensor = Math.max(0, PROFUNDIDAD_TOTAL - reading.v1_agua);

  const aiMutation = useMutation({
    mutationFn: async () =>
      suggest({
        data: {
          sensorId: selectedSensor,
          v1_agua: reading.v1_agua,
          v2_sedimento: reading.v2_sedimento,
        },
      }),
  });

  const updatedAgo = dataUpdatedAt
    ? Math.round((Date.now() - dataUpdatedAt) / 1000)
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/40 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Droplets className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                AQUA-CTRL <span className="text-muted-foreground font-normal">/ Bogotá</span>
              </h1>
              <p className="text-[11px] text-muted-foreground font-mono">
                Monitoreo de alcantarillado · NS-085 EAAB · Universidad Central
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusPill ok={reading.ok && !isError} loading={isLoading} ago={updatedAgo} />
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <Radio className="h-3.5 w-3.5" />
              Blynk Cloud · V1 / V2 / V3
            </div>
          </div>
        </div>
      </header>

      {/* Banner de alerta súbita */}
      {alertFlash && (
        <div className="bg-destructive text-destructive-foreground animate-flash-banner">
          <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm uppercase tracking-wide">
                Obstrucción súbita detectada
              </div>
              <div className="text-xs opacity-90">
                Variación crítica de sedimento entre lecturas consecutivas. Activar
                protocolo NS-085 §4.3 (hidrosuccionador).
              </div>
            </div>
            <button
              onClick={() => setAlertFlash(false)}
              className="text-xs underline opacity-80 hover:opacity-100"
            >
              Reconocer
            </button>
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI
            icon={<Droplets className="h-4 w-4" />}
            label="Nivel de agua (V1)"
            value={`${reading.v1_agua.toFixed(1)} cm`}
            sub={`Distancia sensor: ${distanciaSensor.toFixed(1)} cm`}
            tone={reading.v1_agua >= UMBRAL_AGUA ? "crit" : reading.v1_agua >= 40 ? "warn" : "ok"}
          />
          <KPI
            icon={<Layers className="h-4 w-4" />}
            label="Sedimento (V2)"
            value={`${reading.v2_sedimento.toFixed(1)} cm`}
            sub={`Umbral crítico: ${UMBRAL_SEDIMENTO} cm`}
            tone={
              reading.v2_sedimento >= UMBRAL_SEDIMENTO
                ? "crit"
                : reading.v2_sedimento >= 10
                  ? "warn"
                  : "ok"
            }
          />
          <KPI
            icon={<Activity className="h-4 w-4" />}
            label="Estado (V3)"
            value={reading.v3_estado || "—"}
            sub={reading.ok ? "Stream Blynk activo" : reading.error ?? "Sin datos"}
            tone={reading.ok ? "ok" : "crit"}
          />
          <KPI
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Sensores en alerta"
            value={`${criticos} / ${localities.length}`}
            sub="Localidades críticas"
            tone={criticos > 0 ? "crit" : "ok"}
          />
        </section>

        {/* Mapa + niveles */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Panel
              title="Red de pozos · Bogotá D.C."
              subtitle="Marcadores rojos = sedimento ≥ 15 cm o agua ≥ 60 cm"
            >
              <div className="h-[460px]">
                <ClientOnly fallback={<MapSkeleton />}>
                  <Suspense fallback={<MapSkeleton />}>
                    <SewerMap localities={localities} />
                  </Suspense>
                </ClientOnly>
              </div>
              <Legend />
            </Panel>
          </div>
          <div className="space-y-4">
            <Panel title="Profundidad (referencia 90 cm)">
              <div className="space-y-3">
                <LevelGauge
                  label="Nivel de agua"
                  value={reading.v1_agua}
                  max={PROFUNDIDAD_TOTAL}
                  thresholds={{ warn: 40, crit: UMBRAL_AGUA }}
                />
                <LevelGauge
                  label="Sedimento"
                  value={reading.v2_sedimento}
                  max={30}
                  thresholds={{ warn: 10, crit: UMBRAL_SEDIMENTO }}
                />
                <LevelGauge
                  label="Distancia HC-SR04"
                  value={distanciaSensor}
                  max={PROFUNDIDAD_TOTAL}
                />
              </div>
            </Panel>
          </div>
        </section>

        {/* IA + tabla */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Panel
              title="Histórico reciente"
              subtitle="Stream Blynk · refresco automático cada 5 s"
            >
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="px-2 py-2 font-medium">Hora</th>
                      <th className="px-2 py-2 font-medium">V1 Agua</th>
                      <th className="px-2 py-2 font-medium">V2 Sedimento</th>
                      <th className="px-2 py-2 font-medium">V3 Estado</th>
                      <th className="px-2 py-2 font-medium text-right">Eval.</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                          Esperando primera lectura de Blynk…
                        </td>
                      </tr>
                    )}
                    {history.map((h) => {
                      const crit = h.v1_agua >= UMBRAL_AGUA || h.v2_sedimento >= UMBRAL_SEDIMENTO;
                      return (
                        <tr key={h.id} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-2 text-muted-foreground">
                            {new Date(h.timestamp).toLocaleTimeString("es-CO")}
                          </td>
                          <td className="px-2 py-2">{h.v1_agua.toFixed(1)} cm</td>
                          <td className="px-2 py-2">{h.v2_sedimento.toFixed(1)} cm</td>
                          <td className="px-2 py-2 truncate max-w-[140px]">{h.v3_estado}</td>
                          <td className="px-2 py-2 text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                                crit
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-success/15 text-success"
                              }`}
                            >
                              {crit ? "ALERTA" : "OK"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div>
            <Panel
              title="Mantenimiento predictivo IA"
              subtitle="Middleware listo para Genkit / Lovable AI"
              icon={<Cpu className="h-4 w-4 text-primary" />}
            >
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Sensor objetivo
              </label>
              <select
                value={selectedSensor}
                onChange={(e) => setSelectedSensor(e.target.value)}
                className="mt-1 w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {ESTUDIANTES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.localidad} ({s.responsable})
                  </option>
                ))}
              </select>
              <button
                onClick={() => aiMutation.mutate()}
                disabled={aiMutation.isPending}
                className="mt-3 w-full bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {aiMutation.isPending ? "Analizando…" : "Generar sugerencia"}
              </button>

              {aiMutation.data && (
                <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-muted-foreground">{aiMutation.data.norma}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        aiMutation.data.prioridad === "critica"
                          ? "bg-destructive text-destructive-foreground"
                          : aiMutation.data.prioridad === "alta"
                            ? "bg-warning text-warning-foreground"
                            : "bg-success/20 text-success"
                      }`}
                    >
                      {aiMutation.data.prioridad}
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-xs leading-relaxed">
                    {aiMutation.data.recomendaciones.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>
        </section>

        <footer className="pt-4 pb-8 border-t border-border text-[11px] text-muted-foreground font-mono flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>
            Equipo: Rodriguez · Garcia · Caminos · Lozano · Bustos · Universidad Central
          </span>
          <span>
            Endpoint respaldo: <code className="text-foreground">POST /api/sensor-data</code>
          </span>
        </footer>
      </main>
    </div>
  );
}

function StatusPill({
  ok,
  loading,
  ago,
}: {
  ok: boolean;
  loading: boolean;
  ago: number;
}) {
  const color = loading
    ? "bg-muted-foreground"
    : ok
      ? "bg-success"
      : "bg-destructive";
  const label = loading ? "Conectando…" : ok ? "EN LÍNEA" : "SIN ENLACE";
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border">
      <span className={`h-2 w-2 rounded-full ${color} ${ok ? "animate-pulse" : ""}`} />
      <span className="text-[11px] font-mono uppercase tracking-wider">{label}</span>
      {ok && <span className="text-[10px] text-muted-foreground font-mono">·{ago}s</span>}
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "warn" | "crit";
}) {
  const ring =
    tone === "crit"
      ? "border-destructive/40"
      : tone === "warn"
        ? "border-warning/40"
        : "border-border";
  const dot =
    tone === "crit" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-primary";
  return (
    <div className={`rounded-lg border ${ring} bg-card p-4`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        <span className={dot}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold font-mono">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function ClientOnly({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

function MapSkeleton() {
  return (
    <div className="h-full w-full rounded-lg border border-border bg-secondary/30 flex items-center justify-center text-xs text-muted-foreground font-mono">
      Cargando mapa…
    </div>
  );
}

function Legend() {
  const items = [
    { color: "var(--color-success)", label: "Normal (< 40 cm)" },
    { color: "var(--color-warning)", label: "Atención (40–60 cm)" },
    { color: "var(--color-destructive)", label: "Crítico (≥ 60 cm o sed. ≥ 15 cm)" },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground font-mono">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: i.color }}
          />
          {i.label}
        </div>
      ))}
    </div>
  );
}
