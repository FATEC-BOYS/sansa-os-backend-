import { z } from "zod";

export const SearchInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radius: z.number().int().min(300).max(3000).default(1200),
  category: z.enum(["all","retail","food","beauty"]).default("all")
});

export const CandidateInput = z.object({
  sourceKey: z.string().regex(/^osm:(node|way|relation):[1-9]\d*$/),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  website: z.string().url().max(500).nullable().optional(),
  socialListed: z.boolean(),
  priorityScore: z.number().int().min(0).max(100),
  evidence: z.array(z.string().max(240)).max(6)
});

export type Candidate = z.infer<typeof CandidateInput> & {alreadyInCrm?: boolean;alreadyShortlisted?: boolean;confidence:"low"|"medium"};
type OsmItem = {
  type?: "node" | "way" | "relation"; id?: number; lat?:number;lon?:number;
  center?: {lat?:number;lon?:number}; tags?:Record<string,string>;
};

export function safeWebsite(value: string | undefined): string | null {
  if (!value || value.length > 500) return null;
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : "https://" + value;
    const url = new URL(withScheme);
    if (!["https:","http:"].includes(url.protocol)) return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url.href;
  } catch {return null;}
}

export function categoryOf(tags: Record<string,string>): string {
  const tag = tags.shop ?? tags.amenity ?? "comércio";
  const names:Record<string,string> = {
    beauty:"Beleza", hairdresser:"Salão de beleza", clothes:"Moda", shoes:"Calçados",
    bakery:"Padaria", restaurant:"Restaurante", cafe:"Cafeteria", fast_food:"Alimentação",
    bar:"Bar", jewelry:"Joalheria", florist:"Floricultura", cosmetics:"Cosméticos",
    pet:"Pet shop", books:"Livraria", gift:"Presentes", furniture:"Móveis", optician:"Ótica"
  };
  return names[tag] ?? tag.replaceAll("_"," ");
}
export function scoreCandidate(tags:Record<string,string>) {
  const tag = tags.shop ?? tags.amenity ?? "outro";
  const site = Boolean(safeWebsite(tags.website ?? tags["contact:website"]));
  const social = Boolean(tags["contact:instagram"] || tags.instagram || tags["contact:facebook"] || tags.facebook);
  const visualSegments = new Set(["beauty","hairdresser","clothes","shoes","cosmetics","florist","jewelry","gift","furniture","bakery","restaurant","cafe","fast_food","pet","books","optician"]);
  const evidence = ["Estabelecimento e segmento encontrados no OpenStreetMap."];
  let score = 25;
  if (visualSegments.has(tag)) {score+=25;evidence.push("Segmento tem afinidade inicial com identidade visual, catálogo e conteúdo.");}
  else {score+=12;evidence.push("Categoria comercial com potencial a verificar manualmente.");}
  if (site) {score+=10;evidence.push("URL de site informada no OpenStreetMap; qualidade não verificada.");}
  else {score+=10;evidence.push("Não há URL de site cadastrada no OpenStreetMap (ausência NÃO comprovada).");}
  if (social) {score+=10;evidence.push("Há referência a rede social no OpenStreetMap; conteúdo não analisado.");}
  if (tags["addr:street"]) {score+=5;evidence.push("Endereço parcial cadastrado.");}
  evidence.push("Pontuação mede prioridade de pesquisa, não qualidade do negócio.");
  return {priorityScore:Math.min(score,85),evidence,socialListed:social,website:safeWebsite(tags.website ?? tags["contact:website"])};
}
export function parseOsmElements(input:unknown): Candidate[] {
  const rows = z.object({elements:z.array(z.unknown())}).parse(input).elements;
  const seen = new Set<string>();
  const candidates:Candidate[]=[];
  for(const raw of rows){
    if (!raw || typeof raw!=="object") continue;
    const item=raw as OsmItem;
    if (!item.type || !["node","way","relation"].includes(item.type)||!Number.isSafeInteger(item.id)|| !item.id || !item.tags?.name)continue;
    const lat=item.lat??item.center?.lat, lon=item.lon??item.center?.lon;
    if(typeof lat!=="number"||typeof lon!=="number"||Math.abs(lat)>90||Math.abs(lon)>180)continue;
    const sourceKey=`osm:${item.type}:${item.id}`;
    if(seen.has(sourceKey))continue;
    seen.add(sourceKey);
    const scored=scoreCandidate(item.tags);
    candidates.push({
      sourceKey,name:item.tags.name.slice(0,160),category:categoryOf(item.tags),lat,lon,
      ...scored,confidence:"low"
    });
  }
  return candidates.sort((a,b)=>b.priorityScore-a.priorityScore||a.name.localeCompare(b.name,"pt-BR"));
}

export function buildOverpassQuery(input:z.infer<typeof SearchInput>):string {
  const around=`(around:${input.radius},${input.lat},${input.lon})`;
  const clauses = {
    all: `nwr["shop"]${around};nwr["amenity"~"^(restaurant|cafe|fast_food|bar)$"]${around};`,
    retail: `nwr["shop"]${around};`,
    food: `nwr["shop"="bakery"]${around};nwr["amenity"~"^(restaurant|cafe|fast_food|bar)$"]${around};`,
    beauty: `nwr["shop"~"^(beauty|hairdresser|cosmetics)$"]${around};`
  };
  return `[out:json][timeout:20];(${clauses[input.category]});out center 180;`;
}

let lastExternalSearch = 0;
let searchInProgress=false;
export async function searchOsm(input:z.infer<typeof SearchInput>) {
  if (searchInProgress || Date.now()-lastExternalSearch<60_000) {
    throw new Error("RATE_LIMIT");
  }
  lastExternalSearch=Date.now();
  searchInProgress=true;
  try {
    const endpoint=process.env.OVERPASS_ENDPOINT||"https://overpass-api.de/api/interpreter";
    // Fixed endpoint from server environment, not user-controlled.
    const body=new URLSearchParams({data:buildOverpassQuery(input)});
    const response=await fetch(endpoint,{
      method:"POST",body,signal:AbortSignal.timeout(24_000),
      headers:{"User-Agent":process.env.OVERPASS_USER_AGENT||"SANSA-OS/0.2 (https://sansadigital.com.br)","Accept":"application/json"}
    });
    if(!response.ok)throw new Error(`Overpass HTTP ${response.status}`);
    const text=await response.text();
    if(text.length>2_000_000)throw new Error("Overpass payload too large");
    return parseOsmElements(JSON.parse(text)).slice(0,70);
  } finally {searchInProgress=false;}
}

export function normalizeName(name:string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"").trim();
}
