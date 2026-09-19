export function createAdapterRegistry() {
    const adapters = new Map();
    return {
        register(adapter) {
            if (adapters.has(adapter.id)) {
                throw new Error(`适配器 id 重复：${adapter.id}`);
            }
            adapters.set(adapter.id, adapter);
            return () => {
                adapters.delete(adapter.id);
            };
        },
        replace(adapter) {
            if (!adapters.has(adapter.id)) {
                throw new Error(`适配器未注册，不能替换：${adapter.id}`);
            }
            adapters.set(adapter.id, adapter);
        },
        get(id) {
            return adapters.get(id);
        },
        list() {
            return [...adapters.values()];
        },
        has(id) {
            return adapters.has(id);
        },
    };
}
//# sourceMappingURL=registry.js.map