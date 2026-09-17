/** 读服务并在缺失时返回 undefined，避免到处写断言。 */
export function serviceOf(ctx, name) {
    const value = ctx.get(name);
    return value === undefined || value === null ? undefined : value;
}
//# sourceMappingURL=dsh.js.map