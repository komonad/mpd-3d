import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3 } from 'three';

export function labelBatch(labels: Mesh[]): { mesh: Mesh; update: () => void } {
  const columns = Math.ceil(Math.sqrt(labels.length)), rows = Math.ceil(labels.length / columns), tile = 128;
  const canvas = document.createElement('canvas'); canvas.width = columns * tile; canvas.height = rows * tile;
  const context = canvas.getContext('2d')!;
  const positions = new Float32BufferAttribute(new Float32Array(labels.length * 18), 3), uv: number[] = [];
  labels.forEach((label, i) => {
    const texture = (label.material as MeshBasicMaterial).map!;
    context.drawImage(texture.image as HTMLCanvasElement, i % columns * tile, Math.floor(i / columns) * tile, tile, tile);
    const coordinates = label.geometry.getAttribute('uv'), index = label.geometry.index;
    for (let j = 0; j < 6; j++) {
      const vertex = index ? index.getX(j) : j;
      uv.push((i % columns + coordinates.getX(vertex)) / columns, 1 - (Math.floor(i / columns) + 1 - coordinates.getY(vertex)) / rows);
    }
    label.visible = false;
  });
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const geometry = new BufferGeometry(); geometry.setAttribute('position', positions); geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.userData.transmissiveOnly = true;
  const point = new Vector3();
  const update = () => {
    labels.forEach((label, i) => {
      label.updateWorldMatrix(true, false);
      const source = label.geometry.getAttribute('position'), index = label.geometry.index;
      for (let j = 0; j < 6; j++) {
        point.fromBufferAttribute(source, index ? index.getX(j) : j).applyMatrix4(label.matrixWorld);
        positions.setXYZ(i * 6 + j, point.x, point.y, point.z);
      }
    });
    positions.needsUpdate = true; geometry.computeBoundingSphere();
  };
  update(); return { mesh, update };
}
