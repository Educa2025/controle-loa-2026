
import React, { useState, useMemo, useEffect } from 'react';
import { BudgetItem, CalculatedBudgetItem, VINCULO_MAP } from './types';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { 
  LayoutDashboard, 
  Search, 
  AlertCircle, 
  Upload, 
  Loader2, 
  Trash2, 
  X, 
  Hash,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CloudOff,
  Sigma,
  FileText,
  Download,
  Printer,
  FileSpreadsheet,
  Lock,
  ExternalLink,
  ShieldCheck,
  Key
} from 'lucide-react';

const STORAGE_KEY = 'controle_loa_2026_data_v2';

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1);
  const [data, setData] = useState<BudgetItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVinculo, setActiveVinculo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [projectionBasis, setProjectionBasis] = useState<'media' | 'mes'>('media');

  // Verifica a disponibilidade da chave no ambiente do navegador
  useEffect(() => {
    const checkKeyStatus = async () => {
      try {
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } else {
          // Fallback para ambiente de desenvolvimento local
          setHasKey(!!process.env.API_KEY);
        }
      } catch (e) {
        setHasKey(false);
      }
    };
    checkKeyStatus();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setData(parsed);
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data]);

  const handleOpenKeySelector = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        setHasKey(true); // Assume sucesso conforme diretrizes do SDK
        setUploadError(null);
      } catch (e) {
        console.error("Erro ao abrir seletor de chaves", e);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      // CRÍTICO: Criar a instância aqui garante o uso da chave mais recente do diálogo
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64 = await fileToBase64(file);
      
      const prompt = `VOCÊ É UM AUDITOR FISCAL SÊNIOR. 
      Sua tarefa é extrair as fichas orçamentárias do balancete PDF.
      
      REGRAS DE EXTRAÇÃO:
      1. Extraia cada ficha individualmente (Número da Ficha, Elemento, Dotação Atualizada).
      2. Mantenha os valores decimais originais.
      3. Se houver despesas de pessoal (3.1.90), marque como 13 meses se aplicável.

      Retorne APENAS um JSON Array seguindo este formato:
      [{
        "id": "número da ficha",
        "elemento": "código elemento",
        "funcional": "código ação",
        "vinculo": "código fonte",
        "totalCredito": 0.00,
        "empenhadoAcumulado": 0.00,
        "liquidadoMes": 0.00,
        "liquidadoAcumulado": 0.00,
        "saldoOrcamentario": 0.00
      }]`;

      const result = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64 } }] }],
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 24000 }
        }
      });

      const responseText = result.text || '';
      let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const extracted = JSON.parse(cleanJson) as any[];
      
      if (Array.isArray(extracted) && extracted.length > 0) {
        const sanitized: BudgetItem[] = extracted.map(item => ({
          id: String(item.id || ''),
          elemento: String(item.elemento || ''),
          funcional: String(item.funcional || ''),
          vinculo: String(item.vinculo || ''),
          totalCredito: Number(item.totalCredito) || 0,
          empenhadoAcumulado: Number(item.empenhadoAcumulado) || 0,
          liquidadoMes: Number(item.liquidadoMes) || 0,
          liquidadoAcumulado: Number(item.liquidadoAcumulado) || 0,
          saldoOrcamentario: Number(item.saldoOrcamentario) || 0
        }));
        setData(sanitized);
      }
    } catch (error: any) {
      const errorMsg = error.message || "";
      if (errorMsg.includes("API key not valid") || errorMsg.includes("400") || errorMsg.includes("Requested entity was not found")) {
        setHasKey(false);
        setUploadError("A Chave de API selecionada não é válida para este projeto ou expirou.");
      } else {
        setUploadError("Não foi possível processar o PDF. Certifique-se de que é um balancete legível.");
      }
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const fileToBase64 = (f: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader(); r.readAsDataURL(f);
    r.onload = () => res((r.result as string).split(',')[1]);
    r.onerror = rej;
  });

  const calculatedData = useMemo<CalculatedBudgetItem[]>(() => data.map(item => {
    const saldoALiquidar = item.totalCredito - item.liquidadoAcumulado;
    const mediaL = item.liquidadoAcumulado / currentMonth;
    const baseCalculo = projectionBasis === 'media' ? mediaL : item.liquidadoMes;
    const is13 = item.elemento.startsWith('3.1') || item.elemento.includes('3.3.90.08');
    const mesesParaExecutar = (12 - currentMonth) + (is13 ? 1 : 0);
    const gastoFuturoProjetado = baseCalculo * mesesParaExecutar;
    
    return {
      ...item,
      saldoALiquidar,
      percentualExecucao: item.totalCredito > 0 ? (item.liquidadoAcumulado / item.totalCredito) * 100 : 0,
      statusCritico: (saldoALiquidar - gastoFuturoProjetado) < 0 && baseCalculo > 0,
      previsaoEsgotamento: baseCalculo > 0 ? (saldoALiquidar / baseCalculo) : 99,
      mediaEmpenhada: item.empenhadoAcumulado / currentMonth,
      mediaLiquidada: mediaL,
      is13Meses: is13,
      valorDiferencaProjetada: saldoALiquidar - gastoFuturoProjetado
    };
  }), [data, currentMonth, projectionBasis]);

  const filteredItems = useMemo<CalculatedBudgetItem[]>(() => calculatedData.filter(i => {
    const vinculoLabel = VINCULO_MAP[i.vinculo] || i.vinculo;
    const matchVinculo = !activeVinculo || vinculoLabel === activeVinculo;
    const matchQuery = i.id.toLowerCase().includes(searchQuery.toLowerCase()) || i.elemento.includes(searchQuery);
    return matchVinculo && matchQuery;
  }), [calculatedData, activeVinculo, searchQuery]);

  const groupedData = useMemo<Record<string, CalculatedBudgetItem[]>>(() => {
    const g: Record<string, CalculatedBudgetItem[]> = {};
    filteredItems.forEach(i => {
      const v = VINCULO_MAP[i.vinculo] || `Fonte ${i.vinculo}`;
      if (!g[v]) g[v] = []; g[v].push(i);
    });
    return g;
  }, [filteredItems]);

  const globalTotals = useMemo(() => ({
    credito: filteredItems.reduce((a,c) => a + c.totalCredito, 0),
    liqAcum: filteredItems.reduce((a,c) => a + c.liquidadoAcumulado, 0),
    saldo: filteredItems.reduce((a,c) => a + c.saldoALiquidar, 0),
    difProjetada: filteredItems.reduce((a,c) => a + c.valorDiferencaProjetada, 0),
  }), [filteredItems]);

  // Pantalha de bloqueio para Chave Inválida
  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900 rounded-[3rem] p-12 border border-white/10 shadow-2xl text-center space-y-10 animate-in fade-in zoom-in-95">
          <div className="flex justify-center">
            <div className="bg-indigo-500/20 p-6 rounded-full border border-indigo-500/30">
              <Key className="w-12 h-12 text-indigo-400" />
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-white text-3xl font-black uppercase tracking-tighter">Acesso Online</h2>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              Ocorreu uma falha na autenticação da sua chave de API. Selecione uma chave válida com faturamento ativo para prosseguir com a auditoria.
            </p>
          </div>
          <div className="space-y-4 pt-4">
            <button onClick={handleOpenKeySelector} className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 active:scale-95">
              <ShieldCheck className="w-5 h-5" /> Selecionar Chave Paga
            </button>
            <div className="flex flex-col gap-2">
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:underline flex items-center justify-center gap-2">
                Habilitar Faturamento <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col selection:bg-indigo-100">
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-2xl no-print border-b border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-500/20">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase leading-none">Controle LOA 2026</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-indigo-400">Auditoria Online Ativa</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 gap-1">
              <button onClick={() => setProjectionBasis('media')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${projectionBasis === 'media' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Média</button>
              <button onClick={() => setProjectionBasis('mes')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${projectionBasis === 'mes' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Mês</button>
            </div>

            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              <select value={currentMonth} onChange={e => setCurrentMonth(Number(e.target.value))} className="bg-transparent border-none rounded-lg text-[10px] font-black p-2 outline-none uppercase tracking-widest text-white cursor-pointer">
                {Array.from({length:12}, (_,i)=> <option key={i+1} value={i+1} className="bg-slate-900">{new Intl.DateTimeFormat('pt-BR',{month:'long'}).format(new Date(0,i))}</option>)}
              </select>
            </div>

            <label className={`relative ${isUploading ? 'opacity-50' : 'cursor-pointer hover:scale-105 transition-transform'}`}>
              <div className="bg-emerald-500 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg text-white">
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar Balancete
              </div>
              <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={isUploading} />
            </label>

            <button onClick={() => handleOpenKeySelector()} className="p-2.5 bg-white/5 hover:bg-indigo-600 rounded-xl transition-all border border-white/10 text-white shadow-lg" title="Mudar Chave de API">
              <Key className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8 flex-1">
        {isUploading && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[100] flex flex-col items-center justify-center text-white p-6">
            <div className="bg-slate-900 p-16 rounded-[4rem] border border-white/10 shadow-2xl flex flex-col items-center gap-10 max-w-md text-center">
              <div className="relative">
                <div className="w-32 h-32 border-[6px] border-white/5 border-t-emerald-500 rounded-full animate-spin"></div>
                <FileText className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 text-emerald-400" />
              </div>
              <div className="space-y-4">
                <h3 className="text-4xl font-black uppercase tracking-tighter">Auditoria em Curso</h3>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.2em]">O Gemini 3 Pro está analisando cada dotação do balancete...</p>
              </div>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="bg-rose-50 border border-rose-200 p-6 rounded-[2rem] flex items-center gap-6 shadow-xl animate-in slide-in-from-top-4">
            <AlertCircle className="w-8 h-8 text-rose-500 shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-black text-rose-800 uppercase tracking-tight">Falha na Auditoria Online</h4>
              <p className="text-[11px] text-rose-600 font-bold mt-1 uppercase leading-relaxed">{uploadError}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleOpenKeySelector} className="px-4 py-2 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg shadow-lg">Mudar Chave</button>
              <button onClick={() => setUploadError(null)} className="p-2 text-rose-400 hover:bg-rose-100 rounded-full transition-colors"><X className="w-4 h-4"/></button>
            </div>
          </div>
        )}

        {data.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'Crédito Auditado', val: globalTotals.credito, color: 'text-slate-900' },
                { label: 'Saldo a Liquidar', val: globalTotals.saldo, color: 'text-indigo-600' },
                { label: 'Projeção Final', val: globalTotals.difProjetada, color: globalTotals.difProjetada < 0 ? 'text-rose-600' : 'text-emerald-600' },
                { label: 'Fichas Críticas', val: filteredItems.filter(i => i.statusCritico).length, isCount: true, color: 'text-rose-600' }
              ].map((stat, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{stat.label}</p>
                  <p className={`text-2xl font-black tracking-tighter ${stat.color}`}>
                    {stat.isCount ? stat.val : stat.val.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 space-y-6 no-print">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="relative group">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors"/>
                  <input placeholder="Filtrar por Ficha ou Elemento..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-slate-50 rounded-[2rem] text-xs font-bold outline-none border border-transparent focus:border-indigo-500 transition-all shadow-inner" />
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <button onClick={()=>setActiveVinculo(null)} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${!activeVinculo ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>Todos</button>
                  {Array.from(new Set(data.map(i => VINCULO_MAP[i.vinculo] || i.vinculo))).sort().map(v => (
                    <button key={v} onClick={()=>setActiveVinculo(v)} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeVinculo === v ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>{v}</button>
                  ))}
                </div>
              </div>
            </div>

            {Object.entries(groupedData).map(([group, items]: [string, CalculatedBudgetItem[]]) => (
              <div key={group} className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden mb-12 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-slate-50/50 px-10 py-8 border-b border-slate-100 flex justify-between items-center">
                  <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-4">
                    <div className="w-4 h-4 bg-indigo-600 rounded-lg"></div> {group}
                  </h4>
                  <span className="text-[9px] font-black text-slate-400 bg-white border border-slate-200 px-6 py-2 rounded-full uppercase tracking-widest">{items.length} itens</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-50/20 text-slate-400 font-black uppercase tracking-[0.15em] text-[9px] border-b border-slate-50">
                        <th className="px-10 py-6 text-center">Status</th>
                        <th className="px-4 py-6">Ficha</th>
                        <th className="px-4 py-6">Elemento</th>
                        <th className="px-4 py-6 text-right">Crédito</th>
                        <th className="px-4 py-6 text-right">Liq. Acum</th>
                        <th className="px-10 py-6 text-right">Projeção 31/12</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map((i: CalculatedBudgetItem) => (
                        <tr key={i.id} className={`group hover:bg-indigo-50/30 transition-all ${i.statusCritico ? 'bg-rose-50/30' : ''}`}>
                          <td className="px-10 py-5 text-center">
                            <div className={`w-2.5 h-2.5 rounded-full mx-auto ${i.statusCritico ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                          </td>
                          <td className="px-4 py-5 font-black text-slate-900">{i.id}</td>
                          <td className="px-4 py-5 font-mono text-slate-400 text-[10px]">{i.elemento}</td>
                          <td className="px-4 py-5 text-right font-medium">{i.totalCredito.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td className="px-4 py-5 text-right font-bold text-slate-500">{i.liquidadoAcumulado.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td className="px-10 py-5 text-right">
                            <div className={`font-black uppercase text-[11px] ${i.valorDiferencaProjetada < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {i.valorDiferencaProjetada.toLocaleString('pt-BR',{minimumFractionDigits:2})}
                              <span className="block text-[8px] opacity-40 font-bold mt-1">{i.is13Meses ? 'Incluso 13º' : 'Normal'}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        ) : (
          !isUploading && (
            <div className="flex flex-col items-center justify-center py-64 bg-white rounded-[4rem] border-2 border-dashed border-slate-200 text-slate-300 animate-in zoom-in-95 group">
              <div className="bg-slate-50 p-10 rounded-full mb-10 group-hover:bg-indigo-50 transition-colors">
                <CloudOff className="w-24 h-24 opacity-20 text-indigo-500" />
              </div>
              <div className="text-center space-y-4">
                <p className="font-black text-sm uppercase tracking-[0.5em] text-slate-400">Controle LOA Online</p>
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Aguardando Balancete PDF para Auditoria Geral</p>
              </div>
              <button onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} className="mt-12 px-14 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2rem] text-[11px] font-black uppercase tracking-widest shadow-2xl shadow-indigo-500/30 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-4">
                Iniciar Auditoria <Upload className="w-5 h-5"/>
              </button>
            </div>
          )
        )}
      </main>

      <footer className="py-16 text-center opacity-30 text-[9px] font-black uppercase tracking-[0.8em] no-print">
        CONTROLE LOA 2026 — ANALYTICS ENGINE ONLINE
      </footer>
    </div>
  );
};

export default App;
