'use strict';
const fs = require('fs');

function book_new(){return{SheetNames:[],Sheets:{}}}
function aoa_to_sheet(rows){return{__rows:Array.isArray(rows)?rows:[]}}
function json_to_sheet(data){
  const rows=Array.isArray(data)?data:[];
  if(!rows.length)return aoa_to_sheet([]);
  const headers=[];
  for(const r of rows)for(const k of Object.keys(r||{}))if(!headers.includes(k))headers.push(k);
  return aoa_to_sheet([headers,...rows.map(r=>headers.map(h=>r?.[h]??''))]);
}
function book_append_sheet(wb,ws,name){
  let n=String(name||'Sheet').slice(0,31).replace(/[\\/?*\[\]:]/g,'_');
  if(!n)n='Sheet';let base=n,i=2;
  while(wb.Sheets[n])n=(base.slice(0,28)+'_'+i++).slice(0,31);
  wb.SheetNames.push(n);wb.Sheets[n]=ws;
}
function xesc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]))}
function colName(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function rangeEnd(rows){let max=1;for(const r of rows)max=Math.max(max,Array.isArray(r)?r.length:0);return `${colName(max-1)}${Math.max(1,rows.length)}`}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n>>>0);return b}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b}
let crcTable=null;
function crc32(buf){
  if(!crcTable){crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}}
  let c=0xffffffff;for(const x of buf)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;
}
function zip(entries){
  const locals=[],centrals=[];let offset=0;
  for(const [name,text] of entries){
    const nb=Buffer.from(name),db=Buffer.isBuffer(text)?text:Buffer.from(text),crc=crc32(db);
    const local=Buffer.concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(db.length),u32(db.length),u16(nb.length),u16(0),nb,db]);
    locals.push(local);
    const central=Buffer.concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(db.length),u32(db.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb]);
    centrals.push(central);offset+=local.length;
  }
  const body=Buffer.concat(locals),cd=Buffer.concat(centrals),end=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(cd.length),u32(body.length),u16(0)]);
  return Buffer.concat([body,cd,end]);
}

const STYLE_IDS={
  normal:0,title:1,subtitle:2,meta:3,header:4,text:5,textAlt:6,number:7,numberAlt:8,
  currency:9,currencyAlt:10,percent:11,percentAlt:12,section:13,kpiLabel:14,kpiValue:15,
  good:16,warn:17,bad:18,total:19,totalCurrency:20,note:21,softHeader:22,integer:23,integerAlt:24
};
const ALT_STYLE={text:'textAlt',number:'numberAlt',currency:'currencyAlt',percent:'percentAlt',integer:'integerAlt'};

