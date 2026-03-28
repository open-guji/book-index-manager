declare module 'opencc-js' {
    interface ConverterOptions {
        from: 'tw' | 'hk' | 'cn' | 'twp' | 'jp' | 't';
        to: 'tw' | 'hk' | 'cn' | 'twp' | 'jp' | 't';
    }
    export function Converter(options: ConverterOptions): (text: string) => string;
}

declare module 'opencc-js/t2cn' {
    interface ConverterOptions {
        from: 'tw' | 'hk' | 'cn' | 'twp' | 'jp' | 't';
        to: 'tw' | 'hk' | 'cn' | 'twp' | 'jp' | 't';
    }
    export function Converter(options: ConverterOptions): (text: string) => string;
}
