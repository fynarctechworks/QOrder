interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  /** 'sm' = 24×44px track (default), 'md' = 28×48px track */
  size?: 'sm' | 'md';
}

export default function Toggle({ checked, onChange, disabled, size = 'sm' }: ToggleProps) {
  const track = size === 'md' ? 'h-7 w-12' : 'h-6 w-11';
  const thumb = size === 'md' ? 'h-[22px] w-[22px]' : 'h-5 w-5';
  const translate = size === 'md' ? 'translate-x-[22px]' : 'translate-x-5';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`
        relative inline-flex ${track} shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2
        focus-visible:ring-emerald-500 focus-visible:ring-offset-2
        ${checked ? 'bg-emerald-500' : 'bg-gray-200'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block ${thumb} transform rounded-full bg-white shadow ring-0
          transition duration-200 ease-in-out
          ${checked ? translate : 'translate-x-0'}
        `}
      />
    </button>
  );
}
