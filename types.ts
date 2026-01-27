
export interface BudgetItem {
  id: string; 
  elemento: string; 
  funcional: string; 
  vinculo: string; 
  totalCredito: number; 
  empenhadoAcumulado: number;
  liquidadoAcumulado: number;
  saldoOrcamentario: number;
  observacoes?: string;
}

export interface CalculatedBudgetItem extends BudgetItem {
  saldoALiquidar: number;
  percentualExecucao: number;
  statusCritico: boolean;
  previsaoEsgotamento: number; 
  mediaEmpenhada: number;
  mediaLiquidada: number;
  is13Meses: boolean; 
}

export const VINCULO_MAP: Record<string, string> = {
  '00000': 'Recursos Livres',
  '00101': '70% FUNDEB',
  '00102': '30% FUNDEB',
  '00103': '5% MDE',
  '00104': '25% MDE / Recursos Próprios',
  '00107': 'Salário Educação',
  '10146': 'PNAE (Merenda)',
  '10147': 'Apoio ao Transporte (PNATE)',
  '10231': 'VAAR (FUNDEB)',
};
