#!/usr/bin/env python3
"""Build browser-ready GLBs for the adopted heart-champion characters.

The model is intentionally dependency-free.  It is a stylised, multi-part
multi-part model whose nodes can be animated independently in a browser.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path


Vec3 = tuple[float, float, float]


def add(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a: Vec3, value: float) -> Vec3:
    return (a[0] * value, a[1] * value, a[2] * value)


def dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(a: Vec3) -> float:
    return math.sqrt(dot(a, a))


def normalize(a: Vec3) -> Vec3:
    size = length(a)
    if size < 1e-8:
        return (0.0, 1.0, 0.0)
    return mul(a, 1.0 / size)


def average_normals(vertices: list[Vec3], indices: list[int]) -> list[Vec3]:
    normals = [(0.0, 0.0, 0.0) for _ in vertices]
    for i in range(0, len(indices), 3):
        a = vertices[indices[i]]
        b = vertices[indices[i + 1]]
        c = vertices[indices[i + 2]]
        n = normalize(cross(sub(b, a), sub(c, a)))
        for index in indices[i : i + 3]:
            normals[index] = add(normals[index], n)
    return [normalize(n) for n in normals]


class GLBBuilder:
    def __init__(self) -> None:
        self.binary = bytearray()
        self.buffer_views: list[dict] = []
        self.accessors: list[dict] = []
        self.meshes: list[dict] = []
        self.mesh_vertices: list[list[Vec3]] = []
        self.nodes: list[dict] = []
        self.materials: list[dict] = []
        self.skins: list[dict] = []
        self.animations: list[dict] = []
        self.scene_nodes: list[int] | None = None
        self.material_lookup: dict[str, int] = {}

    def material(
        self,
        name: str,
        color: tuple[float, float, float, float],
        *,
        roughness: float = 0.48,
        metallic: float = 0.0,
        double_sided: bool = False,
    ) -> int:
        if name in self.material_lookup:
            return self.material_lookup[name]
        index = len(self.materials)
        self.material_lookup[name] = index
        self.materials.append(
            {
                "name": name,
                "doubleSided": double_sided,
                "pbrMetallicRoughness": {
                    "baseColorFactor": list(color),
                    "metallicFactor": metallic,
                    "roughnessFactor": roughness,
                },
            }
        )
        return index

    def _append_bytes(self, data: bytes, alignment: int = 4) -> tuple[int, int]:
        while len(self.binary) % alignment:
            self.binary.append(0)
        offset = len(self.binary)
        self.binary.extend(data)
        return offset, len(data)

    def _view(self, offset: int, size: int, target: int | None = None) -> int:
        view = {"buffer": 0, "byteOffset": offset, "byteLength": size}
        if target is not None:
            view["target"] = target
        index = len(self.buffer_views)
        self.buffer_views.append(view)
        return index

    def _accessor(
        self,
        view: int,
        component_type: int,
        count: int,
        accessor_type: str,
        *,
        minimum: list[float] | None = None,
        maximum: list[float] | None = None,
    ) -> int:
        accessor = {
            "bufferView": view,
            "componentType": component_type,
            "count": count,
            "type": accessor_type,
        }
        if minimum is not None:
            accessor["min"] = minimum
        if maximum is not None:
            accessor["max"] = maximum
        index = len(self.accessors)
        self.accessors.append(accessor)
        return index

    def add_mesh(
        self,
        name: str,
        vertices: list[Vec3],
        normals: list[Vec3],
        indices: list[int],
        material_index: int,
    ) -> None:
        if not vertices or not indices:
            return
        if len(vertices) != len(normals):
            raise ValueError(f"{name}: vertex/normal count differs")

        position_bytes = b"".join(struct.pack("<3f", *vertex) for vertex in vertices)
        normal_bytes = b"".join(struct.pack("<3f", *normal) for normal in normals)
        max_index = max(indices)
        if max_index < 65536:
            index_component = 5123
            index_bytes = b"".join(struct.pack("<H", index) for index in indices)
        else:
            index_component = 5125
            index_bytes = b"".join(struct.pack("<I", index) for index in indices)

        position_offset, position_size = self._append_bytes(position_bytes)
        normal_offset, normal_size = self._append_bytes(normal_bytes)
        index_offset, index_size = self._append_bytes(index_bytes)
        position_view = self._view(position_offset, position_size, 34962)
        normal_view = self._view(normal_offset, normal_size, 34962)
        index_view = self._view(index_offset, index_size, 34963)
        minimum = [min(vertex[i] for vertex in vertices) for i in range(3)]
        maximum = [max(vertex[i] for vertex in vertices) for i in range(3)]
        position_accessor = self._accessor(
            position_view,
            5126,
            len(vertices),
            "VEC3",
            minimum=minimum,
            maximum=maximum,
        )
        normal_accessor = self._accessor(normal_view, 5126, len(vertices), "VEC3")
        index_accessor = self._accessor(index_view, index_component, len(indices), "SCALAR")
        mesh_index = len(self.meshes)
        self.mesh_vertices.append(vertices)
        self.meshes.append(
            {
                "name": name,
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": position_accessor,
                            "NORMAL": normal_accessor,
                        },
                        "indices": index_accessor,
                        "material": material_index,
                        "mode": 4,
                    }
                ],
            }
        )
        self.nodes.append({"name": name, "mesh": mesh_index})

    def add_uv_sphere(
        self,
        name: str,
        center: Vec3,
        scale: Vec3,
        material_index: int,
        *,
        segments: int = 16,
        rings: int = 10,
    ) -> None:
        vertices: list[Vec3] = []
        normals: list[Vec3] = []
        indices: list[int] = []
        for iy in range(rings + 1):
            v = iy / rings
            theta = math.pi * v
            sin_theta = math.sin(theta)
            cos_theta = math.cos(theta)
            for ix in range(segments + 1):
                u = ix / segments
                phi = math.tau * u
                raw = (sin_theta * math.cos(phi), cos_theta, sin_theta * math.sin(phi))
                vertices.append(
                    (
                        center[0] + scale[0] * raw[0],
                        center[1] + scale[1] * raw[1],
                        center[2] + scale[2] * raw[2],
                    )
                )
                normals.append(
                    normalize(
                        (
                            raw[0] / max(scale[0], 1e-5),
                            raw[1] / max(scale[1], 1e-5),
                            raw[2] / max(scale[2], 1e-5),
                        )
                    )
                )
        for iy in range(rings):
            for ix in range(segments):
                a = iy * (segments + 1) + ix
                b = a + segments + 1
                c = a + 1
                d = b + 1
                indices.extend((a, b, c, c, b, d))
        self.add_mesh(name, vertices, normals, indices, material_index)

    def add_cylinder(
        self,
        name: str,
        start: Vec3,
        end: Vec3,
        radius_start: float,
        radius_end: float,
        material_index: int,
        *,
        segments: int = 12,
    ) -> None:
        axis = normalize(sub(end, start))
        reference = (0.0, 1.0, 0.0) if abs(dot(axis, (0.0, 1.0, 0.0))) < 0.9 else (1.0, 0.0, 0.0)
        side = normalize(cross(axis, reference))
        other = normalize(cross(axis, side))
        vertices: list[Vec3] = []
        normals: list[Vec3] = []
        indices: list[int] = []
        for point, radius, cap_normal in (
            (start, radius_start, mul(axis, -1.0)),
            (end, radius_end, axis),
        ):
            for i in range(segments):
                angle = math.tau * i / segments
                radial = add(mul(side, math.cos(angle)), mul(other, math.sin(angle)))
                vertices.append(add(point, mul(radial, radius)))
                normals.append(radial)
            vertices.append(point)
            normals.append(cap_normal)
        start_center = segments
        end_ring = segments + 1
        end_center = end_ring + segments
        for i in range(segments):
            j = (i + 1) % segments
            indices.extend((i, end_ring + i, j, j, end_ring + i, end_ring + j))
            indices.extend((start_center, j, i))
            indices.extend((end_center, end_ring + i, end_ring + j))
        self.add_mesh(name, vertices, normals, indices, material_index)

    def add_annulus(
        self,
        name: str,
        center: Vec3,
        outer: tuple[float, float],
        inner: tuple[float, float],
        depth: float,
        material_index: int,
        *,
        segments: int = 32,
    ) -> None:
        vertices: list[Vec3] = []
        indices: list[int] = []
        z_front = center[2] + depth / 2
        z_back = center[2] - depth / 2
        for z in (z_front, z_back):
            for radius in (outer, inner):
                for i in range(segments):
                    angle = math.tau * i / segments
                    vertices.append(
                        (
                            center[0] + radius[0] * math.cos(angle),
                            center[1] + radius[1] * math.sin(angle),
                            z,
                        )
                    )
        front_outer = 0
        front_inner = segments
        back_outer = segments * 2
        back_inner = segments * 3
        for i in range(segments):
            j = (i + 1) % segments
            indices.extend((front_outer + i, front_outer + j, front_inner + j))
            indices.extend((front_outer + i, front_inner + j, front_inner + i))
            indices.extend((back_outer + i, back_inner + j, back_outer + j))
            indices.extend((back_outer + i, back_inner + i, back_inner + j))
            indices.extend((front_outer + i, back_outer + i, back_outer + j))
            indices.extend((front_outer + i, back_outer + j, front_outer + j))
            indices.extend((front_inner + i, front_inner + j, back_inner + j))
            indices.extend((front_inner + i, back_inner + j, back_inner + i))
        self.add_mesh(name, vertices, average_normals(vertices, indices), indices, material_index)

    def add_beak(
        self,
        name: str,
        base: Vec3,
        length_value: float,
        width: float,
        height: float,
        material_index: int,
    ) -> None:
        # A compact four-sided tapered wedge pointing toward negative X.
        sections = ((0.0, 1.0), (0.58, 0.82), (1.0, 0.08))
        vertices: list[Vec3] = []
        indices: list[int] = []
        for t, factor in sections:
            x = base[0] - length_value * t
            half_y = width * factor / 2
            half_z = height * factor / 2
            vertices.extend(
                (
                    (x, base[1] - half_y, base[2] - half_z),
                    (x, base[1] + half_y, base[2] - half_z),
                    (x, base[1] + half_y, base[2] + half_z),
                    (x, base[1] - half_y, base[2] + half_z),
                )
            )
        for section in range(2):
            a = section * 4
            b = a + 4
            indices.extend((a, b, a + 1, a + 1, b, b + 1))
            indices.extend((a + 1, b + 1, a + 2, a + 2, b + 1, b + 2))
            indices.extend((a + 2, b + 2, a + 3, a + 3, b + 2, b + 3))
            indices.extend((a + 3, b + 3, a, a, b + 3, b))
        indices.extend((0, 1, 2, 0, 2, 3))
        last = 8
        indices.extend((last, last + 2, last + 1, last, last + 3, last + 2))
        self.add_mesh(name, vertices, average_normals(vertices, indices), indices, material_index)

    def add_feather(
        self,
        name: str,
        base: Vec3,
        tip: Vec3,
        width: float,
        thickness: float,
        material_index: int,
        *,
        curve: float = 0.06,
    ) -> None:
        direction = normalize(sub(tip, base))
        front_normal = (0.0, 0.0, 1.0)
        side = normalize(cross(front_normal, direction))
        if length(side) < 1e-5:
            side = (1.0, 0.0, 0.0)
        centers = []
        widths = (width * 0.10, width, width * 0.56, 0.0)
        for i, t in enumerate((0.0, 0.34, 0.72, 1.0)):
            point = add(base, mul(sub(tip, base), t))
            point = add(point, (0.0, 0.0, curve * math.sin(math.pi * t)))
            centers.append(point)
        vertices: list[Vec3] = []
        normals: list[Vec3] = []
        for center, half_width in zip(centers, widths):
            front_left = add(add(center, mul(side, half_width)), mul(front_normal, thickness / 2))
            front_right = add(add(center, mul(side, -half_width)), mul(front_normal, thickness / 2))
            back_left = add(add(center, mul(side, half_width)), mul(front_normal, -thickness / 2))
            back_right = add(add(center, mul(side, -half_width)), mul(front_normal, -thickness / 2))
            vertices.extend((front_left, front_right, back_left, back_right))
            normals.extend((front_normal, front_normal, mul(front_normal, -1.0), mul(front_normal, -1.0)))
        indices: list[int] = []
        for section in range(3):
            a = section * 4
            b = a + 4
            indices.extend((a, b, a + 1, a + 1, b, b + 1))
            indices.extend((a + 2, a + 3, b + 2, a + 3, b + 3, b + 2))
            indices.extend((a, a + 2, b, a + 2, b + 2, b))
            indices.extend((a + 1, b + 1, a + 3, a + 3, b + 1, b + 3))
        self.add_mesh(name, vertices, normals, indices, material_index)

    def save(
        self,
        path: Path,
        *,
        model_name: str = "goose-heart-champion",
        scene_name: str = "GooseHeartChampion",
    ) -> None:
        gltf = {
            "asset": {
                "version": "2.0",
                "generator": "Codex dependency-free heart-champion GLB builder",
                "extras": {
                    "model": model_name,
                    "coordinateSystem": "Y-up, front is positive Z",
                    "staticMultiPart": True,
                },
            },
            "scene": 0,
            "scenes": [
                {
                    "name": scene_name,
                    "nodes": self.scene_nodes if self.scene_nodes is not None else list(range(len(self.nodes))),
                }
            ],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.binary)}],
        }
        if self.skins:
            gltf["skins"] = self.skins
        if self.animations:
            gltf["animations"] = self.animations
        json_bytes = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        while len(json_bytes) % 4:
            json_bytes += b" "
        binary = bytes(self.binary)
        while len(binary) % 4:
            binary += b"\x00"
        total_length = 12 + 8 + len(json_bytes) + 8 + len(binary)
        output = bytearray()
        output.extend(struct.pack("<4sII", b"glTF", 2, total_length))
        output.extend(struct.pack("<I4s", len(json_bytes), b"JSON"))
        output.extend(json_bytes)
        output.extend(struct.pack("<I4s", len(binary), b"BIN\x00"))
        output.extend(binary)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(output)


def add_eye_pair(
    builder: GLBBuilder,
    prefix: str,
    eye_material: int,
    glint_material: int,
    *,
    x: float,
    y: float,
    z_center: float = 0.10,
    spacing: float = 0.16,
) -> None:
    for label, z in (("L", z_center - spacing), ("R", z_center + spacing)):
        builder.add_uv_sphere(
            f"{prefix}_Eye_{label}",
            (x, y, z),
            (0.060, 0.072, 0.036),
            eye_material,
            segments=12,
            rings=8,
        )
        builder.add_uv_sphere(
            f"{prefix}_EyeGlint_{label}",
            (x - 0.018, y + 0.018, z + 0.024),
            (0.014, 0.016, 0.010),
            glint_material,
            segments=8,
            rings=5,
        )


def add_animal_neck(
    builder: GLBBuilder,
    prefix: str,
    skin_material: int,
    strap_material: int,
) -> None:
    # The neck ends at the same clavicle line as the goose version so that
    # the replacement head can share the existing chest and head bones.
    builder.add_cylinder(
        f"{prefix}_Neck",
        (0.0, 2.12, 0.02),
        (-0.10, 2.62, 0.05),
        0.34,
        0.28,
        skin_material,
        segments=16,
    )
    builder.add_uv_sphere(
        f"{prefix}_ClaviclePlate",
        (-0.02, 2.14, 0.04),
        (0.52, 0.14, 0.27),
        skin_material,
        segments=16,
        rings=8,
    )
    builder.add_cylinder(
        f"{prefix}_SideStrap",
        (0.23, 2.78, -0.12),
        (0.34, 2.78, 0.12),
        0.045,
        0.045,
        strap_material,
        segments=8,
    )


def add_animal_head(builder: GLBBuilder, variant: str) -> None:
    """Add one animal head while keeping the goose head's attachment points."""

    prefix = {
        "lion": "Lion",
        "rhinoceros": "Rhinoceros",
        "crocodile": "Crocodile",
        "gorilla": "Gorilla",
        "bear": "Bear",
        "hippopotamus": "Hippopotamus",
    }[variant]
    strap = builder.material("Animal head strap", (0.025, 0.028, 0.035, 1.0), roughness=0.42)
    glint = builder.material("Animal eye glint", (0.95, 0.98, 1.0, 1.0), roughness=0.18)

    if variant == "lion":
        mane = builder.material("Lion mane", (0.22, 0.075, 0.018, 1.0), roughness=0.62)
        fur = builder.material("Lion tawny fur", (0.62, 0.30, 0.065, 1.0), roughness=0.52)
        muzzle = builder.material("Lion muzzle", (0.72, 0.46, 0.22, 1.0), roughness=0.56)
        nose = builder.material("Lion nose", (0.075, 0.035, 0.025, 1.0), roughness=0.40)
        eyes = builder.material("Lion amber eyes", (0.82, 0.48, 0.06, 1.0), roughness=0.22)
        builder.add_uv_sphere(f"{prefix}_Mane", (-0.02, 2.90, 0.04), (0.58, 0.56, 0.45), mane, segments=20, rings=12)
        builder.add_uv_sphere(f"{prefix}_HeadFace", (-0.20, 2.92, 0.12), (0.43, 0.43, 0.32), fur, segments=18, rings=12)
        builder.add_uv_sphere(f"{prefix}_Muzzle", (-0.49, 2.79, 0.21), (0.23, 0.18, 0.21), muzzle, segments=16, rings=9)
        builder.add_uv_sphere(f"{prefix}_Nose", (-0.68, 2.81, 0.23), (0.082, 0.065, 0.075), nose, segments=12, rings=8)
        builder.add_uv_sphere(f"{prefix}_Ear_L", (-0.08, 3.27, -0.26), (0.16, 0.18, 0.13), fur, segments=12, rings=8)
        builder.add_uv_sphere(f"{prefix}_Ear_R", (-0.08, 3.27, 0.30), (0.16, 0.18, 0.13), fur, segments=12, rings=8)
        add_eye_pair(builder, prefix, eyes, glint, x=-0.43, y=3.04, z_center=0.10, spacing=0.14)
        add_animal_neck(builder, prefix, mane, strap)
        return

    if variant == "rhinoceros":
        skin = builder.material("Rhinoceros gray skin", (0.36, 0.35, 0.32, 1.0), roughness=0.76)
        muzzle = builder.material("Rhinoceros muzzle", (0.28, 0.27, 0.24, 1.0), roughness=0.72)
        horn = builder.material("Rhinoceros horn", (0.55, 0.50, 0.42, 1.0), roughness=0.70)
        eyes = builder.material("Rhinoceros eyes", (0.09, 0.065, 0.04, 1.0), roughness=0.28)
        builder.add_uv_sphere(f"{prefix}_HeadFace", (-0.06, 2.93, 0.08), (0.52, 0.47, 0.37), skin, segments=18, rings=12)
        builder.add_uv_sphere(f"{prefix}_Muzzle", (-0.43, 2.80, 0.15), (0.32, 0.25, 0.29), muzzle, segments=16, rings=9)
        builder.add_uv_sphere(f"{prefix}_Nose", (-0.68, 2.84, 0.18), (0.095, 0.075, 0.10), eyes, segments=12, rings=8)
        builder.add_cylinder(f"{prefix}_Horn_Large", (-0.42, 3.06, 0.17), (-0.73, 3.40, 0.17), 0.12, 0.012, horn, segments=12)
        builder.add_cylinder(f"{prefix}_Horn_Small", (-0.25, 3.03, -0.03), (-0.46, 3.28, -0.03), 0.075, 0.010, horn, segments=12)
        builder.add_uv_sphere(f"{prefix}_Ear_L", (-0.04, 3.34, -0.27), (0.14, 0.20, 0.11), skin, segments=12, rings=8)
        builder.add_uv_sphere(f"{prefix}_Ear_R", (-0.04, 3.34, 0.31), (0.14, 0.20, 0.11), skin, segments=12, rings=8)
        add_eye_pair(builder, prefix, eyes, glint, x=-0.40, y=3.08, z_center=0.10, spacing=0.13)
        add_animal_neck(builder, prefix, skin, strap)
        return

    if variant == "crocodile":
        skin = builder.material("Crocodile green scales", (0.18, 0.26, 0.10, 1.0), roughness=0.78)
        light_skin = builder.material("Crocodile jaw scales", (0.42, 0.38, 0.16, 1.0), roughness=0.72)
        dark = builder.material("Crocodile eye and nostril", (0.018, 0.022, 0.012, 1.0), roughness=0.30)
        tooth = builder.material("Crocodile teeth", (0.90, 0.82, 0.52, 1.0), roughness=0.58)
        eyes = builder.material("Crocodile eyes", (0.56, 0.42, 0.08, 1.0), roughness=0.24)
        builder.add_uv_sphere(f"{prefix}_HeadFace", (-0.05, 2.95, 0.08), (0.49, 0.41, 0.33), skin, segments=18, rings=12)
        builder.add_beak(f"{prefix}_Snout", (-0.26, 2.86, 0.15), 0.70, 0.38, 0.24, light_skin)
        builder.add_uv_sphere(f"{prefix}_Jaw", (-0.47, 2.73, 0.14), (0.31, 0.16, 0.25), light_skin, segments=16, rings=9)
        for side, z in (("L", 0.02), ("R", 0.28)):
            builder.add_uv_sphere(f"{prefix}_Nostril_{side}", (-0.88, 2.91, z), (0.035, 0.025, 0.030), dark, segments=8, rings=5)
        for index, z in enumerate((0.00, 0.11, 0.22, 0.33)):
            builder.add_cylinder(f"{prefix}_Tooth_{index}", (-0.54, 2.76, z), (-0.54, 2.68, z), 0.018, 0.004, tooth, segments=8)
        builder.add_uv_sphere(f"{prefix}_Ear_L", (-0.02, 3.24, -0.25), (0.10, 0.12, 0.08), skin, segments=10, rings=7)
        builder.add_uv_sphere(f"{prefix}_Ear_R", (-0.02, 3.24, 0.31), (0.10, 0.12, 0.08), skin, segments=10, rings=7)
        add_eye_pair(builder, prefix, eyes, glint, x=-0.39, y=3.12, z_center=0.10, spacing=0.14)
        add_animal_neck(builder, prefix, skin, strap)
        return

    if variant == "gorilla":
        fur = builder.material("Gorilla charcoal fur", (0.055, 0.050, 0.045, 1.0), roughness=0.86)
        muzzle = builder.material("Gorilla muzzle", (0.22, 0.18, 0.16, 1.0), roughness=0.74)
        nose = builder.material("Gorilla nose", (0.035, 0.028, 0.025, 1.0), roughness=0.40)
        eyes = builder.material("Gorilla eyes", (0.18, 0.10, 0.045, 1.0), roughness=0.25)
        builder.add_uv_sphere(f"{prefix}_HeadFace", (-0.08, 2.94, 0.08), (0.50, 0.49, 0.36), fur, segments=18, rings=12)
        builder.add_uv_sphere(f"{prefix}_Brow", (-0.38, 3.10, 0.12), (0.24, 0.13, 0.23), fur, segments=14, rings=8)
        builder.add_uv_sphere(f"{prefix}_Muzzle", (-0.44, 2.79, 0.16), (0.29, 0.24, 0.24), muzzle, segments=16, rings=9)
        builder.add_uv_sphere(f"{prefix}_Nose", (-0.67, 2.86, 0.18), (0.095, 0.075, 0.09), nose, segments=12, rings=8)
        builder.add_uv_sphere(f"{prefix}_Ear_L", (-0.04, 3.18, -0.31), (0.11, 0.15, 0.08), muzzle, segments=10, rings=7)
        builder.add_uv_sphere(f"{prefix}_Ear_R", (-0.04, 3.18, 0.35), (0.11, 0.15, 0.08), muzzle, segments=10, rings=7)
        add_eye_pair(builder, prefix, eyes, glint, x=-0.43, y=3.08, z_center=0.10, spacing=0.14)
        add_animal_neck(builder, prefix, fur, strap)
        return

    if variant == "bear":
        fur = builder.material("Bear brown fur", (0.32, 0.16, 0.055, 1.0), roughness=0.78)
        muzzle = builder.material("Bear muzzle", (0.60, 0.38, 0.18, 1.0), roughness=0.70)
        nose = builder.material("Bear nose", (0.045, 0.028, 0.020, 1.0), roughness=0.36)
        eyes = builder.material("Bear eyes", (0.14, 0.075, 0.025, 1.0), roughness=0.24)
        builder.add_uv_sphere(f"{prefix}_HeadFace", (-0.08, 2.94, 0.08), (0.50, 0.48, 0.35), fur, segments=18, rings=12)
        builder.add_uv_sphere(f"{prefix}_Muzzle", (-0.45, 2.80, 0.20), (0.25, 0.20, 0.22), muzzle, segments=16, rings=9)
        builder.add_uv_sphere(f"{prefix}_Nose", (-0.66, 2.84, 0.22), (0.09, 0.07, 0.08), nose, segments=12, rings=8)
        builder.add_uv_sphere(f"{prefix}_Ear_L", (-0.08, 3.28, -0.26), (0.17, 0.18, 0.13), fur, segments=12, rings=8)
        builder.add_uv_sphere(f"{prefix}_Ear_R", (-0.08, 3.28, 0.31), (0.17, 0.18, 0.13), fur, segments=12, rings=8)
        add_eye_pair(builder, prefix, eyes, glint, x=-0.43, y=3.06, z_center=0.10, spacing=0.14)
        add_animal_neck(builder, prefix, fur, strap)
        return

    if variant == "hippopotamus":
        skin = builder.material("Hippopotamus purple gray skin", (0.34, 0.25, 0.27, 1.0), roughness=0.78)
        muzzle = builder.material("Hippopotamus muzzle", (0.47, 0.34, 0.35, 1.0), roughness=0.74)
        nostril = builder.material("Hippopotamus nostrils", (0.075, 0.045, 0.055, 1.0), roughness=0.42)
        eyes = builder.material("Hippopotamus eyes", (0.16, 0.09, 0.075, 1.0), roughness=0.25)
        builder.add_uv_sphere(f"{prefix}_HeadFace", (-0.06, 2.94, 0.08), (0.55, 0.46, 0.38), skin, segments=18, rings=12)
        builder.add_uv_sphere(f"{prefix}_Muzzle", (-0.48, 2.78, 0.20), (0.38, 0.27, 0.31), muzzle, segments=18, rings=10)
        for side, z in (("L", 0.02), ("R", 0.28)):
            builder.add_uv_sphere(f"{prefix}_Nostril_{side}", (-0.70, 2.93, z), (0.045, 0.030, 0.040), nostril, segments=10, rings=6)
        builder.add_uv_sphere(f"{prefix}_Ear_L", (-0.03, 3.30, -0.26), (0.12, 0.16, 0.10), skin, segments=10, rings=7)
        builder.add_uv_sphere(f"{prefix}_Ear_R", (-0.03, 3.30, 0.32), (0.12, 0.16, 0.10), skin, segments=10, rings=7)
        add_eye_pair(builder, prefix, eyes, glint, x=-0.39, y=3.10, z_center=0.10, spacing=0.17)
        add_animal_neck(builder, prefix, skin, strap)
        return

    raise ValueError(f"unknown animal variant: {variant}")


