'use strict';

/**
 * Aacharya XLSX Safe Writer
 * -------------------------
 * Dependency-free OOXML writer used by Tuition Manager V5.3.
 *
 * Compatibility goals:
 * - Standards-correct worksheet element ordering (important for Excel / Google Sheets)
 * - Shared strings rather than ad-hoc inline strings
 * - Valid ZIP/DOS timestamps and DEFLATE compression
 * - Theme + styles relationships
 * - XML-invalid control-character removal
 * - Excel 32,767 character cell-text limit
 * - ZIP CRC validation and a built-in package validator used by npm test
 */

const fs = require('fs');
const zlib = require('zlib');

function book_new() { return { SheetNames: [], Sheets: {} }; }
function aoa_to_sheet(rows) { return { __rows: Array.isArray(rows) ? rows : [] }; }
function json_to_sheet(data) {
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return aoa_to_sheet([]);
  const headers = [];
  for (const r of rows) for (const k of Object.keys(r || {})) if (!headers.includes(k)) headers.push(k);
  return aoa_to_sheet([headers, ...rows.map(r => headers.map(h => r?.[h] ?? ''))]);
}
function safeSheetName(name) {
  let n = cleanText(name || 'Sheet', 31).replace(/[\\/?*\[\]:]/g, '_').trim();
  if (!n) n = 'Sheet';
  return n;
}
function book_append_sheet(wb, ws, name) {
  let n = safeSheetName(name);
  const base = n;
  let i = 2;
  while (wb.Sheets[n]) n = (base.slice(0, 27) + '_' + i++).slice(0, 31);
  wb.SheetNames.push(n);
  wb.Sheets[n] = ws;
}

// XML 1.0 allows TAB, LF and CR, but not the other C0 control characters.
function cleanText(value, maxLen = 32767) {
  let s = String(value ?? '');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}
function xesc(value) {
  return cleanText(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}
function xmlUnescape(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function colName(n) {
  let s = '';
  for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}
function rangeEnd(rows) {
  let max = 1;
  for (const r of rows) max = Math.max(max, Array.isArray(r) ? r.length : 0);
  return `${colName(max - 1)}${Math.max(1, rows.length)}`;
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n >>> 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(d = new Date()) {
  const year = Math.max(1980, Math.min(2107, d.getFullYear()));
  const month = Math.max(1, Math.min(12, d.getMonth() + 1));
  const day = Math.max(1, Math.min(31, d.getDate()));
  const hour = Math.max(0, Math.min(23, d.getHours()));
  const minute = Math.max(0, Math.min(59, d.getMinutes()));
  const second = Math.max(0, Math.min(59, d.getSeconds()));
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hour << 11) | (minute << 5) | Math.floor(second / 2)
  };
}

// Conventional DEFLATE ZIP writer. Files are small enough that Zip64 is unnecessary.
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const stamp = dosDateTime();
  const utf8Flag = 0x0800;
  const method = 8; // DEFLATE

  for (const [name, raw] of entries) {
    const nb = Buffer.from(String(name), 'utf8');
    const db = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8');
    const compressed = zlib.deflateRawSync(db, { level: 6 });
    const crc = crc32(db);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(utf8Flag), u16(method), u16(stamp.time), u16(stamp.date),
      u32(crc), u32(compressed.length), u32(db.length), u16(nb.length), u16(0), nb, compressed
    ]);
    locals.push(local);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(utf8Flag), u16(method), u16(stamp.time), u16(stamp.date),
      u32(crc), u32(compressed.length), u32(db.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nb
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const body = Buffer.concat(locals);
  const cd = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(body.length), u16(0)
  ]);
  return Buffer.concat([body, cd, end]);
}

