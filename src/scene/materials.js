import * as THREE from 'three';

// CC0 PBR sets from Poly Haven / ambientCG (see CREDITS.md), stored as <name>_{diff,nor_gl,rough}.jpg.
const BASE = `${import.meta.env.BASE_URL}assets/tex/`;

export class MaterialLibrary {
  constructor(manager, anisotropy) {
    this.loader = new THREE.TextureLoader(manager);
    this.anisotropy = anisotropy;
    this.cache = new Map();
  }

  texture(file, { srgb = false, repeat = [1, 1] } = {}) {
    const key = `${file}|${repeat}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const tex = this.loader.load(BASE + file);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = this.anisotropy;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, tex);
    return tex;
  }

  // Builds a physical material from a texture set. `useDiffuse: false` keeps only the
  // surface detail (normal/roughness) so the material can be recolored.
  pbr(name, { repeat = [1, 1], useDiffuse = true, physical = false, ...params } = {}) {
    const Mat = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const mat = new Mat({
      normalMap: this.texture(`${name}_nor_gl.jpg`, { repeat }),
      roughnessMap: this.texture(`${name}_rough.jpg`, { repeat }),
      ...params,
    });
    if (useDiffuse) mat.map = this.texture(`${name}_diff.jpg`, { srgb: true, repeat });
    return mat;
  }
}