def quaternion_axis(axis: Vec3, angle: float) -> tuple[float, float, float, float]:
    half = angle * 0.5
    sine = math.sin(half)
    cosine = math.cos(half)
    direction = normalize(axis)
    return (direction[0] * sine, direction[1] * sine, direction[2] * sine, cosine)


def translation_matrix(position: Vec3) -> list[float]:
    # glTF matrices are stored column-major.
    return [
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        position[0],
        position[1],
        position[2],
        1.0,
    ]


def inverse_translation_matrix(position: Vec3) -> list[float]:
    return translation_matrix((-position[0], -position[1], -position[2]))


def add_animation_accessor(
    builder: GLBBuilder,
    values: list[float],
    count: int,
    accessor_type: str,
) -> int:
    data = b"".join(struct.pack("<f", value) for value in values)
    offset, size = builder._append_bytes(data)
    view = builder._view(offset, size)
    return builder._accessor(view, 5126, count, accessor_type)


ANIMAL_HEAD_PREFIXES = ("lion", "rhinoceros", "crocodile", "gorilla", "bear", "hippopotamus")


def is_animal_head_mesh(lower_name: str) -> bool:
    return any(lower_name.startswith(f"{prefix}_") for prefix in ANIMAL_HEAD_PREFIXES)


def head_bone_name(lower_name: str) -> str:
    if "clavicle" in lower_name:
        return "chest"
    if "throat" in lower_name or "neck" in lower_name:
        return "neck"
    return "head"


