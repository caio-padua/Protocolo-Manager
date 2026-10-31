import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  visibilityLabel: string;
  visibilityTestId: string;
};

export function PasswordInput({
  className,
  disabled,
  visibilityLabel,
  visibilityTestId,
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <Input
        {...inputProps}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={cn("h-10 pr-12", className)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${visibilityLabel}`}
        aria-pressed={visible}
        data-testid={visibilityTestId}
        className="absolute right-0 top-0 grid h-10 w-10 shrink-0 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {visible
          ? <EyeOff className="h-4 w-4" aria-hidden="true" />
          : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
