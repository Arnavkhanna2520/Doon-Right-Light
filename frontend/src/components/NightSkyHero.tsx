import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * Interactive hero. Dragging the dimmer from "unshielded" to "shielded" pulls the
 * skyglow back down to the streets and lets the stars return over the valley.
 * It is an illustration of the idea, not a simulation or a measurement.
 */

// Deterministic pseudo-random numbers so the sky is the same on every visit.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const LAMPS = [70, 150, 235, 320, 410, 495, 585, 670, 760, 845, 930, 1015, 1100, 1180];

export default function NightSkyHero() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState(0); // 0 = unshielded, 100 = fully shielded
  const touched = useRef(false);
  const stars = useMemo(() => {
    const r = rng(2520);
    // `need` is how dark the sky must be before this star shows: faint stars need more shielding.
    return Array.from({ length: 420 }, () => ({ x: r(), y: r() ** 1.4 * 0.78, size: 0.4 + r() * 1.3, need: r() ** 0.7 * 100, tw: r() }));
  }, []);
  const visible = stars.filter((s) => s.need <= level).length;

  // One orchestrated moment on load: the lights are shielded and the sky clears.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setLevel(72); return; }
    let raf = 0;
    const start = performance.now() + 500;
    const tick = (t: number) => {
      if (touched.current) return;
      const k = Math.min(1, Math.max(0, (t - start) / 2600));
      setLevel(Math.round(72 * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = Math.min(1, Math.max(0, (level - s.need) / 14));
        if (a <= 0) continue;
        ctx.globalAlpha = a * (0.55 + s.tw * 0.45);
        ctx.fillStyle = s.tw > 0.85 ? "#ffe9c2" : "#eef1ff";
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [level, stars]);

  const spill = 1 - level / 100;
  return (
    <section className="dark relative isolate overflow-hidden bg-[#070a1f] text-ink">
      {/* sky */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,#070a1f_0%,#0d1336_55%,#1a2258_100%)]" />
      <canvas ref={canvas} className="absolute inset-0 -z-10 size-full" aria-hidden />
      {/* skyglow rising from the city: fades as lights are shielded */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[85%]"
        style={{ opacity: 0.25 + spill * 0.75, background: `radial-gradient(120% ${55 + spill * 45}% at 50% 100%, rgba(255,179,71,${0.2 + spill * 0.5}) 0%, rgba(255,150,90,${spill * 0.28}) 38%, transparent 72%)` }} />

      <div className="mx-auto max-w-7xl px-4 pb-[19rem] pt-32 sm:pt-40 lg:pb-[21rem]">
        <h1 className="max-w-4xl text-[clamp(2.75rem,8vw,6.5rem)] font-semibold leading-[0.95]">Light the street.<br />Not the sky.</h1>
        <p className="mt-6 max-w-xl text-lg text-[#c9cfee]">Doon Right-Light maps where Dehradun's outdoor lighting is too bright, badly aimed, too dim or not working, so the city can fix wasted light and dark roads together.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/map" className="rounded-full bg-glow px-6 py-3 font-semibold text-[#1a1200] transition hover:brightness-110">Open the map</Link>
          <Link to="/report" className="rounded-full border border-white/25 bg-white/5 px-6 py-3 font-semibold backdrop-blur transition hover:bg-white/10">Report a lighting issue</Link>
        </div>
      </div>

      {/* valley, ridge and streetlights */}
      <svg viewBox="0 0 1240 300" preserveAspectRatio="xMidYMax slice" className="pointer-events-none absolute inset-x-0 bottom-0 h-72 w-full" aria-hidden>
        <path d="M0 150 90 118 170 138 260 84 340 112 430 60 520 104 610 72 700 118 800 66 890 108 980 82 1070 120 1160 92 1240 126V300H0z" fill="#0a0e2a" opacity=".85" />
        <path d="M0 196 120 172 240 188 380 160 520 184 660 166 800 190 940 168 1080 186 1240 170V300H0z" fill="#090c24" />
        {LAMPS.map((x, i) => {
          const y = 232 + (i % 3) * 6;
          return (
            <g key={x}>
              <circle cx={x} cy={y - 34} r={6 + spill * 46} fill="#ffb347" opacity={spill * 0.2} />
              <circle cx={x} cy={y - 34} r={4 + spill * 20} fill="#ffcf8a" opacity={spill * 0.35} />
              <path d={`M${x - 7} ${y - 33}h14l${14 + 8}  ${33 + 30}h${-(14 + 44)}z`} fill="#ffb347" opacity={0.1 + (level / 100) * 0.42} />
              <path d={`M${x} ${y + 30}V${y - 34}`} stroke="#3a4380" strokeWidth="2.5" />
              <rect x={x - 8} y={y - 38} width="16" height="4" rx="2" fill="#c9cfee" opacity={0.25 + (level / 100) * 0.75} />
              <circle cx={x} cy={y - 33} r="2.6" fill="#fff3d6" />
            </g>
          );
        })}
        <path d="M0 262h1240v38H0z" fill="#060818" />
      </svg>

      {/* dimmer */}
      <div className="absolute inset-x-0 bottom-5 px-4">
        <div className="mx-auto flex max-w-xl flex-col gap-2 rounded-2xl border border-white/15 bg-[#0b0f29]/70 p-4 backdrop-blur-md">
          <label htmlFor="dimmer" className="flex items-baseline justify-between gap-4 text-sm">
            <span className="font-medium">Drag to shield the city's streetlights</span>
            <span className="tabular whitespace-nowrap text-[#c9cfee]"><strong className="display text-xl text-ink">{visible}</strong> stars in view</span>
          </label>
          <input id="dimmer" type="range" min={0} max={100} value={level} className="dimmer" style={{ ["--v" as string]: `${level}%` }}
            onChange={(e) => { touched.current = true; setLevel(Number(e.target.value)); }} aria-valuetext={`${level}% of lights shielded, ${visible} stars visible`} />
          <div className="flex justify-between text-xs text-[#a3abd0]"><span>Unshielded</span><span className="hidden sm:inline">An illustration of the idea, not a measurement</span><span>Shielded</span></div>
        </div>
      </div>
    </section>
  );
}
