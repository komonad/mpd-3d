import * as THREE from 'three';

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
