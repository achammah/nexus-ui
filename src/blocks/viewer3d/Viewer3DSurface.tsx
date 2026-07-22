// Viewer3D surface — the heavy chunk (three.js). Two modes:
//   OBJECT — real model import (glTF/GLB/OBJ via URL, file picker or drag-drop)
//   or a procedural fallback; orbit/zoom/pan, presets, 360° spin, auto-rotate,
//   wireframe, PNG export, IBL + soft shadows, data-driven hotspots.
//   FLOORPLAN — an architect-grade drawing set: 2D technical PLAN (SVG with
//   chain dimensions, door swings, scale bar, north arrow, title block), 3D
//   perspective, sun-lit RENDER mode, orthographic ELEVATION / SECTION / AXON
//   views, a room SCHEDULE, an interactive measure tool and metric/imperial
//   units — all derived from one rooms+openings config.
// Free-surface contract: host owns the snapshot (value/onChange/reloadNonce),
// this component owns the WebGL lifecycle, token-derived materials and the
// dark/light re-theme.
import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useThemeNonce } from "../workbook/workbook-theme";
import { buildLevel, buildSedan, setLevelGhost, type BuiltLevel } from "./builders";
import { loadFromFiles, loadFromSource, normalizeModel, ModelError, type LoadedModel } from "./loaders";
import {
  AXON_DIR, derivePalette, derivePlanPalette, ELEV_DIRS, envIntensity, EASE, fitDistance, fitFor,
  groundShadowOpacity, LOOK, ORTHO, PRESET_DIRS, SUN, sunFor, type ElevationDir, type Preset,
} from "./look";
import { formatArea, levelArea, levelWalls, type Wall } from "./plan-geometry";
import { moveWall, patchOpening, patchRoom, resizeOpening, slideOpening, wallIsAxisAligned } from "./plan-edit";
import { Plan2D, type Plan2DHandle } from "./Plan2D";
import { Apron } from "./Apron";
import {
  seedScene, type PlanView, type Viewer3DFloorplanConfig, type Viewer3DHotspot,
  type Viewer3DLayers, type Viewer3DOpening, type Viewer3DPlanMeta, type Viewer3DRoom,
  type Viewer3DSelection, type Viewer3DSnapshot, type Viewer3DUnits,
} from "./scene";
import "./viewer3d.css";

export interface Viewer3DSurfaceProps {
  /* the scene to load; null seeds the vehicle demo */
  value: Viewer3DSnapshot | null;
  /* fired when persisted viewer state changes (auto-rotate, active level, view, units) */
  onChange?: (snapshot: Viewer3DSnapshot) => void;
  /* bump to force a fresh mount from the current `value` */
  reloadNonce?: number;
  className?: string;
  /* host controls (save state, reset) — rendered into the toolbar's right end */
  actions?: React.ReactNode;
  "data-testid"?: string;
}

type Anim =
  | { kind: "fly"; t0: number; ms: number; fromP: THREE.Vector3; fromT: THREE.Vector3; toP: THREE.Vector3; toT: THREE.Vector3 }
  | { kind: "spin"; t0: number; ms: number; last: number };

interface Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  camera: THREE.Camera;           // the ACTIVE camera (persp or ortho)
  controls: OrbitControls;
  key: THREE.DirectionalLight;
  sun: THREE.DirectionalLight;
  model: THREE.Group;             // object model OR all levels
  levels: Map<string, BuiltLevel>;
  sphere: THREE.Sphere;           // fit sphere of the ACTIVE content
  box: THREE.Box3;
  raycaster: THREE.Raycaster;
  pmrem: THREE.PMREMGenerator;
  clip: THREE.Plane;
  /* facade-fit half-height for the ortho frustum (set by the view rig; the
     ResizeObserver must preserve it, not recompute from the fit sphere) */
  orthoHalfH: number | null;
  anim: Anim | null;
  /* view-to-view camera transition: eased step closure driven by the tick */
  viewAnim: { t0: number; ms: number; step: (e: number) => void; done: () => void } | null;
  frame: number;
  /* re-run framing/ground/shadow fit after the model content changed */
  refit: () => void;
  /* blob-URL release for a user-imported model */
  userRelease: (() => void) | null;
  dispose: () => void;
}

const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    mats.forEach((mat) => {
      /* imported models carry textures — release them with the material */
      const sm = mat as THREE.MeshStandardMaterial;
      for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap"] as const) {
        (sm[k] as THREE.Texture | null)?.dispose();
      }
      mat.dispose();
    });
  });
}

const PLAN_VIEWS: { id: PlanView; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "3d", label: "3D" },
  { id: "render", label: "Render" },
  { id: "elevation", label: "Elevation" },
  { id: "section", label: "Section" },
  { id: "axon", label: "Axon" },
];