def mesh_bone_name(mesh_name: str) -> str:
    lower = mesh_name.lower()
    if lower.startswith("wing_"):
        return "wing.R"
    if "goosemask" in lower:
        return head_bone_name(lower)
    if is_animal_head_mesh(lower):
        return head_bone_name(lower)
    if "heart" in lower or "chest" in lower or "pectoral" in lower:
        return "chest"
    if "torso" in lower or "abdomen" in lower:
        return "spine"
    if "pelvis" in lower or "hip" in lower:
        return "pelvis"

    side = "L" if "left" in lower else "R" if "right" in lower else ""
    if "foot" in lower:
        return f"foot.{side}"
    if "calf" in lower or "knee" in lower:
        return f"shin.{side}"
    if "thigh" in lower:
        return f"thigh.{side}"
    if "fist" in lower or "knuckle" in lower:
        return f"hand.{side}"
    if "forearm" in lower or "elbow" in lower:
        return f"forearm.{side}"
    if "bicep" in lower or "shoulder" in lower:
        return f"upper_arm.{side}"
    if "abdominal" in lower:
        return "spine"
    return "chest"


def point_segment_distance(point: Vec3, start: Vec3, end: Vec3) -> float:
    segment = sub(end, start)
    denominator = dot(segment, segment)
    if denominator < 1e-8:
        return length(sub(point, start))
    amount = max(0.0, min(1.0, dot(sub(point, start), segment) / denominator))
    nearest = add(start, mul(segment, amount))
    return length(sub(point, nearest))


def smooth_candidate_bones(mesh_name: str) -> list[str]:
    lower = mesh_name.lower()
    if lower.startswith("wing_"):
        return ["chest", "wing.R"]
    if "goosemask" in lower or is_animal_head_mesh(lower):
        if "clavicle" in lower:
            return ["chest", "neck"]
        if "throat" in lower or "neck" in lower:
            return ["chest", "neck", "head"]
        return ["neck", "head"]
    if "heart" in lower or "chest" in lower or "pectoral" in lower:
        return ["spine", "chest", "pelvis"]
    if "torso" in lower or "abdomen" in lower or "abdominal" in lower:
        return ["pelvis", "spine", "chest"]
    if "pelvis" in lower:
        return ["pelvis", "spine", "thigh.L", "thigh.R"]

    side = "L" if "left" in lower else "R" if "right" in lower else ""
    if "foot" in lower:
        return [f"shin.{side}", f"foot.{side}"]
    if "calf" in lower or "knee" in lower:
        return [f"thigh.{side}", f"shin.{side}", f"foot.{side}"]
    if "thigh" in lower or "hip" in lower:
        return ["pelvis", f"thigh.{side}", f"shin.{side}"]
    if "fist" in lower or "knuckle" in lower:
        return [f"forearm.{side}", f"hand.{side}"]
    if "forearm" in lower or "elbow" in lower:
        return [f"upper_arm.{side}", f"forearm.{side}", f"hand.{side}"]
    if "bicep" in lower or "shoulder" in lower:
        return ["chest", f"upper_arm.{side}", f"forearm.{side}"]
    return ["chest", "spine", "pelvis"]


