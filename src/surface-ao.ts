import type { Object3D, WebGLRenderer, WebGLRenderTarget } from 'three';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

export class SurfaceSSAOPass extends SSAOPass {
  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const hidden: Object3D[] = [];
    this.scene.traverse(object => {
      if (object.visible && object.userData.transmissiveOnly) { hidden.push(object); object.visible = false; }
    });
    try { super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive); }
    finally { hidden.forEach(object => { object.visible = true; }); }
  }
}
