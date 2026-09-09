import { SCHEMA_VERSION } from './constants.js';
import { FINANCIAL_SEED } from './data/financial-seed.js';

/**
 * Seed inicial baseado nos dados reais da planilha Controle_Gado.xlsx.
 *
 * Última contagem encontrada:
 * 28/05/2026
 *
 * Vacas: 108
 * Bois: 3
 * Novilhas: 2
 * Bezerras: 36
 * Bezerros: 20
 *
 * Total calculado: 169 cabeças
 *
 * OBS:
 * A planilha informa TOTAL = 172, mas a soma das categorias é 169.
 * O sistema usa a soma das categorias para evitar criar animais inexistentes.
 */
export function createSeed() {

  const owners = [
    { id: 'owner-1', name: 'Bruno' },
    { id: 'owner-2', name: 'Nilda' },
    { id: 'owner-3', name: 'Ana' },
    { id: 'owner-4', name: 'Canarinho' },
    { id: 'owner-5', name: 'Érico' },

    // Necessário porque a planilha atual não informa
    // a divisão completa da contagem mais recente por proprietário.
    { id: 'owner-unassigned', name: 'Não informado' }
  ];


  const pastures = [
    {
      id: 'pasture-1',
      name: "Casa da Vargem",
      archived: false,
      address: 'M5RP+6X Lagamar, MG, Brasil'
    },

    {
      id: 'pasture-2',
      name: 'Pasto da Vargem',
      archived: false,
      address: 'M5JQ+V4 Lagamar, MG, Brasil'
    },

    {
      id: 'pasture-3',
      name: "Pasto da Caixa D'agua",
      archived: false,
      address: 'M5QM+3W Lagamar, MG, Brasil'
    },

    {
      id: 'pasture-4',
      name: 'Pasto da Barragem',
      archived: false,
      address: 'M5RP+36 Lagamar, MG, Brasil'
    },

    {
      id: 'pasture-5',
      name: 'Pasto da Serra',
      archived: false,
      address: 'M5QH+VJ Lagamar, MG, Brasil'
    },

    // A planilha informa os totais de cada pasto,
    // mas não informa qual categoria está em cada um.
    // Por isso não inventamos a distribuição.
    {
      id: 'pasture-unassigned',
      name: 'Localização não informada',
      archived: false
    }
  ];


  /**
   * ESTOQUE REAL
   *
   * Não distribuímos arbitrariamente entre proprietários/pastos.
   * Esses dados deverão ser conferidos posteriormente.
   */
  const openingStock = [

    {
      id: 'opening-vacas',
      category: 'Vacas',
      quantity: 108,
      ownerId: 'owner-unassigned',
      pastureId: 'pasture-unassigned'
    },

    {
      id: 'opening-bois',
      category: 'Bois',
      quantity: 3,
      ownerId: 'owner-unassigned',
      pastureId: 'pasture-unassigned'
    },

    {
      id: 'opening-novilhas',
      category: 'Novilhas',
      quantity: 2,
      ownerId: 'owner-unassigned',
      pastureId: 'pasture-unassigned'
    },

    {
      id: 'opening-bezerras',
      category: 'Bezerras',
      quantity: 36,
      ownerId: 'owner-unassigned',
      pastureId: 'pasture-unassigned'
    },

    {
      id: 'opening-bezerros',
      category: 'Bezerros',
      quantity: 20,
      ownerId: 'owner-unassigned',
      pastureId: 'pasture-unassigned'
    }

  ];


  return {

    version: SCHEMA_VERSION,

    revision: 0,

    // Mantemos o controle do seed financeiro,
    // porque os lançamentos financeiros vieram da planilha real.
    seedVersion: FINANCIAL_SEED.manifest.seedVersion,

    appliedSeeds: [
      FINANCIAL_SEED.manifest.id
    ],

    // IMPORTANTE:
    // agora o sistema NÃO está em modo demonstração.
    demo: false,

    // Data da última contagem real encontrada na planilha.
    openingDate: '2026-05-28',

    owners,

    pastures,

    openingStock,

    movements: [],

    finances: structuredClone(
      FINANCIAL_SEED.records
    ),

    photos: []

  };

}