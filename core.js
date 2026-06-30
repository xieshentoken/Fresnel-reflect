const EPS = 1e-15;

function c(re = 0, im = 0) { return { re, im }; }
function add(a, b) { return c(a.re + b.re, a.im + b.im); }
function sub(a, b) { return c(a.re - b.re, a.im - b.im); }
function neg(a) { return c(-a.re, -a.im); }
function mul(a, b) { return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
function div(a, b) {
  const d = b.re * b.re + b.im * b.im;
  if (d < EPS) return c(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
function scale(a, s) { return c(a.re * s, a.im * s); }
function abs2(a) { return a.re * a.re + a.im * a.im; }
function csqrt(z) {
  const r = Math.hypot(z.re, z.im);
  const re = Math.sqrt(Math.max(0, (r + z.re) / 2));
  const im = Math.sign(z.im || 1) * Math.sqrt(Math.max(0, (r - z.re) / 2));
  return c(re, im);
}
function ccos(z) {
  return c(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));
}
function csin(z) {
  return c(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
}
function matrixMul(A, B) {
  return [
    [add(mul(A[0][0], B[0][0]), mul(A[0][1], B[1][0])), add(mul(A[0][0], B[0][1]), mul(A[0][1], B[1][1]))],
    [add(mul(A[1][0], B[0][0]), mul(A[1][1], B[1][0])), add(mul(A[1][0], B[0][1]), mul(A[1][1], B[1][1]))],
  ];
}

function safeCosTheta(N, n0, k0, sinTheta) {
  const n0sq = n0 * n0 + k0 * k0;
  const sin2 = sinTheta * sinTheta;
  return N.map((nj) => {
    const ratio = scale(div(c(n0sq * sin2, 0), mul(nj, nj)), 1);
    let cosTheta = csqrt(sub(c(1, 0), ratio));
    const nCos = mul(nj, cosTheta);
    if (nCos.im < -1e-15) cosTheta = neg(cosTheta);
    return cosTheta;
  });
}

function buildMatrix(phases, etas) {
  let M = [[c(1, 0), c(0, 0)], [c(0, 0), c(1, 0)]];
  for (let i = 0; i < phases.length; i += 1) {
    const phase = phases[i];
    const eta = etas[i];
    const cos = ccos(phase);
    const sin = csin(phase);
    const layer = [
      [cos, mul(div(c(0, 1), eta), sin)],
      [mul(mul(c(0, 1), eta), sin), cos],
    ];
    M = matrixMul(M, layer);
  }
  return M;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function calculateStack(input) {
  const layers = input.layers || [];
  const n = layers.map((layer) => finiteNumber(layer.n, 1));
  const k = layers.map((layer) => finiteNumber(layer.k, 0));
  const d = layers.map((layer) => finiteNumber(layer.d, 0));
  const n0 = finiteNumber(input.nIn, 1);
  const k0 = finiteNumber(input.kIn, 0);
  const ns = finiteNumber(input.nSub, 1);
  const ks = finiteNumber(input.kSub, 0);
  const thetaDeg = finiteNumber(input.thetaDeg, 0);
  const lambdaS = finiteNumber(input.lambdaS ?? input.wavelength, 550);
  const lambdaP = finiteNumber(input.lambdaP ?? input.wavelength, 550);
  const theta = thetaDeg * Math.PI / 180;
  const sinTheta = Math.sin(theta);
  const cosThetaIn = Math.cos(theta);

  const N = n.map((value, index) => c(value, -k[index]));
  const N0 = c(n0, -k0);
  const Ns = c(ns, -ks);
  const cosAll = safeCosTheta([...N, Ns], n0, k0, sinTheta);
  const cosLayers = cosAll.slice(0, -1);
  const cosSub = cosAll.at(-1);

  const phase = (lambda) => N.map((nj, index) => (
    lambda > 0 ? scale(mul(mul(nj, cosLayers[index]), c(d[index], 0)), 2 * Math.PI / lambda) : c(0, 0)
  ));

  const etaS = N.map((nj, index) => mul(nj, cosLayers[index]));
  const etaP = N.map((nj, index) => div(nj, cosLayers[index]));
  const etaS0 = mul(N0, c(cosThetaIn, 0));
  const etaP0 = div(N0, c(cosThetaIn || EPS, 0));
  const etaSSub = mul(Ns, cosSub);
  const etaPSub = div(Ns, cosSub);

  const solve = (polarization) => {
    const isS = polarization === "s";
    const M = buildMatrix(phase(isS ? lambdaS : lambdaP), isS ? etaS : etaP);
    const eta0 = isS ? etaS0 : etaP0;
    const etaSub = isS ? etaSSub : etaPSub;
    const B = add(M[0][0], mul(M[0][1], etaSub));
    const C = add(M[1][0], mul(M[1][1], etaSub));
    const Y = div(C, B);
    const r = div(sub(eta0, Y), add(eta0, Y));
    const denom = add(mul(B, eta0), C);
    const t = div(scale(eta0, 2), denom);
    const R = abs2(r);
    const eta0Re = eta0.re;
    const etaSubRe = etaSub.re;
    const T = Math.abs(eta0Re) < EPS ? 0 : etaSubRe / eta0Re * abs2(t);
    const A = 1 - R - T;
    return { R, T, A, r, t };
  };

  const s = solve("s");
  const p = solve("p");
  return {
    R_s: s.R, R_p: p.R, R_avg: (s.R + p.R) / 2,
    T_s: s.T, T_p: p.T, T_avg: (s.T + p.T) / 2,
    A_s: s.A, A_p: p.A, A_avg: (s.A + p.A) / 2,
    energy_s: s.R + s.T + s.A,
    energy_p: p.R + p.T + p.A,
  };
}

export function rangeValues(start, end, step) {
  const a = finiteNumber(start); const b = finiteNumber(end); const s = finiteNumber(step);
  if (!(s > 0) || b < a) return [];
  const count = Math.floor((b - a) / s + 1e-9) + 1;
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(Number((a + i * s).toPrecision(12)));
  if (out.at(-1) < b - s * 1e-8) out.push(b);
  return out;
}

export function validateConfig(config) {
  const errors = [];
  if (!(Number(config.wavelength) > 0)) errors.push("波长必须大于 0 nm");
  if (!(Number(config.lambdaS) > 0) || !(Number(config.lambdaP) > 0)) errors.push("s/p 波长必须大于 0 nm");
  if (!(Number(config.nIn) > 0)) errors.push("入射介质 n 必须大于 0");
  if (!(Number(config.nSub) > 0)) errors.push("基板 n 必须大于 0");
  if (Number(config.kIn) < 0 || Number(config.kSub) < 0) errors.push("k 不能为负数");
  if (!(Number(config.thetaDeg) >= 0 && Number(config.thetaDeg) < 90)) errors.push("入射角应满足 0 ≤ θ < 90°");
  const layers = config.layers || [];
  layers.forEach((layer, index) => {
    const label = `L${layers.length - index}`;
    if (!(Number(layer.n) > 0)) errors.push(`${label} 层 n 必须大于 0`);
    if (Number(layer.k) < 0) errors.push(`${label} 层 k 不能为负数`);
    if (Number(layer.d) < 0) errors.push(`${label} 层厚度不能为负数`);
  });
  return errors;
}
