// Tiny pub/sub for app-wide moments (celebrations, Toppy lines, navigation).
const handlers = {};
export function on(name, fn) {
  (handlers[name] ||= new Set()).add(fn);
  return () => handlers[name].delete(fn);
}
export function emit(name, data) {
  (handlers[name] || []).forEach((fn) => fn(data));
}
