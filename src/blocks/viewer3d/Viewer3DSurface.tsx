// Viewer3D surface — the heavy chunk (three.js). Renders an OBJECT viewer
// (glTF or procedural model: orbit/zoom/pan, 360° spin, auto-rotate, camera
// presets, wireframe, env lighting + soft shadow) or a FLOORPLAN viewer
// (extruded walls per level, level switcher, room labels, top-down ↔ 3D),
// both with data-driven clickable hotspots. Free-surface contract: host owns
// the snapshot (value/onChange/reloadNonce), this component owns the WebGL
// lifecycle, token-derived materials and the dark/light re-theme.
import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useThemeNonce } from "../workbook/workbook-theme";
import { buildLevel, buildSedan, setLevelGhost, type BuiltLevel } from "./builders";
import { derivePalette, envIntensity, fitDistance, fitFor, groundShadowOpacity, EASE, LOOK, PRESET_DIRS, type Preset } from "./look";
import { seedScene, type Viewer3DHotspot, type Viewer3DSnapshot } from "./scene";
import "./viewer3d.css";

export interface Viewer3DSurfaceProps {
  /* the scene to load; null seeds the vehicle demo */
  value: Viewer3DSnapshot | null;
  /* fired when persisted viewer state changes (auto-rotate, active level) */
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
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  model: THREE.Group;             // object model OR all levels
  levels: Map<string, BuiltLevel>;
  sphere: THREE.Sphere;           // fit sphere of the ACTIVE content
  raycaster: THREE.Raycaster;
  pmrem: THREE.PMREMGenerator;
  anim: Anim | null;
  frame: number;
  dispose: () => void;
}

const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    mats.forEach((mat) => mat.dispose());
  });
}