export function Viewer3DSurface({ value, onChange, reloadNonce = 0, className, actions, ...rest }: Viewer3DSurfaceProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const engineRef = React.useRef<Engine | null>(null);
  const planRef = React.useRef<Plan2DHandle>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const snapRef = React.useRef<Viewer3DSnapshot>(value ?? seedScene());
  const [phase, setPhase] = React.useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [innerNonce, setInnerNonce] = React.useState(0); // retry after error
  const nonce = useThemeNonce();
  const reduced = prefersReducedMotion();

  const snap = value && value.kind === "viewer3d" ? value : snapRef.current;
  snapRef.current = snap;
  const mode = snap.mode;

  const [autoRotate, setAutoRotate] = React.useState(!!snap.autoRotate && !reduced);
  const [wireframe, setWireframe] = React.useState(false);
  const [activeLevel, setActiveLevel] = React.useState(
    snap.activeLevel ?? snap.floorplan?.levels[0]?.id ?? "");
  const [planView, setPlanView] = React.useState<PlanView>(
    mode === "floorplan" ? (snap.planView ?? "plan") : "3d");
  const [units, setUnits] = React.useState<Viewer3DUnits>(snap.units ?? "metric");
  const [elevDir, setElevDir] = React.useState<ElevationDir>("south");
  const [sectionAxis, setSectionAxis] = React.useState<"x" | "z">("x");
  const [sectionPos, setSectionPos] = React.useState(0.5);
  const [sunHour, setSunHour] = React.useState(SUN.hourDefault);
  const [measuring, setMeasuring] = React.useState(false);
  const [selection, setSelection] = React.useState<Viewer3DSelection>(null);
  const [layers, setLayers] = React.useState<Viewer3DLayers>(snap.layers ?? {});
  const [apronOpen, setApronOpen] = React.useState(snap.apron !== false);
  const [geomNonce, setGeomNonce] = React.useState(0); // bump: floorplan geometry changed → rebuild engine
  const [openHotspot, setOpenHotspot] = React.useState<Viewer3DHotspot | null>(null);
  const [importPct, setImportPct] = React.useState<number | null | false>(false); // false = idle
  const [importedName, setImportedName] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  /* the WebGL engine exists except in the pure-2D plan view */
  const engineOn = mode === "object" || planView !== "plan";
  const showOverlay = mode === "object" || planView === "3d" || planView === "render";
  const allowImport = mode === "object" && snap.object?.allowImport !== false;

  const visibleHotspots = React.useMemo(
    () => snap.hotspots.filter((h) => mode === "object" || !h.level || h.level === activeLevel),
    [snap.hotspots, mode, activeLevel],
  );
  const anchorsRef = React.useRef<{ label: string; roomId: string; pos: THREE.Vector3 }[]>([]);
  const [labelIds, setLabelIds] = React.useState<{ roomId: string; label: string }[]>([]);

  const persist = (patch: Partial<Viewer3DSnapshot>) => {
    const next = { ...snapRef.current, ...patch };
    snapRef.current = next;
    onChangeRef.current?.(next);
  };

  /* ---- mount the engine ---- */
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !engineOn) { setPhase("ready"); return; }
    let cancelled = false;
    setPhase("loading");
    setOpenHotspot(null);
    setImportedName(null);
    const s = snapRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: LOOK.renderer.antialias, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, LOOK.renderer.pixelRatioCap));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap; // radius-blurred soft shadows
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LOOK.renderer.toneMappingExposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const persp = new THREE.PerspectiveCamera(LOOK.camera.fov, 1, LOOK.camera.near, LOOK.camera.far);
    const ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.01, 500);
    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = LOOK.feel.damping;
    controls.autoRotateSpeed = LOOK.feel.autoRotateSpeed;
    controls.maxPolarAngle = LOOK.camera.maxPolarAngle;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), LOOK.env.blur).texture;
    scene.environmentIntensity = envIntensity();

    const L = LOOK.lights;
    const hemi = new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity);
    const key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
    key.castShadow = true;
    key.shadow.mapSize.set(LOOK.renderer.shadowMapSize, LOOK.renderer.shadowMapSize);
    key.shadow.radius = LOOK.renderer.shadowRadius;
    key.shadow.bias = LOOK.renderer.shadowBias;
    const sun = new THREE.DirectionalLight("#ffffff", 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(LOOK.renderer.shadowMapSize, LOOK.renderer.shadowMapSize);
    sun.shadow.radius = LOOK.renderer.shadowRadius * 0.5;
    sun.shadow.bias = LOOK.renderer.shadowBias;
    sun.visible = false;
    scene.add(hemi, key, sun);

    const pal = derivePalette(s.object?.paint);
    const model = new THREE.Group();
    scene.add(model);
    const levels = new Map<string, BuiltLevel>();

    const engine: Engine = {
      renderer, scene, persp, ortho, camera: persp, controls, key, sun, model, levels,
      sphere: new THREE.Sphere(new THREE.Vector3(), 3), box: new THREE.Box3(),
      raycaster: new THREE.Raycaster(), pmrem, clip: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
      orthoHalfH: null, anim: null, viewAnim: null, frame: 0, userRelease: null,
      refit: () => {},
      dispose: () => {
        cancelAnimationFrame(engine.frame);
        ro.disconnect();
        controls.dispose();
        disposeObject(scene);
        engine.userRelease?.();
        scene.environment?.dispose();
        pmrem.dispose();
        renderer.dispose();
        // hard-release the GPU context: renderer.dispose() alone leaves it alive
        // until GC, so repeated navigations hit the browser's ~16-context cap.
        renderer.forceContextLoss();
        renderer.domElement.remove();
      },
    };
    engineRef.current = engine;
    // test hook: journeys assert engine state (ghosting, camera) through this
    (host as HTMLDivElement & { __nxV3?: Engine }).__nxV3 = engine;

    engine.refit = () => {
      if (cancelled) return;
      // size the camera from the host FIRST — framing is aspect-dependent and the
      // ResizeObserver has not fired yet, so camera.aspect is still its 1:1 default
      const hw = host.clientWidth, hh = host.clientHeight;
      if (hw && hh) {
        renderer.setSize(hw, hh, false);
        persp.aspect = hw / hh;
        persp.updateProjectionMatrix();
      }
      // fit sphere + ground under the content
      scene.getObjectByName("nx-ground")?.removeFromParent();
      const box = new THREE.Box3().setFromObject(model);
      engine.box.copy(box);
      box.getBoundingSphere(engine.sphere);
      const r = Math.max(engine.sphere.radius, 1);
      const G = LOOK.ground, C = LOOK.camera, fit0 = fitFor(s.mode);
      const groundY = Math.min(box.min.y, 0) - 0.001;
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(r * G.radiusMul, 48),
        new THREE.ShadowMaterial({ opacity: groundShadowOpacity(s.mode === "floorplan") }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = groundY;
      ground.receiveShadow = true;
      ground.name = "nx-ground";
      scene.add(ground);
      // key light rides the model scale so shadow softness reads the same at any size
      key.position.copy(engine.sphere.center).add(new THREE.Vector3(...L.key.dir).multiplyScalar(r * 2));
      key.target.position.copy(engine.sphere.center);
      key.target.updateMatrixWorld();
      for (const light of [key, sun]) {
        light.shadow.camera.left = light.shadow.camera.bottom = -r * G.frustumMul;
        light.shadow.camera.right = light.shadow.camera.top = r * G.frustumMul;
        light.shadow.camera.far = r * G.farMul;
        light.shadow.camera.updateProjectionMatrix();
      }
      controls.minDistance = r * C.minDistanceMul;
      controls.maxDistance = Math.max(r * C.maxDistanceMul, fitDistance(r, persp.aspect, fit0.mul) * 1.6);
      controls.target.copy(engine.sphere.center);
      if (s.mode === "floorplan") {
        // aim low: the ghosted upper level pulls the fit sphere up and would sit
        // the building in the bottom of the frame
        controls.target.y = box.min.y + (box.max.y - box.min.y) * C.planTargetFrac;
        engine.sphere.center.copy(controls.target);
      }
      const fit = fitFor(s.mode);
      const dir = new THREE.Vector3(...fit.dir).normalize();
      persp.position.copy(engine.sphere.center)
        .addScaledVector(dir, fitDistance(r, persp.aspect, fit.mul));
      persp.lookAt(engine.sphere.center);
      controls.update();
      setPhase("ready");
    };

    if (s.mode === "floorplan" && s.floorplan) {
      // center the plan footprint on the origin
      const all = s.floorplan.levels.flatMap((l) => l.rooms.flatMap((room) => room.poly));
      const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
      const minZ = Math.min(...all.map((p) => p[1])), maxZ = Math.max(...all.map((p) => p[1]));
      model.position.set(-(minX + maxX) / 2, 0, -(minZ + maxZ) / 2);
      s.floorplan.levels.forEach((lvl, i) => {
        const built = buildLevel(lvl, pal, i, s.floorplan?.wallThickness ?? 0.15);
        levels.set(lvl.id, built);
        model.add(built.group);
      });
      engine.refit();
    } else if (s.object && s.object.source.type !== "procedural") {
      setImportPct(null);
      loadFromSource(s.object.source, (pct) => { if (!cancelled) setImportPct(pct); })
        .then((loaded: LoadedModel) => {
          if (cancelled) { loaded.release(); disposeObject(loaded.object); return; }
          normalizeModel(loaded.object, s.object?.scale ?? 1, s.object?.up ?? "y");
          model.add(loaded.object);
          engine.userRelease = loaded.release;
          setImportedName(loaded.name);
          setImportPct(false);
          engine.refit();
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setImportPct(false);
          setErrorMsg(e instanceof ModelError ? e.message : "The 3D model could not be loaded.");
          setPhase("error");
        });
    } else {
      model.add(buildSedan(pal));
      engine.refit();
    }

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      const halfH = engine.orthoHalfH ?? engine.sphere.radius * ORTHO.fitMul;
      const halfW = halfH * (w / h);
      ortho.left = -halfW; ortho.right = halfW; ortho.top = halfH; ortho.bottom = -halfH;
      ortho.updateProjectionMatrix();
    });
    ro.observe(host);

    /* render loop: damping/auto-rotate/animations + DOM projection of hotspots
       and room labels (transforms only — no React state per frame) */
    const v = new THREE.Vector3();
    const tick = (now: number) => {
      engine.frame = requestAnimationFrame(tick);
      const va = engine.viewAnim;
      if (va) {
        const p = Math.min((now - va.t0) / va.ms, 1);
        va.step(EASE(p));
        if (p >= 1) { engine.viewAnim = null; va.done(); }
      }
      const a = engine.anim;
      if (a) {
        const p = Math.min((now - a.t0) / a.ms, 1);
        if (a.kind === "fly") {
          const e = EASE(p);
          persp.position.lerpVectors(a.fromP, a.toP, e);
          controls.target.lerpVectors(a.fromT, a.toT, e);
        } else {
          const e = EASE(p);
          const delta = (e - a.last) * Math.PI * 2;
          a.last = e;
          persp.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), delta).add(controls.target);
        }
        if (p >= 1) engine.anim = null;
      }
      controls.update();
      renderer.render(scene, engine.camera);

      const overlay = overlayRef.current;
      if (overlay) {
        const w = host.clientWidth, h = host.clientHeight;
        const project = (el: HTMLElement, pos: THREE.Vector3, occludable: boolean) => {
          v.copy(pos).project(engine.camera);
          const behind = v.z > 1;
          el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
          el.style.visibility = behind ? "hidden" : "visible";
          if (occludable) {
            engine.raycaster.set((engine.camera as THREE.PerspectiveCamera).position, v.copy(pos).sub((engine.camera as THREE.PerspectiveCamera).position).normalize());
            const dist = (engine.camera as THREE.PerspectiveCamera).position.distanceTo(pos);
            const hits = engine.raycaster.intersectObject(engine.model, true);
            el.classList.toggle("nxV3Pin--occluded", hits.length > 0 && hits[0].distance < dist - 0.18);
            v.copy(pos); // restore (v was reused)
          }
        };
        overlay.querySelectorAll<HTMLElement>("[data-world]").forEach((el) => {
          const [x, y, z] = (el.dataset.world as string).split(",").map(Number);
          v.set(x, y, z);
          if (engine.model) v.add(new THREE.Vector3(engine.model.position.x, 0, engine.model.position.z));
          const world = v.clone();
          project(el, world, el.dataset.occlude === "1");
        });
      }
    };
    engine.frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadNonce, innerNonce, engineOn, geomNonce]);

  /* ---- floorplan editing (apron fields + plan direct manipulation) ---- */

  const setFloorplan = React.useCallback((next: Viewer3DFloorplanConfig) => {
    persist({ floorplan: next });
    setGeomNonce((n) => n + 1); // no-op while the engine is unmounted (plan view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dragFpRef = React.useRef<Viewer3DFloorplanConfig | null>(null);
  const dragWallRef = React.useRef<Wall | null>(null);
  const dragOpeningRef = React.useRef<{ id: string; wall: Wall } | null>(null);

  const onWallDragStart = (wall: Wall) => { dragFpRef.current = snapRef.current.floorplan ?? null; dragWallRef.current = wall; };
  const onWallDrag = (delta: number) => {
    if (!dragFpRef.current || !dragWallRef.current) return;
    setFloorplan(moveWall(dragFpRef.current, activeLevel, dragWallRef.current, delta));
  };
  const onWallDragEnd = () => {
    /* re-anchor the selection to the moved wall (same axis + span + rooms) */
    const old = dragWallRef.current;
    const fp = snapRef.current.floorplan;
    dragFpRef.current = null; dragWallRef.current = null;
    if (!old || !fp) return;
    const lvl = fp.levels.find((l) => l.id === activeLevel);
    if (!lvl) return;
    const axis = wallIsAxisAligned(old);
    const span = (w: Wall) => axis === "x"
      ? [Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])]
      : [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])];
    const [lo, hi] = span(old);
    const match = levelWalls(lvl).find((w) =>
      wallIsAxisAligned(w) === axis
      && Math.abs(span(w)[0] - lo) < 1e-3 && Math.abs(span(w)[1] - hi) < 1e-3
      && w.rooms.slice().sort().join() === old.rooms.slice().sort().join());
    if (match) setSelection({ kind: "wall", level: activeLevel, a: match.a, b: match.b });
  };

  const onOpeningDragStart = (id: string, wall: Wall) => {
    dragFpRef.current = snapRef.current.floorplan ?? null;
    dragOpeningRef.current = { id, wall };
  };
  const onOpeningDrag = (delta: number) => {
    if (!dragFpRef.current || !dragOpeningRef.current) return;
    setFloorplan(slideOpening(dragFpRef.current, activeLevel, dragOpeningRef.current.id, dragOpeningRef.current.wall, delta));
  };
  const onOpeningDragEnd = () => { dragFpRef.current = null; dragOpeningRef.current = null; };

  const fpNow = () => snapRef.current.floorplan;
  const apronHandlers = {
    onPatchRoom: (levelId: string, roomId: string, patch: Partial<Viewer3DRoom>) => {
      const fp = fpNow(); if (fp) setFloorplan(patchRoom(fp, levelId, roomId, patch));
    },
    onPatchOpening: (levelId: string, openingId: string, patch: Partial<Viewer3DOpening>) => {
      const fp = fpNow(); if (fp) setFloorplan(patchOpening(fp, levelId, openingId, patch));
    },
    onResizeOpening: (levelId: string, openingId: string, width: number) => {
      const fp = fpNow(); if (fp) setFloorplan(resizeOpening(fp, levelId, openingId, width));
    },
    onPatchMeta: (patch: Partial<Viewer3DPlanMeta>) => {
      const fp = fpNow(); if (fp) setFloorplan({ ...fp, meta: { ...(fp.meta ?? {}), ...patch } });
    },
    onLayers: (patch: Partial<Viewer3DLayers>) => {
      const next = { ...layers, ...patch };
      setLayers(next);
      persist({ layers: next });
    },
  };

  /* ---- model import (object mode) ---- */

  const importFiles = React.useCallback(async (files: File[]) => {
    const e = engineRef.current;
    if (!e || snapRef.current.mode !== "object") return;
    setImportPct(5);
    try {
      const loaded = await loadFromFiles(files, (pct) => setImportPct(pct));
      /* replace: dispose + release the previous content, keep the group */
      const eng = engineRef.current;
      if (!eng) { loaded.release(); disposeObject(loaded.object); return; }
      [...eng.model.children].forEach((c) => { disposeObject(c); c.removeFromParent(); });
      eng.userRelease?.();
      normalizeModel(loaded.object, snapRef.current.object?.scale ?? 1);
      eng.model.add(loaded.object);
      eng.userRelease = loaded.release;
      setImportedName(loaded.name);
      setImportPct(false);
      setPhase("ready");
      eng.refit();
    } catch (err) {
      setImportPct(false);
      setErrorMsg(err instanceof ModelError ? err.message : "The model could not be imported.");
      setPhase("error");
    }
  }, []);

  const onDrop = (ev: React.DragEvent) => {
    if (!allowImport) return;
    ev.preventDefault();
    setDragOver(false);
    const files = [...ev.dataTransfer.files];
    if (files.length) void importFiles(files);
  };

  /* ---- reactive engine state (no remount) ---- */

  // auto-rotate (forced off under prefers-reduced-motion)
  React.useEffect(() => {
    const e = engineRef.current;
    if (e) e.controls.autoRotate = autoRotate && !reduced && phase === "ready" && (mode === "object" || planView === "3d" || planView === "render");
  }, [autoRotate, reduced, phase, mode, planView]);

  // wireframe
  React.useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => { (mat as THREE.MeshStandardMaterial).wireframe = wireframe; });
    });
  }, [wireframe, phase]);

  // active level: ghost the others, retarget the camera, publish room labels
  React.useEffect(() => {
    const e = engineRef.current;
    if (!e || mode !== "floorplan" || phase !== "ready") return;
    /* level ghosting is a NAVIGATION aid for the interactive 3D view; whole-
       building views (elevation/section/axon/render) show every level solid */
    const ghosting = planView === "3d";
    e.levels.forEach((built, id) => setLevelGhost(built.group, ghosting && id !== activeLevel));
    const built = e.levels.get(activeLevel);
    anchorsRef.current = built ? built.anchors.map((a) => ({ ...a, pos: a.pos })) : [];
    setLabelIds(anchorsRef.current.map((a) => ({ roomId: a.roomId, label: a.label })));
    setOpenHotspot(null);
  }, [activeLevel, mode, phase, engineOn, planView]);

  const flyTo = React.useCallback((dir: [number, number, number], distMul = LOOK.camera.fitMul, ms = LOOK.feel.flyMs) => {
    const e = engineRef.current;
    if (!e) return;
    const r = e.sphere.radius;
    const toT = e.sphere.center.clone();
    const toP = toT.clone().addScaledVector(
      new THREE.Vector3(...dir).normalize(), fitDistance(r, e.persp.aspect, distMul));
    if (prefersReducedMotion()) {
      e.persp.position.copy(toP); e.controls.target.copy(toT); e.controls.update();
      return;
    }
    e.anim = { kind: "fly", t0: performance.now(), ms, fromP: e.persp.position.clone(), fromT: e.controls.target.clone(), toP, toT };
  }, []);

  /* ---- floorplan view rig ----
     Three concerns, three effects: (1) the CAMERA rig — with eased transitions
     between views (dolly-zoom perspective↔orthographic, orbiting ortho↔ortho,
     the section plane sweeping in), because plan/3D/elevation/section are views
     of ONE model, not separate screens; (2) the SECTION cut position; (3) the
     SUN + ground treatment. prefers-reduced-motion snaps everything. */

  const prevViewRef = React.useRef<PlanView | null>(null);

  /* target ortho pose for a view (facade-fit, aimed at the box center) */
  const orthoPose = React.useCallback((e: Engine, view: PlanView, dir3: [number, number, number], aspect: number) => {
    const r = Math.max(e.sphere.radius, 1);
    const bc = e.box.getCenter(new THREE.Vector3());
    const bs = e.box.getSize(new THREE.Vector3());
    const facadeW = view === "axon" ? r * 2 : (Math.abs(dir3[0]) > 0.5 ? bs.z : bs.x);
    const facadeH = view === "axon" ? r * 2 : bs.y;
    const halfH = Math.max(facadeH / 2, facadeW / (2 * aspect)) * ORTHO.fitMul;
    return { bc, halfH, dir: new THREE.Vector3(...dir3).normalize(), r };
  }, []);

  /* spherical direction interpolation (shortest azimuth path) */
  const dirLerp = (a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 => {
    const sa = new THREE.Spherical().setFromVector3(a), sb = new THREE.Spherical().setFromVector3(b);
    let dTheta = sb.theta - sa.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    const phi = THREE.MathUtils.clamp(sa.phi + (sb.phi - sa.phi) * t, 0.02, Math.PI - 0.02);
    return new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, phi, sa.theta + dTheta * t));
  };

  const sectionCut = React.useCallback((e: Engine, axis: "x" | "z", pos: number): number => {
    const bb = e.box;
    return axis === "x" ? bb.min.x + (bb.max.x - bb.min.x) * pos : bb.min.z + (bb.max.z - bb.min.z) * pos;
  }, []);

  /* (1) camera rig + transitions */
  React.useEffect(() => {
    const e = engineRef.current;
    if (!e || mode !== "floorplan" || phase !== "ready") return;
    if (planView === "plan") { prevViewRef.current = null; return; }
    const host = hostRef.current;
    const aspect = host && host.clientHeight ? host.clientWidth / host.clientHeight : 1.6;
    const prev = prevViewRef.current;
    prevViewRef.current = planView;

    const isPersp = planView === "3d" || planView === "render";
    const wasPersp = prev === "3d" || prev === "render";
    const dir3 = planView === "axon" ? AXON_DIR : ELEV_DIRS[sectionOrElevDir(planView, elevDir, sectionAxis)];
    const pose = isPersp ? null : orthoPose(e, planView, dir3, aspect);

    const applyOrtho = () => {
      const p = pose as NonNullable<typeof pose>;
      e.orthoHalfH = p.halfH;
      e.ortho.left = -p.halfH * aspect; e.ortho.right = p.halfH * aspect;
      e.ortho.top = p.halfH; e.ortho.bottom = -p.halfH;
      e.ortho.near = 0.01; e.ortho.far = p.r * 20;
      e.ortho.zoom = 1;
      e.ortho.position.copy(p.bc).addScaledVector(p.dir, p.r * ORTHO.camDistMul);
      e.ortho.up.set(0, 1, 0);
      e.ortho.lookAt(p.bc);
      e.ortho.updateProjectionMatrix();
      e.camera = e.ortho;
      e.controls.object = e.ortho;
      e.controls.target.copy(p.bc);
      e.controls.enableRotate = planView === "axon";
      e.controls.minZoom = ORTHO.zoomMin; e.controls.maxZoom = ORTHO.zoomMax;
      e.controls.update();
    };
    const applyPersp = () => {
      e.persp.fov = LOOK.camera.fov;
      e.persp.updateProjectionMatrix();
      e.camera = e.persp;
      e.controls.object = e.persp;
      e.controls.enableRotate = true;
      e.controls.update();
    };

    /* section clip: entering sweeps the plane in; leaving clears after the fly */
    const enteringSection = planView === "section" && prev !== "section";
    const leavingSection = prev === "section" && planView !== "section";
    const cut = sectionCut(e, sectionAxis, sectionPos);
    const setClipNow = () => {
      if (planView === "section") {
        e.clip.normal.set(sectionAxis === "x" ? -1 : 0, 0, sectionAxis === "x" ? 0 : -1);
        e.clip.constant = cut;
        e.renderer.clippingPlanes = [e.clip];
      } else {
        e.renderer.clippingPlanes = [];
      }
    };
    const clipEdge = sectionAxis === "x" ? e.box.max.x + 0.2 : e.box.max.z + 0.2;

    const snapAll = () => { if (isPersp) applyPersp(); else applyOrtho(); setClipNow(); };

    if (prefersReducedMotion() || prev === null || prev === planView) { e.viewAnim = null; snapAll(); return; }
    if (isPersp && wasPersp) { setClipNow(); return; } // 3d↔render: lights change, camera stays

    const ms = LOOK.feel.flyMs + 250;
    const center0 = e.controls.target.clone();
    const fromDir = e.camera === e.ortho
      ? e.ortho.position.clone().sub(center0).normalize()
      : e.persp.position.clone().sub(center0).normalize();
    const fromHalfH = e.camera === e.ortho
      ? (e.orthoHalfH ?? e.ortho.top) / e.ortho.zoom
      : e.persp.position.distanceTo(center0) * Math.tan((e.persp.fov * Math.PI) / 360);

    /* clip sweep state */
    if (enteringSection) {
      e.clip.normal.set(sectionAxis === "x" ? -1 : 0, 0, sectionAxis === "x" ? 0 : -1);
      e.clip.constant = clipEdge;
      e.renderer.clippingPlanes = [e.clip];
    }
    const clipFrom = e.clip.constant;
    const clipTo = planView === "section" ? cut : clipEdge;
    const stepClip = (t: number) => {
      if (enteringSection || leavingSection || planView === "section") {
        e.clip.constant = clipFrom + (clipTo - clipFrom) * t;
      }
    };

    if (!isPersp) {
      /* → ortho: dolly-zoom the perspective camera down to a near-parallel view,
         then swap in the exact orthographic camera. From another ortho view the
         camera orbits the model instead (fov stays parallel-ish via the ortho). */
      const p = pose as NonNullable<typeof pose>;
      if (wasPersp) {
        const fovFrom = LOOK.camera.fov, fovTo = 5;
        const tFrom = center0.clone(), tTo = p.bc.clone();
        e.camera = e.persp; e.controls.object = e.persp; e.controls.enableRotate = false;
        e.viewAnim = {
          t0: performance.now(), ms,
          step: (t) => {
            const fov = fovFrom + (fovTo - fovFrom) * t;
            const halfH = fromHalfH + (p.halfH - fromHalfH) * t;
            const d = halfH / Math.tan((fov * Math.PI) / 360);
            const dir = dirLerp(fromDir, p.dir, t);
            const tgt = tFrom.clone().lerp(tTo, t);
            e.persp.fov = fov;
            e.persp.position.copy(tgt).addScaledVector(dir, d);
            e.persp.lookAt(tgt);
            e.persp.updateProjectionMatrix();
            e.controls.target.copy(tgt);
            stepClip(t);
          },
          done: () => { applyOrtho(); setClipNow(); },
        };
      } else {
        /* ortho → ortho: orbit the ortho camera between poses */
        const p0 = { halfH: fromHalfH, bc: center0.clone() };
        e.camera = e.ortho; e.controls.object = e.ortho; e.controls.enableRotate = false;
        e.viewAnim = {
          t0: performance.now(), ms,
          step: (t) => {
            const halfH = p0.halfH + (p.halfH - p0.halfH) * t;
            const bc = p0.bc.clone().lerp(p.bc, t);
            const dir = dirLerp(fromDir, p.dir, t);
            e.orthoHalfH = halfH;
            e.ortho.left = -halfH * aspect; e.ortho.right = halfH * aspect;
            e.ortho.top = halfH; e.ortho.bottom = -halfH;
            e.ortho.zoom = 1;
            e.ortho.position.copy(bc).addScaledVector(dir, p.r * ORTHO.camDistMul);
            e.ortho.lookAt(bc);
            e.ortho.updateProjectionMatrix();
            e.controls.target.copy(bc);
            stepClip(t);
          },
          done: () => { applyOrtho(); setClipNow(); },
        };
      }
    } else {
      /* ortho → perspective: start the persp camera at a matching narrow-fov
         pose far out, widen back in to the standard framing */
      const r = Math.max(e.sphere.radius, 1);
      const fit = fitFor(mode);
      const toDir = new THREE.Vector3(...fit.dir).normalize();
      const toT = e.sphere.center.clone();
      const toDist = fitDistance(r, aspect, fit.mul);
      const toHalfH = toDist * Math.tan((LOOK.camera.fov * Math.PI) / 360);
      const fovFrom = 5, fovTo = LOOK.camera.fov;
      e.camera = e.persp; e.controls.object = e.persp; e.controls.enableRotate = false;
      e.viewAnim = {
        t0: performance.now(), ms,
        step: (t) => {
          const fov = fovFrom + (fovTo - fovFrom) * t;
          const halfH = fromHalfH + (toHalfH - fromHalfH) * t;
          const d = halfH / Math.tan((fov * Math.PI) / 360);
          const dir = dirLerp(fromDir, toDir, t);
          const tgt = center0.clone().lerp(toT, t);
          e.persp.fov = fov;
          e.persp.position.copy(tgt).addScaledVector(dir, d);
          e.persp.lookAt(tgt);
          e.persp.updateProjectionMatrix();
          e.controls.target.copy(tgt);
          stepClip(t);
        },
        done: () => {
          e.persp.fov = LOOK.camera.fov;
          e.persp.position.copy(toT).addScaledVector(toDir, toDist);
          e.persp.updateProjectionMatrix();
          applyPersp();
          e.controls.target.copy(toT);
          setClipNow();
        },
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planView, elevDir, sectionAxis, mode, phase]);

  /* (2) live section cut position (slider / A–A marker) — no re-animation */
  React.useEffect(() => {
    const e = engineRef.current;
    if (!e || mode !== "floorplan" || phase !== "ready" || planView !== "section" || e.viewAnim) return;
    e.clip.constant = sectionCut(e, sectionAxis, sectionPos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionPos, sectionAxis, planView, mode, phase]);

  /* (3) sun + ground treatment */
  React.useEffect(() => {
    const e = engineRef.current;
    if (!e || mode !== "floorplan" || phase !== "ready") return;
    const r = Math.max(e.sphere.radius, 1);
    const c = e.sphere.center;
    if (planView === "render") {
      const sd = sunFor(sunHour);
      e.sun.visible = true;
      e.sun.intensity = sd.intensity;
      e.sun.color.set(sd.color);
      e.sun.position.copy(c).addScaledVector(new THREE.Vector3(...sd.dir).normalize(), r * 3);
      e.sun.target.position.copy(c);
      e.sun.target.updateMatrixWorld();
      e.key.intensity = LOOK.lights.key.intensity * 0.25;
      e.scene.environmentIntensity = envIntensity() * SUN.envMul;
    } else {
      e.sun.visible = false;
      e.key.intensity = LOOK.lights.key.intensity;
      e.scene.environmentIntensity = envIntensity();
    }
    const ground = e.scene.getObjectByName("nx-ground") as THREE.Mesh | undefined;
    if (ground) (ground.material as THREE.ShadowMaterial).opacity =
      planView === "render" ? groundShadowOpacity(false) : groundShadowOpacity(true);
  }, [planView, sunHour, mode, phase]);

  // re-theme materials + env when the app theme flips or a skin lands
  React.useEffect(() => {
    const e = engineRef.current;
    if (!e || phase !== "ready") return;
    const pal = derivePalette(snapRef.current.object?.paint);
    e.scene.environmentIntensity = envIntensity() * (planView === "render" ? SUN.envMul : 1);
    const ground = e.scene.getObjectByName("nx-ground") as THREE.Mesh | undefined;
    if (ground) (ground.material as THREE.ShadowMaterial).opacity = groundShadowOpacity(mode === "floorplan");
    if (mode === "floorplan") {
      e.levels.forEach((built) => built.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (m.geometry.type === "ShapeGeometry") mat.color.set(pal.floor);
          else if (!mat.userData.baseTransparent) mat.color.set(pal.wall);
        } else if ((o as THREE.LineSegments).isLineSegments) {
          ((o as THREE.LineSegments).material as THREE.LineBasicMaterial).color.set(pal.wallEdge);
        }
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, phase]);

  const spin360 = () => {
    const e = engineRef.current;
    if (!e || prefersReducedMotion()) return;
    e.anim = { kind: "spin", t0: performance.now(), ms: LOOK.feel.spinMs, last: 0 };
  };

  const resetView = () => { const f = fitFor(mode); flyTo(f.dir, f.mul); };

  /* PNG export: plan view rasterizes the SVG sheet; 3D views re-render at 3× */
  const exportPng = async () => {
    const project = (snap.floorplan?.meta?.project ?? snap.title ?? "viewer3d").replace(/[^\w-]+/g, "-").toLowerCase();
    let dataUrl: string | null = null;
    if (mode === "floorplan" && planView === "plan") {
      dataUrl = (await planRef.current?.exportPng()) ?? null;
    } else {
      const e = engineRef.current;
      if (!e) return;
      const prev = e.renderer.getPixelRatio();
      e.renderer.setPixelRatio(3);
      e.renderer.render(e.scene, e.camera);
      dataUrl = e.renderer.domElement.toDataURL("image/png");
      e.renderer.setPixelRatio(prev);
    }
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${project}-${mode === "floorplan" ? `${activeLevel}-${planView}` : "view"}.png`;
    a.click();
  };

  /* keyboard camera controls on the canvas host */
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const e = engineRef.current;
    if (!e || e.camera !== e.persp) return;
    const off = e.persp.position.clone().sub(e.controls.target);
    const Y = new THREE.Vector3(0, 1, 0);
    let handled = true;
    switch (ev.key) {
      case "ArrowLeft": off.applyAxisAngle(Y, LOOK.feel.keyOrbitStep); break;
      case "ArrowRight": off.applyAxisAngle(Y, -LOOK.feel.keyOrbitStep); break;
      case "ArrowUp": case "ArrowDown": {
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.phi = THREE.MathUtils.clamp(sph.phi + (ev.key === "ArrowUp" ? -1 : 1) * LOOK.feel.keyPolarStep, 0.05, LOOK.camera.maxPolarAngle);
        off.setFromSpherical(sph);
        break;
      }
      case "+": case "=": off.multiplyScalar(LOOK.feel.keyZoomIn); break;
      case "-": case "_": off.multiplyScalar(LOOK.feel.keyZoomOut); break;
      case "r": case "R": case "0": resetView(); ev.preventDefault(); return;
      default: handled = false;
    }
    if (!handled) return;
    ev.preventDefault();
    const len = THREE.MathUtils.clamp(off.length(), e.controls.minDistance, e.controls.maxDistance);
    off.setLength(len);
    e.persp.position.copy(e.controls.target).add(off);
    e.controls.update();
  };

  const levels = snap.floorplan?.levels ?? [];
  const activeLevelObj = levels.find((l) => l.id === activeLevel) ?? levels[0];
  const showPresets = mode === "object" && snap.controls?.presets !== false;
  const showWireframe = mode === "object" && snap.controls?.wireframe !== false;
  const showExport = snap.controls?.export !== false;
  const showSchedule = mode === "floorplan" && snap.controls?.schedule !== false;
  const toneClass = (t?: string) => `nxV3Pin--${t || "accent"}`;
  const planPalette = React.useMemo(() => derivePlanPalette(), [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const setView = (v: PlanView) => {
    setPlanView(v);
    setMeasuring(false);
    persist({ planView: v });
  };

  return (
    <div className={["nxV3", className].filter(Boolean).join(" ")} {...rest}>
      <div className="nxV3Bar" data-testid="viewer3d-toolbar">
        <div className="nxV3BarTitle">
          <span className="nxV3Kicker">{mode === "object" ? "3D object" : "Floor plan"}</span>
          {snap.title && <span className="nxV3Title">{snap.title}</span>}
          {importedName && <span className="nxV3Badge" data-testid="viewer3d-modelname" title={`Imported model: ${importedName}`}>{importedName}</span>}
        </div>
        <div className="nxV3BarActions">
          {mode === "floorplan" && (
            <>
              <div className="nxV3Seg" role="group" aria-label="Drawing view">
                {PLAN_VIEWS.map((v) => (
                  <button key={v.id} type="button" className="nxV3SegBtn" aria-pressed={planView === v.id}
                    data-testid={`viewer3d-view-${v.id}`} onClick={() => setView(v.id)}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="nxV3Seg" role="group" aria-label="Floor level">
                {levels.map((l) => (
                  <button key={l.id} type="button" className="nxV3SegBtn" aria-pressed={activeLevel === l.id}
                    data-testid={`viewer3d-level-${l.id}`}
                    onClick={() => { setActiveLevel(l.id); persist({ activeLevel: l.id }); }}>
                    {l.name}
                  </button>
                ))}
              </div>
              <button type="button" className="nxV3Btn" aria-pressed={units === "imperial"} data-testid="viewer3d-units"
                onClick={() => { const u = units === "metric" ? "imperial" : "metric"; setUnits(u); persist({ units: u }); }}>
                {units === "metric" ? "m" : "ft"}
              </button>
              {showSchedule && (
                <button type="button" className="nxV3Btn" aria-pressed={apronOpen} data-testid="viewer3d-apron-toggle"
                  onClick={() => { const next = !apronOpen; setApronOpen(next); persist({ apron: next }); }}>
                  Panel
                </button>
              )}
            </>
          )}
          {allowImport && (
            <>
              <button type="button" className="nxV3Btn" data-testid="viewer3d-import"
                onClick={() => fileRef.current?.click()}>
                Import model
              </button>
              <input ref={fileRef} type="file" multiple hidden
                accept=".glb,.gltf,.obj,.mtl,.bin,.png,.jpg,.jpeg,.webp"
                data-testid="viewer3d-file"
                onChange={(ev) => { const f = [...(ev.target.files ?? [])]; ev.target.value = ""; if (f.length) void importFiles(f); }} />
            </>
          )}
          {showPresets && (
            <div className="nxV3Seg" role="group" aria-label="Camera angle">
              {(Object.keys(PRESET_DIRS) as Preset[]).map((p) => (
                <button key={p} type="button" className="nxV3SegBtn" data-testid={`viewer3d-preset-${p}`}
                  onClick={() => flyTo(PRESET_DIRS[p], p === "top" ? LOOK.camera.topMul : LOOK.camera.fitMul)}>
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          )}
          {mode === "object" && !reduced && (
            <button type="button" className="nxV3Btn" data-testid="viewer3d-spin" onClick={spin360} title="Spin 360°">
              360°
            </button>
          )}
          {!reduced && (mode === "object" || planView === "3d" || planView === "render") && (
            <button type="button" className="nxV3Btn" aria-pressed={autoRotate} data-testid="viewer3d-autorotate"
              onClick={() => { const next = !autoRotate; setAutoRotate(next); persist({ autoRotate: next }); }}>
              Auto-rotate
            </button>
          )}
          {showWireframe && (
            <button type="button" className="nxV3Btn" aria-pressed={wireframe} data-testid="viewer3d-wireframe"
              onClick={() => setWireframe((w) => !w)}>
              Wireframe
            </button>
          )}
          {showExport && (
            <button type="button" className="nxV3Btn" data-testid="viewer3d-export" onClick={() => void exportPng()}>
              PNG
            </button>
          )}
          {engineOn && (
            <button type="button" className="nxV3Btn" data-testid="viewer3d-reset" onClick={resetView}>
              Reset
            </button>
          )}
          {actions}
        </div>
      </div>

      {/* contextual sub-toolbar per floorplan view */}
      {mode === "floorplan" && (planView === "plan" || planView === "elevation" || planView === "section" || planView === "render") && (
        <div className="nxV3SubBar" data-testid="viewer3d-subbar">
          {planView === "plan" && (
            <>
              <button type="button" className="nxV3Btn" aria-pressed={measuring} data-testid="viewer3d-measure"
                onClick={() => setMeasuring((m) => !m)}>
                Measure
              </button>
              <span className="nxV3SubHint">{measuring ? "Click two points on the plan to measure." : `Gross internal area ${activeLevelObj ? formatArea(levelArea(activeLevelObj), units) : ""} · total ${formatArea(levels.reduce((s, l) => s + levelArea(l), 0), units)}`}</span>
            </>
          )}
          {planView === "elevation" && (
            <div className="nxV3Seg" role="group" aria-label="Elevation direction">
              {(Object.keys(ELEV_DIRS) as ElevationDir[]).map((d) => (
                <button key={d} type="button" className="nxV3SegBtn" aria-pressed={elevDir === d}
                  data-testid={`viewer3d-elev-${d}`} onClick={() => setElevDir(d)}>
                  {d[0].toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          )}
          {planView === "section" && (
            <>
              <div className="nxV3Seg" role="group" aria-label="Section axis">
                {(["x", "z"] as const).map((ax) => (
                  <button key={ax} type="button" className="nxV3SegBtn" aria-pressed={sectionAxis === ax}
                    data-testid={`viewer3d-section-${ax}`} onClick={() => setSectionAxis(ax)}>
                    {ax === "x" ? "Long section" : "Cross section"}
                  </button>
                ))}
              </div>
              <label className="nxV3Slider">
                <span>Cut</span>
                <input type="range" min={2} max={98} value={Math.round(sectionPos * 100)} data-testid="viewer3d-section-pos"
                  onChange={(ev) => setSectionPos(Number(ev.target.value) / 100)} aria-label="Section cut position" />
              </label>
            </>
          )}
          {planView === "render" && (
            <label className="nxV3Slider">
              <span>Sun {String(Math.floor(sunHour)).padStart(2, "0")}:{sunHour % 1 ? "30" : "00"}</span>
              <input type="range" min={SUN.hourMin * 2} max={SUN.hourMax * 2} value={sunHour * 2} data-testid="viewer3d-sun"
                onChange={(ev) => setSunHour(Number(ev.target.value) / 2)} aria-label="Sun time of day" />
            </label>
          )}
        </div>
      )}

      <div className="nxV3Body">
      <div className="nxV3Stage"
        onDragOver={allowImport ? (ev) => { ev.preventDefault(); setDragOver(true); } : undefined}
        onDragLeave={allowImport ? () => setDragOver(false) : undefined}
        onDrop={allowImport ? onDrop : undefined}
      >
        {mode === "floorplan" && planView === "plan" && snap.floorplan && activeLevelObj ? (
          <div className="nxV3PlanWrap" data-testid="viewer3d-planwrap">
            <Plan2D
              ref={planRef}
              floorplan={snap.floorplan}
              level={activeLevelObj}
              units={units}
              palette={planPalette}
              hotspots={visibleHotspots}
              measuring={measuring}
              layers={layers}
              selection={selection}
              onSelect={setSelection}
              editable
              onWallDragStart={onWallDragStart}
              onWallDrag={onWallDrag}
              onWallDragEnd={onWallDragEnd}
              onOpeningDragStart={onOpeningDragStart}
              onOpeningDrag={onOpeningDrag}
              onOpeningDragEnd={onOpeningDragEnd}
              section={{ axis: sectionAxis, pos: sectionPos, onPos: setSectionPos, onOpen: () => setView("section") }}
              onElevation={(d) => { setElevDir(d); setView("elevation"); }}
              onHotspot={(h) => setOpenHotspot((cur) => (cur?.id === h.id ? null : h))}
            />
          </div>
        ) : (
          <div
            ref={hostRef}
            className="nxV3Canvas"
            data-testid="viewer3d-host"
            role="application"
            tabIndex={0}
            aria-label={`3D ${mode === "object" ? "object" : "floor plan"} viewer. Drag to orbit, scroll to zoom, arrow keys rotate, plus and minus zoom, R resets the view.`}
            onKeyDown={onKeyDown}
          />
        )}

        {/* hotspots + room labels project over the canvas */}
        {engineOn && (
          <div ref={overlayRef} className="nxV3Overlay" aria-hidden={phase !== "ready" || !showOverlay} style={showOverlay ? undefined : { display: "none" }}>
            {phase === "ready" && showOverlay && visibleHotspots.map((h) => (
              <button
                key={h.id}
                type="button"
                className={`nxV3Pin ${toneClass(h.tone)} ${openHotspot?.id === h.id ? "nxV3Pin--open" : ""}`}
                data-world={h.position.join(",")}
                data-occlude={mode === "object" ? "1" : "0"}
                data-testid={`viewer3d-hotspot-${h.id}`}
                aria-label={`Marker: ${h.label}`}
                onClick={() => setOpenHotspot((cur) => (cur?.id === h.id ? null : h))}
              >
                <span className="nxV3PinDot" />
                <span className="nxV3PinLabel">{h.label}</span>
              </button>
            ))}
            {phase === "ready" && showOverlay && mode === "floorplan" && labelIds.map(({ roomId, label }) => {
              const a = anchorsRef.current.find((x) => x.roomId === roomId);
              if (!a) return null;
              return (
                <span key={roomId} className="nxV3RoomLabel" data-world={`${a.pos.x},${a.pos.y},${a.pos.z}`} data-testid={`viewer3d-room-${roomId}`}>
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {openHotspot && (
          <div className="nxV3Card nx-rise-in-sm" role="dialog" aria-label={openHotspot.label} data-testid="viewer3d-detail">
            <div className="nxV3CardHead">
              <span className={`nxV3CardDot ${toneClass(openHotspot.tone)}`} />
              <span className="nxV3CardTitle">{openHotspot.label}</span>
              <button type="button" className="nxV3CardClose" aria-label="Close details" onClick={() => setOpenHotspot(null)}>×</button>
            </div>
            {openHotspot.detail && <p className="nxV3CardBody">{openHotspot.detail}</p>}
          </div>
        )}

        {engineOn && <div className="nxV3Hint" aria-hidden="true">Drag to orbit · Scroll to zoom · ⇧drag to pan</div>}

        {dragOver && allowImport && (
          <div className="nxV3Drop" data-testid="viewer3d-drop" aria-hidden="true">
            <span>Drop a .glb / .gltf / .obj model (with its .mtl, .bin and textures)</span>
          </div>
        )}

        {(phase === "loading" || importPct !== false) && phase !== "error" && (
          <div className="nxV3Poster" data-testid="viewer3d-loading">
            <div className="nxV3PosterGlyph" aria-hidden="true" />
            <span>{typeof importPct === "number" ? `Loading model… ${importPct}%` : importPct === null ? "Loading model…" : "Preparing 3D scene…"}</span>
            {typeof importPct === "number" && (
              <div className="nxV3Progress"><div style={{ width: `${importPct}%` }} /></div>
            )}
          </div>
        )}
        {phase === "error" && (
          <div className="nxV3Poster nxV3Poster--error" role="alert" data-testid="viewer3d-error">
            <span className="nxV3PosterTitle">Couldn’t load the model</span>
            <span className="nxV3PosterBody">{errorMsg || "The 3D model could not be loaded."}</span>
            <button type="button" className="nxV3Btn" onClick={() => { setErrorMsg(""); setInnerNonce((n) => n + 1); }}>Try again</button>
          </div>
        )}
      </div>

      {/* the technical apron — persistent CAD dock beside the drawing */}
      {mode === "floorplan" && showSchedule && apronOpen && snap.floorplan && (
        <Apron
          floorplan={snap.floorplan}
          activeLevel={activeLevel}
          selection={selection}
          units={units}
          layers={layers}
          onSelect={setSelection}
          onLevel={(id) => { setActiveLevel(id); persist({ activeLevel: id }); }}
          onClose={() => { setApronOpen(false); persist({ apron: false }); }}
          {...apronHandlers}
        />
      )}
      </div>
    </div>
  );
}

/* elevation dir for a section cut: look along the cut axis */
function sectionOrElevDir(view: PlanView, elevDir: ElevationDir, sectionAxis: "x" | "z"): ElevationDir {
  if (view === "elevation") return elevDir;
  return sectionAxis === "x" ? "east" : "south";
}

export default Viewer3DSurface;
