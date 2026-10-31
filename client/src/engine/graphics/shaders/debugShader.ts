export const VERTEX_SHADER_DEBUG = `#version 300 es
in vec3 a_position;
in vec2 a_uv;

uniform mat4 u_mvp;

out vec2 v_uv;

void main() {
    gl_Position = u_mvp * vec4(a_position, 1.0);
    v_uv = a_uv;
}
`;

export const FRAGMEN_SHADER_DEBUG = `#version 300 es
precision mediump float;

in vec2 v_uv;

uniform sampler2D u_texture;

out vec4 outColor;

void main() {
    float edgeWidth = 0.005;

    bool isEdge =
        v_uv.x < edgeWidth ||
        v_uv.x > 1.0 - edgeWidth ||
        v_uv.y < edgeWidth ||
        v_uv.y > 1.0 - edgeWidth;

    if (isEdge) {
        outColor = vec4(1.0, 0.0, 0.0, 1.0);
    } else {
        outColor = texture(u_texture, v_uv);
    }
}
`;