const STYLE_IDS = {
  normal: 0, title: 1, subtitle: 2, meta: 3, header: 4, text: 5, textAlt: 6, number: 7, numberAlt: 8,
  currency: 9, currencyAlt: 10, percent: 11, percentAlt: 12, section: 13, kpiLabel: 14, kpiValue: 15,
  good: 16, warn: 17, bad: 18, total: 19, totalCurrency: 20, note: 21, softHeader: 22, integer: 23, integerAlt: 24
};
const ALT_STYLE = { text: 'textAlt', number: 'numberAlt', currency: 'currencyAlt', percent: 'percentAlt', integer: 'integerAlt' };

function stylesXml() {
  // Literal rupee symbol is quoted inside the Excel custom number format for maximum compatibility.
  const inrFmt = xesc('"₹"#,##0.00;[Red]-"₹"#,##0.00');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="${inrFmt}"/>
    <numFmt numFmtId="165" formatCode="0.0%"/>
    <numFmt numFmtId="166" formatCode="0.00"/>
  </numFmts>
  <fonts count="8">
    <font><sz val="10"/><name val="Calibri"/><family val="2"/><scheme val="minor"/><color rgb="FF1F2937"/></font>
    <font><b/><sz val="18"/><name val="Calibri"/><family val="2"/><scheme val="minor"/><color rgb="FFFFFFFF"/></font>
    <font><i/><sz val="10"/><name val="Calibri"/><family val="2"/><scheme val="minor"/><color rgb="FFDCE6F1"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><family val="2"/><scheme val="minor"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><family val="2"/><scheme val="minor"/><color rgb="FF1F2937"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/><family val="2"/><scheme val="minor"/><color rgb="FF17365D"/></font>
    <font><i/><sz val="9"/><name val="Calibri"/><family val="2"/><scheme val="minor"/><color rgb="FF64748B"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/><color rgb="FFFFFFFF"/></font>
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
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function themeXml() {
  // Small conventional Office-compatible theme. All worksheet styles use explicit RGB colors.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Aacharya">
<a:themeElements>
<a:clrScheme name="Aacharya">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="17365D"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2>
<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="C8202F"/></a:accent2><a:accent3><a:srgbClr val="70AD47"/></a:accent3>
<a:accent4><a:srgbClr val="5B9BD5"/></a:accent4><a:accent5><a:srgbClr val="8064A2"/></a:accent5><a:accent6><a:srgbClr val="ED7D31"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements></a:theme>`;
}

function tokenId(token) { return STYLE_IDS[token] ?? STYLE_IDS.normal; }
function styleForCell(ws, ri, ci, v) {
  const rowNo = ri + 1;
  const ref = colName(ci) + rowNo;
  let token = ws['!colStyles']?.[ci] || 'text';
  if (ws['!alternateRows'] && rowNo >= (ws['!dataStartRow'] || 1) && ((rowNo - (ws['!dataStartRow'] || 1)) % 2 === 1)) token = ALT_STYLE[token] || token;
  if (ws['!valueStyles']?.[ci] && Object.prototype.hasOwnProperty.call(ws['!valueStyles'][ci], String(v))) token = ws['!valueStyles'][ci][String(v)];
  if (ws['!rowStyles']?.[rowNo]) token = ws['!rowStyles'][rowNo];
  if (ws['!cellStyles']?.[ref]) token = ws['!cellStyles'][ref];
  return tokenId(token);
}

function collectSharedStrings(sheets) {
  const map = new Map();
  const list = [];
  let count = 0;
  const add = value => {
    const s = cleanText(value);
    count++;
    if (!map.has(s)) { map.set(s, list.length); list.push(s); }
  };
  for (const [, ws] of sheets) {
    for (const row of ws.__rows || []) {
      for (const v of row || []) {
        if (v == null || v === '') continue;
        if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.f === 'string') continue;
        if (typeof v === 'number' || typeof v === 'boolean') continue;
        add(v);
      }
    }
  }
  return { map, list, count };
}
function sharedStringsXml(shared) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.count}" uniqueCount="${shared.list.length}">${shared.list.map(s => `<si><t xml:space="preserve">${xesc(s)}</t></si>`).join('')}</sst>`;
}

function cellXml(ws, ri, ci, v, shared) {
  const ref = colName(ci) + (ri + 1);
  const s = styleForCell(ws, ri, ci, v);
  const sa = s ? ` s="${s}"` : '';

  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.f === 'string') {
    const formula = xesc(cleanText(v.f, 8192));
    const cached = v.v;
    if (typeof cached === 'number' && Number.isFinite(cached)) return `<c r="${ref}"${sa}><f>${formula}</f><v>${cached}</v></c>`;
    if (typeof cached === 'boolean') return `<c r="${ref}"${sa} t="b"><f>${formula}</f><v>${cached ? 1 : 0}</v></c>`;
    return `<c r="${ref}"${sa}><f>${formula}</f></c>`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${sa} t="n"><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}"${sa} t="b"><v>${v ? 1 : 0}</v></c>`;
  if (v == null || v === '') return `<c r="${ref}"${sa}/>`;

  const text = cleanText(v);
  const idx = shared.map.get(text);
  if (idx == null) return `<c r="${ref}"${sa}/>`;
  return `<c r="${ref}"${sa} t="s"><v>${idx}</v></c>`;
}

