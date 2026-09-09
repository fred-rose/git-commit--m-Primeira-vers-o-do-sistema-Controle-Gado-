import { createHash } from 'node:crypto';
import * as XLSX from '../../js/vendor/xlsx.js';
import { normalize } from '../../js/utils.js';
import { validDate } from '../../js/domain.js';

export const CASH_SHEETS = ['Movimentação Financeira - Varia', 'Movimentação Financeira - Apênd'];
const hash = text => createHash('sha256').update(text).digest('hex');
const blank = value => value === null || value === undefined || value === '';

function migrationDate(value) {
  let result;
  if (value instanceof Date) result = value.toISOString().slice(0, 10);
  else if (typeof value === 'number') {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts) result = `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
  } else if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) result = value.slice(0, 10);
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) result = value.split('/').reverse().join('-');
  }
  if (!validDate(result)) throw new Error(`Data inválida na planilha: ${value}`);
  return result;
}

export function inferCategory(description, type) {
  const value = normalize(description);
  if (/^saldo anterior$/.test(value)) return 'Saldo inicial';
  if (type === 'Entrada') return /^venda/.test(value) ? 'Venda de gado' : 'Outras receitas';
  if (/^compra/.test(value)) return 'Compra de gado';
  if (/frete/.test(value)) return 'Transporte';
  if (/vacina|pour on|brucelose/.test(value)) return 'Medicamentos';
  if (/mistura sal|proteinado/.test(value)) return 'Alimentação';
  if (/diesel|^petro /.test(value)) return 'Combustível';
  if (/wi-?fi/.test(value.replaceAll(' ', ''))) return 'Comunicação';
  if (/^luz /.test(value)) return 'Energia elétrica';
  if (/arame|barras roscavel/.test(value)) return 'Manutenção';
  if (/\bdias?\b/.test(value.replace(/(\d)([a-z])/g, '$1 $2'))) return 'Mão de obra';
  if (/imposto/.test(value)) return 'Impostos';
  if (/comissao/.test(value)) return 'Comissões';
  if (/funeraria/.test(value)) return 'Serviços funerários';
  return 'Outros';
}

export function extractFinancialMigration(bytes, createdAt = new Date().toISOString()) {
  const workbook = XLSX.read(bytes, { cellNF: true });
  const workbookHash = hash(bytes);
  const migrationId = `gado-v2-caixa-2026-${workbookHash.slice(0, 12)}`;
  const records = [], sheets = [], precision = [], duplicates = [];
  const seen = new Map();
  for (const name of CASH_SHEETS) {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error(`Aba não encontrada: ${name}`);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true });
    const header = rows[0].map(v => normalize(v ?? '').trim());
    if (JSON.stringify(header) !== JSON.stringify(['data', 'descricao', 'operacao', 'valor', 'valor total'])) throw new Error(`Cabeçalhos inesperados em ${name}. Revise a estrutura antes de migrar.`);
    const info = { name, headerRow: 1, headers: rows[0], imported: 0, emptyRows: 0, incomeCents: 0, expenseCents: 0, originalFinalBalance: null, balanceChecks: [] };
    let running = 0;
    rows.slice(1).forEach((row, index) => {
      const rowNumber = index + 2;
      if (row.every(blank)) { info.emptyRows++; return; }
      const [date, description, operation, amount, balance] = row;
      if (typeof description !== 'string' || !description.trim() || !['Entrada', 'Saída'].includes(operation) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new Error(`Lançamento incompleto em ${name}, linha ${rowNumber}. Nenhum seed foi gerado.`);
      const valueCents = Math.round(amount * 100);
      if (!Number.isSafeInteger(valueCents)) throw new Error(`Valor fora do limite: ${name}, linha ${rowNumber}.`);
      const type = operation === 'Entrada' ? 'Entrada' : 'Despesa';
      const normalizedDate = migrationDate(date);
      const signature = hash(JSON.stringify([normalizedDate, description, type, String(amount)]));
      if (seen.has(signature)) { duplicates.push({ sheet: name, row: rowNumber, matches: seen.get(signature) }); return; }
      seen.set(signature, { sheet: name, row: rowNumber });
      const provenance = {
        migrationId, workbook: 'Controle do Gado V2.xlsx', workbookHash, sheet: name, row: rowNumber,
        originalDate: date instanceof Date ? date.toISOString() : String(date), originalOperation: operation, originalAmount: String(amount),
        originalBalance: blank(balance) ? null : String(balance), originalDescription: description,
      };
      const record = { id: `migration-${hash(`${workbookHash}|${name}|${rowNumber}`).slice(0, 24)}`, date: normalizedDate, type, category: inferCategory(description, type), description, valueCents, ownerId: '', owner: '', property: '', notes: '', source: 'migration', movementId: null, createdAt, provenance };
      records.push(record); info.imported++;
      if (type === 'Entrada') info.incomeCents += valueCents; else info.expenseCents += valueCents;
      running += type === 'Entrada' ? valueCents : -valueCents;
      info.originalFinalBalance = blank(balance) ? null : String(balance);
      if (!blank(balance)) info.balanceChecks.push({ row: rowNumber, computedCents: running, sourceRoundedCents: Math.round(balance * 100), matches: running === Math.round(balance * 100) });
      if (Math.abs(amount - valueCents / 100) > 0.0000001) precision.push({ sheet: name, row: rowNumber, original: String(amount), normalized: (valueCents / 100).toFixed(2), rule: 'Arredondamento para o centavo mais próximo; original preservado.' });
    });
    sheets.push({ ...info, balanceCents: info.incomeCents - info.expenseCents });
  }
  const oldName = 'Movimentação Financeira';
  const oldRows = XLSX.utils.sheet_to_json(workbook.Sheets[oldName], { header: 1, defval: null, blankrows: true });
  const historicalReview = oldRows.slice(1).flatMap((row, i) => row.every(blank) ? [] : [{ sheet: oldName, row: i + 2, owner: row[0], date: row[1], description: row[2], operation: row[3], animal: row[4], quantity: row[5], amount: row[6], observation: row[7], photo: row[8], reason: typeof row[6] === 'number' && row[6] > 0 ? 'Confirmar valor total/unitário e relação com saldo anterior de 2026.' : typeof row[7] === 'number' ? 'Valor vazio; quantia aparece em Observação. Confirmar significado.' : 'Sem valor financeiro confirmado.' }]);
  const incomeCents = sheets.reduce((sum, s) => sum + s.incomeCents, 0);
  const expenseCents = sheets.reduce((sum, s) => sum + s.expenseCents, 0);
  return {
    manifest: { id: migrationId, seedVersion: 2, workbook: 'Controle do Gado V2.xlsx', workbookHash, createdAt, recordCount: records.length, incomeCents, expenseCents, balanceCents: incomeCents - expenseCents, sheets: sheets.map(s => ({ name: s.name, count: s.imported })) },
    records,
    audit: { workbookHash, createdAt, sheets, precision, duplicates, historicalReview, unusedSheets: workbook.SheetNames.filter(n => !CASH_SHEETS.includes(n)).map(name => ({ name, reason: name === oldName ? 'Revisão de significado dos valores e conciliação entre períodos pendentes.' : name === 'Parâmetros' ? 'Parâmetros, rateios e cálculos sem data e sem operação inequívoca; risco de contar valores já registrados.' : 'Não contém um livro de lançamentos financeiros.' })) },
  };
}
