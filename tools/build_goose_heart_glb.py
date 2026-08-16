#!/usr/bin/env python3
"""Build a small browser-ready GLB for the adopted goose-heart character.

The model is intentionally dependency-free.  It is a stylised, multi-part
static model whose nodes can be animated independently in a browser.
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

    def save(self, path: Path) -> None:
        gltf = {
            "asset": {
                "version": "2.0",
                "generator": "Codex dependency-free goose-heart GLB builder",
                "extras": {
                    "model": "goose-heart-champion",
                    "coordinateSystem": "Y-up, front is positive Z",
                    "staticMultiPart": True,
                },
            },
            "scene": 0,
            "scenes": [
                {
                    "name": "GooseHeartChampion",
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


def mesh_bone_name(mesh_name: str) -> str:
    lower = mesh_name.lower()
    if lower.startswith("wing_"):
        return "wing.R"
    if "goosemask" in lower:
        if "throat" in lower:
            return "neck"
        if "clavicle" in lower:
            return "chest"
        return "head"
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
    if "goosemask" in lower:
        if "clavicle" in lower:
            return ["chest", "neck"]
        if "throat" in lower:
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
            "name": "GooseHeartFighterRig",
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

    def add_clip(name: str, clips: list[tuple[str, str, list[float], list[tuple[float, ...]]]]) -> None:
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
        builder.animations.append({"name": name, "samplers": samplers, "channels": channels})

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

    builder.scene_nodes = list(range(mesh_node_count)) + [bone_indices["root"]]


def build_model() -> GLBBuilder:
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

    # Realistic-looking goose mask and the white section reaching the clavicles.
    builder.add_uv_sphere("GooseMaskFace", (-0.15, 2.88, 0.10), (0.43, 0.43, 0.32), mask_white, segments=18, rings=12)
    builder.add_beak("GooseMaskBeak", (-0.42, 2.83, 0.16), 0.48, 0.28, 0.20, beak_orange)
    builder.add_uv_sphere("GooseMaskNostril", (-0.74, 2.89, 0.27), (0.045, 0.022, 0.025), eye_black, segments=10, rings=6)
    builder.add_uv_sphere("GooseMaskEyeOpening", (-0.39, 3.01, 0.35), (0.095, 0.105, 0.028), eye_black, segments=12, rings=8)
    builder.add_uv_sphere("GooseMaskEyeGlint", (-0.405, 3.035, 0.375), (0.020, 0.020, 0.010), eye_glint, segments=8, rings=5)
    builder.add_cylinder("GooseMaskThroat", (0.0, 2.12, 0.02), (-0.12, 2.62, 0.06), 0.32, 0.27, mask_white, segments=14)
    builder.add_uv_sphere("GooseMaskClaviclePlate", (-0.02, 2.14, 0.04), (0.52, 0.14, 0.27), mask_white, segments=16, rings=8)
    builder.add_cylinder("GooseMaskSideStrap", (0.23, 2.78, -0.12), (0.34, 2.78, 0.12), 0.045, 0.045, strap_black, segments=8)

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
    character_dir = Path(__file__).with_name("assets") / "characters"
    variants = (
        (character_dir / "goose-heart-champion.glb", False),
        (character_dir / "goose-heart-champion-smooth.glb", True),
    )
    for output, smooth in variants:
        builder = build_model()
        add_fighter_rig(builder, smooth=smooth)
        builder.save(output)
        print(
            f"wrote {output} ({output.stat().st_size} bytes, "
            f"{len(builder.nodes)} nodes, {len(builder.skins)} skin, "
            f"{len(builder.animations)} animations, smooth={smooth})"
        )


if __name__ == "__main__":
    main()
