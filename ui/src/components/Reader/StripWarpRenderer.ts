// WebGL 透视变换渲染器 (Per-strip Perspective Texture Mapper)
// 将原图中的任意凸四边形 (srcQuad) 映射到目标画布矩形 (dstRect)

export interface StripTransform {
  srcQuad: [[number, number], [number, number], [number, number], [number, number]]; // [TL, TR, BR, BL] in raw image px
  dstRect: [number, number, number, number]; // [x, y, w, h] in warped canvas px
}

const VERTEX_SHADER_SRC = `
  attribute vec2 a_position; // 目标画布像素坐标 [0, canvasWidth] x [0, canvasHeight]
  attribute vec2 a_texCoord; // 原图像素坐标 [0, imgWidth] x [0, imgHeight]

  uniform vec2 u_resolution; // 目标画布尺寸 [w, h]
  uniform vec2 u_imgResolution; // 原图尺寸 [w, h]

  varying vec2 v_texCoord;

  void main() {
    // 转换到屏幕裁剪空间 [-1, 1]
    vec2 zeroToOne = a_position / u_resolution;
    vec2 clipSpace = zeroToOne * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);

    // 纹理坐标归一化 [0, 1]
    v_texCoord = a_texCoord / u_imgResolution;
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform float u_alpha;
  varying vec2 v_texCoord;

  void main() {
    vec4 tex = texture2D(u_image, v_texCoord);
    gl_FragColor = vec4(tex.rgb, tex.a * u_alpha);
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export class StripWarpRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private positionBuffer: WebGLBuffer;
  private texCoordBuffer: WebGLBuffer;

  private uResolutionLoc: WebGLUniformLocation;
  private uImgResolutionLoc: WebGLUniformLocation;
  private uAlphaLoc: WebGLUniformLocation;
  private aPositionLoc: number;
  private aTexCoordLoc: number;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) throw new Error('Failed to create shaders');

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
    }
    this.program = program;

    this.positionBuffer = gl.createBuffer()!;
    this.texCoordBuffer = gl.createBuffer()!;

    this.uResolutionLoc = gl.getUniformLocation(program, 'u_resolution')!;
    this.uImgResolutionLoc = gl.getUniformLocation(program, 'u_imgResolution')!;
    this.uAlphaLoc = gl.getUniformLocation(program, 'u_alpha')!;
    this.aPositionLoc = gl.getAttribLocation(program, 'a_position');
    this.aTexCoordLoc = gl.getAttribLocation(program, 'a_texCoord');

    // 启用 Alpha 混合 (支持版心半透明叠加)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 初始清屏底色为宣纸暖白色 (绝对不黑屏)
    this.clear(canvas.width, canvas.height);
  }

  /**
   * 清屏填充暖纸背景色
   */
  public clear(canvasWidth: number, canvasHeight: number) {
    const gl = this.gl;
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0.98, 0.97, 0.95, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * 为指定图片创建 WebGL 纹理
   */
  public createTexture(image: HTMLImageElement): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return tex;
  }

  /**
   * 使用指定的纹理和透明度，绘制一组横带到画布
   */
  public renderStripsWithTexture(
    texture: WebGLTexture,
    canvasWidth: number,
    canvasHeight: number,
    imgWidth: number,
    imgHeight: number,
    strips: { colOffsetX: number; colOffsetY?: number; strip: StripTransform }[],
    alpha = 1.0
  ) {
    if (strips.length === 0) return;

    const gl = this.gl;
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.useProgram(this.program);
    gl.uniform2f(this.uResolutionLoc, canvasWidth, canvasHeight);
    gl.uniform2f(this.uImgResolutionLoc, imgWidth, imgHeight);
    gl.uniform1f(this.uAlphaLoc, alpha);

    const positions: number[] = [];
    const texCoords: number[] = [];
    const SUBDIV_V = 8;

    for (const item of strips) {
      const offsetX = item.colOffsetX || 0;
      const offsetY = item.colOffsetY || 0;
      const { srcQuad, dstRect } = item.strip;
      const [dstX, dstY, dstW, dstH] = dstRect;
      const targetX = offsetX + dstX;
      const targetY = offsetY + dstY;

      const [pTL, pTR, pBR, pBL] = srcQuad;

      for (let s = 0; s < SUBDIV_V; s++) {
        const v0 = s / SUBDIV_V;
        const v1 = (s + 1) / SUBDIV_V;

        const dy0 = targetY + dstH * v0;
        const dy1 = targetY + dstH * v1;

        const leftP0 = [pTL[0] + (pBL[0] - pTL[0]) * v0, pTL[1] + (pBL[1] - pTL[1]) * v0];
        const leftP1 = [pTL[0] + (pBL[0] - pTL[0]) * v1, pTL[1] + (pBL[1] - pTL[1]) * v1];

        const rightP0 = [pTR[0] + (pBR[0] - pTR[0]) * v0, pTR[1] + (pBR[1] - pTR[1]) * v0];
        const rightP1 = [pTR[0] + (pBR[0] - pTR[0]) * v1, pTR[1] + (pBR[1] - pTR[1]) * v1];

        const dTL = [targetX, dy0];
        const dTR = [targetX + dstW, dy0];
        const dBL = [targetX, dy1];
        const dBR = [targetX + dstW, dy1];

        // 三角形 1: dTL, dTR, dBL
        positions.push(dTL[0], dTL[1], dTR[0], dTR[1], dBL[0], dBL[1]);
        texCoords.push(leftP0[0], leftP0[1], rightP0[0], rightP0[1], leftP1[0], leftP1[1]);

        // 三角形 2: dTR, dBR, dBL
        positions.push(dTR[0], dTR[1], dBR[0], dBR[1], dBL[0], dBL[1]);
        texCoords.push(rightP0[0], rightP0[1], rightP1[0], rightP1[1], leftP1[0], leftP1[1]);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.aPositionLoc);
    gl.vertexAttribPointer(this.aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.aTexCoordLoc);
    gl.vertexAttribPointer(this.aTexCoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
  }

  public deleteTexture(texture: WebGLTexture | null) {
    if (texture) {
      this.gl.deleteTexture(texture);
    }
  }

  public destroy() {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
  }
}
