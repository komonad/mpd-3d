import { Path, Shape, ShapeGeometry } from 'three';

export function exteriorPlainGeometry(width: number, height: number): ShapeGeometry {
  const extent = 2048, overlap = 0.12;
  const shape = new Shape();
  shape.moveTo(-extent, -extent); shape.lineTo(extent, -extent);
  shape.lineTo(extent, extent); shape.lineTo(-extent, extent); shape.closePath();
  const x = width / 2 - overlap, y = height / 2 - overlap, hole = new Path();
  hole.moveTo(-x, -y); hole.lineTo(-x, y); hole.lineTo(x, y); hole.lineTo(x, -y); hole.closePath();
  shape.holes.push(hole);
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, 1.016, 0);
  return geometry;
}
