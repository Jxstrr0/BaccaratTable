import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Renderer, camera, post-processing and image-based lighting.
export class Stage {
  constructor(container, manager) {
    this.container = container;
    this.manager = manager;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    // Render scale starts at up to 1.5× and adapts to the frame rate (see adapt()).
    this.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.pixelRatio = this.maxPixelRatio;
    this.frameTimes = [];
    this.goodWindows = 0;
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.02, 400);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.5, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  async loadEnvironment(url) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const hdr = await new HDRLoader(this.manager).setDataType(THREE.FloatType).loadAsync(url);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    // Tame the panorama's bare bulbs: unclamped they show up as hot glints on lacquer and marble.
    const data = hdr.image.data;
    for (let i = 0; i < data.length; i++) data[i] = Math.min(data[i], 3);
    hdr.needsUpdate = true;
    const env = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.35;
    this.scene.environmentRotation.y = Math.PI * 0.5;
  }

  // Adaptive resolution: every 60 frames, drop the render scale if we're under ~45 fps and
  // raise it again after a few comfortably smooth windows. Bloom goes last, only at the floor.
  adapt(dt) {
    if (dt > 0.25) return; // tab switches and hitches aren't representative
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((s, t) => s + t, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 45) {
      this.goodWindows = 0;
      if (this.pixelRatio > 0.75) this.setPixelRatio(this.pixelRatio - 0.25);
      else this.bloom.enabled = false;
    } else if (avg < 1 / 58 && ++this.goodWindows >= 3) {
      this.goodWindows = 0;
      if (!this.bloom.enabled) this.bloom.enabled = true;
      else if (this.pixelRatio < this.maxPixelRatio) this.setPixelRatio(this.pixelRatio + 0.25);
    }
  }

  setPixelRatio(ratio) {
    this.pixelRatio = Math.min(this.maxPixelRatio, Math.max(0.75, ratio));
    this.renderer.setPixelRatio(this.pixelRatio);
    this.composer.setPixelRatio(this.pixelRatio);
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // Keep the table framed on portrait screens.
    this.camera.fov = w / h < 1 ? 72 : 55;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  render() {
    this.composer.render();
  }
}
