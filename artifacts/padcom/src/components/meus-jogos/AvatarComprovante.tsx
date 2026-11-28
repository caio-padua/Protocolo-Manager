/** Ilustração neutra, sem semelhança com pessoa real; só aparece após comprovante. */
export default function AvatarComprovante() {
  return (
    <div className="mj-avatar-finalizado concave-3d inline-flex items-center gap-2 rounded-lg px-2 py-1.5"
      role="status" aria-label="Pedido registrado com comprovante oficial. Avatar ilustrativo." data-testid="mj-avatar-finalizado">
      <svg viewBox="0 0 48 64" className="h-12 w-9 shrink-0" aria-hidden="true">
        <circle cx="24" cy="9" r="6" fill="hsl(var(--accent))" />
        <path className="mj-avatar-corpo" d="M19 17h10l4 17-3 2 3 14H15l3-14-3-2z" fill="hsl(var(--primary))" />
        <path className="mj-avatar-braco mj-avatar-braco-a" d="M17 19 9 31l4 3 8-10" fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" />
        <path className="mj-avatar-braco mj-avatar-braco-b" d="m31 19 8 12-4 3-8-10" fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" />
        <path d="m19 49-3 12m14-12 3 12" fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="text-[10px] font-bold leading-tight text-primary">Registro confirmado<br /><span className="font-normal text-muted-foreground">avatar ilustrativo</span></span>
    </div>
  );
}
