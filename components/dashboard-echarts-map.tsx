"use client";

import type { EChartsType } from "echarts";

import Image from "next/image";

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

type TimeSeriesResponse = {
  data: Array<{ ano_inicio: string; count: number; area_total: number }>;
};

type MunicipiosResponse = {
  data: Array<{ name: string; ano_inicio: string; count: number; area_total: number }>;
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
  obra_ativa: string;
};

const DEFAULT_FILTERS: Filters = {
  ano_inicio: "",
  categoria: "",
  destinacao: "",
  tipo_obra: "",
  obra_ativa: "",
};

export default function DashboardEChartsMap() {
  const chartElRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

  const timeSeriesChartElRef = useRef<HTMLDivElement | null>(null);
  const timeSeriesChartRef = useRef<EChartsType | null>(null);

  const barChartElRef = useRef<HTMLDivElement | null>(null);
  const barChartRef = useRef<EChartsType | null>(null);

  const barAreaChartElRef = useRef<HTMLDivElement | null>(null);
  const barAreaChartRef = useRef<EChartsType | null>(null);

  const [meta, setMeta] = useState<MetadataResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [tab, setTab] = useState<MapTab>("obras");
  const [mapData, setMapData] = useState<MapResponse | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesResponse | null>(null);
  const [municipiosData, setMunicipiosData] = useState<MunicipiosResponse | null>(null);
  const [geojson, setGeojson] = useState<GeoJSON | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const maybeJson = await res
          .json()
          .catch(() => ({ error: "Falha ao carregar metadados do dashboard." }));
        throw new Error(maybeJson?.error ?? "Falha ao carregar metadados do dashboard.");
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

    async function loadDashboardData() {
      setIsLoading(true);
      setError(null);

      const [mapRes, seriesRes, municipiosRes] = await Promise.all([
        fetch(`/api/dashboard/map${queryString}`, { cache: "no-store" }),
        fetch(`/api/dashboard/timeseries${queryString}`, { cache: "no-store" }),
        fetch(`/api/dashboard/municipios${queryString}`, { cache: "no-store" }),
      ]);

      if (!mapRes.ok) {
        const maybeJson = await mapRes
          .json()
          .catch(() => ({ error: "Falha ao carregar dados do mapa." }));
        throw new Error(maybeJson?.error ?? "Falha ao carregar dados do mapa.");
      }

      if (!seriesRes.ok) {
        const maybeJson = await seriesRes
          .json()
          .catch(() => ({ error: "Falha ao carregar série temporal." }));
        throw new Error(maybeJson?.error ?? "Falha ao carregar série temporal.");
      }

      if (!municipiosRes.ok) {
        const maybeJson = await municipiosRes
          .json()
          .catch(() => ({ error: "Falha ao carregar tabela de municípios." }));
        throw new Error(
          maybeJson?.error ?? "Falha ao carregar tabela de municípios.",
        );
      }

      const [mapJson, seriesJson, municipiosJsonRaw] = (await Promise.all([
        mapRes.json(),
        seriesRes.json(),
        municipiosRes.json(),
      ])) as [MapResponse, TimeSeriesResponse, MunicipiosResponse];

      const municipiosJson: MunicipiosResponse = {
        data: Array.isArray(municipiosJsonRaw?.data)
          ? municipiosJsonRaw.data
              .map((r) => ({
                name: String(r?.name ?? ""),
                ano_inicio: String(r?.ano_inicio ?? "").trim(),
                count: Number((r as unknown as { count?: unknown })?.count ?? 0),
                area_total: Number((r as unknown as { area_total?: unknown })?.area_total ?? 0),
              }))
              .filter(
                (r) =>
                  r.name.trim() &&
                  r.ano_inicio &&
                  Number.isFinite(r.count) &&
                  Number.isFinite(r.area_total),
              )
          : [],
      };

      if (!cancelled) {
        setMapData(mapJson);
        setTimeSeries(seriesJson);
        setMunicipiosData(municipiosJson);
      }
    }

    loadDashboardData()
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
    let disposed = false;

    async function initTimeSeriesChart() {
      if (!timeSeriesChartElRef.current) return;

      const echarts = await import("echarts");
      if (disposed) return;

      if (!timeSeriesChartRef.current) {
        timeSeriesChartRef.current = echarts.init(timeSeriesChartElRef.current);
      }

      timeSeriesChartRef.current.resize();
    }

    initTimeSeriesChart();

    function onResize() {
      timeSeriesChartRef.current?.resize?.();
    }

    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      timeSeriesChartRef.current?.dispose?.();
      timeSeriesChartRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function initBarChart() {
      if (!barChartElRef.current) return;

      const echarts = await import("echarts");
      if (disposed) return;

      if (!barChartRef.current) {
        barChartRef.current = echarts.init(barChartElRef.current);
      }

      barChartRef.current.resize();
    }

    initBarChart();

    function onResize() {
      barChartRef.current?.resize?.();
    }

    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      barChartRef.current?.dispose?.();
      barChartRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function initBarAreaChart() {
      if (!barAreaChartElRef.current) return;

      const echarts = await import("echarts");
      if (disposed) return;

      if (!barAreaChartRef.current) {
        barAreaChartRef.current = echarts.init(barAreaChartElRef.current);
      }

      barAreaChartRef.current.resize();
    }

    initBarAreaChart();

    function onResize() {
      barAreaChartRef.current?.resize?.();
    }

    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      barAreaChartRef.current?.dispose?.();
      barAreaChartRef.current = null;
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

      const created = !chartRef.current;
      if (!chartRef.current) chartRef.current = echarts.init(el);

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
          animationDurationUpdate: 1000,
          animationEasingUpdate: "cubicOut",
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
              id: "map-scatter",
              name: tab === "obras" ? "Obras" : "Metragem",
              type: "scatter",
              coordinateSystem: "geo",
              universalTransition: true,
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
        { notMerge: false, lazyUpdate: true },
      );

      // Avoid calling resize() right after setOption on updates;
      // it can short-circuit update animations.
      if (created) chartRef.current.resize();
    }

    updateChart();

    return () => {
      disposed = true;
    };
  }, [geojson, mapData, tab]);

  const timeSeriesRows = useMemo(() => {
    const rows = timeSeries?.data ?? [];
    return [...rows]
      .filter(
        (r) =>
          typeof r?.ano_inicio === "string" &&
          r.ano_inicio.trim() &&
          Number.isFinite(r?.count) &&
          Number.isFinite(r?.area_total),
      )
      .sort((a, b) => {
        const ai = Number(a.ano_inicio);
        const bi = Number(b.ano_inicio);
        if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
        return a.ano_inicio.localeCompare(b.ano_inicio, "pt-BR", {
          sensitivity: "base",
        });
      });
  }, [timeSeries]);

  useEffect(() => {
    let disposed = false;

    async function updateTimeSeriesChart() {
      const el = timeSeriesChartElRef.current;
      if (!el) return;

      const echarts = await import("echarts");
      if (disposed) return;

      const created = !timeSeriesChartRef.current;
      if (!timeSeriesChartRef.current) timeSeriesChartRef.current = echarts.init(el);

      const years = timeSeriesRows.map((r) => r.ano_inicio);
      const values = timeSeriesRows.map((r) =>
        tab === "obras" ? r.count : r.area_total,
      );

      const finiteValues = values.filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v),
      );
      const minVal = finiteValues.length ? Math.min(...finiteValues) : null;
      const maxVal = finiteValues.length ? Math.max(...finiteValues) : null;
      const range =
        minVal === null || maxVal === null ? null : Math.max(0, maxVal - minVal);

      // Keep the series visually centered by padding both min/max.
      const pad =
        minVal === null || maxVal === null
          ? null
          : range && range > 0
            ? range * 0.25
            : Math.max(1, Math.abs(minVal) * 0.1);

      const rawMin = minVal === null || pad === null ? null : minVal - pad;
      const rawMax = maxVal === null || pad === null ? null : maxVal + pad;

      function niceStep(valueRange: number, splits: number) {
        if (!Number.isFinite(valueRange) || valueRange <= 0) return 1;
        const safeSplits = Math.max(2, Math.floor(splits));
        const rough = valueRange / (safeSplits - 1);

        const exponent = Math.floor(Math.log10(rough));
        const base = Math.pow(10, exponent);
        const fraction = rough / base;

        let niceFraction = 1;
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;

        const step = niceFraction * base;
        return Math.max(1, Math.round(step));
      }

      const desiredSplits = 5;
      const fixedMetragemInterval = 5_000_000;
      const yInterval =
        rawMin === null || rawMax === null
          ? null
          : tab === "metragem"
            ? fixedMetragemInterval
            : niceStep(rawMax - rawMin, desiredSplits);
      const yMin =
        rawMin === null || yInterval === null
          ? null
          : Math.floor(rawMin / yInterval) * yInterval;
      const yMax =
        rawMax === null || yInterval === null
          ? null
          : Math.ceil(rawMax / yInterval) * yInterval;

      const yMinNonNegative = yMin === null ? null : Math.max(0, yMin);

      const yAxisExtra =
        yMin === null || yMax === null || yInterval === null
          ? {}
          : tab === "metragem"
            ? { min: yMinNonNegative, max: yMax, interval: yInterval }
            : {
                min: yMinNonNegative,
                max: yMax,
                interval: yInterval,
                splitNumber: desiredSplits,
              };

      const color = tab === "obras" ? "#38bdf8" : "#38bdf8";

      timeSeriesChartRef.current.setOption(
        {
          animationDurationUpdate: 350,
          animationEasingUpdate: "cubicOut",
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "line" },
            formatter: (params: unknown) => {
              const items = Array.isArray(params) ? params : [];
              const first = items[0] as { axisValue?: unknown; value?: unknown };
              const year =
                typeof first?.axisValue === "string"
                  ? first.axisValue
                  : String(first?.axisValue ?? "");
              const value =
                typeof first?.value === "number" ? first.value : Number(first?.value ?? 0);
                return tab === "obras"
                ? `${year}: ${formatNumber(value)} obras`
                : `${year}: ${formatArea(value)}`;
              },
              },
              grid: {
              left: 8,
              right: 12,
              top: 18,
              bottom: 8,
              containLabel: true,
              },
              xAxis: {
              type: "category",
              data: years,
              boundaryGap: false,
              axisLabel: {
                color: "rgba(255,255,255,0.70)",
                rotate: 90,
              },
              axisLine: {
                lineStyle: { color: "rgba(127,127,127,0.35)" },
              },
              },
              yAxis: {
              type: "value",
              ...yAxisExtra,
              axisLabel: {
                formatter: (v: unknown) => {
                const n = typeof v === "number" ? v : Number(v);
                if (!Number.isFinite(n)) return "";
                return tab === "obras" ? formatNumber(n) : formatNumber(Math.round(n));
              },
              color: "rgba(255,255,255,0.70)",
            },
            splitLine: {
              lineStyle: { color: "rgba(127,127,127,0.20)" },
            },
          },
          series: [
            {
              id: "timeseries",
              name: tab === "obras" ? "Obras" : "Metragem",
              type: "line",
              data: values,
              universalTransition: true,
              smooth: true,
              showSymbol: true,
              symbol: "square",
              symbolSize: 15,
              lineStyle: { width: 2, color },
              itemStyle: { color },
            },
          ],
        },
        { notMerge: false, lazyUpdate: true },
      );

      // Avoid calling resize() right after setOption on updates;
      // it can short-circuit update animations.
      if (created) timeSeriesChartRef.current.resize();
    }

    updateTimeSeriesChart();

    return () => {
      disposed = true;
    };
  }, [timeSeriesRows, tab]);

  useEffect(() => {
    // Keep chart visible during refresh; use a transparent loading overlay.
    if (!timeSeriesChartRef.current) return;

    if (isLoading) {
      timeSeriesChartRef.current.showLoading?.("default", {
        text: "",
        maskColor: "rgba(0,0,0,0)",
        color: tab === "obras" ? "#38bdf8" : "#fbbf24",
        lineWidth: 2,
      });
    } else {
      timeSeriesChartRef.current.hideLoading?.();
    }
  }, [isLoading, tab]);

  const barChartRows = useMemo(() => {
    const rows = mapData?.data ?? [];
    return [...rows]
      .filter((r) => typeof r?.name === "string" && Number.isFinite(r?.count))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }, [mapData]);

  const barAreaRows = useMemo(() => {
    const rows = mapData?.data ?? [];
    return [...rows]
      .filter(
        (r) => typeof r?.name === "string" && Number.isFinite(r?.area_total),
      )
      .sort((a, b) => (b.area_total ?? 0) - (a.area_total ?? 0));
  }, [mapData]);

  type TableSortKey = "name" | "ano_inicio" | "count" | "area_total" | "avg_area";
  const [tableSort, setTableSort] = useState<{ key: TableSortKey; dir: "asc" | "desc" }>({
    key: "ano_inicio",
    dir: "asc",
  });

  const tableBaseRows = useMemo(() => {
    const rows = municipiosData?.data ?? [];
    const filtered = [...rows]
      .filter(
        (r) =>
          typeof r?.name === "string" &&
          typeof r?.ano_inicio === "string" &&
          r.ano_inicio.trim() &&
          Number.isFinite(r?.count) &&
          Number.isFinite(r?.area_total),
      );

    if (filters.ano_inicio) {
      const selectedYear = String(filters.ano_inicio).trim();
      return filtered.filter((r) => String(r.ano_inicio).trim() === selectedYear);
    }

    return filtered;
  }, [filters.ano_inicio, municipiosData]);

  const tableRows = useMemo(() => {
    const rows = [...tableBaseRows];

    const dir = tableSort.dir === "asc" ? 1 : -1;
    if (tableSort.key === "name") {
      rows.sort((a, b) => {
        const nameCmp = a.name.localeCompare(b.name, "pt-BR", {
          sensitivity: "base",
        });
        if (nameCmp !== 0) return dir * nameCmp;

        const aYear = Number.parseInt(String(a.ano_inicio), 10);
        const bYear = Number.parseInt(String(b.ano_inicio), 10);
        if (Number.isFinite(aYear) && Number.isFinite(bYear)) {
          return dir * (aYear - bYear);
        }

        return dir * String(a.ano_inicio).localeCompare(String(b.ano_inicio), "pt-BR");
      });
      return rows;
    }

    if (tableSort.key === "ano_inicio") {
      rows.sort((a, b) => {
        const aYear = Number.parseInt(String(a.ano_inicio), 10);
        const bYear = Number.parseInt(String(b.ano_inicio), 10);

        if (Number.isFinite(aYear) && Number.isFinite(bYear) && aYear !== bYear) {
          return dir * (aYear - bYear);
        }

        const yearCmp = String(a.ano_inicio).localeCompare(String(b.ano_inicio), "pt-BR");
        if (yearCmp !== 0) return dir * yearCmp;

        return dir * a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
      });
      return rows;
    }

    if (tableSort.key === "count") {
      rows.sort((a, b) => dir * (Number(a.count ?? 0) - Number(b.count ?? 0)));
      return rows;
    }

    if (tableSort.key === "avg_area") {
      rows.sort((a, b) => {
        const aCount = Number(a.count ?? 0);
        const bCount = Number(b.count ?? 0);
        const aArea = Number(a.area_total ?? 0);
        const bArea = Number(b.area_total ?? 0);

        const aAvg = aCount > 0 ? aArea / aCount : 0;
        const bAvg = bCount > 0 ? bArea / bCount : 0;

        return dir * (aAvg - bAvg);
      });
      return rows;
    }

    rows.sort((a, b) => dir * (Number(a.area_total ?? 0) - Number(b.area_total ?? 0)));
    return rows;
  }, [tableBaseRows, tableSort]);

  function toggleTableSort(key: TableSortKey) {
    setTableSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: key === "name" || key === "ano_inicio" ? "asc" : "desc" };
    });
  }

  function sortIndicator(key: TableSortKey) {
    if (tableSort.key !== key) return "";
    return tableSort.dir === "asc" ? " ▲" : " ▼";
  }

  async function downloadMunicipiosExcel() {
    if (!municipiosData) return;

    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();

    const rows = tableRows.map((r) => {
      const count = Number(r.count ?? 0);
      const area = Number(r.area_total ?? 0);
      const avg = count > 0 ? area / count : null;

      return {
        "Município": r.name,
        "Ano": r.ano_inicio,
        "Número de obras": count,
        "Metragem (m²)": Math.round(area),
        "Metragem média por obra (m²)": avg === null ? null : Math.round(avg),
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(rows, {
      header: [
        "Município",
        "Ano",
        "Número de obras",
        "Metragem (m²)",
        "Metragem média por obra (m²)",
      ],
    });
    worksheet["!cols"] = [
      { wch: 28 },
      { wch: 10 },
      { wch: 16 },
      { wch: 18 },
      { wch: 24 },
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, "Municipios");

    const today = new Date().toISOString().slice(0, 10);
    xlsx.writeFile(workbook, `cno_municipios_${today}.xlsx`, {
      compression: true,
    });
  }

  useEffect(() => {
    let disposed = false;

    async function updateBarChart() {
      const el = barChartElRef.current;
      if (!el) return;

      const echarts = await import("echarts");
      if (disposed) return;

      if (!barChartRef.current) {
        barChartRef.current = echarts.init(el);
      }

      const topN = 25;
      const rows = barChartRows.slice(0, topN);
      const names = rows.map((r) => r.name);
      const counts = rows.map((r) => r.count);

      barChartRef.current.setOption(
        {
          animationDurationUpdate: 350,
          animationEasingUpdate: "cubicOut",
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: (params: unknown) => {
              const items = Array.isArray(params) ? params : [];
              const first = items[0] as { name?: unknown; value?: unknown };
              const name = typeof first?.name === "string" ? first.name : "";
              const value = typeof first?.value === "number" ? first.value : 0;
              return `${name}: ${formatNumber(value)} obras`;
            },
          },
          grid: {
            left: 8,
            right: 12,
            top: 18,
            bottom: 8,
            containLabel: true,
          },
          xAxis: {
            type: "value",
            axisLabel: {
              formatter: (v: unknown) => {
                const n = typeof v === "number" ? v : Number(v);
                return Number.isFinite(n) ? formatNumber(n) : "";
              },
            },
            splitLine: {
              lineStyle: { color: "rgba(127,127,127,0.20)" },
            },
          },
          yAxis: {
            type: "category",
            data: names,
            inverse: true,
            axisLabel: {
              color: "rgba(255,255,255,0.88)",
              width: 140,
              overflow: "truncate",
            },
          },
          series: [
            {
              type: "bar",
              data: counts,
              itemStyle: {
                color: "#38bdf8",
                opacity: 0.9,
              },
              barMaxWidth: 18,
            },
          ],
        },
        { notMerge: false, lazyUpdate: true },
      );

      barChartRef.current.resize();
    }

    updateBarChart();

    return () => {
      disposed = true;
    };
  }, [barChartRows]);

  useEffect(() => {
    // Keep chart visible during refresh; use a transparent loading overlay.
    if (!barChartRef.current) return;

    if (isLoading) {
      barChartRef.current.showLoading?.("default", {
        text: "",
        maskColor: "rgba(0,0,0,0)",
        color: "#38bdf8",
        lineWidth: 2,
      });
    } else {
      barChartRef.current.hideLoading?.();
    }
  }, [isLoading]);

  useEffect(() => {
    let disposed = false;

    async function updateBarAreaChart() {
      const el = barAreaChartElRef.current;
      if (!el) return;

      const echarts = await import("echarts");
      if (disposed) return;

      if (!barAreaChartRef.current) {
        barAreaChartRef.current = echarts.init(el);
      }

      const topN = 25;
      const rows = barAreaRows.slice(0, topN);
      const names = rows.map((r) => r.name);
      const areas = rows.map((r) => r.area_total);

      barAreaChartRef.current.setOption(
        {
          animationDurationUpdate: 350,
          animationEasingUpdate: "cubicOut",
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: (params: unknown) => {
              const items = Array.isArray(params) ? params : [];
              const first = items[0] as { name?: unknown; value?: unknown };
              const name = typeof first?.name === "string" ? first.name : "";
              const value = typeof first?.value === "number" ? first.value : 0;
              return `${name}: ${formatArea(value)}`;
            },
          },
          grid: {
            left: 8,
            right: 12,
            top: 18,
            bottom: 8,
            containLabel: true,
          },
          xAxis: {
            type: "value",
            axisLabel: {
              formatter: (v: unknown) => {
                const n = typeof v === "number" ? v : Number(v);
                return Number.isFinite(n) ? formatNumber(n) : "";
              },
            },
            splitLine: {
              lineStyle: { color: "rgba(127,127,127,0.20)" },
            },
          },
          yAxis: {
            type: "category",
            data: names,
            inverse: true,
            axisLabel: {
              color: "rgba(255,255,255,0.88)",
              width: 140,
              overflow: "truncate",
            },
          },
          series: [
            {
              type: "bar",
              data: areas,
              itemStyle: {
                color: "#fbbf24",
                opacity: 0.9,
              },
              barMaxWidth: 18,
            },
          ],
        },
        { notMerge: false, lazyUpdate: true },
      );

      barAreaChartRef.current.resize();
    }

    updateBarAreaChart();

    return () => {
      disposed = true;
    };
  }, [barAreaRows]);

  useEffect(() => {
    // Keep chart visible during refresh; use a transparent loading overlay.
    if (!barAreaChartRef.current) return;

    if (isLoading) {
      barAreaChartRef.current.showLoading?.("default", {
        text: "",
        maskColor: "rgba(0,0,0,0)",
        color: "#fbbf24",
        lineWidth: 2,
      });
    } else {
      barAreaChartRef.current.hideLoading?.();
    }
  }, [isLoading]);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mt-10 flex flex-col gap-6 lg:flex-row">
      <aside className="w-full flex-shrink-0 rounded-lg border border-foreground/10 p-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:w-80 lg:self-start lg:overflow-auto">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium text-foreground/70">Filtros</div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground/70">Obras ativas</span>
            <button
              type="button"
              role="switch"
              aria-checked={filters.obra_ativa === "1"}
              onClick={() =>
                updateFilter("obra_ativa", filters.obra_ativa === "1" ? "" : "1")
              }
              className={
                filters.obra_ativa === "1"
                  ? "relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center rounded-full bg-blue-600 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  : "relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center rounded-full bg-foreground/20 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              }
            >
              <span className="sr-only">Filtrar somente obras ativas</span>
              <span
                className={
                  filters.obra_ativa === "1"
                    ? "inline-block h-6 w-6 translate-x-5 rounded-full bg-background shadow-sm transition-transform duration-200"
                    : "inline-block h-6 w-6 translate-x-1 rounded-full bg-background shadow-sm transition-transform duration-200"
                }
              />
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4">
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

        <div className="mt-6 flex justify-center">
          <div className="relative h-16 w-40 sm:h-20 sm:w-60">
            <Image
              src="/logo_dark.png"
              alt="Logo do Explorador do CNO"
              fill
              priority
              className="object-contain"
            />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-foreground/10">
        <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-3">
          <div className="text-sm font-medium">Obras em Santa Catarina</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("obras")}
              className={
                tab === "obras"
                  ? "h-9 rounded-md border border-foreground/20 bg-foreground/5 px-3 text-sm text-foreground transition-colors duration-200 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:bg-foreground/15"
                  : "h-9 rounded-md border border-foreground/10 px-3 text-sm text-foreground/70 transition-colors duration-200 hover:border-foreground/20 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:bg-foreground/10"
              }
            >
              Número de obras
            </button>
            <button
              type="button"
              onClick={() => setTab("metragem")}
              className={
                tab === "metragem"
                  ? "h-9 rounded-md border border-foreground/20 bg-foreground/5 px-3 text-sm text-foreground transition-colors duration-200 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:bg-foreground/15"
                  : "h-9 rounded-md border border-foreground/10 px-3 text-sm text-foreground/70 transition-colors duration-200 hover:border-foreground/20 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:bg-foreground/10"
              }
            >
              Metragem de obras
            </button>
          </div>
        </div>
        <div className="px-4 py-3 text-sm text-foreground/70">{!isLoading && error ? error : null}</div>
        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="text-xs text-foreground/70">Distribuição geográfica</div>
            <div className="mt-2 h-[480px] w-full" ref={chartElRef} />
          </div>

          <div className="min-w-0">
            <div className="text-xs text-foreground/70">
              Evolução por ano ({tab === "obras" ? "número de obras" : "metragem de obras"})
            </div>
            <div className="mt-2 h-[480px] w-full" ref={timeSeriesChartElRef} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-foreground/10">
          <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-2">
            <div className="text-sm font-medium">Número de obras por município (top 25)</div>
          </div>
          {!isLoading && error ? (
            <div className="px-4 pt-2 text-sm text-foreground/70">{error}</div>
          ) : null}
          <div className="px-4 pb-4">
            <div className="h-[420px] w-full sm:h-[520px]" ref={barChartElRef} />
          </div>
        </div>

        <div className="rounded-lg border border-foreground/10">
          <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-2">
            <div className="text-sm font-medium">Metragem de obras por município (top 25)</div>
          </div>
          {!isLoading && error ? (
            <div className="px-4 pt-2 text-sm text-foreground/70">{error}</div>
          ) : null}
          <div className="px-4 pb-4">
            <div className="h-[420px] w-full sm:h-[520px]" ref={barAreaChartElRef} />
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-foreground/10">
        <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-2">
          <div className="text-sm font-medium">Obras por município (por ano)</div>
          <button
            type="button"
            onClick={downloadMunicipiosExcel}
            disabled={isLoading || !municipiosData}
            className={
              isLoading || !municipiosData
                ? "h-9 cursor-not-allowed rounded-md border border-foreground/10 px-3 text-sm text-foreground/40 transition-colors duration-200"
                : "h-9 rounded-md border border-foreground/20 bg-foreground/5 px-3 text-sm text-foreground transition-colors duration-200 hover:border-foreground/30 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:bg-foreground/15"
            }
          >
            Download
          </button>
        </div>
        {!isLoading && error ? (
          <div className="px-4 pt-2 text-sm text-foreground/70">{error}</div>
        ) : null}

        <div className="px-4 pb-4 pt-2">
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background text-foreground/70">
                <tr className="border-b border-foreground/10">
                  <th
                    aria-sort={
                      tableSort.key === "name"
                        ? tableSort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="whitespace-nowrap py-2 text-left font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTableSort("name")}
                      className="select-none hover:text-foreground"
                    >
                      Município{sortIndicator("name")}
                    </button>
                  </th>
                  <th
                    aria-sort={
                      tableSort.key === "ano_inicio"
                        ? tableSort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="whitespace-nowrap py-2 text-left font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTableSort("ano_inicio")}
                      className="select-none hover:text-foreground"
                    >
                      Ano{sortIndicator("ano_inicio")}
                    </button>
                  </th>
                  <th
                    aria-sort={
                      tableSort.key === "count"
                        ? tableSort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="whitespace-nowrap py-2 text-right font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTableSort("count")}
                      className="select-none hover:text-foreground"
                    >
                      Nº de obras{sortIndicator("count")}
                    </button>
                  </th>
                  <th
                    aria-sort={
                      tableSort.key === "area_total"
                        ? tableSort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="whitespace-nowrap py-2 text-right font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTableSort("area_total")}
                      className="select-none hover:text-foreground"
                    >
                      Metragem{sortIndicator("area_total")}
                    </button>
                  </th>
                  <th
                    aria-sort={
                      tableSort.key === "avg_area"
                        ? tableSort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="whitespace-nowrap py-2 text-right font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTableSort("avg_area")}
                      className="select-none hover:text-foreground"
                    >
                      Metragem média por obra{sortIndicator("avg_area")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {tableRows.map((row) => (
                  <tr key={`${row.name}__${row.ano_inicio}`} className="h-9">
                    <td className="h-9 pr-4 align-middle">{row.name}</td>
                    <td className="h-9 pr-4 tabular-nums align-middle">
                      {row.ano_inicio}
                    </td>
                    <td className="h-9 text-right tabular-nums align-middle">
                      {formatNumber(row.count)}
                    </td>
                    <td className="h-9 text-right tabular-nums align-middle">
                      {formatArea(row.area_total)}
                    </td>
                    <td className="h-9 text-right tabular-nums align-middle">
                      {row.count > 0 ? formatArea(row.area_total / row.count) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
