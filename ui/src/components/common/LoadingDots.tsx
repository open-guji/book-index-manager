import React, { useState, useEffect } from 'react';

export const LoadingDots: React.FC = () => {
    const [dots, setDots] = useState(1);
    useEffect(() => {
        const timer = setInterval(() => setDots(d => d >= 3 ? 1 : d + 1), 500);
        return () => clearInterval(timer);
    }, []);
    return (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bim-desc-fg, #717171)', fontSize: '14px' }}>
            {'加载中' + '.'.repeat(dots)}
        </div>
    );
};
