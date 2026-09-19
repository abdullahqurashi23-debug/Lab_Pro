// A tiny, safe arithmetic expression evaluator for FORMULA-type test
// parameters (e.g. LDL = cholesterol - hdl - (triglycerides / 5)).
// Deliberately NOT eval()/new Function() — formulas are stored in the
// database and edited from the Settings UI, so they must never be able to
// execute arbitrary JavaScript. Supports +, -, *, /, unary minus,
// parentheses, number literals, and case-insensitive variable names.

type TokenType = 'number' | 'identifier' | 'op' | 'lparen' | 'rparen' | 'eof';
interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      tokens.push({ type: 'number', value: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
      tokens.push({ type: 'identifier', value: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i++;
      continue;
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character in formula: "${ch}"`);
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private variables: Record<string, number>
  ) {}

  private peek() {
    return this.tokens[this.pos];
  }

  private consume(type?: TokenType): Token {
    const tok = this.tokens[this.pos];
    if (type && tok.type !== type) {
      throw new Error(`Formula error: expected ${type} but got "${tok.value || '<end>'}"`);
    }
    this.pos++;
    return tok;
  }

  parse(): number {
    const value = this.parseExpression();
    this.consume('eof');
    return value;
  }

  // expression := term (('+' | '-') term)*
  private parseExpression(): number {
    let value = this.parseTerm();
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const rhs = this.parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  // term := factor (('*' | '/') factor)*
  private parseTerm(): number {
    let value = this.parseFactor();
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value;
      const rhs = this.parseFactor();
      if (op === '/' && rhs === 0) throw new Error('Formula error: division by zero');
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  // factor := '-' factor | number | identifier | '(' expression ')'
  private parseFactor(): number {
    const tok = this.peek();
    if (tok.type === 'op' && tok.value === '-') {
      this.consume();
      return -this.parseFactor();
    }
    if (tok.type === 'number') {
      this.consume();
      return parseFloat(tok.value);
    }
    if (tok.type === 'identifier') {
      this.consume();
      const key = tok.value.toLowerCase();
      if (!(key in this.variables)) {
        throw new Error(`Formula error: unknown parameter "${tok.value}"`);
      }
      return this.variables[key];
    }
    if (tok.type === 'lparen') {
      this.consume();
      const value = this.parseExpression();
      this.consume('rparen');
      return value;
    }
    throw new Error(`Formula error: unexpected token "${tok.value || '<end>'}"`);
  }
}

// `variables` should be keyed by parameter name exactly as slugified by
// `slugifyParamName` below, so callers don't need to worry about case.
export function evaluateFormula(formula: string, variables: Record<string, number>): number {
  const normalizedVars: Record<string, number> = {};
  for (const [k, v] of Object.entries(variables)) normalizedVars[k.toLowerCase()] = v;
  const tokens = tokenize(formula);
  return new Parser(tokens, normalizedVars).parse();
}

// Turns a human parameter name like "Total Cholesterol" into the
// identifier a formula would reference: "total_cholesterol".
export function slugifyParamName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
