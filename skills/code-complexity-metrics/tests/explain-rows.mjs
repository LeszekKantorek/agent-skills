export function explainRow(line) {
  const match = /^([^\r\n]*?) +\| +(\+?\d+|—) +\| +(\+?\d+) +\| +(\+?\d+) +\| +(\+?\d+) +\| +(\+?\d+)(?: \/\/ error: (.*))?$/u.exec(line);
  if (!match) return null;
  const [, fragment, cognitive, n1, n2, eta1, eta2, error] = match;
  return {fragment, cognitive: cognitive === '—' ? null : Number(cognitive),
    halstead: [Number(n1), Number(n2), Number(eta1), Number(eta2)], error};
}
