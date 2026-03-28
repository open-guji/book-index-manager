/**
 * 简单模板替换
 * formatTemplate('共 {n} 册', { n: 100 }) → '共 100 册'
 */
export function formatTemplate(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}
