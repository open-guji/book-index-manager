import React, { createContext, useContext, useMemo } from 'react';

export type BidUrlBuilder = (id: string) => string;

const defaultBuildUrl: BidUrlBuilder = (id) => `/book-index?id=${id}`;

const BidUrlContext = createContext<BidUrlBuilder>(defaultBuildUrl);

export interface BidUrlProviderProps {
    buildUrl: BidUrlBuilder;
    children: React.ReactNode;
}

export function BidUrlProvider({ buildUrl, children }: BidUrlProviderProps) {
    const value = useMemo(() => buildUrl, [buildUrl]);
    return <BidUrlContext.Provider value={value}>{children}</BidUrlContext.Provider>;
}

export function useBidUrl(): BidUrlBuilder {
    return useContext(BidUrlContext);
}
