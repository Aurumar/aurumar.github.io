import {createHash} from '../../../../../multi-device/portable/node-crypto.mjs';

export class Hold extends Error {
  constructor(code, detail = null) { super(code); this.name = 'Hold'; this.code = code; this.detail = detail; }
}
export const check = (condition, code, detail) => { if (!condition) throw new Hold(code, detail); };
export const clone = value => structuredClone(value);
export const sorted = values => [...new Set(values)].sort();
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    check(Number.isFinite(value), 'NON_FINITE_NUMBER');
    return Object.is(value, -0) ? '-0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  check(value && Object.getPrototypeOf(value) === Object.prototype, 'JSON_OBJECT_REQUIRED');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export const eq = (a, b) => canonical(a) === canonical(b);
export function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const keyOf = (kind, id) => JSON.stringify([kind, id]);
export const own = (object,key,fallback=null) => Object.hasOwn(object,key)?object[key]:fallback;
export const put = (object,key,value) => Object.defineProperty(object,key,{value,writable:true,enumerable:true,configurable:true});
export const compare = (a,b) => a<b?-1:a>b?1:0;
export function idOK(id) { return typeof id === 'string' && /^[A-Za-z0-9_:.\/-]{1,120}$/.test(id); }
export function dateOK(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Versioned, bounded exact rational arithmetic. No IEEE-754 comparison settles a reward.
const gcd = (a,b) => { a=a<0n?-a:a; while(b) [a,b]=[b,a%b]; return a; };
export class Rational {
  constructor(n, d=1n) {
    check(d !== 0n, 'ZERO_DENOMINATOR'); if(d<0n) {n=-n;d=-d;}
    const g=gcd(n,d); this.n=n/g;this.d=d/g;
    check(this.n.toString().length <= 160 && this.d.toString().length <= 160, 'RATIONAL_LIMIT');
  }
  static of(x) {
    if(x instanceof Rational) return x;
    check(typeof x==='number' || typeof x==='string', 'EXACT_NUMBER_REQUIRED');
    if(typeof x==='number') check(Number.isFinite(x), 'NON_FINITE_NUMBER');
    let s=String(x); check(s.length<=180,'RATIONAL_LIMIT');
    if(/^-?\d+\/[1-9]\d*$/.test(s)) {const [n,d]=s.split('/');return new Rational(BigInt(n),BigInt(d));}
    const m=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(s);check(m,'EXACT_NUMBER_REQUIRED');
    const exponent=Number(m[4]||0)-(m[3]||'').length;
    check(Math.abs(exponent)<=120 && (m[2]+(m[3]||'')).length<=120,'RATIONAL_LIMIT');
    let n=BigInt(m[2]+(m[3]||''))*(m[1]?-1n:1n);
    return exponent>=0?new Rational(n*10n**BigInt(exponent)):new Rational(n,10n**BigInt(-exponent));
  }
  add(b){b=Rational.of(b);return new Rational(this.n*b.d+b.n*this.d,this.d*b.d);}
  sub(b){b=Rational.of(b);return new Rational(this.n*b.d-b.n*this.d,this.d*b.d);}
  mul(b){b=Rational.of(b);return new Rational(this.n*b.n,this.d*b.d);}
  div(b){b=Rational.of(b);return new Rational(this.n*b.d,this.d*b.n);}
  cmp(b){b=Rational.of(b);const n=this.n*b.d-b.n*this.d;return n<0n?-1:n>0n?1:0;}
  toString(){return this.d===1n?String(this.n):`${this.n}/${this.d}`;}
}
export const R=Rational.of, zero=()=>R('0');
export const sum=values=>values.reduce((s,v)=>s.add(v),zero());
export const max=(...vs)=>vs.map(R).reduce((a,b)=>a.cmp(b)>=0?a:b);
export const min=(...vs)=>vs.map(R).reduce((a,b)=>a.cmp(b)<=0?a:b);