function stylesXml(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="₹#,##0.00;[Red]-₹#,##0.00"/>
    <numFmt numFmtId="165" formatCode="0.0%"/>
    <numFmt numFmtId="166" formatCode="0.00"/>
  </numFmts>
  <fonts count="8">
    <font><sz val="10"/><name val="Calibri"/><color rgb="FF1F2937"/></font>
    <font><b/><sz val="18"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><i/><sz val="10"/><name val="Calibri"/><color rgb="FFDCE6F1"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF1F2937"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/><color rgb="FF17365D"/></font>
    <font><i/><sz val="9"/><name val="Calibri"/><color rgb="FF64748B"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
  </fonts>
  <fills count="11">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="25">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="6" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="166" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="165" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="0" fontId="7" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="7" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="1" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function tokenId(token){return STYLE_IDS[token]??STYLE_IDS.normal}
function styleForCell(ws,ri,ci,v){
  const rowNo=ri+1,ref=colName(ci)+rowNo;
  let token=ws['!colStyles']?.[ci]||'text';
  if(ws['!alternateRows']&&rowNo>=(ws['!dataStartRow']||1)&&((rowNo-(ws['!dataStartRow']||1))%2===1))token=ALT_STYLE[token]||token;
  if(ws['!valueStyles']?.[ci]&&Object.prototype.hasOwnProperty.call(ws['!valueStyles'][ci],String(v)))token=ws['!valueStyles'][ci][String(v)];
  if(ws['!rowStyles']?.[rowNo])token=ws['!rowStyles'][rowNo];
  if(ws['!cellStyles']?.[ref])token=ws['!cellStyles'][ref];
  return tokenId(token);
}
function cellXml(ws,ri,ci,v){
  const ref=colName(ci)+(ri+1),s=styleForCell(ws,ri,ci,v),sa=s?` s="${s}"`:'';
  if(v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.f==='string'){
    const cached=v.v;
    return `<c r="${ref}"${sa}><f>${xesc(v.f)}</f>${cached==null?'':`<v>${Number.isFinite(Number(cached))?Number(cached):0}</v>`}</c>`;
  }
  if(typeof v==='number'&&Number.isFinite(v))return `<c r="${ref}"${sa}><v>${v}</v></c>`;
  if(typeof v==='boolean')return `<c r="${ref}"${sa} t="b"><v>${v?1:0}</v></c>`;
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
}
function sheetXml(ws){
  const rows=ws.__rows||[],last=rangeEnd(rows);
  const widths=(ws['!cols']||[]).map((x,i)=>x?.wch?`<col min="${i+1}" max="${i+1}" width="${Math.max(1,Number(x.wch))}" customWidth="1"/>`:'').join('');
  const tabColor=String(ws['!tabColor']||'4472C4').replace(/^#/,'').toUpperCase();
  const freeze=ws['!freeze']||null;
  let view=`<sheetView workbookViewId="0" showGridLines="${ws['!showGridLines']===true?1:0}">`;
  if(freeze&&(freeze.rows||freeze.cols)){
    const attrs=[];if(freeze.cols)attrs.push(`xSplit="${freeze.cols}"`);if(freeze.rows)attrs.push(`ySplit="${freeze.rows}"`);
    const pane=(freeze.rows&&freeze.cols)?'bottomRight':freeze.rows?'bottomLeft':'topRight';
    attrs.push(`topLeftCell="${colName(freeze.cols||0)}${(freeze.rows||0)+1}"`,`activePane="${pane}"`,'state="frozen"');
    view+=`<pane ${attrs.join(' ')}/>`;
  }
  view+='</sheetView>';
  let out=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><tabColor rgb="FF${tabColor}"/></sheetPr><dimension ref="A1:${last}"/><sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="18"/>${widths?`<cols>${widths}</cols>`:''}<sheetData>`;
  rows.forEach((row,ri)=>{
    const h=ws['!rowHeights']?.[ri+1];out+=`<row r="${ri+1}"${h?` ht="${Number(h)}" customHeight="1"`:''}>`;
    for(let ci=0;ci<row.length;ci++)out+=cellXml(ws,ri,ci,row[ci]);
    out+='</row>';
  });
  out+='</sheetData>';
  const merges=Array.isArray(ws['!merges'])?ws['!merges']:[];
  if(merges.length)out+=`<mergeCells count="${merges.length}">${merges.map(r=>`<mergeCell ref="${xesc(r)}"/>`).join('')}</mergeCells>`;
  if(ws['!autofilter'])out+=`<autoFilter ref="${xesc(ws['!autofilter'])}"/>`;
  out+='<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
  return out;
}

function writeFile(wb,file){
  const sheets=wb.SheetNames.map(n=>[n,wb.Sheets[n]]);
  const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'+sheets.map((s,i)=>`<sheet name="${xesc(s[0])}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets><calcPr calcId="191029" calcMode="auto"/></workbook>';
  const wbRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const entries=[['[Content_Types].xml',types],['_rels/.rels',rels],['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',wbRels],['xl/styles.xml',stylesXml()],...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,sheetXml(s[1])])];
  fs.writeFileSync(file,zip(entries));
}
module.exports={utils:{book_new,aoa_to_sheet,json_to_sheet,book_append_sheet},writeFile,STYLE_IDS};
