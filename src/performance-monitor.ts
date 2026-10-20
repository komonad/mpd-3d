import type { WebGLRenderer } from 'three';

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

export class PerformanceMonitor {
  private readonly element = document.createElement('div');
  private readonly output = document.createElement('div');
  private readonly details = document.createElement('textarea');
  private readonly gl: WebGL2RenderingContext;
  private readonly timer: TimerExtension | null;
  private pending: WebGLQuery[] = [];
  private active?: WebGLQuery;
  private enabled = false;
  private previous = 0;
  private started = 0;
  private intervals: number[] = [];
  private renderStart = 0;
  private renderTimes: number[] = [];
  private gpuTimes: number[] = [];
  private report: Record<string, unknown> = {};
  private scene = '';

  constructor(private readonly renderer: WebGLRenderer, host: HTMLElement) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.timer = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.element.className = 'performance-monitor'; this.element.hidden = true;
    const copy = document.createElement('button'); copy.textContent = '复制性能信息';
    copy.onclick = () => {
      this.details.value = JSON.stringify(this.report, null, 2); this.details.hidden = false;
      this.details.focus(); this.details.select();
      void navigator.clipboard?.writeText(this.details.value).then(() => { copy.textContent = '已复制'; }, () => {});
    };
    this.details.readOnly = true; this.details.hidden = true; this.details.setAttribute('aria-label', '性能诊断信息');
    this.element.append(this.output, copy, this.details); host.append(this.element);
  }

  toggle(): boolean { this.setEnabled(!this.enabled); return this.enabled; }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled; this.element.hidden = !enabled;
    this.renderer.info.autoReset = !enabled;
    this.previous = this.started = 0; this.intervals = []; this.renderTimes = [];
    this.pending.forEach(query => this.gl.deleteQuery(query)); this.pending = []; this.gpuTimes = [];
    this.details.hidden = true;
  }
  setScene(id: string): void { this.scene = id; }
  resetClock(): void { this.previous = this.started = 0; this.intervals = []; }

  frame(now: number): void {
    if (!this.enabled) return;
    if (this.previous) this.intervals.push(now - this.previous);
    this.previous = now; this.started ||= now;
    const query = this.pending[0];
    if (query && this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) {
      if (!this.gl.getParameter(this.timer!.GPU_DISJOINT_EXT)) this.gpuTimes.push(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) / 1e6);
      this.gl.deleteQuery(query); this.pending.shift();
    }
    if (now - this.started < 600 || !this.intervals.length) return;
    const times = this.intervals.slice().sort((a, b) => a - b);
    const fps = 1000 * times.length / times.reduce((a, b) => a + b, 0);
    const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];
    const cpu = this.renderTimes.length ? this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length : null;
    const gpu = this.gpuTimes.length ? this.gpuTimes.reduce((a, b) => a + b, 0) / this.gpuTimes.length : null;
    const debug = this.gl.getExtension('WEBGL_debug_renderer_info');
    this.report = {
      scene: this.scene, browser: navigator.userAgent, gpu: debug ? this.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      viewport: [this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight], drawingBuffer: [this.gl.drawingBufferWidth, this.gl.drawingBufferHeight],
      screen: [screen.width, screen.height], windowPosition: [screenX, screenY],
      devicePixelRatio, refreshFps: fps, frameP95Ms: p95, longFrames: times.filter(ms => ms > 50).length,
      renderCpuMs: cpu, renderGpuMs: gpu, renderGpuMaxMs: this.gpuTimes.length ? Math.max(...this.gpuTimes) : null,
      draws: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
    };
    this.output.textContent = `刷新 ${fps.toFixed(0)} FPS · 帧间隔 P95 ${p95.toFixed(1)} ms\n绘制 CPU ${cpu === null ? '静止' : cpu.toFixed(1) + ' ms'} · GPU ${gpu === null ? cpu === null ? '静止' : '无法计时' : gpu.toFixed(1) + ' ms'}\n超过 50 ms：${times.filter(ms => ms > 50).length} 帧`;
    this.started = now; this.intervals = []; this.renderTimes = []; this.gpuTimes = [];
  }

  beginRender(): void {
    if (!this.enabled) return;
    this.renderer.info.reset(); this.renderStart = performance.now();
    if (this.timer && this.pending.length < 4) {
      const query = this.gl.createQuery();
      if (query) { this.active = query; this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, query); }
    }
  }
  endRender(): void {
    if (!this.enabled) return;
    this.renderTimes.push(performance.now() - this.renderStart);
    if (this.active) {
      this.gl.endQuery(this.timer!.TIME_ELAPSED_EXT); this.pending.push(this.active); this.active = undefined;
    }
  }
}
