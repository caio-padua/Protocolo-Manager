import { Switch } from "@/components/ui/switch";

/** Padrão 5 da skill Paxter: o Switch padrão do sistema dentro de um sulco côncavo, com o rótulo ao lado. */
export function ToggleWell({ checked, onChange, label, disabled, testid, title, compacto }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; testid?: string; title?: string; compacto?: boolean;
}) {
  return (
    <label className={`concave-3d mx-tw ${compacto ? "mx-tw-c" : ""}`} title={title} onClick={(e) => e.stopPropagation()}>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} data-testid={testid} aria-label={label} />
      <span>{label}</span>
    </label>
  );
}
