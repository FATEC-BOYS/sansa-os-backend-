import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export async function renderProposalPdf(content:string,meta:{number:number;createdAt:Date;approved:boolean}){
  const doc=await PDFDocument.create();
  doc.setTitle(`SANSA | Proposta v${meta.number}`);doc.setLanguage('pt-BR');
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const heading=await doc.embedFont(StandardFonts.TimesRomanBold);
  const clean=(value:string)=>Array.from(value.replace(/\r\n/g,'\n').replace(/\t/g,'  ')).map(c=>{if(c==='\n')return c;try{font.encodeText(c);return c;}catch{return '?';}}).join('');
  let page=doc.addPage([595.28,841.89]);let y=0;
  const addPage=(first=false)=>{
    if(!first)page=doc.addPage([595.28,841.89]);
    page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(.96,.945,.906)});
    page.drawText('SANSA OFICINA DIGITAL',{x:48,y:795,size:11,font,color:rgb(.54,.11,.11)});
    page.drawText(`Proposta comercial / v${meta.number}`,{x:48,y:755,size:26,font:heading,color:rgb(.05,.05,.06)});
    page.drawText(meta.approved?'APROVADA INTERNAMENTE - sem aceite contratual':'RASCUNHO - pendente de aprovação interna',{x:48,y:730,size:10,font,color:rgb(.157,.27,.55)});
    y=700;
  };addPage(true);
  for(const paragraph of clean(content).split('\n')){
    const words=paragraph.split(/\s+/);let line='';const lines:string[]=[];
    for(const word of words){
      // Break long URLs/tokens as well as ordinary text.
      for(const char of (line?' ':'')+word){
        if(font.widthOfTextAtSize(line+char,10)>499){lines.push(line);line='';}
        line+=char;
      }
    }
    lines.push(line);
    for(const text of lines){if(y<76)addPage();page.drawText(text,{x:48,y,size:10,font,color:rgb(.16,.16,.18)});y-=15;}
    y-=4;
  }
  const pages=doc.getPages();pages.forEach((p,i)=>{
    p.drawText(`v${meta.number} | ${meta.createdAt.toISOString().slice(0,10)} | ${i+1}/${pages.length}`,{x:48,y:40,size:9,font,color:rgb(.157,.27,.55)});
  });
  return doc.save();
}
