export const VERTEX_SHADER_GLOBE = `#version 300 es
precision highp float;

in vec2 a_uv;
in vec4 a_instance;

uniform mat4 u_mvp;

out vec2 v_uv;
flat out int v_layer;

const float PI = 3.14159265358979323846;

void main() {
    float tileX = a_instance.x;
    float tileY = a_instance.y;
    float zoom = a_instance.z;

    v_layer = int(a_instance.w);

    float n = exp2(zoom);

    // Local tile coordinates -> global tile coordinates
    float globalX = tileX + a_uv.x;
    float globalY = tileY + a_uv.y;

    // Global tile coordinates -> longitude and latitude
    float longitude = (globalX / n) * 2.0 * PI - PI;

    float mercatorY = PI * (1.0 - 2.0 * globalY / n);
    float latitude = atan(sinh(mercatorY));

    // Longitude and latitude -> unit sphere position
    float px = -cos(longitude) * cos(latitude);
    float py = sin(latitude);
    float pz = sin(longitude) * cos(latitude);

    vec3 position = vec3(px, py, pz);

    gl_Position = u_mvp * vec4(position, 1.0);

    v_uv = a_uv;
}
`;

export const FRAGMEN_SHADER_GLOBE = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 v_uv;
flat in int v_layer;

uniform sampler2DArray u_textureArray;

out vec4 outColor;

void main() {
    outColor = texture(
        u_textureArray,
        vec3(v_uv, float(v_layer))
    );
}
`;
