# raw_nk

本目录存放 Fresnel Web 应用的原始材料 n/k 数据。

当前内置库：

- `materials_builtin.js`

字段约定：

- `name`：材料名称，必须唯一。
- `category`：材料分类，用于下拉框分组。
- `n`：默认折射率，通常作为 550 nm 附近的固定值。
- `k`：默认消光系数。
- `cauchy`：可选，格式 `[A, B, C]`，对应 `n = A + B/λ² + C/λ⁴`，其中 `λ` 单位为 μm。

用户在页面中新增或导入的材料不会写回此目录，而是保存在浏览器 `localStorage` 的 `fresnel.materialDb.v1` 键下。
