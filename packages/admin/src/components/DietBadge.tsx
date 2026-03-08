interface DietBadgeProps {
  type?: string | null;
  showLabel?: boolean;
}

const DIET_CONFIG: Record<string, { border: string; fill: string; bg: string; borderColor: string; text: string; label: string }> = {
  VEG:     { border: 'border-green-600',  fill: 'bg-green-600',  bg: 'bg-green-50', borderColor: 'border-green-200', text: 'text-green-700', label: 'Vegetarian' },
  EGG:     { border: 'border-amber-500',  fill: 'bg-amber-500',  bg: 'bg-amber-50',   borderColor: 'border-amber-200',   text: 'text-amber-700',   label: 'Egg' },
  NON_VEG: { border: 'border-red-600',    fill: 'bg-red-600',    bg: 'bg-red-50',     borderColor: 'border-red-200',     text: 'text-red-700',     label: 'Non-Vegetarian' },
};

export default function DietBadge({ type, showLabel = false }: DietBadgeProps) {
  if (!type) return null;
  const config = DIET_CONFIG[type];
  if (!config) return null;

  if (showLabel) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 ${config.bg} border ${config.borderColor} rounded-md`} title={config.label}>
        <span className={`w-4 h-4 flex items-center justify-center border-2 ${config.border} rounded-sm`}>
          <span className={`w-1.5 h-1.5 rounded-full ${config.fill}`} />
        </span>
        <span className={`text-[11px] font-semibold ${config.text}`}>{config.label}</span>
      </div>
    );
  }

  return (
    <span className={`inline-flex w-4 h-4 rounded-sm border-2 ${config.border} items-center justify-center shrink-0`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.fill}`} />
    </span>
  );
}
