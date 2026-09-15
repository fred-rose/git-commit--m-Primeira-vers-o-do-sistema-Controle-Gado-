import { CATEGORIES, MOVEMENT_TYPES } from '../constants.js';
import { getStock } from '../domain.js';
import { escapeHtml as h, today, toCents, nameOf, number, formatDate, money } from '../utils.js';
import { financeCategories, financeOwnerName, financeSourceLabel } from '../finance.js';
import { openModal } from './modal.js';
import { selectField, inputField, textareaField, dateField, options } from './ui.js';

export function movementForm(repository, id) {
  if (repository.cloud) return import('./cloudMovementForm.js').then(module => module.movementForm(repository,id));
  const data = repository.getData();
  const current = data.movements.find(m => m.id === id);
  const m = current || { type: 'Entrada', category: 'Vacas', date: today(), quantity: '', valueCents: 0 };
  const pastures = data.pastures.filter(p => !p.archived || [m.pastureId, m.destinationId].includes(p.id));
  openModal({
    feedback:{loading:'Salvando…',success:'Movimentação salva'},
    title: id ? 'Editar movimentação' : 'Nova movimentação',
    subtitle: `Controle iniciado em ${formatDate(data.openingDate)}. Quantidades e valores serão atualizados juntos.`,
    content: `<div class="form-grid">${selectField('type', 'O que aconteceu?', MOVEMENT_TYPES, m.type)}${dateField(m.date, data.openingDate)}${selectField('category', 'Categoria', CATEGORIES, m.category)}${inputField('quantity', 'Quantidade de animais', m.quantity, 'number', 'required min="1" step="1" inputmode="numeric"')}${selectField('ownerId', 'Proprietário', data.owners, m.ownerId, 'Selecione')}${selectField('pastureId', 'Pasto / origem', pastures, m.pastureId, 'Selecione')}<div id="destination-field">${selectField('destinationId', 'Pasto de destino', pastures, m.destinationId, 'Selecione')}</div><div id="value-field">${inputField('value', 'Valor total (R$)', m.valueCents ? (m.valueCents / 100).toFixed(2) : '', 'text', 'inputmode="decimal" placeholder="Ex.: 40000,00"')}</div><p class="form-hint full-width" id="stock-hint" aria-live="polite"></p><p class="form-hint full-width" id="money-hint"></p>${textareaField('note', 'Observação (opcional)', m.note)}</div>`,
    setup(form) {
      const refresh = () => {
        const values = Object.fromEntries(new FormData(form));
        const transfer = values.type === 'Transferência de pasto';
        form.querySelector('#destination-field').hidden = !transfer;
        form.elements.destinationId.disabled = !transfer;
        const financial = ['Compra', 'Venda'].includes(values.type);
        form.querySelector('#value-field').hidden = !financial;
        form.elements.value.disabled = !financial;
        form.elements.value.required = values.type === 'Venda';
        form.querySelector('#money-hint').textContent = values.type === 'Compra' ? 'Valor total opcional. Se informado, gera uma despesa automaticamente.' : values.type === 'Venda' ? 'O valor total da venda gera uma entrada financeira automaticamente.' : '';
        const allowed = values.type === 'Nascimento' ? ['Bezerras', 'Bezerros'] : CATEGORIES;
        if (form.elements.category.options.length !== allowed.length) form.elements.category.innerHTML = options(allowed, allowed.includes(values.category) ? values.category : allowed[0]);
        const quantity = getStock(data).filter(l => l.category === form.elements.category.value && l.ownerId === values.ownerId && l.pastureId === values.pastureId).reduce((sum, l) => sum + l.quantity, 0);
        form.querySelector('#stock-hint').textContent = values.ownerId && values.pastureId ? `Saldo atual: ${number(quantity)} ${form.elements.category.value.toLowerCase()} de ${nameOf(data.owners, values.ownerId)} neste pasto. O saldo na data e as movimentações posteriores também serão conferidos.` : 'Selecione proprietário e pasto para consultar o saldo.';
      };
      form.addEventListener('change', refresh);
      refresh();
    },
    submit(values) {
      const input = Object.fromEntries(values);
      input.valueCents = ['Compra', 'Venda'].includes(input.type) ? toCents(input.value) : 0;
      return id ? repository.updateMovement(id, input) : repository.addMovement(input);
    },
  });
}

export function pastureForm(repository, id) {
  const pasture = repository.getData().pastures.find(p => p.id === id);
  openModal({ feedback:{loading:'Salvando…',success:'Salvo'}, title: id ? 'Editar pasto' : 'Cadastrar pasto', content: inputField('name', 'Nome do pasto', pasture?.name, 'text', 'required maxlength="100" placeholder="Ex.: Barragem"'), submit: values => repository.savePasture(id, values.get('name')) });
}

