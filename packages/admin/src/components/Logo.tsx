import { memo } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

function LogoComponent({ size = 64, className = '' }: LogoProps) {
  return (
    <img
      src="/4.png"
      alt="Q Order Logo"
      width={size}
      height={size}
      className={`rounded-2xl ${className}`}
      style={{ objectFit: 'contain' }}
    />
  );
}

export const Logo = memo(LogoComponent);
export default Logo;
