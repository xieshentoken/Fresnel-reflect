import { BUILTIN_MATERIALS } from "./raw_nk/materials_builtin.js";

export const MATERIALS = BUILTIN_MATERIALS;

export function materialByName(name) {
  return MATERIALS.find((material) => material.name === name) || MATERIALS[0];
}

export function nkForMaterial(name, wavelengthNm, useDispersion = false) {
  const material = materialByName(name);
  if (useDispersion && material.cauchy) {
    const [A, B, C = 0] = material.cauchy;
    const lamUm = Number(wavelengthNm) / 1000;
    if (lamUm > 0) return { n: A + B / lamUm ** 2 + C / lamUm ** 4, k: material.k || 0, source: "Cauchy" };
  }
  return { n: material.n, k: material.k, source: "fixed@550nm" };
}

export function categoryNames() {
  return [...new Set(MATERIALS.map((material) => material.category))];
}