def smooth_vertex_weights(
    mesh_name: str,
    vertex: Vec3,
    candidates: list[str],
    bone_order: dict[str, int],
    bone_segments: dict[str, tuple[Vec3, Vec3]],
) -> list[tuple[int, float]]:
    scored: list[tuple[str, float]] = []
    for bone_name in candidates:
        if bone_name not in bone_order or bone_name not in bone_segments:
            continue
        start, end = bone_segments[bone_name]
        distance = point_segment_distance(vertex, start, end)
        # A soft inverse-distance field gives two or more bones meaningful
        # influence around elbows, knees, shoulders and the chest seam.
        score = 1.0 / ((distance + 0.085) ** 2)
        scored.append((bone_name, score))
    if not scored:
        return [(bone_order["chest"], 1.0)]
    scored.sort(key=lambda item: item[1], reverse=True)
    scored = scored[:4]
    total = sum(score for _, score in scored)
    return [(bone_order[name], score / total) for name, score in scored]


def add_fighter_rig(builder: GLBBuilder, *, smooth: bool = False) -> None:
    """Add a humanoid rig and starter fighting animations.

    The default mode uses one rigid weight per part.  ``smooth=True`` uses up
    to four distance-based weights per vertex, so vertices around shoulders,
    elbows, hips and knees blend between neighboring bones.
    """

    mesh_node_count = len(builder.nodes)
    bone_specs: list[tuple[str, str | None, Vec3]] = [
        ("root", None, (0.0, 0.0, 0.0)),
        ("pelvis", "root", (0.0, 0.98, 0.0)),
        ("spine", "pelvis", (0.0, 0.55, 0.0)),
        ("chest", "spine", (0.0, 0.50, 0.0)),
        ("neck", "chest", (-0.12, 0.27, 0.04)),
        ("head", "neck", (-0.03, 0.58, 0.06)),
        ("upper_arm.L", "chest", (-0.68, -0.06, 0.0)),
        ("forearm.L", "upper_arm.L", (-0.47, 0.21, 0.03)),
        ("hand.L", "forearm.L", (-0.07, 0.24, 0.01)),
        ("upper_arm.R", "chest", (0.68, -0.06, 0.0)),
        ("forearm.R", "upper_arm.R", (0.47, 0.21, 0.03)),
        ("hand.R", "forearm.R", (0.07, 0.24, 0.01)),
        ("thigh.L", "pelvis", (-0.33, 0.02, 0.0)),
        ("shin.L", "thigh.L", (-0.05, -0.50, 0.02)),
        ("foot.L", "shin.L", (0.0, -0.34, 0.02)),
        ("thigh.R", "pelvis", (0.33, 0.02, 0.0)),
        ("shin.R", "thigh.R", (0.05, -0.50, 0.02)),
        ("foot.R", "shin.R", (0.0, -0.34, 0.02)),
        ("wing.R", "chest", (0.45, 0.25, -0.22)),
    ]
    bone_indices: dict[str, int] = {}
    local_positions: dict[str, Vec3] = {}
    parents: dict[str, str | None] = {}
    for name, parent, local in bone_specs:
        bone_indices[name] = len(builder.nodes)
        local_positions[name] = local
        parents[name] = parent
        builder.nodes.append({"name": name, "translation": list(local)})

    for name, parent, _ in bone_specs:
        if parent is not None:
            builder.nodes[bone_indices[parent]].setdefault("children", []).append(bone_indices[name])

    world_positions: dict[str, Vec3] = {}
    for name, parent, local in bone_specs:
        world_positions[name] = local if parent is None else add(world_positions[parent], local)

    joints = [bone_indices[name] for name, _, _ in bone_specs]
    inverse_bind_data: list[float] = []
    for name, _, _ in bone_specs:
        inverse_bind_data.extend(inverse_translation_matrix(world_positions[name]))
    inverse_bind_accessor = add_animation_accessor(builder, inverse_bind_data, len(joints), "MAT4")
    skin_index = len(builder.skins)
    builder.skins.append(
        {
            "name": "HeartChampionFighterRig",
            "joints": joints,
            "inverseBindMatrices": inverse_bind_accessor,
            "skeleton": bone_indices["root"],
        }
    )

    # Bind every existing mesh node.  The smooth variant retains up to four
    # influences per vertex; the original variant keeps one rigid influence.
    bone_order = {name: index for index, (name, _, _) in enumerate(bone_specs)}
    bone_segments: dict[str, tuple[Vec3, Vec3]] = {}
    for name, parent, _ in bone_specs:
        start = world_positions[parent] if parent is not None else world_positions[name]
        bone_segments[name] = (start, world_positions[name])
    for node_index in range(mesh_node_count):
        node = builder.nodes[node_index]
        node["skin"] = skin_index
        bone_name = mesh_bone_name(node["name"])
        if bone_name not in bone_order:
            bone_name = "chest"
        joint_index = bone_order[bone_name]
        primitive = builder.meshes[node["mesh"]]["primitives"][0]
        vertex_count = builder.accessors[primitive["attributes"]["POSITION"]]["count"]
        joint_values: list[int] = []
        weight_values: list[float] = []
        vertices = builder.mesh_vertices[node["mesh"]]
        candidates = smooth_candidate_bones(node["name"]) if smooth else []
        for vertex in vertices:
            influences = (
                smooth_vertex_weights(node["name"], vertex, candidates, bone_order, bone_segments)
                if smooth
                else [(joint_index, 1.0)]
            )
            influences = influences[:4]
            while len(influences) < 4:
                influences.append((0, 0.0))
            for joint, weight in influences:
                joint_values.append(joint)
                weight_values.append(weight)
        joint_bytes = b"".join(struct.pack("<4H", *joint_values[i : i + 4]) for i in range(0, len(joint_values), 4))
        weight_bytes = b"".join(struct.pack("<4f", *weight_values[i : i + 4]) for i in range(0, len(weight_values), 4))
        joint_offset, joint_size = builder._append_bytes(joint_bytes)
        weight_offset, weight_size = builder._append_bytes(weight_bytes)
        joint_view = builder._view(joint_offset, joint_size, 34962)
        weight_view = builder._view(weight_offset, weight_size, 34962)
        joint_accessor = builder._accessor(joint_view, 5123, vertex_count, "VEC4")
        weight_accessor = builder._accessor(weight_view, 5126, vertex_count, "VEC4")
        primitive["attributes"]["JOINTS_0"] = joint_accessor
        primitive["attributes"]["WEIGHTS_0"] = weight_accessor

    def add_clip(
        name: str,
        clips: list[tuple[str, str, list[float], list[tuple[float, ...]]]],
        *,
        extras: dict | None = None,
    ) -> None:
        samplers = []
        channels = []
        for bone_name, path, times, values in clips:
            input_accessor = add_animation_accessor(builder, times, len(times), "SCALAR")
            width = 3 if path == "translation" else 4
            output_accessor = add_animation_accessor(builder, [value for frame in values for value in frame], len(values), "VEC3" if width == 3 else "VEC4")
            sampler_index = len(samplers)
            samplers.append({"input": input_accessor, "output": output_accessor, "interpolation": "LINEAR"})
            channels.append(
                {
                    "sampler": sampler_index,
                    "target": {"node": bone_indices[bone_name], "path": path},
                }
            )
        animation = {"name": name, "samplers": samplers, "channels": channels}
        if extras:
            animation["extras"] = extras
        builder.animations.append(animation)

    idle_times = [0.0, 0.8, 1.6]
    add_clip(
        "Idle",
        [
            ("root", "translation", idle_times, [(0.0, 0.0, 0.0), (0.0, 0.025, 0.0), (0.0, 0.0, 0.0)]),
            ("spine", "rotation", idle_times, [quaternion_axis((0.0, 0.0, 1.0), 0.0), quaternion_axis((0.0, 0.0, 1.0), 0.035), quaternion_axis((0.0, 0.0, 1.0), 0.0)]),
            ("chest", "rotation", idle_times, [quaternion_axis((0.0, 1.0, 0.0), -0.02), quaternion_axis((0.0, 1.0, 0.0), 0.02), quaternion_axis((0.0, 1.0, 0.0), -0.02)]),
            ("wing.R", "rotation", idle_times, [quaternion_axis((0.0, 0.0, 1.0), 0.0), quaternion_axis((0.0, 0.0, 1.0), 0.025), quaternion_axis((0.0, 0.0, 1.0), 0.0)]),
        ],
    )

    guard_times = [0.0, 0.18, 0.36]
    add_clip(
        "Guard",
        [
            ("upper_arm.L", "rotation", guard_times, [quaternion_axis((0.0, 0.0, 1.0), 0.0), quaternion_axis((0.0, 0.0, 1.0), -0.15), quaternion_axis((0.0, 0.0, 1.0), 0.0)]),
            ("upper_arm.R", "rotation", guard_times, [quaternion_axis((0.0, 0.0, 1.0), 0.0), quaternion_axis((0.0, 0.0, 1.0), 0.15), quaternion_axis((0.0, 0.0, 1.0), 0.0)]),
            ("forearm.L", "rotation", guard_times, [quaternion_axis((0.0, 1.0, 0.0), 0.0), quaternion_axis((0.0, 1.0, 0.0), -0.18), quaternion_axis((0.0, 1.0, 0.0), 0.0)]),
            ("forearm.R", "rotation", guard_times, [quaternion_axis((0.0, 1.0, 0.0), 0.0), quaternion_axis((0.0, 1.0, 0.0), 0.18), quaternion_axis((0.0, 1.0, 0.0), 0.0)]),
        ],
    )

    punch_times = [0.0, 0.14, 0.28, 0.72]
    add_clip(
        "Punch_R",
        [
            ("upper_arm.R", "rotation", punch_times, [quaternion_axis((0.0, 0.0, 1.0), 0.0), quaternion_axis((0.0, 0.0, 1.0), -0.35), quaternion_axis((0.0, 0.0, 1.0), -0.08), quaternion_axis((0.0, 0.0, 1.0), 0.0)]),
            ("forearm.R", "rotation", punch_times, [quaternion_axis((0.0, 0.0, 1.0), 0.0), quaternion_axis((0.0, 0.0, 1.0), -0.45), quaternion_axis((0.0, 0.0, 1.0), -0.72), quaternion_axis((0.0, 0.0, 1.0), 0.0)]),
            ("hand.R", "rotation", punch_times, [quaternion_axis((0.0, 1.0, 0.0), 0.0), quaternion_axis((0.0, 1.0, 0.0), 0.12), quaternion_axis((0.0, 1.0, 0.0), 0.20), quaternion_axis((0.0, 1.0, 0.0), 0.0)]),
        ],
    )

    kick_times = [0.0, 0.16, 0.34, 0.82]
    add_clip(
        "Kick_L",
        [
            ("thigh.L", "rotation", kick_times, [quaternion_axis((0.0, 0.0, 1.0), 0.0), quaternion_axis((0.0, 0.0, 1.0), -0.24), quaternion_axis((0.0, 0.0, 1.0), 0.10), quaternion_axis((0.0, 0.0, 1.0), 0.0)]),
            ("shin.L", "rotation", kick_times, [quaternion_axis((0.0, 0.0, 1.0), 0.0), quaternion_axis((0.0, 0.0, 1.0), 0.30), quaternion_axis((0.0, 0.0, 1.0), 0.62), quaternion_axis((0.0, 0.0, 1.0), 0.0)]),
            ("foot.L", "rotation", kick_times, [quaternion_axis((1.0, 0.0, 0.0), 0.0), quaternion_axis((1.0, 0.0, 0.0), -0.12), quaternion_axis((1.0, 0.0, 0.0), -0.22), quaternion_axis((1.0, 0.0, 0.0), 0.0)]),
        ],
    )

    def motion_spec(
        name: str,
        style: str,
        sides: str | tuple[str, ...],
        times: list[float],
        first: list[float],
        second: list[float],
        third: list[float],
        spine: list[float],
        chest: list[float],
        *,
        axes: tuple[Vec3, Vec3, Vec3],
        spine_axis: Vec3 = (0.0, 1.0, 0.0),
        chest_axis: Vec3 = (0.0, 1.0, 0.0),
        root_x: list[float] | None = None,
        root_y: list[float] | None = None,
    ) -> dict:
        return {
            "name": name,
            "style": style,
            "sides": sides,
            "times": times,
            "first": first,
            "second": second,
            "third": third,
            "spine": spine,
            "chest": chest,
            "axes": axes,
            "spine_axis": spine_axis,
            "chest_axis": chest_axis,
            "root_x": root_x,
            "root_y": root_y,
        }

    def add_motion_set(category: str, specs: list[dict]) -> None:
        if category == "punch":
            limb_bones = ("upper_arm", "forearm", "hand")
            default_axes = ((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))
        else:
            limb_bones = ("thigh", "shin", "foot")
            default_axes = ((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))

        for spec in specs:
            times = spec["times"]
            frame_count = len(times)
            for key in ("first", "second", "third", "spine", "chest"):
                if len(spec[key]) != frame_count:
                    raise ValueError(f"{spec['name']}: {key} frame count differs")
            raw_sides = spec["sides"]
            sides = (raw_sides,) if isinstance(raw_sides, str) else tuple(raw_sides)
            body_sign = -1.0 if len(sides) == 1 and sides[0] == "R" else 1.0
            power = spec.get("power", 1.18)
            body_scale = spec.get("body_scale", 1.0)
            side_delay = spec.get("side_delay", 0.0)
            channels: list[tuple[str, str, list[float], list[tuple[float, ...]]]] = []
            axes = spec.get("axes", default_axes)
            values = (spec["first"], spec["second"], spec["third"])

            for side_index, side in enumerate(sides):
                side_sign = -1.0 if side == "R" else 1.0
                side_times = times
                if side_index and side_delay:
                    side_times = [time + side_delay * side_index for time in times]
                for bone_base, axis, angles in zip(limb_bones, axes, values):
                    bone_name = f"{bone_base}.{side}"
                    channels.append(
                        (
                            bone_name,
                            "rotation",
                            side_times,
                            q_series(axis, [side_sign * power * angle for angle in angles]),
                        )
                    )

            channels.append(
                (
                    "spine",
                    "rotation",
                    times,
                    q_series(spec["spine_axis"], [body_sign * body_scale * angle for angle in spec["spine"]]),
                )
            )
            channels.append(
                (
                    "chest",
                    "rotation",
                    times,
                    q_series(spec["chest_axis"], [body_sign * body_scale * angle for angle in spec["chest"]]),
                )
            )

            pelvis = spec.get("pelvis")
            if pelvis is not None:
                channels.append(
                    (
                        "pelvis",
                        "rotation",
                        times,
                        q_series((0.0, 0.0, 1.0), [body_sign * body_scale * angle for angle in pelvis]),
                    )
                )

            root_turn = spec.get("root_turn", 0.0)
            if root_turn:
                turn_curve = [0.0, 0.72, 1.0, 1.0, 0.0] if frame_count == 5 else [0.0, 0.72, 1.0, 0.0]
                channels.append(
                    (
                        "root",
                        "rotation",
                        times,
                        q_series((0.0, 1.0, 0.0), [body_sign * root_turn * amount for amount in turn_curve]),
                    )
                )

            root_x = spec.get("root_x")
            root_y = spec.get("root_y")
            root_z = spec.get("root_z")
            if root_x is not None or root_y is not None or root_z is not None:
                root_x = root_x if root_x is not None else [0.0] * frame_count
                root_y = root_y if root_y is not None else [0.0] * frame_count
                root_z = root_z if root_z is not None else [0.0] * frame_count
                if len(root_x) != frame_count or len(root_y) != frame_count or len(root_z) != frame_count:
                    raise ValueError(f"{spec['name']}: root motion frame count differs")
                channels.append(
                    (
                        "root",
                        "translation",
                        times,
                        [(body_sign * x, y, z) for x, y, z in zip(root_x, root_y, root_z)],
                    )
                )

            add_clip(
                spec["name"],
                channels,
                extras={
                    "category": category,
                    "style": spec["style"],
                    "motionFamily": "musou-inspired",
                    "phaseModel": "windup-impact-hold-recovery",
                    "powerLevel": spec.get("power_level", "standard"),
                    "rootMotion": bool(root_x is not None or root_y is not None or root_z is not None),
                    "comboDelaySeconds": side_delay,
                    "hitHoldSeconds": spec.get("hit_hold", 0.0),
                    "sharedAcrossAnimalVariants": True,
                },
            )

    def q_series(axis: Vec3, angles: list[float]) -> list[tuple[float, float, float, float]]:
        return [quaternion_axis(axis, angle) for angle in angles]

    punch_specs = [
        motion_spec("Punch_01_Jab", "quick straight", "R", [0.0, 0.10, 0.22, 0.46], [0.0, 0.18, 0.42, 0.0], [0.0, 0.28, 0.52, 0.0], [0.0, 0.04, 0.08, 0.0], [0.0, 0.03, 0.06, 0.0], [0.0, 0.05, 0.10, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_02_Cross", "long rear straight", "L", [0.0, 0.16, 0.32, 0.68], [0.0, 0.28, 0.64, 0.0], [0.0, 0.34, 0.75, 0.0], [0.0, 0.07, 0.15, 0.0], [0.0, 0.06, 0.15, 0.0], [0.0, 0.08, 0.18, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_03_Hook", "wide hook", "R", [0.0, 0.16, 0.34, 0.60], [0.0, 0.30, 0.62, 0.0], [0.0, 0.12, 0.42, 0.0], [0.0, 0.18, 0.36, 0.0], [0.0, 0.10, 0.22, 0.0], [0.0, 0.14, 0.28, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_04_Uppercut", "rising uppercut", "R", [0.0, 0.18, 0.34, 0.70], [0.0, 0.24, 0.58, 0.0], [0.0, 0.44, 0.72, 0.0], [0.0, 0.10, 0.18, 0.0], [0.0, 0.05, 0.12, 0.0], [0.0, 0.06, 0.15, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_05_Overhand", "high overhand", "L", [0.0, 0.20, 0.40, 0.80], [0.0, 0.40, 0.78, 0.0], [0.0, 0.25, 0.58, 0.0], [0.0, 0.10, 0.20, 0.0], [0.0, 0.12, 0.22, 0.0], [0.0, 0.14, 0.26, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_06_Backfist", "turning backfist", "R", [0.0, 0.14, 0.30, 0.56], [0.0, 0.18, 0.50, 0.0], [0.0, 0.08, 0.34, 0.0], [0.0, 0.22, 0.48, 0.0], [0.0, 0.08, 0.16, 0.0], [0.0, 0.10, 0.20, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_07_LongJab", "stepping long jab", "L", [0.0, 0.18, 0.38, 0.78], [0.0, 0.10, 0.52, 0.0], [0.0, 0.22, 0.64, 0.0], [0.0, 0.04, 0.12, 0.0], [0.0, 0.04, 0.09, 0.0], [0.0, 0.05, 0.12, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0)), root_x=[0.0, 0.02, 0.05, 0.0]),
        motion_spec("Punch_08_BodyHook", "low body hook", "R", [0.0, 0.15, 0.34, 0.62], [0.0, 0.34, 0.58, 0.0], [0.0, 0.16, 0.38, 0.0], [0.0, 0.12, 0.28, 0.0], [0.0, 0.18, 0.30, 0.0], [0.0, 0.20, 0.34, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_09_StraightBody", "low straight", "L", [0.0, 0.14, 0.28, 0.58], [0.0, 0.22, 0.52, 0.0], [0.0, 0.42, 0.78, 0.0], [0.0, 0.06, 0.14, 0.0], [0.0, 0.10, 0.18, 0.0], [0.0, 0.12, 0.22, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_10_Elbow", "close elbow", "R", [0.0, 0.14, 0.28, 0.52], [0.0, 0.32, 0.56, 0.0], [0.0, 0.06, 0.18, 0.0], [0.0, 0.04, 0.08, 0.0], [0.0, 0.10, 0.18, 0.0], [0.0, 0.12, 0.22, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_11_SpinBackfist", "spinning backfist", "L", [0.0, 0.22, 0.42, 0.86], [0.0, 0.38, 0.74, 0.0], [0.0, 0.10, 0.32, 0.0], [0.0, 0.28, 0.52, 0.0], [0.0, 0.25, 0.48, 0.0], [0.0, 0.22, 0.44, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_12_DoubleJab", "double jab", ("L", "R"), [0.0, 0.10, 0.24, 0.50], [0.0, 0.20, 0.46, 0.0], [0.0, 0.28, 0.56, 0.0], [0.0, 0.04, 0.10, 0.0], [0.0, 0.0, 0.02, 0.0], [0.0, 0.0, 0.03, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_13_CrossHook", "double cross hook", ("L", "R"), [0.0, 0.14, 0.30, 0.64], [0.0, 0.25, 0.56, 0.0], [0.0, 0.18, 0.48, 0.0], [0.0, 0.12, 0.30, 0.0], [0.0, 0.02, 0.08, 0.0], [0.0, 0.03, 0.10, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_14_HookCross", "hook cross", ("L", "R"), [0.0, 0.16, 0.35, 0.70], [0.0, 0.30, 0.60, 0.0], [0.0, 0.10, 0.40, 0.0], [0.0, 0.16, 0.34, 0.0], [0.0, 0.06, 0.14, 0.0], [0.0, 0.08, 0.16, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_15_OneTwo", "one two combination", ("L", "R"), [0.0, 0.12, 0.28, 0.58], [0.0, 0.15, 0.48, 0.0], [0.0, 0.30, 0.68, 0.0], [0.0, 0.06, 0.13, 0.0], [0.0, 0.08, 0.16, 0.0], [0.0, 0.10, 0.20, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_16_RisingHook", "rising hook", "R", [0.0, 0.16, 0.34, 0.64], [0.0, 0.18, 0.50, 0.0], [0.0, 0.28, 0.64, 0.0], [0.0, 0.14, 0.28, 0.0], [0.0, 0.12, 0.24, 0.0], [0.0, 0.14, 0.28, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Punch_17_LeapingPunch", "leaping punch", "L", [0.0, 0.16, 0.34, 0.72], [0.0, 0.28, 0.62, 0.0], [0.0, 0.36, 0.72, 0.0], [0.0, 0.08, 0.18, 0.0], [0.0, 0.06, 0.14, 0.0], [0.0, 0.08, 0.16, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0)), root_y=[0.0, 0.08, 0.18, 0.0]),
        motion_spec("Punch_18_ChargePunch", "charged punch", "R", [0.0, 0.24, 0.44, 0.90], [0.0, 0.08, 0.56, 0.0], [0.0, 0.16, 0.68, 0.0], [0.0, 0.02, 0.12, 0.0], [0.0, 0.06, 0.16, 0.0], [0.0, 0.08, 0.18, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0)), root_x=[0.0, 0.03, 0.08, 0.0]),
        motion_spec("Punch_19_BurstPunch", "double burst", ("L", "R"), [0.0, 0.12, 0.26, 0.56], [0.0, 0.32, 0.70, 0.0], [0.0, 0.38, 0.80, 0.0], [0.0, 0.12, 0.22, 0.0], [0.0, 0.0, 0.10, 0.0], [0.0, 0.0, 0.14, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0)), root_x=[0.0, 0.05, 0.10, 0.0]),
        motion_spec("Punch_20_HeavySmash", "heavy smash", "R", [0.0, 0.22, 0.46, 0.94], [0.0, 0.45, 0.86, 0.0], [0.0, 0.32, 0.70, 0.0], [0.0, 0.14, 0.28, 0.0], [0.0, 0.16, 0.28, 0.0], [0.0, 0.18, 0.34, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0)), root_y=[0.0, 0.02, -0.08, 0.0]),
    ]

    kick_specs = [
        motion_spec("Kick_01_Front", "front kick", "R", [0.0, 0.14, 0.30, 0.62], [0.0, 0.18, 0.42, 0.0], [0.0, 0.48, 0.78, 0.0], [0.0, 0.12, 0.24, 0.0], [0.0, 0.03, 0.06, 0.0], [0.0, 0.04, 0.08, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))),
        motion_spec("Kick_02_Low", "low kick", "L", [0.0, 0.16, 0.34, 0.66], [0.0, 0.28, 0.60, 0.0], [0.0, 0.16, 0.38, 0.0], [0.0, 0.10, 0.20, 0.0], [0.0, 0.08, 0.14, 0.0], [0.0, 0.10, 0.18, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))),
        motion_spec("Kick_03_Mid", "mid kick", "R", [0.0, 0.16, 0.34, 0.70], [0.0, 0.20, 0.52, 0.0], [0.0, 0.42, 0.78, 0.0], [0.0, 0.10, 0.20, 0.0], [0.0, 0.04, 0.08, 0.0], [0.0, 0.06, 0.12, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))),
        motion_spec("Kick_04_High", "high kick", "L", [0.0, 0.18, 0.38, 0.78], [0.0, 0.34, 0.68, 0.0], [0.0, 0.56, 0.90, 0.0], [0.0, 0.18, 0.30, 0.0], [0.0, 0.10, 0.18, 0.0], [0.0, 0.12, 0.22, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))),
        motion_spec("Kick_05_Roundhouse", "roundhouse", "R", [0.0, 0.18, 0.38, 0.76], [0.0, 0.42, 0.80, 0.0], [0.0, 0.20, 0.58, 0.0], [0.0, 0.30, 0.62, 0.0], [0.0, 0.22, 0.36, 0.0], [0.0, 0.24, 0.40, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Kick_06_Side", "side kick", "L", [0.0, 0.18, 0.36, 0.74], [0.0, 0.36, 0.72, 0.0], [0.0, 0.32, 0.70, 0.0], [0.0, 0.02, 0.24, 0.0], [0.0, 0.14, 0.28, 0.0], [0.0, 0.16, 0.30, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Kick_07_Back", "back kick", "R", [0.0, 0.20, 0.42, 0.82], [0.0, 0.45, 0.84, 0.0], [0.0, 0.40, 0.76, 0.0], [0.0, 0.14, 0.32, 0.0], [0.0, 0.18, 0.34, 0.0], [0.0, 0.20, 0.38, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Kick_08_Axe", "axe kick", "L", [0.0, 0.20, 0.42, 0.86], [0.0, 0.30, 0.62, 0.0], [0.0, 0.62, 0.94, 0.0], [0.0, 0.32, 0.54, 0.0], [0.0, 0.06, 0.12, 0.0], [0.0, 0.08, 0.16, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))),
        motion_spec("Kick_09_Sweep", "low sweep", "R", [0.0, 0.18, 0.38, 0.74], [0.0, 0.48, 0.82, 0.0], [0.0, 0.12, 0.28, 0.0], [0.0, 0.20, 0.40, 0.0], [0.0, 0.22, 0.40, 0.0], [0.0, 0.24, 0.44, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0))),
        motion_spec("Kick_10_Thrust", "thrust kick", "L", [0.0, 0.14, 0.30, 0.64], [0.0, 0.22, 0.54, 0.0], [0.0, 0.50, 0.86, 0.0], [0.0, 0.12, 0.22, 0.0], [0.0, 0.08, 0.16, 0.0], [0.0, 0.10, 0.20, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))),
        motion_spec("Kick_11_Spin", "spinning kick", "R", [0.0, 0.22, 0.44, 0.88], [0.0, 0.44, 0.86, 0.0], [0.0, 0.30, 0.68, 0.0], [0.0, 0.26, 0.56, 0.0], [0.0, 0.28, 0.54, 0.0], [0.0, 0.30, 0.58, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Kick_12_Heel", "heel kick", "L", [0.0, 0.18, 0.38, 0.78], [0.0, 0.24, 0.56, 0.0], [0.0, 0.58, 0.92, 0.0], [0.0, 0.36, 0.72, 0.0], [0.0, 0.12, 0.20, 0.0], [0.0, 0.14, 0.24, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))),
        motion_spec("Kick_13_Knee", "knee strike", "R", [0.0, 0.14, 0.28, 0.56], [0.0, 0.56, 0.86, 0.0], [0.0, 0.08, 0.24, 0.0], [0.0, 0.02, 0.10, 0.0], [0.0, 0.12, 0.22, 0.0], [0.0, 0.14, 0.26, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))),
        motion_spec("Kick_14_JumpFront", "jumping front kick", ("L", "R"), [0.0, 0.16, 0.34, 0.72], [0.0, 0.22, 0.56, 0.0], [0.0, 0.48, 0.82, 0.0], [0.0, 0.10, 0.22, 0.0], [0.0, 0.02, 0.06, 0.0], [0.0, 0.04, 0.08, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0)), root_y=[0.0, 0.10, 0.18, 0.0]),
        motion_spec("Kick_15_JumpRound", "jumping roundhouse", "R", [0.0, 0.20, 0.42, 0.84], [0.0, 0.46, 0.82, 0.0], [0.0, 0.34, 0.70, 0.0], [0.0, 0.28, 0.58, 0.0], [0.0, 0.18, 0.30, 0.0], [0.0, 0.20, 0.34, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0)), root_y=[0.0, 0.12, 0.22, 0.0]),
        motion_spec("Kick_16_Double", "double kick", ("L", "R"), [0.0, 0.16, 0.34, 0.70], [0.0, 0.34, 0.66, 0.0], [0.0, 0.42, 0.76, 0.0], [0.0, 0.10, 0.24, 0.0], [0.0, 0.04, 0.08, 0.0], [0.0, 0.06, 0.10, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0)), root_y=[0.0, 0.06, 0.14, 0.0]),
        motion_spec("Kick_17_Flying", "flying kick", "L", [0.0, 0.18, 0.40, 0.82], [0.0, 0.38, 0.78, 0.0], [0.0, 0.44, 0.82, 0.0], [0.0, 0.18, 0.36, 0.0], [0.0, 0.10, 0.22, 0.0], [0.0, 0.12, 0.24, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0)), root_x=[0.0, 0.04, 0.10, 0.0], root_y=[0.0, 0.10, 0.24, 0.0]),
        motion_spec("Kick_18_Heavy", "heavy kick", "R", [0.0, 0.22, 0.46, 0.94], [0.0, 0.50, 0.92, 0.0], [0.0, 0.46, 0.84, 0.0], [0.0, 0.20, 0.40, 0.0], [0.0, 0.16, 0.30, 0.0], [0.0, 0.18, 0.34, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0)), root_y=[0.0, 0.02, -0.10, 0.0]),
        motion_spec("Kick_19_Crescent", "crescent kick", "L", [0.0, 0.20, 0.42, 0.84], [0.0, 0.42, 0.80, 0.0], [0.0, 0.24, 0.60, 0.0], [0.0, 0.34, 0.68, 0.0], [0.0, 0.22, 0.42, 0.0], [0.0, 0.24, 0.46, 0.0], axes=((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0))),
        motion_spec("Kick_20_Burst", "burst double kick", ("L", "R"), [0.0, 0.14, 0.30, 0.64], [0.0, 0.38, 0.78, 0.0], [0.0, 0.44, 0.86, 0.0], [0.0, 0.18, 0.36, 0.0], [0.0, 0.02, 0.10, 0.0], [0.0, 0.04, 0.12, 0.0], axes=((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0)), root_y=[0.0, 0.08, 0.16, 0.0]),
    ]

    # The game direction is intentionally "musou-inspired" rather than a
    # one-to-one recreation of any named title: close the gap, sell the
    # anticipation, hold the impact briefly, then return with a readable
    # recovery.  The same profiles are applied to every animal head variant.
    musou_profiles = {
        "Punch_01_Jab": {"style": "musou_dash_jab", "power": 1.12, "body_scale": 1.08, "drive": 0.14, "hit_hold": 0.025, "power_level": "light"},
        "Punch_02_Cross": {"style": "musou_gap_cross", "power": 1.28, "body_scale": 1.22, "drive": 0.25, "root_turn": 0.10, "hit_hold": 0.050, "power_level": "medium"},
        "Punch_03_Hook": {"style": "musou_wide_hook", "power": 1.38, "body_scale": 1.30, "drive": 0.12, "root_turn": 0.24, "hit_hold": 0.055, "power_level": "medium"},
        "Punch_04_Uppercut": {"style": "musou_launcher_uppercut", "power": 1.44, "body_scale": 1.34, "drive": 0.14, "lift": 0.12, "root_turn": -0.10, "hit_hold": 0.070, "power_level": "launcher"},
        "Punch_05_Overhand": {"style": "musou_drop_overhand", "power": 1.48, "body_scale": 1.42, "drive": 0.18, "lift": -0.04, "root_turn": 0.10, "hit_hold": 0.075, "power_level": "heavy"},
        "Punch_06_Backfist": {"style": "musou_turning_backfist", "power": 1.42, "body_scale": 1.34, "drive": 0.08, "root_turn": 0.52, "hit_hold": 0.060, "power_level": "medium"},
        "Punch_07_LongJab": {"style": "musou_gap_closing_jab", "power": 1.22, "body_scale": 1.12, "drive": 0.30, "hit_hold": 0.035, "power_level": "medium"},
        "Punch_08_BodyHook": {"style": "musou_body_sweep", "power": 1.44, "body_scale": 1.38, "drive": 0.14, "root_turn": 0.20, "hit_hold": 0.060, "power_level": "heavy"},
        "Punch_09_StraightBody": {"style": "musou_body_breaker", "power": 1.32, "body_scale": 1.28, "drive": 0.22, "hit_hold": 0.055, "power_level": "medium"},
        "Punch_10_Elbow": {"style": "musou_close_elbow_burst", "power": 1.52, "body_scale": 1.40, "drive": 0.10, "root_turn": 0.28, "hit_hold": 0.070, "power_level": "heavy"},
        "Punch_11_SpinBackfist": {"style": "musou_spin_backfist", "power": 1.56, "body_scale": 1.48, "drive": 0.10, "root_turn": 0.78, "hit_hold": 0.075, "power_level": "heavy"},
        "Punch_12_DoubleJab": {"style": "musou_double_hit_chain", "power": 1.18, "body_scale": 1.12, "drive": 0.20, "side_delay": 0.105, "hit_hold": 0.030, "power_level": "chain"},
        "Punch_13_CrossHook": {"style": "musou_cross_hook_chain", "power": 1.42, "body_scale": 1.32, "drive": 0.22, "root_turn": 0.30, "side_delay": 0.125, "hit_hold": 0.050, "power_level": "chain"},
        "Punch_14_HookCross": {"style": "musou_hook_cross_chain", "power": 1.46, "body_scale": 1.36, "drive": 0.26, "root_turn": 0.34, "side_delay": 0.130, "hit_hold": 0.055, "power_level": "chain"},
        "Punch_15_OneTwo": {"style": "musou_one_two_chain", "power": 1.36, "body_scale": 1.26, "drive": 0.24, "side_delay": 0.115, "hit_hold": 0.045, "power_level": "chain"},
        "Punch_16_RisingHook": {"style": "musou_rising_launcher", "power": 1.46, "body_scale": 1.38, "drive": 0.12, "lift": 0.10, "root_turn": -0.12, "hit_hold": 0.070, "power_level": "launcher"},
        "Punch_17_LeapingPunch": {"style": "musou_air_pursuit", "power": 1.36, "body_scale": 1.18, "drive": 0.34, "lift": 0.22, "hit_hold": 0.055, "power_level": "air"},
        "Punch_18_ChargePunch": {"style": "musou_charge_breaker", "power": 1.72, "body_scale": 1.58, "drive": 0.20, "root_turn": 0.14, "hit_hold": 0.100, "power_level": "heavy"},
        "Punch_19_BurstPunch": {"style": "musou_burst_chain", "power": 1.46, "body_scale": 1.30, "drive": 0.32, "side_delay": 0.105, "hit_hold": 0.045, "power_level": "chain"},
        "Punch_20_HeavySmash": {"style": "musou_finisher_smash", "power": 1.88, "body_scale": 1.72, "drive": 0.16, "lift": -0.10, "root_turn": 0.18, "hit_hold": 0.115, "power_level": "finisher"},
        "Kick_01_Front": {"style": "musou_dash_front_kick", "power": 1.24, "body_scale": 1.12, "drive": 0.18, "hit_hold": 0.040, "power_level": "medium"},
        "Kick_02_Low": {"style": "musou_low_breaker", "power": 1.28, "body_scale": 1.18, "drive": 0.14, "root_turn": 0.12, "hit_hold": 0.045, "power_level": "medium"},
        "Kick_03_Mid": {"style": "musou_mid_drive_kick", "power": 1.34, "body_scale": 1.24, "drive": 0.22, "hit_hold": 0.055, "power_level": "medium"},
        "Kick_04_High": {"style": "musou_high_rising_kick", "power": 1.42, "body_scale": 1.30, "drive": 0.16, "lift": 0.05, "hit_hold": 0.065, "power_level": "launcher"},
        "Kick_05_Roundhouse": {"style": "musou_wide_roundhouse", "power": 1.52, "body_scale": 1.40, "drive": 0.12, "root_turn": 0.50, "hit_hold": 0.070, "power_level": "heavy"},
        "Kick_06_Side": {"style": "musou_side_wall_kick", "power": 1.48, "body_scale": 1.38, "drive": 0.20, "root_turn": 0.32, "hit_hold": 0.065, "power_level": "heavy"},
        "Kick_07_Back": {"style": "musou_back_kick", "power": 1.54, "body_scale": 1.42, "drive": 0.08, "root_turn": 0.56, "hit_hold": 0.075, "power_level": "heavy"},
        "Kick_08_Axe": {"style": "musou_axe_launcher", "power": 1.52, "body_scale": 1.44, "drive": 0.14, "lift": 0.10, "hit_hold": 0.075, "power_level": "launcher"},
        "Kick_09_Sweep": {"style": "musou_area_sweep", "power": 1.48, "body_scale": 1.42, "drive": 0.12, "root_turn": 0.44, "hit_hold": 0.065, "power_level": "area"},
        "Kick_10_Thrust": {"style": "musou_thrust_breaker", "power": 1.40, "body_scale": 1.28, "drive": 0.26, "hit_hold": 0.055, "power_level": "medium"},
        "Kick_11_Spin": {"style": "musou_spin_kick", "power": 1.64, "body_scale": 1.54, "drive": 0.14, "root_turn": 0.86, "hit_hold": 0.080, "power_level": "heavy"},
        "Kick_12_Heel": {"style": "musou_heel_smash", "power": 1.56, "body_scale": 1.48, "drive": 0.12, "lift": 0.06, "hit_hold": 0.080, "power_level": "heavy"},
        "Kick_13_Knee": {"style": "musou_knee_burst", "power": 1.42, "body_scale": 1.30, "drive": 0.20, "lift": 0.04, "hit_hold": 0.060, "power_level": "medium"},
        "Kick_14_JumpFront": {"style": "musou_air_front_kick", "power": 1.44, "body_scale": 1.18, "drive": 0.36, "lift": 0.30, "hit_hold": 0.060, "power_level": "air"},
        "Kick_15_JumpRound": {"style": "musou_air_roundhouse", "power": 1.66, "body_scale": 1.42, "drive": 0.28, "lift": 0.32, "root_turn": 0.58, "hit_hold": 0.080, "power_level": "air"},
        "Kick_16_Double": {"style": "musou_double_kick_chain", "power": 1.46, "body_scale": 1.26, "drive": 0.34, "lift": 0.18, "side_delay": 0.120, "hit_hold": 0.050, "power_level": "chain"},
        "Kick_17_Flying": {"style": "musou_flying_pursuit", "power": 1.62, "body_scale": 1.36, "drive": 0.42, "lift": 0.38, "root_turn": 0.24, "hit_hold": 0.070, "power_level": "air"},
        "Kick_18_Heavy": {"style": "musou_finisher_kick", "power": 1.86, "body_scale": 1.66, "drive": 0.18, "lift": -0.10, "root_turn": 0.22, "hit_hold": 0.115, "power_level": "finisher"},
        "Kick_19_Crescent": {"style": "musou_crescent_area", "power": 1.68, "body_scale": 1.50, "drive": 0.16, "root_turn": 0.68, "hit_hold": 0.080, "power_level": "area"},
        "Kick_20_Burst": {"style": "musou_burst_kick_chain", "power": 1.58, "body_scale": 1.30, "drive": 0.38, "lift": 0.22, "side_delay": 0.120, "hit_hold": 0.060, "power_level": "finisher"},
    }

    def prepare_musou_specs(specs: list[dict]) -> None:
        for spec in specs:
            profile = musou_profiles.get(spec["name"])
            if profile is None:
                continue
            spec.update(profile)
            drive = spec.get("drive", 0.0)
            lift = spec.get("lift", 0.0)
            spec["root_z"] = [0.0, drive * 0.42, drive, 0.0]
            original_root_y = spec.get("root_y") or [0.0] * len(spec["times"])
            lift_curve = [0.0, lift * 0.44, lift, 0.0]
            spec["root_y"] = [base + offset for base, offset in zip(original_root_y, lift_curve)]
            spec["pelvis"] = [0.0, -0.10, 0.07, 0.0]

            hold = spec.get("hit_hold", 0.0)
            if hold <= 0.0 or len(spec["times"]) != 4:
                continue
            times = spec["times"]
            spec["times"] = times[:3] + [times[2] + hold, times[3] + hold]
            for key in ("first", "second", "third", "spine", "chest", "root_x", "root_y", "root_z", "pelvis"):
                values = spec.get(key)
                if values is not None:
                    spec[key] = values[:3] + [values[2], values[3]]

    prepare_musou_specs(punch_specs)
    prepare_musou_specs(kick_specs)

    add_motion_set("punch", punch_specs)
    add_motion_set("kick", kick_specs)

    builder.scene_nodes = list(range(mesh_node_count)) + [bone_indices["root"]]


