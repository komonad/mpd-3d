import * as THREE from 'three';

export interface SurfaceTextures {
  glass: THREE.DataTexture;
  glassRoughness: THREE.DataTexture;
}

function surfaceTexture(sample: (u: number, v: number) => number, color = true): THREE.DataTexture {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = Math.round(sample((x + 0.5) / size, (y + 0.5) / size));
    data.set([value, value, value, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

export function surfaceTextures(): SurfaceTextures {
  const glassStroke = (u: number, v: number): number => {
    const phase = ((u + v) * 3 + 0.2) % 1;
    const distance = Math.min(phase, 1 - phase) / 3;
    return Math.max(0, 1 - distance / 0.014);
  };
  return {
    glass: surfaceTexture((u, v) => 255 - glassStroke(u, v) * 54),
    glassRoughness: surfaceTexture((u, v) => 9 + glassStroke(u, v) * 43, false),
  };
}

export function adhesiveTexture(): THREE.DataTexture {
  const size = 64, data = new Uint8Array(size * size * 4);
  const colors = [[155, 155, 155, 255], [255, 255, 255, 10]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const color = colors[(Math.floor(x / (size / 2)) + Math.floor(y / (size / 2))) % 2];
    data.set(color, (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