function sheetXml(ws, shared) {
  const rows = ws.__rows || [];
  const last = rangeEnd(rows);
  const widths = (ws['!cols'] || []).map((x, i) => x?.wch ? `<col min="${i + 1}" max="${i + 1}" width="${Math.max(1, Math.min(255, Number(x.wch)))}" customWidth="1"/>` : '').join('');
  const rawTab = String(ws['!tabColor'] || '4472C4').replace(/^#/, '').toUpperCase();
  const tabColor = /^[0-9A-F]{6}$/.test(rawTab) ? rawTab : '4472C4';
  const freeze = ws['!freeze'] || null;
  let view = `<sheetView workbookViewId="0" showGridLines="${ws['!showGridLines'] === true ? 1 : 0}">`;
  if (freeze && (freeze.rows || freeze.cols)) {
    const attrs = [];
    if (freeze.cols) attrs.push(`xSplit="${Math.max(0, Number(freeze.cols) || 0)}"`);
    if (freeze.rows) attrs.push(`ySplit="${Math.max(0, Number(freeze.rows) || 0)}"`);
    const pane = (freeze.rows && freeze.cols) ? 'bottomRight' : freeze.rows ? 'bottomLeft' : 'topRight';
    attrs.push(`topLeftCell="${colName(Math.max(0, Number(freeze.cols) || 0))}${Math.max(0, Number(freeze.rows) || 0) + 1}"`, `activePane="${pane}"`, 'state="frozen"');
    view += `<pane ${attrs.join(' ')}/>`;
  }
  view += '</sheetView>';

  let out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><tabColor rgb="FF${tabColor}"/></sheetPr><dimension ref="A1:${last}"/><sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="18"/>${widths ? `<cols>${widths}</cols>` : ''}<sheetData>`;
  rows.forEach((row, ri) => {
    const h = ws['!rowHeights']?.[ri + 1];
    out += `<row r="${ri + 1}"${h ? ` ht="${Math.max(1, Number(h))}" customHeight="1"` : ''}>`;
    const safeRow = Array.isArray(row) ? row : [];
    for (let ci = 0; ci < safeRow.length; ci++) out += cellXml(ws, ri, ci, safeRow[ci], shared);
    out += '</row>';
  });
  out += '</sheetData>';

  // IMPORTANT: OOXML schema order requires autoFilter BEFORE mergeCells.
  if (ws['!autofilter']) out += `<autoFilter ref="${xesc(ws['!autofilter'])}"/>`;
  const merges = Array.isArray(ws['!merges']) ? ws['!merges'] : [];
  if (merges.length) out += `<mergeCells count="${merges.length}">${merges.map(r => `<mergeCell ref="${xesc(r)}"/>`).join('')}</mergeCells>`;

  out += '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
  return out;
}

function writeFile(wb, file) {
  const sheets = wb.SheetNames.map(n => [n, wb.Sheets[n]]);
  const shared = collectSharedStrings(sheets);
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr defaultThemeVersion="166925"/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xesc(s[0])}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1"/></workbook>`;
  const styleRid = sheets.length + 1;
  const themeRid = sheets.length + 2;
  const stringsRid = sheets.length + 3;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${styleRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${themeRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId${stringsRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;

  const entries = [
    ['[Content_Types].xml', types],
    ['_rels/.rels', rels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/styles.xml', stylesXml()],
    ['xl/theme/theme1.xml', themeXml()],
    ['xl/sharedStrings.xml', sharedStringsXml(shared)],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s[1], shared)])
  ];
  fs.writeFileSync(file, zip(entries));
}

// Minimal ZIP reader + validator used by npm test. This does not "repair" files;
// it confirms CRC/size, package parts, sheet relationships and worksheet element order.
function readZipEntries(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = Math.max(0, buf.length - 65557); i <= buf.length - 4; i++) {
    if (buf.readUInt32LE(i) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record not found');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Invalid ZIP central-directory header');
    const method = buf.readUInt16LE(p + 10);
    const expectedCrc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP header: ${name}`);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? zlib.inflateRawSync(compressed) : method === 0 ? compressed : (() => { throw new Error(`Unsupported ZIP method ${method}`); })();
    if (data.length !== uncompSize) throw new Error(`ZIP size mismatch: ${name}`);
    if (crc32(data) !== expectedCrc) throw new Error(`ZIP CRC mismatch: ${name}`);
    out.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
function validateFile(file, expectedSheets = null, requiredStrings = []) {
  const entries = readZipEntries(file);
  const required = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/theme/theme1.xml', 'xl/sharedStrings.xml'];
  for (const name of required) if (!entries.has(name)) throw new Error(`Missing XLSX package part: ${name}`);

  const workbook = entries.get('xl/workbook.xml').toString('utf8');
  const names = [...workbook.matchAll(/<sheet\s+name="([^"]+)"/g)].map(m => xmlUnescape(m[1]));
  if (!names.length) throw new Error('Workbook has no worksheets');
  if (expectedSheets && names.length !== expectedSheets) throw new Error(`Expected ${expectedSheets} worksheets, found ${names.length}`);
  if (new Set(names).size !== names.length) throw new Error('Duplicate worksheet names');

  const sharedXml = entries.get('xl/sharedStrings.xml').toString('utf8');
  for (const needle of requiredStrings || []) if (!sharedXml.includes(xesc(needle))) throw new Error(`Required workbook text missing from shared strings: ${needle}`);

  for (let i = 1; i <= names.length; i++) {
    const part = `xl/worksheets/sheet${i}.xml`;
    const data = entries.get(part);
    if (!data) throw new Error(`Missing worksheet part: ${part}`);
    const xml = data.toString('utf8');
    if (!xml.includes('<worksheet ') || !xml.includes('<sheetData>') || !xml.includes('</worksheet>')) throw new Error(`Malformed worksheet wrapper: ${part}`);
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml)) throw new Error(`Illegal XML control character: ${part}`);
    const auto = xml.indexOf('<autoFilter');
    const merges = xml.indexOf('<mergeCells');
    if (auto >= 0 && merges >= 0 && auto > merges) throw new Error(`OOXML element order invalid in ${part}: autoFilter must precede mergeCells`);
  }
  return { ok: true, sheets: names, entries: entries.size, bytes: fs.statSync(file).size };
}

module.exports = {
  utils: { book_new, aoa_to_sheet, json_to_sheet, book_append_sheet },
  writeFile,
  validateFile,
  STYLE_IDS
};