export function Viewer3DSurface({ value, onChange, reloadNonce = 0, className, actions, ...rest }: Viewer3DSurfaceProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const engineRef = React.useRef<Engine | null>(null);
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
  const [topDown, setTopDown] = React.useState(false);
  const [openHotspot, setOpenHotspot] = React.useState<Viewer3DHotspot | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const visibleHotspots = React.useMemo(
    () => snap.hotspots.filter((h) => mode === "object" || !h.level || h.level === activeLevel),
    [snap.hotspots, mode, activeLevel],
  );
  const anchorsRef = React.useRef<{ label: string; roomId: string; pos: THREE.Vector3 }[]>([]);
  const [labelIds, setLabelIds] = React.useState<{ roomId: string; label: string }[]>([]);

  /* ---- mount the engine ---- */
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setPhase("loading");
    setOpenHotspot(null);
    const s = snapRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: LOOK.renderer.antialias, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, LOOK.renderer.pixelRatioCap));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LOOK.renderer.toneMappingExposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(LOOK.camera.fov, 1, LOOK.camera.near, LOOK.camera.far);
    const controls = new OrbitControls(camera, renderer.domElement);
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
    scene.add(hemi, key);

    const pal = derivePalette(s.object?.paint);
    const model = new THREE.Group();
    scene.add(model);
    const levels = new Map<string, BuiltLevel>();

    const engine: Engine = {
      renderer, scene, camera, controls, model, levels,
      sphere: new THREE.Sphere(new THREE.Vector3(), 3),
      raycaster: new THREE.Raycaster(), pmrem, anim: null, frame: 0,
      dispose: () => {
        cancelAnimationFrame(engine.frame);
        ro.disconnect();
        controls.dispose();
        disposeObject(scene);
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

    const finishSetup = () => {
      if (cancelled) return;
      // size the camera from the host FIRST — framing is aspect-dependent and the
      // ResizeObserver has not fired yet, so camera.aspect is still its 1:1 default
      const hw = host.clientWidth, hh = host.clientHeight;
      if (hw && hh) {
        renderer.setSize(hw, hh, false);
        camera.aspect = hw / hh;
        camera.updateProjectionMatrix();
      }
      // fit sphere + ground under the content
      const box = new THREE.Box3().setFromObject(model);
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
      key.shadow.camera.left = key.shadow.camera.bottom = -r * G.frustumMul;
      key.shadow.camera.right = key.shadow.camera.top = r * G.frustumMul;
      key.shadow.camera.far = r * G.farMul;
      key.shadow.camera.updateProjectionMatrix();
      controls.minDistance = r * C.minDistanceMul;
      controls.maxDistance = Math.max(r * C.maxDistanceMul, fitDistance(r, camera.aspect, fit0.mul) * 1.6);
      controls.target.copy(engine.sphere.center);
      if (s.mode === "floorplan") {
        // aim low: the ghosted upper level pulls the fit sphere up and would sit
        // the building in the bottom of the frame
        controls.target.y = box.min.y + (box.max.y - box.min.y) * C.planTargetFrac;
        engine.sphere.center.copy(controls.target);
      }
      const fit = fitFor(s.mode);
      const dir = new THREE.Vector3(...fit.dir).normalize();
      camera.position.copy(engine.sphere.center)
        .addScaledVector(dir, fitDistance(r, camera.aspect, fit.mul));
      camera.lookAt(engine.sphere.center);
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
        const built = buildLevel(lvl, pal, i);
        levels.set(lvl.id, built);
        model.add(built.group);
      });
      finishSetup();
    } else if (s.object?.source.type === "gltf") {
      new GLTFLoader().load(
        s.object.source.url,
        (gltf) => {
          if (cancelled) return;
          const obj = gltf.scene;
          // normalize: center on origin, rest on the floor, ~4.5m max dimension
          const box = new THREE.Box3().setFromObject(obj);
          const size = box.getSize(new THREE.Vector3());
          const scale = 4.5 / Math.max(size.x, size.y, size.z, 0.001);
          obj.scale.setScalar(scale);
          box.setFromObject(obj);
          const c = box.getCenter(new THREE.Vector3());
          obj.position.sub(c).setY(obj.position.y - box.min.y);
          obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
          model.add(obj);
          finishSetup();
        },
        undefined,
        () => { if (!cancelled) { setErrorMsg("The 3D model could not be loaded."); setPhase("error"); } },
      );
    } else {
      model.add(buildSedan(pal));
      finishSetup();
    }

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(host);

    /* render loop: damping/auto-rotate/animations + DOM projection of hotspots
       and room labels (transforms only — no React state per frame) */
    const v = new THREE.Vector3();
    const tick = (now: number) => {
      engine.frame = requestAnimationFrame(tick);
      const a = engine.anim;
      if (a) {
        const p = Math.min((now - a.t0) / a.ms, 1);
        if (a.kind === "fly") {
          const e = EASE(p);
          camera.position.lerpVectors(a.fromP, a.toP, e);
          controls.target.lerpVectors(a.fromT, a.toT, e);
        } else {
          const e = EASE(p);
          const delta = (e - a.last) * Math.PI * 2;
          a.last = e;
          camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), delta).add(controls.target);
        }
        if (p >= 1) engine.anim = null;
      }
      controls.update();
      renderer.render(scene, camera);

      const overlay = overlayRef.current;
      if (overlay) {
        const w = host.clientWidth, h = host.clientHeight;
        const project = (el: HTMLElement, pos: THREE.Vector3, occludable: boolean) => {
          v.copy(pos).project(camera);
          const behind = v.z > 1;
          el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
          el.style.visibility = behind ? "hidden" : "visible";
          if (occludable) {
            engine.raycaster.set(camera.position, v.copy(pos).sub(camera.position).normalize());
            const dist = camera.position.distanceTo(pos);
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
  }, [reloadNonce, innerNonce]);

  /* ---- reactive engine state (no remount) ---- */

  // auto-rotate (forced off under prefers-reduced-motion)
  React.useEffect(() => {
    const e = engineRef.current;
    if (e) e.controls.autoRotate = autoRotate && !reduced && phase === "ready";
  }, [autoRotate, reduced, phase]);

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
    e.levels.forEach((built, id) => setLevelGhost(built.group, id !== activeLevel));
    const built = e.levels.get(activeLevel);
    anchorsRef.current = built ? built.anchors.map((a) => ({ ...a, pos: a.pos })) : [];
    setLabelIds(anchorsRef.current.map((a) => ({ roomId: a.roomId, label: a.label })));
    setOpenHotspot(null);
  }, [activeLevel, mode, phase]);

  const flyTo = React.useCallback((dir: [number, number, number], distMul = LOOK.camera.fitMul, ms = LOOK.feel.flyMs) => {
    const e = engineRef.current;
    if (!e) return;
    const r = e.sphere.radius;
    const toT = e.sphere.center.clone();
    const toP = toT.clone().addScaledVector(
      new THREE.Vector3(...dir).normalize(), fitDistance(r, e.camera.aspect, distMul));
    if (prefersReducedMotion()) {
      e.camera.position.copy(toP); e.controls.target.copy(toT); e.controls.update();
      return;
    }
    e.anim = { kind: "fly", t0: performance.now(), ms, fromP: e.camera.position.clone(), fromT: e.controls.target.clone(), toP, toT };
  }, []);

  // top-down ↔ perspective
  React.useEffect(() => {
    if (mode !== "floorplan" || phase !== "ready") return;
    const f = fitFor(mode);
    flyTo(topDown ? PRESET_DIRS.top : f.dir, topDown ? LOOK.camera.topMul : f.mul);
  }, [topDown, mode, phase, flyTo]);

  // re-theme materials + env when the app theme flips or a skin lands
  React.useEffect(() => {
    const e = engineRef.current;
    if (!e || phase !== "ready") return;
    const pal = derivePalette(snapRef.current.object?.paint);
    e.scene.environmentIntensity = envIntensity();
    const ground = e.scene.getObjectByName("nx-ground") as THREE.Mesh | undefined;
    if (ground) (ground.material as THREE.ShadowMaterial).opacity = groundShadowOpacity(mode === "floorplan");
    if (mode === "floorplan") {
      e.levels.forEach((built) => built.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (m.geometry.type === "ShapeGeometry") mat.color.set(pal.floor);
          else mat.color.set(pal.wall);
        } else if ((o as THREE.LineSegments).isLineSegments) {
          ((o as THREE.LineSegments).material as THREE.LineBasicMaterial).color.set(pal.wallEdge);
        }
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, phase]);

  const persist = (patch: Partial<Viewer3DSnapshot>) => {
    const next = { ...snapRef.current, ...patch };
    snapRef.current = next;
    onChangeRef.current?.(next);
  };

  const spin360 = () => {
    const e = engineRef.current;
    if (!e || prefersReducedMotion()) return;
    e.anim = { kind: "spin", t0: performance.now(), ms: LOOK.feel.spinMs, last: 0 };
  };

  const resetView = () => { const f = fitFor(mode); flyTo(f.dir, f.mul); };

  /* keyboard camera controls on the canvas host */
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const e = engineRef.current;
    if (!e) return;
    const off = e.camera.position.clone().sub(e.controls.target);
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
    e.camera.position.copy(e.controls.target).add(off);
    e.controls.update();
  };

  const levels = snap.floorplan?.levels ?? [];
  const showPresets = mode === "object" && snap.controls?.presets !== false;
  const showWireframe = mode === "object" && snap.controls?.wireframe !== false;
  const toneClass = (t?: string) => `nxV3Pin--${t || "accent"}`;

  return (
    <div className={["nxV3", className].filter(Boolean).join(" ")} {...rest}>
      <div className="nxV3Bar" data-testid="viewer3d-toolbar">
        <div className="nxV3BarTitle">
          <span className="nxV3Kicker">{mode === "object" ? "3D object" : "Floor plan"}</span>
          {snap.title && <span className="nxV3Title">{snap.title}</span>}
        </div>
        <div className="nxV3BarActions">
          {mode === "floorplan" && (
            <>
              <div className="nxV3Seg" role="group" aria-label="Floor level">
                {levels.map((l) => (
                  <button key={l.id} type="button" className="nxV3SegBtn" aria-pressed={activeLevel === l.id}
                    data-testid={`viewer3d-level-${l.id}`}
                    onClick={() => { setActiveLevel(l.id); persist({ activeLevel: l.id }); }}>
                    {l.name}
                  </button>
                ))}
              </div>
              <button type="button" className="nxV3Btn" aria-pressed={topDown} data-testid="viewer3d-topdown"
                onClick={() => setTopDown((t) => !t)}>
                {topDown ? "3D view" : "Top-down"}
              </button>
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
          {!reduced && (
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
          <button type="button" className="nxV3Btn" data-testid="viewer3d-reset" onClick={resetView}>
            Reset
          </button>
          {actions}
        </div>
      </div>

      <div className="nxV3Stage">
        <div
          ref={hostRef}
          className="nxV3Canvas"
          data-testid="viewer3d-host"
          role="application"
          tabIndex={0}
          aria-label={`3D ${mode === "object" ? "object" : "floor plan"} viewer. Drag to orbit, scroll to zoom, arrow keys rotate, plus and minus zoom, R resets the view.`}
          onKeyDown={onKeyDown}
        />
        {/* hotspots + room labels project over the canvas */}
        <div ref={overlayRef} className="nxV3Overlay" aria-hidden={phase !== "ready"}>
          {phase === "ready" && visibleHotspots.map((h) => (
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
          {phase === "ready" && mode === "floorplan" && labelIds.map(({ roomId, label }) => {
            const a = anchorsRef.current.find((x) => x.roomId === roomId);
            if (!a) return null;
            return (
              <span key={roomId} className="nxV3RoomLabel" data-world={`${a.pos.x},${a.pos.y},${a.pos.z}`} data-testid={`viewer3d-room-${roomId}`}>
                {label}
              </span>
            );
          })}
        </div>

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

        <div className="nxV3Hint" aria-hidden="true">Drag to orbit · Scroll to zoom · ⇧drag to pan</div>

        {phase === "loading" && (
          <div className="nxV3Poster" data-testid="viewer3d-loading">
            <div className="nxV3PosterGlyph" aria-hidden="true" />
            <span>Preparing 3D scene…</span>
          </div>
        )}
        {phase === "error" && (
          <div className="nxV3Poster nxV3Poster--error" role="alert" data-testid="viewer3d-error">
            <span className="nxV3PosterTitle">Couldn’t load the model</span>
            <span className="nxV3PosterBody">{errorMsg || "The 3D model could not be loaded."}</span>
            <button type="button" className="nxV3Btn" onClick={() => setInnerNonce((n) => n + 1)}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Viewer3DSurface;
