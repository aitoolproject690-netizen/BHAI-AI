/**
 * Deterministic fallback for common, provider-independent coding exercises.
 * This is only a last-resort safety net; normal coding uses configured AI.
 */

function wants(text, pattern){ return pattern.test(String(text||"")); }

export function buildSimpleCodingFallback(task=""){
  const raw=String(task||"").trim();
  const js=wants(raw,/\b(?:javascript|js|node(?:\.js)?)\b/i);

  if(js && wants(raw,/(?:largest|max(?:imum)?|sabse\s+bada|bada(?:\s+number)?)\b.*\barray\b|\blargest\s+number\b/i)){
    return [
      "JavaScript:",
      "",
      "```js",
      "function largestNumber(arr) {",
      "  if (!Array.isArray(arr) || arr.length === 0) return null;",
      "  return Math.max(...arr);",
      "}",
      "```",
      "",
      "Ye function array ka sabse bada number return karega. Empty array par `null` dega."
    ].join("\n");
  }

  if(js && wants(raw,/(?:smallest|min(?:imum)?|sabse\s+chhota)\b.*\barray\b|\bsmallest\s+number\b/i)){
    return [
      "JavaScript:",
      "",
      "```js",
      "function smallestNumber(arr) {",
      "  if (!Array.isArray(arr) || arr.length === 0) return null;",
      "  return Math.min(...arr);",
      "}",
      "```"
    ].join("\n");
  }

  if(js && wants(raw,/(?:sum|total|jod|jodna|yog)\b.*\barray\b|\bsum\s+of\s+array\b/i)){
    return [
      "JavaScript:",
      "",
      "```js",
      "function sumArray(arr) {",
      "  if (!Array.isArray(arr)) return 0;",
      "  return arr.reduce((sum, n) => sum + n, 0);",
      "}",
      "```"
    ].join("\n");
  }

  if(js && wants(raw,/(?:reverse|ulta)\b.*\bstring\b|\breverse\s+string\b/i)){
    return [
      "JavaScript:",
      "",
      "```js",
      "function reverseString(text) {",
      "  return String(text).split('').reverse().join('');",
      "}",
      "```"
    ].join("\n");
  }

  if(js && wants(raw,/(?:factorial|fact)\b/i)){
    return [
      "JavaScript:",
      "",
      "```js",
      "function factorial(n) {",
      "  if (!Number.isInteger(n) || n < 0) return null;",
      "  let result = 1;",
      "  for (let i = 2; i <= n; i++) result *= i;",
      "  return result;",
      "}",
      "```"
    ].join("\n");
  }

  return null;
}
