import { describe, expect, it } from "vitest";
import { lerIcs, chaveEvento } from "../lib/ics-parser";

const ICS = [
  "BEGIN:VCALENDAR",
  "X-WR-CALNAME:AGENDA TESTE",
  "BEGIN:VTIMEZONE",
  "TZID:America/Sao_Paulo",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "UID:abc@google.com",
  "DTSTART:20260710T130000Z",
  "DTEND:20260710T140000Z",
  "SUMMARY:Dentista\\, Dr. Caio",
  "DESCRIPTION:linha 1\\nlinha 2 muito longa que",
  "  continua dobrada",
  "BEGIN:VALARM",
  "TRIGGER:-PT10M",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:dia@google.com",
  "DTSTART;VALUE=DATE:20260711",
  "DTEND;VALUE=DATE:20260712",
  "RRULE:FREQ=WEEKLY",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:tz@google.com",
  "DTSTART;TZID=America/Sao_Paulo:20260712T090000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:tzruim@google.com",
  "DTSTART;TZID=Asia/Tokyo:20260712T090000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:sem uid",
  "DTSTART:20260712T090000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("ics-parser", () => {
  const r = lerIcs(ICS);
  it("ignora o DTSTART 1970 do bloco de fuso", () => {
    expect(r.eventos.map((e) => e.uid)).toEqual(["abc@google.com", "dia@google.com", "tz@google.com"]);
  });
  it("le titulo escapado, descricao dobrada e alarme interno", () => {
    const e = r.eventos[0];
    expect(e.titulo).toBe("Dentista, Dr. Caio");
    expect(e.descricao).toBe("linha 1\nlinha 2 muito longa que continua dobrada");
    expect(e.inicio.toISOString()).toBe("2026-07-10T13:00:00.000Z");
  });
  it("dia inteiro ancora em Brasilia, recorrencia sem expandir, cancelado", () => {
    const e = r.eventos[1];
    expect(e.diaInteiro).toBe(true);
    expect(e.inicio.toISOString()).toBe("2026-07-11T03:00:00.000Z");
    expect(e.recorrencia).toBe("FREQ=WEEKLY");
    expect(e.status).toBe("cancelado");
  });
  it("TZID de Sao Paulo vira -03:00", () => {
    expect(r.eventos[2].inicio.toISOString()).toBe("2026-07-12T12:00:00.000Z");
  });
  it("fuso desconhecido e evento sem UID vao para ignorados com motivo", () => {
    expect(r.ignorados).toHaveLength(2);
    expect(r.ignorados[0].motivo).toContain("Asia/Tokyo");
  });
  it("chave inclui recurrence-id", () => {
    expect(chaveEvento({ uid: "u", recurrenceId: null })).toBe("u|");
    expect(chaveEvento({ uid: "u", recurrenceId: "20260101" })).toBe("u|20260101");
  });
});
