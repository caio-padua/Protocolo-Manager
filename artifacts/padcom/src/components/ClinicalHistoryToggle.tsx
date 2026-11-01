import { Switch } from "@/components/ui/switch";
import { ToggleWell } from "@/pages/comunicacao/_shared";

export default function ClinicalHistoryToggle({
  label,
  open,
  onOpenChange,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ToggleWell
      label={label}
      hint={open ? "Histórico aberto" : "Ative para consultar documentos anteriores"}
    >
      <Switch
        checked={open}
        onCheckedChange={onOpenChange}
        aria-label={label}
      />
    </ToggleWell>
  );
}
