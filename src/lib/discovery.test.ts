import {test} from "node:test";
import assert from "node:assert/strict";
import {SearchInput,buildOverpassQuery,parseOsmElements,scoreCandidate,normalizeName,safeWebsite} from "./discovery.js";

test("limita buscas ao raio definido, sem injeção de filtro",()=>{
  const options=SearchInput.parse({lat:-23.7080198,lon:-46.5506139,radius:1200,category:"food"});
  const query=buildOverpassQuery(options);
  assert.match(query,/around:1200/);
  assert.match(query,/restaurant/);
  assert.equal(SearchInput.safeParse({lat:-23,lon:-46,radius:50000}).success,false);
});
test("parseia nós, áreas e exclui linhas sem nome",()=>{
  const result=parseOsmElements({elements:[
    {type:"node",id:10,lat:-23.7,lon:-46.55,tags:{name:"Café da Esquina",amenity:"cafe"}},
    {type:"way",id:20,center:{lat:-23.71,lon:-46.56},tags:{name:"Loja Azul",shop:"clothes",website:"https://example.com"}},
    {type:"node",id:30,lat:-23.7,lon:-46.55,tags:{shop:"beauty"}}
  ]});
  assert.equal(result.length,2);
  assert.equal(result.some(x=>x.name==="Loja Azul"&&x.website==="https://example.com/"),true);
});
test("ausência de website no mapa é incerteza, não defeito comprovado",()=>{
  const scored=scoreCandidate({shop:"hairdresser"});
  assert.ok(scored.evidence.join(" ").includes("NÃO comprovada"));
  assert.equal(scored.website,null);
});
test("filtra esquemas e normaliza nomes",()=>{
  assert.equal(safeWebsite("javascript:alert(1)"),null);
  assert.equal(normalizeName("Café & Arte"),normalizeName("Cafe Arte"));
});
