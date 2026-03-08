import { memo } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

function LogoComponent({ size = 64, className = '' }: LogoProps) {
  return (
    <img
      src="/Q Order Logo Landscape.svg"
      alt="Logo"
      style={{ height: size, width: 'auto', objectFit: 'contain' }}
      className={className}
    />
  );
}

export const Logo = memo(LogoComponent);
export default Logo;
