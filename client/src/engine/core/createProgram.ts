import { createShader } from "../graphics/createShader";

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexShaderSrc: string,
  fragmentShaderSrc: string,
): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);

  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSrc,
  );
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Failed to create shader program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Program linking failed";

    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}
