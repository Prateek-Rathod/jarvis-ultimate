import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  WebGLRenderer,
} from "three";
import type { AgentVoiceState } from "../../lib/agentVoice";

const suitAssetUrl = "/models/jarvis-armored-suit.glb";

interface ArmoredSuitProps {
  state: AgentVoiceState;
}

function displayState(state: AgentVoiceState): string {
  if (state === "wake_listening" || state === "activated") return "listening";
  if (state === "executing") return "executing";
  if (state === "error" || state === "interrupted") return "error";
  return state;
}

function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    if (!("isMesh" in object) || !object.isMesh) return;
    const mesh = object as Mesh;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material.dispose());
  });
}

export default function ArmoredSuit({ state }: ArmoredSuitProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const [sceneStatus, setSceneStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let renderer: WebGLRenderer | null = null;
    let scene: Scene | null = null;
    let suit: Group | null = null;
    let reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.reduceMotion === "true";
    const reactorMaterials: Array<{ material: MeshStandardMaterial; base: number }> = [];
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updateReducedMotion = () => {
      reducedMotion =
        motionQuery.matches || document.documentElement.dataset.reduceMotion === "true";
      setReduceMotion(reducedMotion);
      if (reducedMotion) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
        renderFrame();
      } else if (frameId === 0 && renderer && scene) {
        frameId = window.requestAnimationFrame(renderFrame);
      }
    };

    let camera: import("three").PerspectiveCamera | null = null;
    const clock = { getElapsedTime: () => performance.now() / 1000 };

    const renderFrame = () => {
      frameId = 0;
      if (disposed || !renderer || !scene || !camera) return;
      const elapsed = clock.getElapsedTime();
      if (suit) {
        suit.rotation.y = reducedMotion ? 0 : (elapsed / 72) * Math.PI * 2;
        suit.position.y = reducedMotion ? 0 : Math.sin(elapsed * 0.72) * 0.045;
        const currentState = stateRef.current;
        const stateBoost =
          currentState === "listening" || currentState === "wake_listening"
            ? 1.35
            : currentState === "processing" || currentState === "executing"
              ? 1.7
              : currentState === "speaking"
                ? 1.5
                : currentState === "error"
                  ? 0.7
                  : 1;
        const pulse = reducedMotion ? 1 : 1 + Math.sin(elapsed * 2.4) * 0.06;
        reactorMaterials.forEach(({ material, base }) => {
          material.emissiveIntensity = base * stateBoost * pulse;
        });
      }
      renderer.render(scene, camera);
      if (!reducedMotion) frameId = window.requestAnimationFrame(renderFrame);
    };

    motionQuery.addEventListener("change", updateReducedMotion);
    const motionObserver = new MutationObserver(updateReducedMotion);
    motionObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduce-motion"],
    });
    updateReducedMotion();

    void (async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        if (disposed) return;

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 6.8);
        camera.lookAt(0, 0, 0);
        scene.add(new THREE.HemisphereLight(0xe8edff, 0x171014, 2.2));

        const keyLight = new THREE.DirectionalLight(0xffe0c4, 3.5);
        keyLight.position.set(-3.5, 5, 5);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0x9bcaff, 1.7);
        fillLight.position.set(3, 1, 4);
        scene.add(fillLight);
        const rimLight = new THREE.DirectionalLight(0xff392f, 2.2);
        rimLight.position.set(3.5, 2, -3);
        scene.add(rimLight);

        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
        });
        renderer.setClearColor(0x090909, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.domElement.className = "armored-suit-canvas";
        renderer.domElement.setAttribute("aria-hidden", "true");
        container.append(renderer.domElement);

        const resize = () => {
          const bounds = container.getBoundingClientRect();
          if (!renderer || !camera || !bounds.width || !bounds.height) return;
          renderer.setSize(bounds.width, bounds.height, false);
          camera.aspect = bounds.width / bounds.height;
          camera.updateProjectionMatrix();
          if (reducedMotion) renderFrame();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();

        new GLTFLoader().load(
          suitAssetUrl,
          (gltf) => {
            if (disposed || !scene) {
              disposeObject(gltf.scene);
              return;
            }
            const bounds = new THREE.Box3().setFromObject(gltf.scene);
            const size = bounds.getSize(new THREE.Vector3());
            const center = bounds.getCenter(new THREE.Vector3());
            if (!Number.isFinite(size.y) || size.y <= 0) {
              disposeObject(gltf.scene);
              setSceneStatus("error");
              return;
            }

            const scale = 2.7 / size.y;
            const centeredSuit = new THREE.Group();
            gltf.scene.position.set(-center.x, -center.y, -center.z);
            centeredSuit.scale.setScalar(scale);
            centeredSuit.add(gltf.scene);
            gltf.scene.traverse((object) => {
              if (!("isMesh" in object) || !object.isMesh) return;
              const mesh = object as Mesh;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              const clonedMaterials = materials.map((material: Material) => {
                const cloned = material.clone();
                if (
                  cloned instanceof THREE.MeshStandardMaterial &&
                  (cloned.emissive.getHex() !== 0 || cloned.emissiveMap !== null)
                ) {
                  reactorMaterials.push({
                    material: cloned,
                    base: Math.max(cloned.emissiveIntensity, 0.45),
                  });
                }
                return cloned;
              });
              mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]!;
            });
            suit = centeredSuit;
            scene.add(suit);
            setSceneStatus("ready");
            renderFrame();
          },
          undefined,
          () => {
            if (!disposed) setSceneStatus("error");
          },
        );
      } catch {
        if (!disposed) setSceneStatus("error");
      }
    })();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      motionQuery.removeEventListener("change", updateReducedMotion);
      motionObserver.disconnect();
      resizeObserver?.disconnect();
      if (suit) disposeObject(suit);
      scene?.clear();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return (
    <div
      className={`jarvis-armored-visual state-${displayState(state)}`}
      aria-label="3D JARVIS armored suit"
    >
      <div className="armored-chamber-background" aria-hidden="true" />
      <div className="armored-reactor-field" aria-hidden="true">
        <div className="armored-energy-ring armored-ring-outer" />
        <div className="armored-energy-ring armored-ring-middle" />
        <div className="armored-energy-ring armored-ring-inner" />
        <div className="armored-energy-pulse" />
      </div>
      <div className="armored-energy-particles" aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => (
          <span
            className="armored-energy-particle"
            key={index}
            style={
              {
                "--particle-index": index,
                "--particle-angle": `${index * 22.5}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div ref={containerRef} className="armored-suit-canvas-container" />
      {sceneStatus === "loading" && (
        <span className="armored-suit-status" role="status">
          Loading armored suit…
        </span>
      )}
      {sceneStatus === "error" && (
        <span className="armored-suit-status armored-suit-status-error" role="status">
          3D armored suit could not be loaded. Check the GLB asset and WebGL support.
        </span>
      )}
      {reduceMotion && <span className="sr-only">Reduced motion enabled</span>}
    </div>
  );
}