export function financeForm(repository, id) {
  const data = repository.getData();
  const f = data.finances.find(row => row.id === id) || { type: 'Despesa', date: today(), category: 'Outros' };
  if (f.source === 'migration') return viewFinance(repository, id);
  openModal({ feedback:{loading:'Salvando…',success:'Salvo'}, title: id ? 'Editar lançamento' : 'Novo lançamento financeiro', subtitle: 'Para compra ou venda de animais, use Nova movimentação.', content: `<div class="form-grid">${selectField('type', 'Tipo', ['Entrada', 'Despesa'], f.type)}${dateField(f.date)}${inputField('category', 'Categoria', f.category, 'text', 'required maxlength="100" list="finance-categories"')}<datalist id="finance-categories">${financeCategories(data).map(c => `<option value="${h(c)}"></option>`).join('')}</datalist>${inputField('value', 'Valor total (R$)', f.valueCents ? (f.valueCents / 100).toFixed(2) : '', 'text', 'required inputmode="decimal" placeholder="Ex.: 150,00"')}${selectField('ownerId', 'Proprietário (opcional)', data.owners, f.ownerId, 'Não informado', false)}${inputField('property', 'Propriedade (opcional)', f.property, 'text', 'maxlength="150"')}${textareaField('description', 'Descrição', f.description, 500)}${textareaField('notes', 'Observação (opcional)', f.notes)}</div>`, setup: form => { form.elements.description.required = true; }, submit: values => { const input = Object.fromEntries(values); input.valueCents = toCents(input.value); return repository.saveFinance(id, input); } });
}

export function viewFinance(repository, id) {
  const data = repository.getData(), f = data.finances.find(row => row.id === id);
  if (!f) return;
  const fields = [['Data', formatDate(f.date)], ['Tipo', f.type], ['Categoria sugerida', f.category], ['Descrição original', f.description], ['Proprietário', financeOwnerName(data, f) || 'Não informado na planilha'], ['Propriedade', f.property || 'Não informada na planilha'], ['Valor utilizado', money(f.valueCents)], ['Origem', financeSourceLabel(f.source)], ['Arquivo', f.provenance?.workbook], ['Aba', f.provenance?.sheet], ['Linha', f.provenance?.row], ['Valor original (R$)', f.provenance?.originalAmount], ['Saldo original da aba (somente conferência)', f.provenance?.originalBalance], ['Observação', f.notes || '—']];
  openModal({ title: 'Detalhes do lançamento', subtitle: 'Registro preservado da planilha original. O saldo atual é calculado pelas entradas e despesas.', content: `<dl class="finance-detail">${fields.map(([label, value]) => `<div><dt>${h(label)}</dt><dd>${h(value ?? 'Não informado')}</dd></div>`).join('')}</dl>`, submitLabel: 'Fechar', successMessage: '', submit() {} });
}

export async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Escolha uma foto de até 15 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error('Não foi possível ler esta imagem. Escolha outro arquivo.'); }
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.6, 0.4]) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length <= 600000) return result;
    }
    throw new Error('A imagem ainda está grande. Recorte ou reduza a foto e tente novamente.');
  } finally { URL.revokeObjectURL(url); }
}

export function photoForm(repository, id) {
  const data = repository.getData();
  const p = data.photos.find(row => row.id === id) || { date: today() };
  openModal({ feedback:{loading:repository.cloud?'Enviando foto…':'Salvando foto…',success:'Foto salva'}, title: id ? 'Editar registro fotográfico' : 'Adicionar foto', content: `<div class="form-grid">${inputField('title', 'Título', p.title, 'text', 'required maxlength="100"')}${dateField(p.date)}${selectField('pastureId', 'Pasto (opcional)', data.pastures.filter(x => !x.archived || x.id === p.pastureId), p.pastureId, 'Sem vínculo', false)}${selectField('ownerId', 'Proprietário (opcional)', data.owners, p.ownerId, 'Sem vínculo', false)}<label class="form-group full-width"><span>${id ? 'Substituir imagem (opcional)' : 'Imagem'}</span><input type="file" name="file" accept="image/jpeg,image/png,image/webp" ${id ? '' : 'required'}></label>${textareaField('description', 'Descrição (opcional)', p.description)}</div>`, submit: async values => {
    const input = Object.fromEntries(values);
    input.image = input.file?.size ? await prepareImage(input.file) : p.image;
    await repository.savePhoto(id, input);
  } });
}

export function viewPhoto(repository, id) {
  const photo = repository.getData().photos.find(p => p.id === id);
  if (!photo) return;
  openModal({ title: photo.title, subtitle: formatDate(photo.date), content: `<img class="photo-full" src="${h(photo.image)}" alt="${h(photo.title)}"><p class="confirmation-text">${h(photo.description)}</p>`, submitLabel: 'Fechar', successMessage: '', submit() {} });
}
