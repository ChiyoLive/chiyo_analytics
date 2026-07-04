/**
 * 监听 <html> 标签指定属性变化的函数
 * @param attributes 需要监听的属性数组，例如 ["lang", "style"]
 * @param cb 回调函数，当被监听属性发生改变时触发，接收属性名称和当前属性值
 * @returns 返回一个取消监听的函数
 */
export function onHtmlAttributeChange(
  attributes: string[],
  cb: (name: string, value: string) => void,
): () => void {
  if (
    typeof document === "undefined" ||
    typeof MutationObserver === "undefined"
  ) {
    return () => {};
  }

  const targetNode = document.documentElement;

  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === "attributes" && mutation.attributeName) {
        const name = mutation.attributeName;
        if (attributes.indexOf(name) !== -1) {
          const val = targetNode.getAttribute(name) || "";
          cb(name, val);
        }
      }
    }
  });

  observer.observe(targetNode, {
    attributes: true,
    attributeFilter: attributes,
  });

  return () => {
    observer.disconnect();
  };
}
