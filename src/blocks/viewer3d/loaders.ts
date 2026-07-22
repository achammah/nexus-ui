/* Model intake — heavy chunk only. Loads real models from a config URL or from
   user-supplied local files (file picker / drag-drop). Formats:
     .glb          — single file (binary glTF; meshopt-compressed accepted)
     .gltf         — JSON glTF; multi-file: drop it together with its .bin + textures
     .obj (+.mtl)  — multi-file: drop the .obj with its .mtl and texture images
   DRACO / KTX2-compressed assets are NOT decoded here (their decoders are wasm
   side-files a host app must serve itself); a compressed asset fails with a
   plain error naming that. Everything else auto-centers, rests on the ground
   plane and normalizes to ~4.5 m so lighting/framing behave. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Viewer3DModelSource } from "./scene";

export const MODEL_EXTENSIONS = [".glb", ".gltf", ".obj", ".mtl", ".png", ".jpg", ".jpeg", ".webp", ".bin", ".ktx2"];
export const MAX_MODEL_BYTES = 150 * 1024 * 1024; // hard reject above this

export interface LoadedModel {
  object: THREE.Group;
  format: "glb" | "gltf" | "obj";
  name: string;
  /* call when the model is replaced/unmounted — revokes blob URLs */
  release: () => void;
}

export class ModelError extends Error {}

const ext = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
};

/* normalize: center on origin, rest on the floor, ~targetSize max dimension */
export function normalizeModel(obj: THREE.Object3D, scaleMul = 1, up: "y" | "z" = "y"): void {
  if (up === "z") obj.rotation.x = -Math.PI / 2;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const scale = (4.5 / Math.max(size.x, size.y, size.z, 0.001)) * scaleMul;
  obj.scale.multiplyScalar(scale);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
}

function gltfLoader(manager?: THREE.LoadingManager): GLTFLoader {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/* map raw loader failures to messages a person can act on */
function explainGltfError(e: unknown, name: string): ModelError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/draco/i.test(msg)) return new ModelError(`${name} is DRACO-compressed. Serve the DRACO decoder with your app, or export the model uncompressed (or meshopt).`);
  if (/ktx2|basis/i.test(msg)) return new ModelError(`${name} uses KTX2/Basis textures, which need a host-served transcoder. Re-export with PNG/JPEG textures.`);
  if (/fetch|network|404|failed to load/i.test(msg)) return new ModelError(`${name} could not be fetched. Check the URL — the app's CSP only allows same-origin/bundled assets.`);
  return new ModelError(`${name} could not be parsed as glTF: ${msg}`);
}

/* ---- load from a config source (URLs) ---- */

export function loadFromSource(
  source: Viewer3DModelSource,
  onProgress?: (pct: number | null) => void,
): Promise<LoadedModel> {
  if (source.type === "gltf") {
    return new Promise((resolve, reject) => {
      gltfLoader().load(
        source.url,
        (gltf) => resolve({ object: gltf.scene as unknown as THREE.Group, format: source.url.toLowerCase().endsWith(".glb") ? "glb" : "gltf", name: source.url.split("/").pop() || "model", release: () => {} }),
        (ev) => onProgress?.(ev.total ? Math.round((ev.loaded / ev.total) * 100) : null),
        (e) => reject(explainGltfError(e, source.url.split("/").pop() || "model")),
      );
    });
  }
  if (source.type === "obj") {
    const finish = (materials?: MTLLoader.MaterialCreator): Promise<LoadedModel> =>
      new Promise((resolve, reject) => {
        const loader = new OBJLoader();
        if (materials) { materials.preload(); loader.setMaterials(materials); }
        loader.load(
          source.url,
          (obj) => resolve({ object: obj, format: "obj", name: source.url.split("/").pop() || "model", release: () => {} }),
          (ev) => onProgress?.(ev.total ? Math.round((ev.loaded / ev.total) * 100) : null),
          (e) => reject(new ModelError(`${source.url.split("/").pop()} could not be loaded: ${e instanceof Error ? e.message : e}`)),
        );
      });
    if (!source.mtlUrl) return finish();
    return new Promise((resolve, reject) => {
      new MTLLoader().load(source.mtlUrl as string, (m) => resolve(finish(m)), undefined,
        () => resolve(finish())); // missing MTL degrades to neutral material, not failure
    }).then((p) => p as Promise<LoadedModel>) as Promise<LoadedModel>;
  }
  return Promise.reject(new ModelError("Procedural sources build locally — nothing to load."));
}

/* ---- load from user files (picker / drag-drop) ----
   Multi-file bundles (.gltf + .bin + textures, .obj + .mtl + textures) resolve
   their relative references through a blob-URL map on a LoadingManager. */

export async function loadFromFiles(
  files: File[],
  onProgress?: (pct: number | null) => void,
): Promise<LoadedModel> {
  if (!files.length) throw new ModelError("No files received.");
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_MODEL_BYTES) throw new ModelError(`Model is ${(total / 1048576).toFixed(0)} MB — the viewer caps imports at ${(MAX_MODEL_BYTES / 1048576).toFixed(0)} MB.`);
  const bad = files.find((f) => !MODEL_EXTENSIONS.includes(ext(f.name)));
  if (bad) throw new ModelError(`"${bad.name}" is not a supported file. Use .glb, .gltf (+.bin/textures) or .obj (+.mtl/textures).`);

  const root = files.find((f) => ext(f.name) === ".glb")
    ?? files.find((f) => ext(f.name) === ".gltf")
    ?? files.find((f) => ext(f.name) === ".obj");
  if (!root) throw new ModelError("Drop a .glb, .gltf or .obj file (its .mtl/.bin/textures may come along in the same drop).");

  onProgress?.(5);

  /* blob map: every dropped file is reachable by its basename */
  const urls = new Map<string, string>();
  for (const f of files) urls.set(f.name.toLowerCase(), URL.createObjectURL(f));
  const release = () => { for (const u of urls.values()) URL.revokeObjectURL(u); };
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const base = decodeURIComponent(url.split("/").pop() || "").toLowerCase();
    return urls.get(base) ?? url;
  });

  try {
    if (ext(root.name) === ".glb") {
      const buf = await root.arrayBuffer();
      onProgress?.(60);
      const gltf = await gltfLoader(manager).parseAsync(buf, "");
      onProgress?.(95);
      return { object: gltf.scene as unknown as THREE.Group, format: "glb", name: root.name, release };
    }
    if (ext(root.name) === ".gltf") {
      const text = await root.text();
      onProgress?.(40);
      const gltf = await gltfLoader(manager).parseAsync(text, "");
      onProgress?.(95);
      return { object: gltf.scene as unknown as THREE.Group, format: "gltf", name: root.name, release };
    }
    /* OBJ: optional MTL sibling */
    const mtlFile = files.find((f) => ext(f.name) === ".mtl");
    const objLoader = new OBJLoader(manager);
    if (mtlFile) {
      const mtl = new MTLLoader(manager).parse(await mtlFile.text(), "");
      mtl.preload();
      objLoader.setMaterials(mtl);
    }
    onProgress?.(50);
    const obj = objLoader.parse(await root.text());
    /* OBJ without materials arrives matte black in a PBR scene — give it a body */
    if (!mtlFile) {
      const neutral = new THREE.MeshStandardMaterial({ color: "#9aa0a8", metalness: 0.2, roughness: 0.6 });
      obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = neutral; });
    }
    onProgress?.(95);
    return { object: obj, format: "obj", name: root.name, release };
  } catch (e) {
    release();
    if (e instanceof ModelError) throw e;
    throw explainGltfError(e, root.name);
  }
}
