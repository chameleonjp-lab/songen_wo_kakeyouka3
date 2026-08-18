import { describe, expect, it } from "vitest";
import { Ray } from "@babylonjs/core/Culling/ray";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/Shaders/postprocess.vertex";
import "@babylonjs/core/Shaders/rgbdDecode.fragment";
import "@babylonjs/core/Shaders/rgbdEncode.fragment";

describe("Babylon shader registrations", () => {
  it("keeps the ray side effect and RGBD post-process shaders available", () => {
    expect(Ray).toBeTypeOf("function");
    expect(ShaderStore.ShadersStore.postprocessVertexShader).toContain("gl_Position");
    expect(ShaderStore.ShadersStore.rgbdDecodePixelShader).toContain("fromRGBD");
    expect(ShaderStore.ShadersStore.rgbdEncodePixelShader).toContain("toRGBD");
  });
});
