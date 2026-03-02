"use client";

import type { EChartsType } from "echarts";

import { useEffect, useMemo, useRef, useState } from "react";

type MetadataResponse = {
  geojsonUrl: string;
  filters: {
    ano_inicio: string[];
    categoria: string[];
    destinacao: string[];
    tipo_obra: string[];
  };
};

type MapResponse = {
  nameProperty: string;
  data: Array<{ name: string; count: number; area_total: number }>;
  totals: {
    total_obras: number;
    total_area_total: number;
  };
};

type MapTab = "obras" | "metragem";

type EChartsRegisterMapInput = Parameters<
  (typeof import("echarts"))["registerMap"]
>[1];

type GeoJSONFeature = {
  properties?: Record<string, unknown>;
  geometry?: unknown;
};

type GeoJSON = {
  features?: GeoJSONFeature[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function updateBoundsFromCoordinates(
  value: unknown,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  if (!Array.isArray(value)) return;

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    const x = value[0];
    const y = value[1];
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
    return;
  }

  for (const child of value) {
    updateBoundsFromCoordinates(child, bounds);
  }
}

function centroidFromGeometry(geometry: unknown) {
  const coords =
    isObject(geometry) && "coordinates" in geometry ? geometry.coordinates : undefined;
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  updateBoundsFromCoordinates(coords, bounds);

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) return null;

  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2] as const;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatArea(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    value,
  )} m²`;
}

function symbolSize(value: number, max: number) {
  const minSize = 10;
  const maxSize = 40;
  const exponent = 1;

  if (!max || max <= 0) return minSize;

  const ratio = Math.max(0, Math.min(1, value / max));
  const eased = Math.pow(ratio, exponent);
  return minSize + (maxSize - minSize) * eased;
}

type Filters = {
  ano_inicio: string;
  categoria: string;
  destinacao: string;
  tipo_obra: string;
};

const DEFAULT_FILTERS: Filters = {
  ano_inicio: "",
  categoria: "",
  destinacao: "",
  tipo_obra: "",
};

export default function DashboardEChartsMap() {
  const chartElRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

  const [meta, setMeta] = useState<MetadataResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [tab, setTab] = useState<MapTab>("obras");
  const [mapData, setMapData] = useState<MapResponse | null>(null);
  const [geojson, setGeojson] = useState<GeoJSON | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kpis = useMemo(() => {
    if (!mapData) return null;
    return {
      totalObras: Number(mapData.totals?.total_obras ?? 0),
      totalArea: Number(mapData.totals?.total_area_total ?? 0),
    };
  }, [mapData]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      setError(null);
      const res = await fetch("/api/dashboard/metadata", {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Falha ao carregar metadados do dashboard.");
      }

      const json = (await res.json()) as MetadataResponse;
      if (!cancelled) setMeta(json);
    }

    loadMeta().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMapData() {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/dashboard/map${queryString}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const maybeJson = await res
          .json()
          .catch(() => ({ error: "Falha ao carregar dados do mapa." }));
        throw new Error(maybeJson?.error ?? "Falha ao carregar dados do mapa.");
      }

      const json = (await res.json()) as MapResponse;
      if (!cancelled) setMapData(json);
    }

    loadMapData()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [queryString]);

  useEffect(() => {
    let disposed = false;

    async function initChart() {
      if (!chartElRef.current) return;

      const echarts = await import("echarts");
      if (disposed) return;
      if (!chartRef.current) {
        chartRef.current = echarts.init(chartElRef.current);
      }
      chartRef.current.resize();
    }

    initChart();

    function onResize() {
      chartRef.current?.resize?.();
    }

    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose?.();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadGeojson() {
      if (!meta) return;
      const json = (await fetch(meta.geojsonUrl, { cache: "force-cache" }).then(
        (r) => r.json(),
      )) as unknown;

      if (cancelled) return;

      if (isObject(json)) {
        setGeojson(json as unknown as GeoJSON);
      } else {
        setGeojson(null);
      }
    }

    loadGeojson().catch(() => {
      if (!cancelled) setGeojson(null);
    });

    return () => {
      cancelled = true;
    };
  }, [meta]);

  useEffect(() => {
    let disposed = false;

    async function updateChart() {
      const el = chartElRef.current;
      if (!el) return;
      if (!geojson) return;
      if (!mapData) return;

      const echarts = await import("echarts");
      if (disposed) return;

      if (!chartRef.current) {
        chartRef.current = echarts.init(el);
      }

      echarts.registerMap("sc-municipios", geojson as EChartsRegisterMapInput);

      const features = Array.isArray(geojson.features) ? geojson.features : [];
      const centroidByName = new Map<string, readonly [number, number]>();
      for (const f of features) {
        const nameValue = f?.properties?.[mapData.nameProperty];
        if (typeof nameValue !== "string") continue;
        const centroid = centroidFromGeometry(f.geometry);
        if (!centroid) continue;
        centroidByName.set(nameValue, centroid);
      }

      const values = mapData.data
        .map((d) => (tab === "obras" ? d.count : d.area_total))
        .filter((v) => Number.isFinite(v));
      const max = values.length ? Math.max(...values) : 0;

      const scatterData = mapData.data
        .map((d) => {
          const centroid = centroidByName.get(d.name);
          if (!centroid) return null;
          const v = tab === "obras" ? d.count : d.area_total;
          return {
            name: d.name,
            value: [centroid[0], centroid[1], v],
            count: d.count,
            area_total: d.area_total,
          };
        })
        .filter(Boolean);

      chartRef.current.setOption(
        {
          tooltip: {
            trigger: "item",
            formatter: (p: unknown) => {
              const maybe = p as {
                name?: unknown;
                data?: unknown;
                value?: unknown;
              };
              const name = typeof maybe?.name === "string" ? maybe.name : "";
              const data = (maybe?.data ?? {}) as {
                count?: unknown;
                area_total?: unknown;
              };

              const count = typeof data.count === "number" ? data.count : 0;
              const area = typeof data.area_total === "number" ? data.area_total : 0;

              return tab === "obras"
                ? `${name}: ${formatNumber(count)} obras`
                : `${name}: ${formatArea(area)}`;
            },
          },
          visualMap: {
            show: false,
            min: 0,
            max,
            dimension: 2,
            inRange: {
              colorAlpha: [0.5, 1],
            },
          },
          geo: {
            map: "sc-municipios",
            roam: true,
            emphasis: {
              label: { show: false },
            },
            itemStyle: {
              borderColor: "rgba(127,127,127,0.35)",
              areaColor: "rgba(127,127,127,0.10)",
            },
          },
          series: [
            {
              name: tab === "obras" ? "Obras" : "Metragem",
              type: "scatter",
              coordinateSystem: "geo",
              data: scatterData,
              symbolSize: (val: unknown) => {
                const v = Array.isArray(val) && typeof val[2] === "number" ? val[2] : 0;
                return symbolSize(v, max);
              },
              itemStyle: {
                opacity: 0.9, color: "#38bdf8",
              },
            },
          ],
        },
        { notMerge: true },
      );

      chartRef.current.resize();
    }

    updateChart();

    return () => {
      disposed = true;
    };
  }, [geojson, mapData, tab]);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mt-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="text-foreground/70">Ano de início</span>
          <select
            value={filters.ano_inicio}
            onChange={(e) => updateFilter("ano_inicio", e.target.value)}
            className="h-10 rounded-md border border-foreground/10 bg-transparent px-3"
          >
            <option value="">Todos</option>
            {meta?.filters.ano_inicio.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-foreground/70">Categoria</span>
          <select
            value={filters.categoria}
            onChange={(e) => updateFilter("categoria", e.target.value)}
            className="h-10 rounded-md border border-foreground/10 bg-transparent px-3"
          >
            <option value="">Todos</option>
            {meta?.filters.categoria.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-foreground/70">Destinação</span>
          <select
            value={filters.destinacao}
            onChange={(e) => updateFilter("destinacao", e.target.value)}
            className="h-10 rounded-md border border-foreground/10 bg-transparent px-3"
          >
            <option value="">Todos</option>
            {meta?.filters.destinacao.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-foreground/70">Tipo de obra</span>
          <select
            value={filters.tipo_obra}
            onChange={(e) => updateFilter("tipo_obra", e.target.value)}
            className="h-10 rounded-md border border-foreground/10 bg-transparent px-3"
          >
            <option value="">Todos</option>
            {meta?.filters.tipo_obra.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 rounded-lg border border-foreground/10">
        <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-3">
          <div className="text-sm font-medium">Obras em Santa Catarina</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("obras")}
              className={
                tab === "obras"
                  ? "h-9 rounded-md border border-foreground/20 px-3 text-sm"
                  : "h-9 rounded-md border border-foreground/10 px-3 text-sm text-foreground/70"
              }
            >
              Número de obras
            </button>
            <button
              type="button"
              onClick={() => setTab("metragem")}
              className={
                tab === "metragem"
                  ? "h-9 rounded-md border border-foreground/20 px-3 text-sm"
                  : "h-9 rounded-md border border-foreground/10 px-3 text-sm text-foreground/70"
              }
            >
              Metragem de obras
            </button>
          </div>
        </div>
        <div className="px-4 py-3 text-sm text-foreground/70">{!isLoading && error ? error : null}</div>
        <div className="flex flex-col lg:flex-row">
          <div className="min-w-0 flex-1">
            <div className="h-[520px] w-full" ref={chartElRef} />
          </div>
          <div className="border-t border-foreground/10 lg:h-[480px] lg:w-72 lg:border-l lg:border-t-0">
            <div className="flex h-full flex-col justify-center gap-2 p-4">
              <div className="rounded-md border border-foreground/10 p-3">
                <div className="text-xs text-foreground/70">Total de obras</div>
                <div className="mt-1 text-2xl font-semibold">
                  {isLoading || !kpis ? "…" : formatNumber(kpis.totalObras)}
                </div>
              </div>

              <div className="rounded-md border border-foreground/10 p-3">
                <div className="text-xs text-foreground/70">Metragem de obras</div>
                <div className="mt-1 text-2xl font-semibold">
                  {isLoading || !kpis ? "…" : formatArea(kpis.totalArea)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
