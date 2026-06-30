# Fresnel Industrial

本目录是从 `py/Reflectance/reflectance_gui` 重构出的独立 Web 应用，用于多层薄膜 Fresnel / transfer-matrix 反射、透射、吸收计算。

## 启动

macOS：

双击 `启动Fresnel.command`，或在本目录运行：

```bash
npm start
```

Windows：

双击 `启动Fresnel-Windows.bat`。

默认地址：

```text
http://127.0.0.1:8788/
```

## 文件结构

- `core.js`：核心传输矩阵计算函数，不依赖 DOM。
- `materials.js`：材料查询函数与简单 Cauchy 色散模型。
- `raw_nk/materials_builtin.js`：内置材料 n/k 数据库。
- `app.js`：界面状态、扫描、导出、图表绘制。
- `styles.css`：工业风 UI。
- `server.js`：本地静态服务。
- `tests/core.test.mjs`：核心计算 sanity tests。

## 当前能力

- 单点 R/T/A 计算，显示 s/p/平均值。
- 波长扫描、膜厚扫描、角度扫描。
- 多膜层增删、排序、材料选择、自定义 n/k/d。
- 膜层顺序约定：界面列表从入射侧到基体侧排列；新增膜层默认插入入射侧，因此越早添加的膜层越靠近基体。显示编号从基体侧开始，最靠近基体的膜层为 `L1`。
- 对带 Cauchy 参数的材料可启用色散计算；无色散数据的材料使用固定 550 nm 近似值。
- 本地材料数据库：可新增自定义 n/k，可导入/导出 JSON 或 CSV。
- JSON 配置保存/读取。
- 当前图表数据导出 CSV。

## 材料数据库

内置材料数据已解耦到：

```text
raw_nk/materials_builtin.js
```

`materials.js` 只保留查询函数。用户新增或导入的材料保存在浏览器 `localStorage`：

```text
fresnel.materialDb.v1
```

在 02 STACK 的 `LOCAL MATERIAL DB` 区域可以：

- 手动新增固定 `n/k` 材料；
- 可选填写 Cauchy 参数 `A/B/C`；
- 导入 JSON 或 CSV；
- 导出当前自定义材料；
- 清空自定义材料。

CSV 推荐表头：

```csv
name,category,n,k,A,B,C
MyFilm,User,1.72,0,1.68,0.012,0
```

JSON 推荐格式：

```json
{
  "version": 1,
  "materials": [
    { "name": "MyFilm", "category": "User", "n": 1.72, "k": 0 },
    { "name": "MyCauchyFilm", "category": "User", "n": 1.7, "k": 0, "cauchy": [1.68, 0.012, 0] }
  ]
}
```

同名自定义材料会覆盖内置材料；清空自定义材料不会删除内置材料。

## 准确性说明

`core.js` 沿用了原 Python `thinfilm_engine.py` 的思路：复折射率写作 `N = n - i k`，并对复数 `cos(theta)` 分支做吸收介质修正，以避免反向传播或非物理解。  

目前材料数据库仍以原程序的少量静态 n/k 为基础。后续若要提高绝对准确性，优先应加入真实波长相关的材料数据，例如 Sopra、refractiveindex.info、椭偏拟合结果或用户自己的 tabulated n/k 文件。