def build_model(variant: str = "goose") -> GLBBuilder:
    variant = variant.lower()
    if variant != "goose" and variant not in ANIMAL_HEAD_PREFIXES:
        raise ValueError(f"unknown model variant: {variant}")
    builder = GLBBuilder()
    gold = builder.material("Golden skin", (0.95, 0.48, 0.035, 1.0), roughness=0.38)
    gold_dark = builder.material("Golden shadow", (0.66, 0.22, 0.012, 1.0), roughness=0.48)
    mask_white = builder.material("Goose mask white", (0.92, 0.95, 0.96, 1.0), roughness=0.38)
    wing_white = builder.material("Wing white", (0.88, 0.96, 1.0, 1.0), roughness=0.36, double_sided=True)
    wing_blue = builder.material("Wing pale blue", (0.58, 0.80, 0.96, 1.0), roughness=0.40, double_sided=True)
    beak_orange = builder.material("Goose beak orange", (1.0, 0.30, 0.035, 1.0), roughness=0.34)
    eye_black = builder.material("Mask eye opening", (0.004, 0.006, 0.009, 1.0), roughness=0.22)
    strap_black = builder.material("Mask strap", (0.025, 0.028, 0.035, 1.0), roughness=0.42)
    heart_red = builder.material("Heart crimson", (0.68, 0.025, 0.035, 1.0), roughness=0.36)
    heart_dark = builder.material("Heart cavity", (0.22, 0.012, 0.014, 1.0), roughness=0.55)
    vein_blue = builder.material("Heart blue vessels", (0.025, 0.10, 0.34, 1.0), roughness=0.40)
    rim_red = builder.material("Exposed chest tissue", (0.38, 0.025, 0.018, 1.0), roughness=0.52)
    eye_glint = builder.material("Eye glint", (0.9, 0.96, 1.0, 1.0), roughness=0.2)

    # Golden body: chest, abdomen and pelvis.
    builder.add_uv_sphere("Torso", (0.0, 1.56, 0.0), (0.64, 0.88, 0.36), gold)
    builder.add_uv_sphere("Pelvis", (0.0, 0.98, 0.0), (0.52, 0.42, 0.31), gold)
    builder.add_uv_sphere("Abdomen", (0.0, 1.30, 0.25), (0.46, 0.55, 0.22), gold)
    for index, x in enumerate((-0.22, 0.22)):
        builder.add_uv_sphere(f"Pectoral_{index}", (x, 1.94, 0.27), (0.39, 0.26, 0.22), gold)
    for index, (x, y) in enumerate(((-0.22, 1.57), (0.22, 1.57), (0.0, 1.37))):
        builder.add_uv_sphere(f"Abdominal_{index}", (x, y, 0.29), (0.16, 0.16, 0.12), gold_dark)

    # Flexed arms and fists.
    for side_sign, label in ((-1.0, "Left"), (1.0, "Right")):
        shoulder = (0.68 * side_sign, 1.97, 0.0)
        elbow = (1.15 * side_sign, 2.18, 0.03)
        wrist = (1.22 * side_sign, 2.62, 0.04)
        fist = (1.22 * side_sign, 2.86, 0.08)
        builder.add_uv_sphere(f"{label}_Shoulder", shoulder, (0.30, 0.30, 0.28), gold)
        builder.add_cylinder(f"{label}_Bicep", shoulder, elbow, 0.25, 0.20, gold)
        builder.add_uv_sphere(f"{label}_Elbow", elbow, (0.20, 0.20, 0.19), gold)
        builder.add_cylinder(f"{label}_Forearm", elbow, wrist, 0.19, 0.15, gold)
        builder.add_uv_sphere(f"{label}_Fist", fist, (0.23, 0.27, 0.22), gold)
        for knuckle_index, offset in enumerate((-0.10, 0.0, 0.10)):
            builder.add_uv_sphere(
                f"{label}_Knuckle_{knuckle_index}",
                (fist[0] + offset * side_sign, fist[1] + 0.11, fist[2] + 0.03),
                (0.075, 0.075, 0.07),
                gold,
                segments=10,
                rings=6,
            )

    # Legs and feet.
    for side_sign, label in ((-1.0, "Left"), (1.0, "Right")):
        hip = (0.33 * side_sign, 1.0, 0.0)
        knee = (0.38 * side_sign, 0.50, 0.02)
        ankle = (0.39 * side_sign, 0.16, 0.04)
        builder.add_uv_sphere(f"{label}_Hip", hip, (0.30, 0.34, 0.27), gold)
        builder.add_cylinder(f"{label}_Thigh", hip, knee, 0.29, 0.22, gold)
        builder.add_uv_sphere(f"{label}_Knee", knee, (0.22, 0.20, 0.19), gold)
        builder.add_cylinder(f"{label}_Calf", knee, ankle, 0.21, 0.15, gold)
        builder.add_uv_sphere(f"{label}_Foot", (ankle[0], 0.09, 0.22), (0.27, 0.11, 0.43), gold)

    if variant == "goose":
        # Realistic-looking goose mask and the white section reaching the clavicles.
        builder.add_uv_sphere("GooseMaskFace", (-0.15, 2.88, 0.10), (0.43, 0.43, 0.32), mask_white, segments=18, rings=12)
        builder.add_beak("GooseMaskBeak", (-0.42, 2.83, 0.16), 0.48, 0.28, 0.20, beak_orange)
        builder.add_uv_sphere("GooseMaskNostril", (-0.74, 2.89, 0.27), (0.045, 0.022, 0.025), eye_black, segments=10, rings=6)
        builder.add_uv_sphere("GooseMaskEyeOpening", (-0.39, 3.01, 0.35), (0.095, 0.105, 0.028), eye_black, segments=12, rings=8)
        builder.add_uv_sphere("GooseMaskEyeGlint", (-0.405, 3.035, 0.375), (0.020, 0.020, 0.010), eye_glint, segments=8, rings=5)
        builder.add_cylinder("GooseMaskThroat", (0.0, 2.12, 0.02), (-0.12, 2.62, 0.06), 0.32, 0.27, mask_white, segments=14)
        builder.add_uv_sphere("GooseMaskClaviclePlate", (-0.02, 2.14, 0.04), (0.52, 0.14, 0.27), mask_white, segments=16, rings=8)
        builder.add_cylinder("GooseMaskSideStrap", (0.23, 2.78, -0.12), (0.34, 2.78, 0.12), 0.045, 0.045, strap_black, segments=8)
    else:
        add_animal_head(builder, variant)

    # One pale blue-white wing behind the right shoulder.
    feather_specs = [
        ((0.34, 2.22, -0.22), (0.72, 2.74, -0.34), 0.13, wing_blue),
        ((0.37, 2.25, -0.25), (0.88, 3.00, -0.37), 0.15, wing_white),
        ((0.40, 2.28, -0.28), (1.02, 3.23, -0.40), 0.16, wing_blue),
        ((0.43, 2.31, -0.31), (1.18, 3.46, -0.43), 0.17, wing_white),
        ((0.46, 2.34, -0.34), (1.34, 3.63, -0.46), 0.18, wing_blue),
        ((0.49, 2.37, -0.37), (1.47, 3.76, -0.49), 0.18, wing_white),
        ((0.52, 2.40, -0.40), (1.57, 3.84, -0.52), 0.17, wing_blue),
        ((0.55, 2.43, -0.43), (1.67, 3.88, -0.55), 0.16, wing_white),
        ((0.58, 2.46, -0.46), (1.75, 3.86, -0.58), 0.15, wing_blue),
    ]
    for index, (base, tip, width, material_index) in enumerate(feather_specs):
        builder.add_feather(f"Wing_Feather_{index}", base, tip, width, 0.035, material_index, curve=0.07)
    for index in range(4):
        base = (0.30 + index * 0.08, 2.28 + index * 0.06, -0.15)
        tip = (0.55 + index * 0.12, 2.55 + index * 0.12, -0.22)
        builder.add_feather(f"Wing_Cover_{index}", base, tip, 0.12, 0.04, wing_white, curve=0.04)

    # Small embedded heart and the chest opening around it.
    builder.add_uv_sphere("ChestCavity", (0.0, 1.99, 0.36), (0.35, 0.40, 0.075), heart_dark, segments=18, rings=10)
    builder.add_annulus("ChestSkinOpening", (0.0, 1.99, 0.43), (0.35, 0.41), (0.235, 0.30), 0.07, rim_red, segments=28)
    builder.add_uv_sphere("HeartBody", (0.0, 1.96, 0.51), (0.23, 0.30, 0.15), heart_red, segments=18, rings=10)
    builder.add_uv_sphere("HeartLeftLobe", (-0.11, 2.15, 0.50), (0.15, 0.15, 0.13), heart_red, segments=14, rings=8)
    builder.add_uv_sphere("HeartRightLobe", (0.11, 2.15, 0.50), (0.15, 0.15, 0.13), heart_red, segments=14, rings=8)
    builder.add_cylinder("HeartAorta", (0.02, 2.21, 0.51), (0.02, 2.38, 0.51), 0.045, 0.035, heart_red, segments=10)
    builder.add_cylinder("HeartBlueVessel", (-0.12, 2.18, 0.56), (-0.19, 2.34, 0.56), 0.024, 0.018, vein_blue, segments=8)
    builder.add_cylinder("HeartFrontVessel", (0.0, 1.92, 0.66), (0.07, 2.12, 0.68), 0.014, 0.009, vein_blue, segments=8)
    builder.add_cylinder("HeartSideVessel", (0.10, 1.92, 0.66), (0.16, 2.07, 0.67), 0.012, 0.008, vein_blue, segments=8)

    return builder


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir if (script_dir / "assets").is_dir() else script_dir.parent
    character_dir = repo_root / "assets" / "characters"
    variants = ("goose",) + ANIMAL_HEAD_PREFIXES
    for variant in variants:
        model_stem = f"{variant}-heart-champion"
        scene_name = f"{variant.title()}HeartChampion"
        for smooth in (False, True):
            suffix = "-smooth" if smooth else ""
            output = character_dir / f"{model_stem}{suffix}.glb"
            builder = build_model(variant)
            add_fighter_rig(builder, smooth=smooth)
            builder.save(output, model_name=f"{model_stem}{suffix}", scene_name=scene_name)
            print(
                f"wrote {output} ({output.stat().st_size} bytes, "
                f"{len(builder.nodes)} nodes, {len(builder.skins)} skin, "
                f"{len(builder.animations)} animations, variant={variant}, smooth={smooth})"
            )


if __name__ == "__main__":
    main()
