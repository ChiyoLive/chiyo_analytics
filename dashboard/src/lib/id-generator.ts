let nextId = 0;

/**
 * 一个保证当前会话里大概率唯一的随机字符串 id
 *
 * 不可用作 nanoid 或者 uuid-v4 的替代
 */
export function randomId() {
  nextId += 1;
  return `${Date.now().toString(36)}-${nextId.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
