export default {
  mount(container, value, context) {
    if (value.fail) throw new Error("Controlled mount failure");
    container.textContent = `${value.title}:${context.revision}`;
  },
  update(value, context) {
    if (value.fail) throw new Error("Controlled update failure");
    globalThis.document.querySelector("#app").textContent =
      `${value.title}:${context.revision}`;
  },
  dispose() {
    globalThis.document.querySelector("#app").replaceChildren();
  },
};
