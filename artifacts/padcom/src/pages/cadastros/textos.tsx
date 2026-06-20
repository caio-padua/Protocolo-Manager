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
import { MessageSquareText, CreditCard, Video, Save, Upload, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getCollabToken } from "@/lib/collab-auth";

const SITE_CONTENT_KEY = ["/api/site-content"] as const;

// Upload de vídeo em 2 passos: pede URL assinada (presigned) ao servidor e
// envia o arquivo DIRETO ao Object Storage. Devolve a URL servível para tocar
// na tela do paciente. Exige token de colaborador (rota gateada).
async function uploadVideoFile(file: File): Promise<string> {
  const token = getCollabToken();
  const reqResp = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!reqResp.ok) {
    if (reqResp.status === 401) throw new Error("Faça login de colaborador para enviar vídeo.");
    throw new Error("Falha ao preparar o envio do vídeo.");
  }
  const { uploadURL, objectPath } = (await reqResp.json()) as {
    uploadURL: string;
    objectPath: string;
  };
  const putResp = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putResp.ok) throw new Error("Falha ao enviar o arquivo do vídeo.");
  // objectPath vem como /objects/...; servimos por /api/storage/objects/...
  return `/api/storage${objectPath}`;
}

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
    category: "payment_link",
    title: "Links de Pagamento",
    subtitle: "Cole aqui o link de pagamento de cada braço (concierge, sinal de 25%, estético). Deixe vazio para exibir \"Pagamento em breve\".",
    icon: Link2,
    multiline: false,
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
  const [uploading, setUploading] = useState(false);

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

  // Envia o arquivo e JÁ salva a URL servível no conteúdo (não precisa clicar
  // em Salvar depois do upload — evita perder o vídeo recém-enviado).
  async function enviarArquivo(file: File) {
    if (!file.type.startsWith("video/")) {
      toast.error("Selecione um arquivo de vídeo.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadVideoFile(file);
      setMediaUrl(url);
      await updateMut.mutateAsync({ id: item.id, data: { mediaUrl: url } });
      toast.success("Vídeo enviado e salvo.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio do vídeo.");
    } finally {
      setUploading(false);
    }
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
        <div className="space-y-3">
          <label className="btn-3d flex items-center justify-center gap-2 px-3 py-3 cursor-pointer text-[11px] font-black uppercase tracking-widest text-primary">
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Enviando vídeo...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" /> Enviar vídeo do computador
              </>
            )}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enviarArquivo(f);
                e.target.value = "";
              }}
            />
          </label>
          <div className="concave-3d px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Ou cole um link (YouTube, Vimeo ou Google Drive)
          </div>
          <Input
            placeholder="https://... (link do vídeo)"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            className="field-engraved"
          />
          {mediaUrl.trim() && (
            <video
              src={mediaUrl}
              controls
              className="w-full rounded-md bg-black aspect-video"
            />
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
