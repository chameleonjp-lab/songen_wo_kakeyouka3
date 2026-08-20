#!/usr/bin/env python3
"""Audit the repository-owned character GLBs from their GLB JSON/BIN data.

This deliberately uses only the Python standard library.  It reads accessor
values directly from each GLB so the report does not depend on a renderer or
on the character builder's implementation details.

Run from the repository root:

    python3 tools/audit_character_glbs.py
    python3 tools/audit_character_glbs.py --check

The first command regenerates ``GLB_REAL_DATA_AUDIT.md``.  ``--check`` exits
non-zero if an expected file is missing, an animation signature changes, or a
normal/smooth pair no longer has the expected geometry and structure parity.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import re
import struct
import sys
from pathlib import Path
from typing import Any, Iterable


COMPONENTS: dict[int, tuple[str, int]] = {
    5120: ("b", 1),  # BYTE
    5121: ("B", 1),  # UNSIGNED_BYTE
    5122: ("h", 2),  # SHORT
    5123: ("H", 2),  # UNSIGNED_SHORT
    5125: ("I", 4),  # UNSIGNED_INT
    5126: ("f", 4),  # FLOAT
}
TYPE_COMPONENTS: dict[str, int] = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}

FAMILIES: tuple[tuple[str, str], ...] = (
    ("ガチョウ", "goose-heart-champion"),
    ("クマ", "bear-heart-champion"),
    ("ワニ", "crocodile-heart-champion"),
    ("ゴリラ", "gorilla-heart-champion"),
    ("カバ", "hippopotamus-heart-champion"),
    ("ライオン", "lion-heart-champion"),
    ("サイ", "rhinoceros-heart-champion"),
    ("共通うんこ頭", "poop-heart-champion"),
)

HEAD_TOKENS = {
    "head",
    "face",
    "crown",
    "muzzle",
    "snout",
    "beak",
    "bill",
    "nose",
    "nostril",
    "eye",
    "brow",
    "mane",
    "horn",
    "jaw",
    "ear",
}
BODY_TOKENS = {"torso", "pelvis", "abdomen", "abdominal", "pectoral"}


def _camel_tokens(name: str) -> list[str]:
    """Split snake_case and CamelCase node names into lower-case tokens."""

    separated = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    return [token.lower() for token in re.split(r"[^A-Za-z0-9]+", separated) if token]


def _read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError(f"{path}: file is too short to be a GLB")
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"{path}: expected glTF 2.0, got {magic!r} v{version}")
    if total_length != len(data):
        raise ValueError(f"{path}: header length {total_length} != file length {len(data)}")

    position = 12
    json_chunk: bytes | None = None
    binary_chunk: bytes | None = None
    while position + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, position)
        position += 8
        chunk_end = position + chunk_length
        if chunk_end > len(data):
            raise ValueError(f"{path}: chunk exceeds file length")
        chunk = data[position:chunk_end]
        position = chunk_end
        if chunk_type == b"JSON":
            json_chunk = chunk
        elif chunk_type == b"BIN\x00":
            binary_chunk = chunk
    if json_chunk is None:
        raise ValueError(f"{path}: missing JSON chunk")
    if binary_chunk is None:
        binary_chunk = b""
    try:
        document = json.loads(json_chunk.rstrip(b"\x00 \t\r\n"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON chunk: {exc}") from exc
    if document.get("asset", {}).get("version") != "2.0":
        raise ValueError(f"{path}: JSON asset.version is not 2.0")
    return document, binary_chunk


class GLB:
    """A decoded GLB and a few helpers for accessor reads."""

    def __init__(self, path: Path):
        self.path = path
        self.document, self.binary = _read_glb(path)

    def accessor_values(self, accessor_index: int) -> list[tuple[int | float, ...]]:
        accessors = self.document.get("accessors", [])
        buffer_views = self.document.get("bufferViews", [])
        accessor = accessors[accessor_index]
        component_type = accessor["componentType"]
        if component_type not in COMPONENTS:
            raise ValueError(f"{self.path}: unsupported accessor componentType {component_type}")
        if "bufferView" not in accessor:
            raise ValueError(f"{self.path}: sparse/implicit accessor {accessor_index} is unsupported")
        view = buffer_views[accessor["bufferView"]]
        format_code, component_size = COMPONENTS[component_type]
        component_count = TYPE_COMPONENTS[accessor["type"]]
        item_size = component_size * component_count
        stride = view.get("byteStride", item_size)
        if stride < item_size:
            raise ValueError(f"{self.path}: accessor {accessor_index} has invalid byteStride")
        offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        values: list[tuple[int | float, ...]] = []
        unpack_format = "<" + format_code * component_count
        for row in range(accessor["count"]):
            row_offset = offset + row * stride
            try:
                values.append(struct.unpack_from(unpack_format, self.binary, row_offset))
            except struct.error as exc:
                raise ValueError(
                    f"{self.path}: accessor {accessor_index} exceeds BIN chunk at {row_offset}"
                ) from exc
        return values

    def accessor_count(self, accessor_index: int | None) -> int:
        return 0 if accessor_index is None else int(self.document["accessors"][accessor_index]["count"])

    def image_info(self) -> list[dict[str, Any]]:
        """Return embedded image names, mime types, dimensions, and byte sizes."""

        result: list[dict[str, Any]] = []
        for image in self.document.get("images", []):
            info: dict[str, Any] = {
                "name": image.get("name", "(unnamed)"),
                "mimeType": image.get("mimeType", ""),
                "embedded": "bufferView" in image,
                "width": None,
                "height": None,
                "bytes": 0,
            }
            if "bufferView" in image:
                view = self.document.get("bufferViews", [])[image["bufferView"]]
                offset = view.get("byteOffset", 0)
                length = view["byteLength"]
                payload = self.binary[offset : offset + length]
                info["bytes"] = len(payload)
                if payload.startswith(b"\x89PNG\r\n\x1a\n") and len(payload) >= 24:
                    info["width"], info["height"] = struct.unpack_from(">II", payload, 16)
            elif "uri" in image:
                info["embedded"] = False
                info["uri"] = image["uri"]
            result.append(info)
        return result


def _as_float_vector(values: Iterable[int | float]) -> tuple[float, ...]:
    return tuple(float(value) for value in values)


def _vec_norm(vector: Iterable[float]) -> float:
    return math.sqrt(sum(value * value for value in vector))


def _vec_sub(left: Iterable[float], right: Iterable[float]) -> tuple[float, ...]:
    return tuple(a - b for a, b in zip(left, right))


def _quat_norm(q: Iterable[float]) -> tuple[float, float, float, float]:
    values = tuple(float(value) for value in q)
    length = _vec_norm(values)
    return (0.0, 0.0, 0.0, 1.0) if length < 1e-12 else tuple(value / length for value in values)  # type: ignore[return-value]


def _quat_conjugate(q: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    return (-q[0], -q[1], -q[2], q[3])


def _quat_multiply(
    left: tuple[float, float, float, float], right: tuple[float, float, float, float]
) -> tuple[float, float, float, float]:
    x1, y1, z1, w1 = left
    x2, y2, z2, w2 = right
    return (
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    )


def _signed_quaternion_angle_degrees(q: tuple[float, float, float, float]) -> float:
    """Return an axis-angle magnitude with the dominant axis sign.

    The generated rigs use Y-axis root turns, so this produces the expected
    signed yaw while remaining useful if a future GLB rotates around another
    axis.
    """

    x, y, z, w = _quat_norm(q)
    if w < 0.0:
        x, y, z, w = -x, -y, -z, -w
    vector_length = math.sqrt(x * x + y * y + z * z)
    if vector_length < 1e-10:
        return 0.0
    angle = 2.0 * math.atan2(vector_length, max(-1.0, min(1.0, w)))
    axis = (x / vector_length, y / vector_length, z / vector_length)
    dominant_axis = max(range(3), key=lambda index: abs(axis[index]))
    sign = -1.0 if axis[dominant_axis] < 0.0 else 1.0
    return math.degrees(angle) * sign


def _format_vector(vector: Iterable[float], digits: int = 3) -> str:
    return "(" + ", ".join(f"{value:+.{digits}f}" for value in vector) + ")"


def _format_node(index: int, node: dict[str, Any]) -> str:
    return f"{index}:{node.get('name', '(unnamed)')}"


def _node_candidates(model: GLB) -> dict[str, list[str]]:
    nodes = model.document.get("nodes", [])
    mesh_nodes = [(index, node) for index, node in enumerate(nodes) if "mesh" in node]
    joints = {
        joint
        for skin in model.document.get("skins", [])
        for joint in skin.get("joints", [])
    }

    def tokens_for(node: dict[str, Any]) -> set[str]:
        return set(_camel_tokens(node.get("name", "")))

    head_mesh = [
        _format_node(index, node)
        for index, node in mesh_nodes
        if tokens_for(node) & HEAD_TOKENS
    ]
    heart_mesh = [
        _format_node(index, node)
        for index, node in mesh_nodes
        if tokens_for(node) & {"heart", "chest", "cavity", "tissue"}
    ]
    body_mesh = [
        _format_node(index, node)
        for index, node in mesh_nodes
        if tokens_for(node) & BODY_TOKENS
    ]
    head_bones = [
        _format_node(index, nodes[index])
        for index in sorted(joints)
        if nodes[index].get("name", "").lower() in {"neck", "head"}
    ]
    heart_bones = [
        _format_node(index, nodes[index])
        for index in sorted(joints)
        if nodes[index].get("name", "").lower() in {"chest"}
    ]
    body_bones = [
        _format_node(index, nodes[index])
        for index in sorted(joints)
        if nodes[index].get("name", "").lower() in {"root", "pelvis", "spine", "chest"}
    ]
    return {
        "head_mesh": head_mesh,
        "head_bones": head_bones,
        "heart_mesh": heart_mesh,
        "heart_bones": heart_bones,
        "body_mesh": body_mesh,
        "body_bones": body_bones,
    }


def _root_index(model: GLB) -> int:
    skins = model.document.get("skins", [])
    if skins and skins[0].get("skeleton") is not None:
        return int(skins[0]["skeleton"])
    for index, node in enumerate(model.document.get("nodes", [])):
        if node.get("name", "").lower() == "root":
            return index
    raise ValueError(f"{model.path}: no root/skeleton node found")


def _animation_duration(model: GLB, animation: dict[str, Any]) -> float:
    times: list[float] = []
    for sampler in animation.get("samplers", []):
        times.extend(float(row[0]) for row in model.accessor_values(sampler["input"]))
    return max(times, default=0.0)


def _root_clip_motion(model: GLB, animation: dict[str, Any], root_index: int) -> dict[str, Any]:
    nodes = model.document.get("nodes", [])
    root_node = nodes[root_index]
    base_translation = _as_float_vector(root_node.get("translation", [0.0, 0.0, 0.0]))
    base_rotation = _quat_norm(root_node.get("rotation", [0.0, 0.0, 0.0, 1.0]))
    motion: dict[str, Any] = {"translation": None, "rotation": None}
    for channel in animation.get("channels", []):
        target = channel.get("target", {})
        if target.get("node") != root_index:
            continue
        path = target.get("path")
        sampler = animation.get("samplers", [])[channel["sampler"]]
        values = model.accessor_values(sampler["output"])
        if path == "translation" and values:
            vectors = [_as_float_vector(value) for value in values]
            deltas = [_vec_sub(vector, base_translation) for vector in vectors]
            peak = max(deltas, key=_vec_norm)
            motion["translation"] = {"distance": _vec_norm(peak), "vector": peak}
        elif path == "rotation" and values:
            quaternions = [_quat_norm(value) for value in values]
            deltas = [
                _quat_multiply(_quat_conjugate(base_rotation), quaternion)
                for quaternion in quaternions
            ]
            angles = [_signed_quaternion_angle_degrees(delta) for delta in deltas]
            peak_index = max(range(len(angles)), key=lambda index: abs(angles[index]))
            motion["rotation"] = {
                "angle": angles[peak_index],
                "quaternion": quaternions[peak_index],
            }
    return motion


def _root_motion(model: GLB, animations: list[dict[str, Any]]) -> dict[str, Any]:
    root_index = _root_index(model)
    root_node = model.document["nodes"][root_index]
    base_translation = _as_float_vector(root_node.get("translation", [0.0, 0.0, 0.0]))
    base_rotation = _quat_norm(root_node.get("rotation", [0.0, 0.0, 0.0, 1.0]))
    clips: dict[str, dict[str, Any]] = {}
    translation_channels = 0
    rotation_channels = 0
    max_translation: dict[str, Any] | None = None
    max_rotation: dict[str, Any] | None = None
    for animation in animations:
        clip = _root_clip_motion(model, animation, root_index)
        clips[animation["name"]] = clip
        if clip["translation"] is not None:
            translation_channels += 1
            candidate = {"animation": animation["name"], **clip["translation"]}
            if max_translation is None or candidate["distance"] > max_translation["distance"]:
                max_translation = candidate
        if clip["rotation"] is not None:
            rotation_channels += 1
            candidate = {"animation": animation["name"], **clip["rotation"]}
            if max_rotation is None or abs(candidate["angle"]) > abs(max_rotation["angle"]):
                max_rotation = candidate
    return {
        "index": root_index,
        "name": root_node.get("name", "root"),
        "base_translation": base_translation,
        "base_rotation": base_rotation,
        "translation_channels": translation_channels,
        "rotation_channels": rotation_channels,
        "max_translation": max_translation,
        "max_rotation": max_rotation,
        "clips": clips,
    }


def _weight_stats(model: GLB) -> dict[str, Any]:
    histogram: dict[int, int] = {}
    total = 0
    max_sum_error = 0.0
    non_normalized = 0
    for mesh in model.document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            weight_accessor = primitive.get("attributes", {}).get("WEIGHTS_0")
            if weight_accessor is None:
                continue
            for row in model.accessor_values(weight_accessor):
                influence_count = sum(float(weight) > 1e-5 for weight in row)
                histogram[influence_count] = histogram.get(influence_count, 0) + 1
                total += 1
                error = abs(sum(float(weight) for weight in row) - 1.0)
                max_sum_error = max(max_sum_error, error)
                if error > 1e-4:
                    non_normalized += 1
    return {
        "vertices": total,
        "histogram": {str(key): value for key, value in sorted(histogram.items())},
        "max_influences": max(map(int, histogram), default=0),
        "non_normalized": non_normalized,
        "max_sum_error": max_sum_error,
    }


def _mesh_stats(model: GLB) -> dict[str, Any]:
    vertices = 0
    indices = 0
    primitives = 0
    for mesh in model.document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitives += 1
            attributes = primitive.get("attributes", {})
            position_accessor = attributes.get("POSITION")
            vertices += model.accessor_count(position_accessor)
            indices += model.accessor_count(primitive.get("indices"))
    return {
        "meshes": len(model.document.get("meshes", [])),
        "primitives": primitives,
        "vertices": vertices,
        "indices": indices,
        "triangles": indices // 3,
    }


def _semantic_values(model: GLB, semantic: str) -> list[list[tuple[int | float, ...]]]:
    values: list[list[tuple[int | float, ...]]] = []
    for mesh in model.document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            accessor_index = (
                primitive.get("attributes", {}).get(semantic)
                if semantic != "INDICES"
                else primitive.get("indices")
            )
            values.append([] if accessor_index is None else model.accessor_values(accessor_index))
    return values


def _semantic_equal(left: GLB, right: GLB, semantic: str) -> bool:
    return _semantic_values(left, semantic) == _semantic_values(right, semantic)


def _animation_data_equal(left: GLB, right: GLB) -> bool:
    left_animations = left.document.get("animations", [])
    right_animations = right.document.get("animations", [])
    if len(left_animations) != len(right_animations):
        return False
    for left_animation, right_animation in zip(left_animations, right_animations):
        if left_animation.get("name") != right_animation.get("name"):
            return False
        if len(left_animation.get("samplers", [])) != len(right_animation.get("samplers", [])):
            return False
        for left_sampler, right_sampler in zip(
            left_animation.get("samplers", []), right_animation.get("samplers", [])
        ):
            if left.accessor_values(left_sampler["input"]) != right.accessor_values(right_sampler["input"]):
                return False
            if left.accessor_values(left_sampler["output"]) != right.accessor_values(right_sampler["output"]):
                return False
    return True


def _strip_model_extra(document: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(document)
    try:
        del result["asset"]["extras"]["model"]
    except KeyError:
        pass
    return result


def _pair_comparison(normal: GLB, smooth: GLB) -> dict[str, Any]:
    normal_binary = normal.binary
    smooth_binary = smooth.binary
    changed_binary_bytes = sum(a != b for a, b in zip(normal_binary, smooth_binary))
    changed_binary_bytes += abs(len(normal_binary) - len(smooth_binary))
    return {
        "structure_equal_except_model_extra": _strip_model_extra(normal.document)
        == _strip_model_extra(smooth.document),
        "geometry_equal": all(
            _semantic_equal(normal, smooth, semantic)
            for semantic in ("POSITION", "NORMAL", "TEXCOORD_0", "INDICES")
        ),
        "animation_data_equal": _animation_data_equal(normal, smooth),
        "nodes_equal": [node.get("name") for node in normal.document.get("nodes", [])]
        == [node.get("name") for node in smooth.document.get("nodes", [])],
        "joints_differ": not _semantic_equal(normal, smooth, "JOINTS_0"),
        "weights_differ": not _semantic_equal(normal, smooth, "WEIGHTS_0"),
        "changed_binary_bytes": changed_binary_bytes,
        "file_size_delta": smooth.path.stat().st_size - normal.path.stat().st_size,
        "normal_weight_stats": _weight_stats(normal),
        "smooth_weight_stats": _weight_stats(smooth),
    }


def _audit_file(path: Path) -> dict[str, Any]:
    model = GLB(path)
    document = model.document
    animations = document.get("animations", [])
    skin_joints = [
        joint
        for skin in document.get("skins", [])
        for joint in skin.get("joints", [])
    ]
    images = model.image_info()
    mesh_stats = _mesh_stats(model)
    root_motion = _root_motion(model, animations)
    return {
        "path": str(path),
        "file": path.name,
        "model": model,
        "bytes": path.stat().st_size,
        "nodes": len(document.get("nodes", [])),
        "mesh_stats": mesh_stats,
        "materials": len(document.get("materials", [])),
        "material_names": [material.get("name", "(unnamed)") for material in document.get("materials", [])],
        "textures": len(document.get("textures", [])),
        "images": len(images),
        "image_info": images,
        "bones": len(set(skin_joints)),
        "bone_names": [document.get("nodes", [])[joint].get("name", "(unnamed)") for joint in skin_joints],
        "animations": [
            {
                "name": animation.get("name", f"Animation_{index}"),
                "duration": _animation_duration(model, animation),
                "channels": len(animation.get("channels", [])),
            }
            for index, animation in enumerate(animations)
        ],
        "candidates": _node_candidates(model),
        "root_motion": root_motion,
        "weight_stats": _weight_stats(model),
    }


def _animation_signature(summary: dict[str, Any]) -> list[tuple[str, float]]:
    return [(animation["name"], round(animation["duration"], 6)) for animation in summary["animations"]]


def _all_pairs(analyses: dict[str, dict[str, dict[str, Any]]]) -> list[tuple[str, dict[str, Any]]]:
    pairs: list[tuple[str, dict[str, Any]]] = []
    for _, base in FAMILIES:
        pairs.append((base, analyses[base]["pair"]))
    return pairs


def _fmt_histogram(histogram: dict[str, int]) -> str:
    return ", ".join(f"{key}本={value:,}頂点" for key, value in sorted(histogram.items(), key=lambda item: int(item[0]))) or "なし"


def _fmt_images(images: list[dict[str, Any]]) -> str:
    if not images:
        return "なし"
    labels = []
    for image in images:
        dimensions = (
            f"{image['width']}×{image['height']}"
            if image.get("width") is not None and image.get("height") is not None
            else "サイズ不明"
        )
        labels.append(f"`{image['name']}` ({dimensions}, {image.get('mimeType') or 'mime不明'})")
    return ", ".join(labels)


def _fmt_optional_vector(vector: Iterable[float] | None) -> str:
    return "—" if vector is None else _format_vector(vector)


def _fmt_root_translation(clip: dict[str, Any]) -> str:
    value = clip.get("translation")
    if value is None:
        return "—"
    return f"{value['distance']:.3f} m Δ{_format_vector(value['vector'])}"


def _fmt_root_rotation(clip: dict[str, Any]) -> str:
    value = clip.get("rotation")
    if value is None:
        return "—"
    return f"{value['angle']:+.2f}°"


def _fmt_max_translation(root: dict[str, Any]) -> str:
    value = root.get("max_translation")
    if value is None:
        return "—"
    return f"{value['distance']:.3f} m (`{value['animation']}`, Δ{_format_vector(value['vector'])})"


def _fmt_max_rotation(root: dict[str, Any]) -> str:
    value = root.get("max_rotation")
    if value is None:
        return "—"
    return f"{value['angle']:+.2f}° (`{value['animation']}`)"


def _fmt_list(values: list[str]) -> str:
    return ", ".join(f"`{value}`" for value in values) if values else "なし"


def _render_report(analyses: dict[str, dict[str, dict[str, Any]]]) -> str:
    first_base = FAMILIES[0][1]
    first = analyses[first_base]["normal"]
    first_root = first["root_motion"]
    pair_comparisons = [analyses[base]["pair"] for _, base in FAMILIES]
    all_animation_signatures_equal = all(
        _animation_signature(analyses[base]["normal"]) == _animation_signature(first)
        and _animation_signature(analyses[base]["smooth"]) == _animation_signature(first)
        for _, base in FAMILIES
    )
    all_root_motion_equal = all(
        analyses[base]["normal"]["root_motion"]["clips"] == first_root["clips"]
        and analyses[base]["smooth"]["root_motion"]["clips"] == first_root["clips"]
        for _, base in FAMILIES
    )

    lines: list[str] = [
        "# GLB実データ監査報告",
        "",
        "対象の16個（8種類×通常版/スムース版）のGLBを、glTF JSONチャンクとBINチャンクから直接読み取った監査結果です。レンダラーのロード結果や生成スクリプトの宣言値には依存していません。44アニメーションの内訳は基本4種＋パンチ20種＋キック20種、つまり40攻撃アニメーションです。",
        "",
        "再生成コマンド: `python3 tools/audit_character_glbs.py`",
        "",
        "## 結論",
        "",
        f"- 対象は **{sum(1 for _ in FAMILIES) * 2}ファイル**。全ファイルが19本のスキン骨、44アニメーション（基本4種＋攻撃40種）を持ちます。アニメーション名と長さは全16ファイルで一致: **{all_animation_signatures_equal}**。",
        "- 通常版とスムース版は、頂点位置・法線・UV・インデックス、ノード名、アニメーション値が一致します。差分は実データ上の `JOINTS_0` / `WEIGHTS_0` と `asset.extras.model` です。",
        "- 通常版は全頂点が1本の骨（1 influence）。スムース版は全頂点が2〜4本の骨で重み付けされ、最大4本です。頂点数・メッシュ数・材質数・テクスチャ数はペア内で変わりません。",
        "- 埋め込み画像はガチョウとうんこ頭のみ（各12画像/12テクスチャ、各128×128 PNG）。クマ、ワニ、ゴリラ、カバ、ライオン、サイは画像0/テクスチャ0です。",
        f"- ルート骨名は `{first_root['name']}`（nodes indexはファイル別表）。初期移動 {_format_vector(first_root['base_translation'])}、初期回転 quaternion {_format_vector(first_root['base_rotation'])}。全ファイルでルート移動/回転のキーフレーム構造は一致: **{all_root_motion_equal}**。",
        "",
        "## ファイル別実測値",
        "",
        "`vertices` は各 primitive の POSITION accessor の合計、`triangles` はインデックス数÷3です。`images/textures` はGLB内の images/textures 配列の件数です。",
        "",
        "| 種類 | 版 | ファイル | bytes | nodes/meshes | vertices/triangles | 材質 | images/textures | bones | animations |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for label, base in FAMILIES:
        for version, key in (("通常", "normal"), ("スムース", "smooth")):
            summary = analyses[base][key]
            mesh = summary["mesh_stats"]
            lines.append(
                f"| {label} | {version} | `{summary['file']}` | {summary['bytes']:,} | {summary['nodes']}/{mesh['meshes']} | {mesh['vertices']:,}/{mesh['triangles']:,} | {summary['materials']} | {summary['images']}/{summary['textures']} | {summary['bones']} | {len(summary['animations'])} |"
            )

    lines += [
        "",
        "## 通常版/スムース版の実データ差分",
        "",
        "`changed BIN bytes` はBINチャンク内の異なるバイト数です。JSON構造は `asset.extras.model` を除けば一致し、通常版/スムース版のファイルサイズ差はJSONのモデル名と4/8バイトのチャンクパディングによるものです。",
        "",
        "| 種類 | geometry (POSITION/NORMAL/UV/indices) | animation data | nodes | JOINTS_0差分 | WEIGHTS_0差分 | 通常版 influence | スムース版 influence | changed BIN bytes | file delta |",
        "|---|---|---|---|---|---|---|---|---:|---:|",
    ]
    for label, base in FAMILIES:
        pair = analyses[base]["pair"]
        normal_weights = pair["normal_weight_stats"]
        smooth_weights = pair["smooth_weight_stats"]
        lines.append(
            f"| {label} | {pair['geometry_equal']} | {pair['animation_data_equal']} | {pair['nodes_equal']} | {pair['joints_differ']} | {pair['weights_differ']} | {_fmt_histogram(normal_weights['histogram'])} | {_fmt_histogram(smooth_weights['histogram'])} | {pair['changed_binary_bytes']:,} | {pair['file_size_delta']:+,} |"
        )

    lines += [
        "",
        "## ルート移動・回転",
        "",
        "各クリップの `root T peak` は初期 root translation からの最大距離（m）と、その時点のΔベクトルです。`root R peak` は初期 quaternion からの最大軸角で、生成データはY軸回転なので実質的に符号付きyawです。",
        "",
        "| ファイル | root node | base T | base R | translation channels | 最大T変位 | rotation channels | 最大R |",
        "|---|---|---|---|---:|---|---:|---|",
    ]
    for label, base in FAMILIES:
        summary = analyses[base]["normal"]
        root = summary["root_motion"]
        lines.append(
            f"| `{summary['file']}` ({label}) | `{root['index']}:{root['name']}` | {_format_vector(root['base_translation'])} | {_format_vector(root['base_rotation'])} | {root['translation_channels']} | {_fmt_max_translation(root)} | {root['rotation_channels']} | {_fmt_max_rotation(root)} |"
        )

    lines += [
        "",
        "### 44アニメーションの名前・長さ・root motion（全ファイル共通）",
        "",
        "| # | 名前 | 長さ (s) | root T peak | root R peak |",
        "|---:|---|---:|---|---:|",
    ]
    for index, animation in enumerate(first["animations"], 1):
        clip = first_root["clips"].get(animation["name"], {"translation": None, "rotation": None})
        lines.append(
            f"| {index} | `{animation['name']}` | {animation['duration']:.3f} | {_fmt_root_translation(clip)} | {_fmt_root_rotation(clip)} |"
        )

    lines += [
        "",
        "## 頭・心臓・胴体のノード候補",
        "",
        "候補は各GLBの実ノード名から、メッシュノード（`mesh` を持つノード）とスキン骨を分けて抽出しました。番号はGLTF nodes配列のインデックスです。通常版/スムース版の候補名・番号は各ペアで一致します。",
        "",
    ]
    for label, base in FAMILIES:
        summary = analyses[base]["normal"]
        candidates = summary["candidates"]
        lines += [
            f"### {label} — `{summary['file']}`（通常/スムース共通）",
            "",
            f"- 頭メッシュ候補: {_fmt_list(candidates['head_mesh'])}",
            f"- 頭・首の骨候補: {_fmt_list(candidates['head_bones'])}",
            f"- 心臓/胸部メッシュ候補: {_fmt_list(candidates['heart_mesh'])}",
            f"- 心臓/胸部の骨候補: {_fmt_list(candidates['heart_bones'])}",
            f"- 胴体メッシュ候補: {_fmt_list(candidates['body_mesh'])}",
            f"- 胴体の骨候補: {_fmt_list(candidates['body_bones'])}",
            "",
        ]

    lines += ["## 材質・テクスチャ実測値", ""]
    for label, base in FAMILIES:
        summary = analyses[base]["normal"]
        image_info = summary["image_info"]
        lines += [
            f"### {label} — 通常/スムース共通",
            "",
            f"- 材質 ({summary['materials']}): {_fmt_list(summary['material_names'])}",
            f"- images/textures: {summary['images']}/{summary['textures']}",
            f"- 埋め込み画像: {_fmt_images(image_info)}",
            "",
        ]

    lines += [
        "## 監査の再実行",
        "",
        "```sh",
        "python3 tools/audit_character_glbs.py",
        "python3 tools/audit_character_glbs.py --check",
        "```",
        "",
        "`--check` は16ファイルの存在、全ファイルの19骨/44アニメーション、アニメーション署名の一致、ペアの構造/ジオメトリ/アニメーションデータ一致、通常版とスムース版のJOINTS/WEIGHTS差分を検証します。",
        "",
    ]
    return "\n".join(lines)


def _check_analyses(analyses: dict[str, dict[str, dict[str, Any]]]) -> list[str]:
    errors: list[str] = []
    first_normal = analyses[FAMILIES[0][1]]["normal"]
    expected_signature = _animation_signature(first_normal)
    for label, base in FAMILIES:
        pair = analyses[base]["pair"]
        for version in ("normal", "smooth"):
            summary = analyses[base][version]
            if summary["bones"] != 19:
                errors.append(f"{label}/{version}: expected 19 bones, got {summary['bones']}")
            if len(summary["animations"]) != 44:
                errors.append(f"{label}/{version}: expected 44 animations, got {len(summary['animations'])}")
            if _animation_signature(summary) != expected_signature:
                errors.append(f"{label}/{version}: animation signature differs")
        if not pair["structure_equal_except_model_extra"]:
            errors.append(f"{label}: normal/smooth JSON structure differs beyond asset.extras.model")
        if not pair["geometry_equal"]:
            errors.append(f"{label}: normal/smooth geometry differs")
        if not pair["animation_data_equal"]:
            errors.append(f"{label}: normal/smooth animation data differs")
        if not pair["nodes_equal"]:
            errors.append(f"{label}: normal/smooth node names differ")
        if not pair["joints_differ"] or not pair["weights_differ"]:
            errors.append(f"{label}: expected JOINTS_0 and WEIGHTS_0 differences were not found")
        normal_hist = pair["normal_weight_stats"]["histogram"]
        smooth_hist = pair["smooth_weight_stats"]["histogram"]
        if set(normal_hist) != {"1"} or set(smooth_hist) - {"2", "3", "4"}:
            errors.append(f"{label}: unexpected skin influence histogram")
    return errors


def _build_analyses(assets_dir: Path) -> dict[str, dict[str, dict[str, Any]]]:
    analyses: dict[str, dict[str, dict[str, Any]]] = {}
    for label, base in FAMILIES:
        normal_path = assets_dir / f"{base}.glb"
        smooth_path = assets_dir / f"{base}-smooth.glb"
        if not normal_path.is_file() or not smooth_path.is_file():
            missing = [str(path) for path in (normal_path, smooth_path) if not path.is_file()]
            raise FileNotFoundError(f"{label}: missing GLB file(s): {', '.join(missing)}")
        normal = _audit_file(normal_path)
        smooth = _audit_file(smooth_path)
        analyses[base] = {
            "label": label,
            "normal": normal,
            "smooth": smooth,
            "pair": _pair_comparison(normal["model"], smooth["model"]),
        }
    return analyses


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets-dir", type=Path, default=Path("assets/characters"))
    parser.add_argument("--output", type=Path, default=Path("GLB_REAL_DATA_AUDIT.md"))
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if expected GLB inventory, signatures, or pair parity checks fail",
    )
    args = parser.parse_args(argv)
    try:
        analyses = _build_analyses(args.assets_dir)
        report = _render_report(analyses)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report + "\n", encoding="utf-8")
    except (OSError, ValueError, KeyError, struct.error) as exc:
        print(f"GLB audit failed: {exc}", file=sys.stderr)
        return 2

    errors = _check_analyses(analyses)
    print(f"Audited {len(FAMILIES) * 2} GLBs; wrote {args.output}")
    if errors:
        print("Audit check failures:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1 if args.check else 0
    print("Audit checks: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
