import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSiteContent,
  useUpdateSiteContent,
} from "@workspace/api-client-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageSquareText, CreditCard, Video, Save, Upload } from "lucide-react";
import { toast } from "sonner";

const SITE_CONTENT_KEY = ["/api/site-content"] as const;

type SectionDef = {
  category: string;
  title: string;
  subtitle: string;
  icon: typeof MessageSquareText;
  multiline: boolean;
  isVideo?: boolean;
};

const SECTIONS: SectionDef[] = [
  {
    category: "button_phrase",
    title: "Fraseologia dos Botões",
    subtitle: "O texto que aparece em cada botão das entradas de agendamento.",
    icon: MessageSquareText,
    multiline: false,
  },
  {
    category: "payment_text",
    title: "Textos de Pagamento",
    subtitle: "As explicações de concierge, sinal de 25% e estético que o paciente lê.",
    icon: CreditCard,
    multiline: true,
  },
  {
    category: "video",
    title: "Vídeos de Apresentação",
    subtitle: "Cole o link do vídeo (YouTube, Vimeo ou Google Drive). Upload direto chega em breve.",
    icon: Video,
    multiline: true,
    isVideo: true,
  },
];

function ItemEditor({
  item,
  multiline,
  isVideo,
  onSaved,
}: {
  item: { id: number; title: string; body: string | null; mediaUrl: string | null };
  multiline: boolean;
  isVideo?: boolean;
  onSaved: () => void;
}) {
  const updateMut = useUpdateSiteContent();
  const [body, setBody] = useState(item.body ?? "");
  const [mediaUrl, setMediaUrl] = useState(item.mediaUrl ?? "");

  useEffect(() => {
    setBody(item.body ?? "");
    setMediaUrl(item.mediaUrl ?? "");
  }, [item.id, item.body, item.mediaUrl]);

  const dirty = body !== (item.body ?? "") || mediaUrl !== (item.mediaUrl ?? "");

  async function salvar() {
    await updateMut.mutateAsync({
      id: item.id,
      data: isVideo ? { mediaUrl: mediaUrl.trim() || null } : { body },
    });
    toast.success("Conteúdo salvo.");
    onSaved();
  }

  return (
    <div className="panel-3d-sub p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-widest text-primary">{item.title}</span>
        <Button
          size="sm"
          className="btn-3d"
          onClick={salvar}
          disabled={updateMut.isPending || !dirty}
        >
          <Save className="w-3.5 h-3.5 mr-1" /> Salvar
        </Button>
      </div>

      {isVideo ? (
        <div className="space-y-2">
          <Input
            placeholder="https://... (link do vídeo)"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            className="field-engraved"
          />
          <div className="concave-3d flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Upload className="w-3.5 h-3.5" />
            Espaço de upload de vídeo — em breve. Por enquanto, use um link.
          </div>
          {mediaUrl.trim() && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-bold text-cyan-600 underline break-all"
            >
              Abrir vídeo atual
            </a>
          )}
        </div>
      ) : multiline ? (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="field-engraved resize-y"
        />
      ) : (
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="field-engraved"
        />
      )}
    </div>
  );
}

function Section({ category, subtitle, multiline, isVideo }: SectionDef) {
  const qc = useQueryClient();
  const { data, isLoading } = useListSiteContent({ category });
  const invalidate = () => qc.invalidateQueries({ queryKey: SITE_CONTENT_KEY });
  const items = data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 panel-3d-sub" />
        <Skeleton className="h-24 panel-3d-sub" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{subtitle}</p>
      {items.length === 0 ? (
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide py-6 text-center">
          Nenhum conteúdo cadastrado ainda.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ItemEditor
              key={item.id}
              item={item}
              multiline={multiline}
              isVideo={isVideo}
              onSaved={invalidate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CadastroTextos() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="bevel-3d w-10 h-10 flex items-center justify-center text-primary">
          <MessageSquareText className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight uppercase">Textos & Vídeos Editáveis</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            Fraseologia dos botões, explicações de pagamento e vídeos — tudo o que o paciente vê.
          </p>
        </div>
      </div>

      <div className="panel-3d">
        <div className="px-6 pt-5 pb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Central de Conteúdo</span>
        </div>
        <CardContent className="pt-2">
          <Tabs defaultValue={SECTIONS[0].category}>
            <TabsList className="concave-3d p-1 mb-4">
              {SECTIONS.map((s) => (
                <TabsTrigger key={s.category} value={s.category} className="text-xs font-bold uppercase tracking-wide">
                  <s.icon className="w-3.5 h-3.5 mr-1" />
                  {s.title}
                </TabsTrigger>
              ))}
            </TabsList>
            {SECTIONS.map((s) => (
              <TabsContent key={s.category} value={s.category} className="pt-2">
                <Section {...s} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </div>
    </div>
  );
}
