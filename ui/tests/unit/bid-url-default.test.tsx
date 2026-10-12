import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { BidUrlProvider, useBidUrl } from '../../src/core/bid-url';

function Probe({ id }: { id: string }) {
    const buildUrl = useBidUrl();
    return <a href={buildUrl(id)}>x</a>;
}

describe('BidUrl 默认构造器（overview#577）', () => {
    it('没包 Provider 时条目地址是 /item/<id>，不再产出 /book-index?id=', () => {
        const { container } = render(<Probe id="98y5qfl7nl" />);
        expect(container.querySelector('a')!.getAttribute('href')).toBe('/item/98y5qfl7nl');
    });

    it('宿主包了 Provider 时用宿主的', () => {
        const { container } = render(
            <BidUrlProvider buildUrl={(id) => `/x/${id}`}><Probe id="a1" /></BidUrlProvider>,
        );
        expect(container.querySelector('a')!.getAttribute('href')).toBe('/x/a1');
    });
});
