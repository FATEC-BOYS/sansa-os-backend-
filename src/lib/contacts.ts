import { z } from "zod";

// Apenas contatos comerciais cadastrados manualmente pela operadora.
// Em branco significa exclusão do campo; campos omitidos permanecem inalterados.
const optionalContact = z.union([z.string().trim().max(254), z.null()]).optional();

export const contactsInput = z.object({
  email: optionalContact,
  whatsapp: optionalContact
}).strict().refine(v=>Object.prototype.hasOwnProperty.call(v,"email") || Object.prototype.hasOwnProperty.call(v,"whatsapp"),{
  message:"Informe pelo menos um campo a atualizar"
});

export function normalizeEmail(input: string|null|undefined): string|null|undefined {
  if(input==null) return input;
  if(!input) return null;
  const result=z.string().trim().email().max(254).safeParse(input);
  if(!result.success) throw new Error("INVALID_EMAIL");
  // Local-part can be case-sensitive; retain original casing as supplied.
  return result.data;
}

export function normalizeBrazilianWhatsApp(input: string|null|undefined):string|null|undefined {
  if(input==null)return input;
  if(!input.trim())return null;
  // Apenas números brasileiros: DDD + 8/9 dígitos, com DDI opcional.
  if(!/^[+\d\s().-]+$/.test(input))throw new Error("INVALID_WHATSAPP");
  let digits=input.replace(/\D/g,"");
  if(digits.startsWith("55") && (digits.length===12||digits.length===13)){
    digits=digits.slice(2);
  }
  if(!/^[1-9]\d{1}[2-9]\d{7,8}$/.test(digits))throw new Error("INVALID_WHATSAPP");
  return "+55"+digits;
}

export function validateContacts(input:unknown):{contactEmail?:string|null;contactWhatsapp?:string|null}{
  const parsed=contactsInput.parse(input);
  const result:{contactEmail?:string|null;contactWhatsapp?:string|null}={};
  if(Object.prototype.hasOwnProperty.call(parsed,"email"))result.contactEmail=normalizeEmail(parsed.email);
  if(Object.prototype.hasOwnProperty.call(parsed,"whatsapp"))result.contactWhatsapp=normalizeBrazilianWhatsApp(parsed.whatsapp);
  return result;
}
