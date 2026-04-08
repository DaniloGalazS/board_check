import * as XLSX from 'xlsx';
import type { BoinvRow, ProdStdRow, ItemppRow } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function getSheet(file: File): Promise<XLSX.WorkSheet> {
  return readFile(file).then((buf) => {
    const wb = XLSX.read(buf, { type: 'array' });
    return wb.Sheets[wb.SheetNames[0]];
  });
}

/**
 * Returns raw rows as string-keyed objects, all values coerced to strings.
 * Handles Excel files where the header row is not the first row (skips
 * summary/internal rows at the top by scanning for a row containing
 * a known header keyword).
 */
function sheetToRaw(sheet: XLSX.WorkSheet): Record<string, string>[] {
  const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  // Find the header row: look for markers that appear in the human-readable header row
  // but NOT in the internal field name row (e.g. "ITEMGROUPID", "ITEMVARIANTE", etc.)
  const HEADER_MARKERS = ['article group', 'stock age', 'valuated', 'nominal good', 'grammage', 'grain']
  let headerRowIdx = -1
  for (let i = 0; i < allRows.length; i++) {
    const rowStr = allRows[i].join('|').toLowerCase()
    if (HEADER_MARKERS.some((m) => rowStr.includes(m))) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    // Fall back to default behaviour (first row as header)
    return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: '' })
  }

  const headers = allRows[headerRowIdx] as string[]
  const dataRows = allRows.slice(headerRowIdx + 1)

  return dataRows
    .filter((row) => (row as string[]).some((v) => v !== ''))
    .map((row) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => {
        if (h) obj[h.trim()] = String((row as string[])[i] ?? '').trim()
      })
      return obj
    })
}

function str(val: unknown): string {
  return String(val ?? '').trim();
}

function num(val: unknown): number {
  // Commas are thousands separators (e.g. "1,745.75" → 1745.75)
  const n = parseFloat(String(val ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * Find the value of a key in a row using case-insensitive partial matching.
 * This handles variations in column headers between file versions.
 */
function findKey(row: Record<string, string>, pattern: RegExp): string {
  for (const key of Object.keys(row)) {
    if (pattern.test(key.trim())) {
      return str(row[key]);
    }
  }
  return '';
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

export async function parseBoinv(file: File): Promise<BoinvRow[]> {
  const sheet = await getSheet(file);
  const raw = sheetToRaw(sheet);

  return raw
    .filter((r) => findKey(r, /article.*(no|num|#)/i) || findKey(r, /article.*group/i))
    .map((r) => ({
      articleGroup: findKey(r, /article.*group/i),
      articleNo: findKey(r, /article.*no\.?$/i) || findKey(r, /^article no/i),
      description: findKey(r, /article.*desc/i),
      variant: findKey(r, /^variant$/i),
      stockAge: num(findKey(r, /stock.*age/i)),
      batchNo: findKey(r, /batch.*no/i),
      quantity: num(findKey(r, /quantity/i)),
      stockUnit: findKey(r, /^stock.{0,5}unit/i),
      valuatedAmount: num(findKey(r, /valuated.*amount/i)),
      millCurrency: findKey(r, /mill.*currency/i),
    }))
    .filter((r) => r.articleNo !== '');
}

export async function parseProdStd(file: File): Promise<ProdStdRow[]> {
  const sheet = await getSheet(file);
  const raw = sheetToRaw(sheet);

  return raw
    .filter((r) => findKey(r, /jobref/i) || findKey(r, /article.*no/i))
    .map((r) => ({
      jobRef: findKey(r, /jobref/i),
      articleNo: findKey(r, /article.*no\.?$/i) || findKey(r, /^article no/i),
      variant: findKey(r, /^variant$/i),
      description: findKey(r, /article.*desc/i),
      articleIn: findKey(r, /article.*in/i),
      kunde: findKey(r, /kunde/i),
      lanes: num(findKey(r, /lanes/i)),
      nominalGoodQty: num(findKey(r, /nominal.*good.*qty/i)),
      productionTime: num(findKey(r, /production.*time/i)),
    }))
    .filter((r) => r.articleNo !== '' && r.articleIn !== '');
}

export async function parseItempp(file: File): Promise<ItemppRow[]> {
  const sheet = await getSheet(file);
  const raw = sheetToRaw(sheet);

  return raw
    .filter((r) => findKey(r, /article.*no/i))
    .map((r) => ({
      articleNo: findKey(r, /article.*no\.?$/i) || findKey(r, /^article no/i),
      variant: findKey(r, /^variant$/i),
      grainDirection: findKey(r, /grain/i) || findKey(r, /496/i),
    }))
    .filter((r) => r.articleNo !== '');
}
