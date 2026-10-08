import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { RotateCcw, StepForward, Zap } from "lucide-react";
import {
  NeuronSim,
  PRESET_GROUPS,
  PRESETS,
  V_REST,
  matchPreset,
  presetById,
  type Params,
  type PresetId,
} from "@/lib/izhikevich";
import { drawScope } from "@/components/draw-scope";

type Mode = "step" | "auto";

type Live = {
  mode: Mode;
  speed: number;
  dt: number;
  iConst: number;
  pulseAmp: number;
  params: Params;
  windowMs: number;
};

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 25] as const;
const WINDOWS = [200, 500, 1000, 2000] as const;

const INITIAL_PARAMS = presetById("RS").params;
const INITIAL_U = INITIAL_PARAMS.b * V_REST;

function fmt(n: number, digits: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits).replace(".", ",");
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

const PARAM_LIMITS: Record<keyof Params, [number, number]> = {
  a: [-1, 1],
  b: [-2, 2],
  c: [-100, 0],
  d: [-30, 30],
};

function fieldClass() {
  return "h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink";
}

export function NeuronBench() {
  const simRef = useRef<NeuronSim | null>(null);
  if (simRef.current === null) simRef.current = new NeuronSim(INITIAL_PARAMS);

  const liveRef = useRef<Live>({
    mode: "auto",
    speed: 1,
    dt: 1,
    iConst: 10,
    pulseAmp: 20,
    params: { ...INITIAL_PARAMS },
    windowMs: 500,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vRef = useRef<HTMLSpanElement | null>(null);
  const uRef = useRef<HTMLSpanElement | null>(null);
  const tRef = useRef<HTMLSpanElement | null>(null);
  const spikeRef = useRef<HTMLSpanElement | null>(null);
  const hzRef = useRef<HTMLSpanElement | null>(null);
  const iNowRef = useRef<HTMLSpanElement | null>(null);
  const pulseRef = useRef<HTMLSpanElement | null>(null);
  const publishRef = useRef<() => void>(() => {});
  const drawRef = useRef<() => void>(() => {});

  publishRef.current = () => {
    const sim = simRef.current;
    if (!sim) return;
    const live = liveRef.current;
    if (vRef.current) vRef.current.textContent = fmt(sim.v, 2);
    if (uRef.current) uRef.current.textContent = fmt(sim.u, 2);
    if (tRef.current) tRef.current.textContent = fmt(sim.t, 1);
    if (spikeRef.current) spikeRef.current.textContent = String(sim.spikes);
    if (iNowRef.current) iNowRef.current.textContent = fmt(sim.currentI(live.iConst), 1);
    const hz = sim.rateHz(live.windowMs);
    if (hzRef.current) hzRef.current.textContent = hz === null ? "—" : fmt(hz, 1);
    if (pulseRef.current) {
      const active = sim.pulses.filter((p) => p.left > 1e-6);
      if (active.length === 0) {
        pulseRef.current.textContent = "brak";
      } else {
        const sum = active.reduce((s, p) => s + p.amp, 0);
        const left = Math.max(...active.map((p) => p.left));
        pulseRef.current.textContent = `${fmt(sum, 1)} · ${fmt(left, 2)} ms`;
      }
    }
  };

  drawRef.current = () => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    drawScope(canvas, sim, liveRef.current.windowMs);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(canvas);
    publishRef.current();
    drawRef.current();
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const live = liveRef.current;
      const sim = simRef.current;
      if (sim && live.mode === "auto") {
        const wall = Math.min(50, now - last);
        if (wall > 0) {
          sim.run(wall * live.speed, live.dt, live.params, live.iConst);
          publishRef.current();
          drawRef.current();
        }
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const fontsReady = document.fonts?.ready;
    if (fontsReady) void fontsReady.then(() => drawRef.current());
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-3 border-b border-line pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink">
          Neuron Izhikevicha
        </h1>
        <p className="font-mono text-sm leading-6 text-ink">
          v′ = 0.04v² + 5v + 140 − u + I
          <br />
          u′ = a(bv − u)
          <span className="text-muted"> · przy v ≥ 30 mV: v ← c, u ← u + d</span>
        </p>
        <p className="max-w-3xl text-sm leading-6 text-pretty text-muted">
          Jeden neuron. Suwak to prąd stały. Przycisk impulsu dodaje drugi prąd na dokładnie 1 ms
          czasu modelu.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Scope
          canvasRef={canvasRef}
          vRef={vRef}
          uRef={uRef}
          tRef={tRef}
          spikeRef={spikeRef}
          hzRef={hzRef}
          iNowRef={iNowRef}
          pulseRef={pulseRef}
          liveRef={liveRef}
          publishRef={publishRef}
          drawRef={drawRef}
        />
        <Controls
          simRef={simRef}
          liveRef={liveRef}
          publishRef={publishRef}
          drawRef={drawRef}
        />
      </div>
    </main>
  );
}

function Scope({
  canvasRef,
  vRef,
  uRef,
  tRef,
  spikeRef,
  hzRef,
  iNowRef,
  pulseRef,
  liveRef,
  publishRef,
  drawRef,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  vRef: RefObject<HTMLSpanElement | null>;
  uRef: RefObject<HTMLSpanElement | null>;
  tRef: RefObject<HTMLSpanElement | null>;
  spikeRef: RefObject<HTMLSpanElement | null>;
  hzRef: RefObject<HTMLSpanElement | null>;
  iNowRef: RefObject<HTMLSpanElement | null>;
  pulseRef: RefObject<HTMLSpanElement | null>;
  liveRef: RefObject<Live>;
  publishRef: RefObject<() => void>;
  drawRef: RefObject<() => void>;
}) {
  const [windowMs, setWindowMs] = useState(500);

  useLayoutEffect(() => {
    publishRef.current();
    drawRef.current();
  });

  return (
    <section className="flex flex-col gap-4 lg:col-span-2">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="v · potencjał" unit="mV" valueRef={vRef} initial={fmt(V_REST, 2)} accent />
        <Stat label="u · powrót" valueRef={uRef} initial={fmt(INITIAL_U, 2)} />
        <Stat label="czas" unit="ms" valueRef={tRef} initial={fmt(0, 1)} />
        <div className="flex flex-col gap-1 border border-line bg-surface px-3 py-2">
          <dt className="text-xs text-muted">spajki</dt>
          <dd className="font-mono text-2xl leading-none font-medium text-ink tabular-nums">
            <span ref={spikeRef}>0</span>
          </dd>
          <p className="text-xs text-muted tabular-nums">
            <span ref={hzRef}>—</span>
            <span> Hz w oknie</span>
          </p>
        </div>
      </dl>

      <div className="border border-line bg-surface p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">Przebieg</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            Okno
            <select
              className="h-11 rounded-md border border-line bg-surface px-2 text-base text-ink"
              value={windowMs}
              onChange={(e) => {
                const ms = Number(e.target.value);
                liveRef.current.windowMs = ms;
                setWindowMs(ms);
                drawRef.current();
              }}
            >
              {WINDOWS.map((ms) => (
                <option key={ms} value={ms}>
                  {ms} ms
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="h-80 md:h-96">
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            role="img"
            aria-label="Wykres potencjału v i zmiennej powrotu u"
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <li className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-6 bg-trace" />v — potencjał błony
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-6 bg-recovery" />u — zmienna powrotu
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-6 bg-trace/15" />
            impuls 1 ms
          </li>
        </ul>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="border border-line bg-surface px-3 py-3">
          <dt className="text-xs text-muted">I do neuronu</dt>
          <dd className="mt-1 font-mono text-lg text-ink tabular-nums">
            <span ref={iNowRef}>{fmt(10, 1)}</span>
          </dd>
        </div>
        <div className="border border-line bg-surface px-3 py-3">
          <dt className="text-xs text-muted">Impuls w neuronie</dt>
          <dd className="mt-1 font-mono text-lg text-ink tabular-nums">
            <span ref={pulseRef}>brak</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Stat({
  label,
  unit,
  valueRef,
  initial,
  accent,
}: {
  label: string;
  unit?: string;
  valueRef: RefObject<HTMLSpanElement | null>;
  initial: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border border-line bg-surface px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={
          "font-mono text-2xl leading-none font-medium tabular-nums " +
          (accent ? "text-trace" : "text-ink")
        }
      >
        <span ref={valueRef}>{initial}</span>
        {unit ? <span className="ml-1 text-sm font-normal text-muted">{unit}</span> : null}
      </dd>
    </div>
  );
}

function Controls({
  simRef,
  liveRef,
  publishRef,
  drawRef,
}: {
  simRef: RefObject<NeuronSim | null>;
  liveRef: RefObject<Live>;
  publishRef: RefObject<() => void>;
  drawRef: RefObject<() => void>;
}) {
  const [presetId, setPresetId] = useState<PresetId | "custom">("RS");
  const [params, setParams] = useState<Params>({ ...INITIAL_PARAMS });
  const [mode, setMode] = useState<Mode>("auto");
  const [speed, setSpeed] = useState(1);
  const [dt, setDt] = useState(1);
  const [iConst, setIConst] = useState(10);
  const [pulseAmp, setPulseAmp] = useState(20);

  const blurb =
    presetId === "custom"
      ? "Własne a, b, c, d. Zmiana liczb nie zeruje stanu — od tego jest reset."
      : presetById(presetId).blurb;

  function refresh() {
    publishRef.current();
    drawRef.current();
  }

  function applyPreset(id: PresetId) {
    const next = { ...presetById(id).params };
    liveRef.current.params = next;
    setParams(next);
    setPresetId(id);
    simRef.current?.reset(next);
    simRef.current?.clearCarry();
    refresh();
  }

  function editParam(key: keyof Params, raw: string) {
    const parsed = clamp(Number(raw), PARAM_LIMITS[key][0], PARAM_LIMITS[key][1]);
    if (parsed === null) return;
    const next = { ...liveRef.current.params, [key]: parsed };
    liveRef.current.params = next;
    setParams(next);
    setPresetId(matchPreset(next));
  }

  return (
    <aside className="flex flex-col gap-5 border border-line bg-surface p-4">
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm text-ink" htmlFor="preset">
          Typ neuronu
          <select
            id="preset"
            className={fieldClass()}
            value={presetId}
            onChange={(e) => {
              const id = e.target.value;
              if (id === "custom") return;
              applyPreset(id as PresetId);
            }}
          >
            {presetId === "custom" ? <option value="custom">Własne a, b, c, d</option> : null}
            {PRESET_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {PRESETS.filter((p) => p.group === group).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="text-sm leading-6 text-pretty text-muted">{blurb}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-ink">Parametry</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["a", "skala czasu u"],
              ["b", "czułość u na v"],
              ["c", "reset v po spajku, mV"],
              ["d", "skok u po spajku"],
            ] as const
          ).map(([key, hint]) => (
            <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-muted">
              <span className="font-mono text-sm text-ink">{key}</span>
              <input
                className={fieldClass() + " px-2 font-mono"}
                type="number"
                inputMode="decimal"
                title={hint}
                step={key === "c" ? 1 : key === "a" ? 0.001 : 0.01}
                min={PARAM_LIMITS[key][0]}
                max={PARAM_LIMITS[key][1]}
                value={String(Number(params[key].toFixed(4)))}
                onChange={(e) => editParam(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-ink">Czas</legend>
        <div
          role="radiogroup"
          aria-label="Tryb symulacji"
          className="grid grid-cols-2 gap-1 border border-line p-1"
        >
          {(
            [
              ["step", "Krok po kroku"],
              ["auto", "Automatyczna"],
            ] as const
          ).map(([id, label]) => {
            const on = mode === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                className={
                  "h-11 px-2 text-sm motion-safe:transition-colors " +
                  (on ? "bg-ink text-surface" : "text-ink hover:bg-bg")
                }
                onClick={() => {
                  liveRef.current.mode = id;
                  if (id === "step") simRef.current?.clearCarry();
                  setMode(id);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center gap-2 bg-ink px-3 text-sm text-surface disabled:opacity-40"
          disabled={mode !== "step"}
          onClick={() => {
            const live = liveRef.current;
            simRef.current?.step(live.dt, live.params, live.iConst);
            refresh();
          }}
        >
          <StepForward className="size-4" aria-hidden="true" />
          Następny krok
        </button>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            Szybkość
            <select
              className={fieldClass() + " disabled:opacity-40"}
              disabled={mode !== "auto"}
              onChange={(e) => {
                const value = Number(e.target.value);
                liveRef.current.speed = value;
                setSpeed(value);
              }}
            >
              {SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value === 1 ? "1× czas rzeczywisty" : `${String(value).replace(".", ",")}×`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            Krok dt (ms)
            <input
              className={fieldClass() + " font-mono"}
              type="number"
              inputMode="decimal"
              min={0.1}
              max={2}
              step={0.1}
              value={dt}
              onChange={(e) => {
                const parsed = clamp(Number(e.target.value), 0.1, 2);
                if (parsed === null) return;
                const stepped = Math.round(parsed * 10) / 10;
                liveRef.current.dt = stepped;
                simRef.current?.clearCarry();
                setDt(stepped);
              }}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm text-ink">Wejścia</legend>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="i-const" className="text-sm text-ink">
              Prąd stały I
            </label>
            <span className="font-mono text-sm text-ink tabular-nums">{fmt(iConst, 1)}</span>
          </div>
          <input
            id="i-const"
            type="range"
            min={0}
            max={50}
            step={0.1}
            value={iConst}
            aria-valuemin={0}
            aria-valuemax={50}
            aria-valuenow={iConst}
            onChange={(e) => {
              const parsed = clamp(Number(e.target.value), 0, 50);
              if (parsed === null) return;
              const stepped = Math.round(parsed * 10) / 10;
              liveRef.current.iConst = stepped;
              setIConst(stepped);
            }}
          />
          <label className="sr-only" htmlFor="i-number">
            Prąd stały, wartość
          </label>
          <input
            id="i-number"
            className={fieldClass() + " font-mono"}
            type="number"
            inputMode="decimal"
            min={0}
            max={50}
            step={0.1}
            value={iConst}
            onChange={(e) => {
              const parsed = clamp(Number(e.target.value), 0, 50);
              if (parsed === null) return;
              const stepped = Math.round(parsed * 10) / 10;
              liveRef.current.iConst = stepped;
              setIConst(stepped);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="pulse-amp" className="text-sm text-ink">
            Impuls 1 ms
          </label>
          <div className="flex gap-2">
            <input
              id="pulse-amp"
              className={fieldClass() + " font-mono"}
              type="number"
              inputMode="decimal"
              min={-50}
              max={50}
              step={1}
              value={pulseAmp}
              onChange={(e) => {
                const parsed = clamp(Number(e.target.value), -50, 50);
                if (parsed === null) return;
                liveRef.current.pulseAmp = parsed;
                setPulseAmp(parsed);
              }}
            />
            <button
              type="button"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-ink px-3 text-sm text-surface disabled:opacity-40"
              disabled={pulseAmp === 0}
              onClick={() => {
                simRef.current?.sendPulse(liveRef.current.pulseAmp);
                refresh();
              }}
            >
              <Zap className="size-4" aria-hidden="true" />
              Wyślij
            </button>
          </div>
          <p className="text-xs leading-5 text-muted">
            Wartość od −50 do 50. Ujemna hamuje. W trybie krokowym impuls czeka na następny krok.
          </p>
        </div>
      </fieldset>

      <button
        type="button"
        className="inline-flex h-11 items-center justify-center gap-2 border border-line px-3 text-sm text-ink hover:bg-bg"
        onClick={() => {
          simRef.current?.reset(liveRef.current.params);
          refresh();
        }}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Reset stanu
      </button>
    </aside>
  );
}
