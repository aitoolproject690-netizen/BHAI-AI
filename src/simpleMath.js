/**
 * Safe deterministic solver for simple arithmetic chat requests.
 * Never uses eval/Function. Returns null for non-arithmetic prompts.
 */

function isFiniteNumber(value) {
  return Number.isFinite(value) && Math.abs(value) <= 1e15;
}

function tokenize(expression) {
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) { i++; continue; }

    if ("+-*/()".includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      let dots = 0;
      while (i < expression.length && /[0-9.]/.test(expression[i])) {
        if (expression[i] === ".") dots++;
        i++;
      }
      const raw = expression.slice(start, i);
      if (dots > 1 || raw === ".") throw new Error("invalid number");
      const value = Number(raw);
      if (!isFiniteNumber(value)) throw new Error("invalid number");
      tokens.push(value);
      continue;
    }

    throw new Error("invalid token");
  }
  return tokens;
}

function evaluate(expression) {
  const tokens = tokenize(expression);
  let index = 0;

  function parseExpression() {
    let value = parseTerm();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++];
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
      if (!isFiniteNumber(value)) throw new Error("result out of range");
    }
    return value;
  }

  function parseTerm() {
    let value = parseUnary();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++];
      const right = parseUnary();
      if (op === "/" && right === 0) throw new Error("division by zero");
      value = op === "*" ? value * right : value / right;
      if (!isFiniteNumber(value)) throw new Error("result out of range");
    }
    return value;
  }

  function parseUnary() {
    if (tokens[index] === "+") {
      index++;
      return parseUnary();
    }
    if (tokens[index] === "-") {
      index++;
      const value = -parseUnary();
      if (!isFiniteNumber(value)) throw new Error("result out of range");
      return value;
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = tokens[index];
    if (typeof token === "number") {
      index++;
      return token;
    }
    if (token === "(") {
      index++;
      const value = parseExpression();
      if (tokens[index] !== ")") throw new Error("missing parenthesis");
      index++;
      return value;
    }
    throw new Error("expected number");
  }

  const result = parseExpression();
  if (index !== tokens.length) throw new Error("unexpected token");
  return result;
}

export function solveSimpleMath(text = "") {
  let raw = String(text).trim();
  if (!raw) return null;

  raw = raw
    .replace(/^\s*bhai[,:-]?\s*/i, "")
    .replace(/\s*\?\s*$/u, "")
    .replace(/\s*=\s*$/u, "")
    .trim();

  raw = raw.replace(/^(?:what(?:'s| is)?|calculate|solve|find)\s+/i, "").trim();
  raw = raw.replace(/^(?:kya|kitna|kitne|nikalo)\s+(?:hoga|hoga\?|hai|hain)\s*/i, "").trim();

  if (!raw || raw.length > 100) return null;
  if (!/^[0-9+*/().\s-]+$/.test(raw)) return null;
  if (!/[0-9]/.test(raw) || !/[+*/-]/.test(raw)) return null;

  try {
    const result = evaluate(raw);
    if (!isFiniteNumber(result)) return null;
    if (Number.isInteger(result)) return String(result);
    return String(Number(result.toFixed(12)));
  } catch {
    return null;
  }
}
