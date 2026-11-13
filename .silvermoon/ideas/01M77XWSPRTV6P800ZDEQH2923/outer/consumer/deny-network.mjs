globalThis.fetch = async () => {
  throw new TypeError("Independent consumer injected transport rejection.");
};
