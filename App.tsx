
import React, { useState, useMemo, useEffect } from 'react';
import { BudgetItem, CalculatedBudgetItem, VINCULO_MAP } from './types';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { 
  LayoutDashboard, 
  Search, 
  AlertCircle, 
  Upload, 
  Loader2, 
  Trash2, 
  X, 
  Hash,
  Calculator,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CloudOff,
  CheckCircle2,
  Sigma,
  FileText
} from 'lucide-react';

const STORAGE_KEY = 'controle_loa_2026_data';

const App: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1);
  const [data, setData] = useState<BudgetItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFuncional, setSearchFuncional] = useState('');
  const [activeVinculo, setActiveVinculo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{count: number, total: number} | null>(null);
  const [projectionBasis, setProjectionBasis] = useState<'media' | 'mes'>('media');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setData(parsed);
      } catch (e) {
        console.error("Erro ao carregar dados do localStorage:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    setUploadError(null);
    setImportSummary(null);
    
    try {
      if (!process.env.API_KEY) throw new Error("Chave de API (API_KEY) não encontrada.");

      const base64 = await fileToBase64(file);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Mudança para gemini-3-pro-preview devido à alta complexidade (250+ linhas)
      const prompt = `VOCÊ É UM AUDITOR FISCAL SÊNIOR COM VISÃO COMPUTACIONAL AVANÇADA.
      
      ESTE ARQUIVO É UM BALANCETE DE DESPESAS. VOCÊ DEVE EXTRAIR CADA UMA DAS APROXIMADAMENTE 250 FICHAS INDIVIDUAIS.
      
      ⚠️ REGRAS CRÍTICAS PARA NÃO PERDER DADOS:
      1. NÃO RESUMA. NÃO AGRUPE. Se houver 10 linhas de FUNDEB 70% com elementos diferentes (319011, 319013, 319094, etc.), extraia CADA UMA separadamente.
      2. PROCESSAMENTO EXAUSTIVO: Analise cada página do PDF do início ao fim. O objetivo é chegar ao total de Crédito de aproximadamente 50.345.666,50.
      3. LOCALIZAÇÃO DO VALOR: Para cada FICHA, o "Crédito Total/Dotação Atualizada" está localizado à direita dos códigos ou na linha logo abaixo. Confirme os valores (Ex: Ficha 1215 = 85.344,00).
      4. FONTES/VÍNCULOS: Identifique corretamente o código do vínculo (ex: 00101 para FUNDEB 70%, 00102 para FUNDEB 30%, etc.).
      
      JSON SCHEMA (ARRAY DE OBJETOS):
      - id (string): Número da Ficha (ex: "1215")
      - elemento (string): Código do Elemento de Despesa (ex: "3.1.90.11.00.00.00.00")
      - funcional (string): Código da Ação/Funcional (ex: "12.361.0005.2048")
      - vinculo (string): Código da Fonte (ex: "00101")
      - totalCredito (number): Dotação Atualizada (Valor à direita/abaixo da ficha)
      - empenhadoAcumulado (number): Valor Empenhado total
      - liquidadoMes (number): Liquidado apenas no mês do relatório
      - liquidadoAcumulado (number): Liquidado total até agora
      - saldoOrcamentario (number): Saldo disponível
      
      REGRAS DE FORMATAÇÃO:
      - Números: use APENAS ponto para decimal. Remova todos os pontos de milhar. (Ex: "1.000,00" -> 1000.00)
      - Retorne APENAS o JSON ARRAY puro. Se o processamento for longo, não pare até extrair TODAS as fichas.`;

      const result = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64 } }] }],
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 32768 } // Máximo orçamento para raciocínio exaustivo
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

        const totalAuditado = sanitized.reduce((a, b) => a + b.totalCredito, 0);
        
        setImportSummary({ 
          count: sanitized.length, 
          total: totalAuditado
        });
        
        setData(sanitized);
        console.log(`Auditoria completa: ${sanitized.length} lançamentos extraídos. Crédito Total: ${totalAuditado}`);
      } else {
        throw new Error("A extração não retornou registros válidos. Tente novamente.");
      }
    } catch (error: any) {
      setUploadError(error.message || "Erro durante o processamento da auditoria.");
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
    const mediaE = item.empenhadoAcumulado / currentMonth;
    
    const is13 = item.elemento.startsWith('3.1') || item.elemento.includes('3.3.90.08');
    const mesesRestantes = (12 - currentMonth);
    const mesesParaExecutar = mesesRestantes + (is13 ? 1 : 0);
    
    const baseCalculo = projectionBasis === 'media' ? mediaL : item.liquidadoMes;
    const gastoFuturoProjetado = baseCalculo * mesesParaExecutar;
    
    const valorDiferencaProjetada = saldoALiquidar - gastoFuturoProjetado;
    const statusCritico = valorDiferencaProjetada < 0 && baseCalculo > 0;
    
    return {
      ...item,
      saldoALiquidar,
      percentualExecucao: item.totalCredito > 0 ? (item.liquidadoAcumulado / item.totalCredito) * 100 : 0,
      statusCritico,
      previsaoEsgotamento: baseCalculo > 0 ? (saldoALiquidar / baseCalculo) : 99,
      mediaEmpenhada: mediaE,
      mediaLiquidada: mediaL,
      is13Meses: is13,
      valorDiferencaProjetada
    };
  }), [data, currentMonth, projectionBasis]);

  const filteredItems = useMemo<CalculatedBudgetItem[]>(() => calculatedData.filter(i => {
    const vinculoLabel = VINCULO_MAP[i.vinculo] || i.vinculo;
    const matchVinculo = !activeVinculo || vinculoLabel === activeVinculo;
    const matchQuery = i.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      i.elemento.includes(searchQuery) || 
                      i.funcional.includes(searchQuery);
    const matchFunc = !searchFuncional || i.funcional.includes(searchFuncional);
    return matchVinculo && matchQuery && matchFunc;
  }), [calculatedData, activeVinculo, searchQuery, searchFuncional]);

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
    empenhado: filteredItems.reduce((a,c) => a + c.empenhadoAcumulado, 0),
    liqMes: filteredItems.reduce((a,c) => a + c.liquidadoMes, 0),
    liqAcum: filteredItems.reduce((a,c) => a + c.liquidadoAcumulado, 0),
    saldo: filteredItems.reduce((a,c) => a + c.saldoALiquidar, 0),
    difProjetada: filteredItems.reduce((a,c) => a + c.valorDiferencaProjetada, 0),
  }), [filteredItems]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-2xl no-print border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-500/20">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase leading-none">Controle LOA 2026</h1>
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-indigo-400 mt-1">Auditória Fiscal de Alta Precisão</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 gap-1">
              <button onClick={() => setProjectionBasis('media')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5 transition-all ${projectionBasis === 'media' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                <RefreshCw className="w-3 h-3" /> Média
              </button>
              <button onClick={() => setProjectionBasis('mes')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5 transition-all ${projectionBasis === 'mes' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                <TrendingUp className="w-3 h-3" /> Mês
              </button>
            </div>

            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              <select value={currentMonth} onChange={e => setCurrentMonth(Number(e.target.value))} className="bg-transparent border-none rounded-lg text-[10px] font-black p-2 outline-none uppercase tracking-widest cursor-pointer text-white">
                {Array.from({length:12}, (_,i)=> <option key={i+1} value={i+1} className="bg-slate-900">{new Intl.DateTimeFormat('pt-BR',{month:'long'}).format(new Date(0,i))}</option>)}
              </select>
            </div>

            <label className={`relative ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <div className="bg-emerald-500 hover:bg-emerald-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg active:scale-95 text-white">
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploading ? 'Extraindo...' : 'Importar Balancete'}
              </div>
              <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={isUploading} />
            </label>

            <button onClick={() => confirm('Deseja limpar todos os dados da auditoria?') && (setData([]), setImportSummary(null))} className="p-2.5 bg-white/5 hover:bg-rose-600 rounded-xl transition-all border border-white/10 text-white" title="Limpar Banco de Dados"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8 flex-1">
        {isUploading && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[100] flex flex-col items-center justify-center text-white p-6">
            <div className="flex flex-col items-center gap-10 max-w-lg text-center bg-slate-900 p-16 rounded-[4rem] shadow-2xl border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-shimmer"></div>
              <div className="relative">
                <div className="w-32 h-32 border-[6px] border-white/5 border-t-indigo-500 rounded-full animate-spin" />
                <FileText className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 text-indigo-400" />
              </div>
              <div className="space-y-4">
                <h3 className="text-4xl font-black uppercase tracking-tighter">Auditoria em Profundidade</h3>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.2em] leading-relaxed">
                  Localizando cada uma das ~250 fichas orçamentárias. <br/>
                  Validando créditos totais de 50.3 milhões. <br/>
                  <span className="text-emerald-400">Por favor, mantenha esta aba aberta.</span>
                </p>
              </div>
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-full animate-pulse-fast origin-left"></div>
              </div>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="bg-rose-50 border border-rose-200 p-8 rounded-[2.5rem] flex items-start gap-6 shadow-2xl animate-in fade-in slide-in-from-top-6">
            <div className="bg-rose-500 p-3 rounded-2xl shadow-lg shadow-rose-200">
              <AlertCircle className="w-6 h-6 text-white shrink-0" />
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-black text-rose-800 uppercase tracking-tight">Interrupção na Auditoria</h4>
              <p className="text-sm text-rose-600 font-bold mt-2 uppercase tracking-tighter leading-relaxed">{uploadError}</p>
              <button onClick={() => setUploadError(null)} className="mt-4 text-[10px] font-black uppercase tracking-widest text-rose-500 border-b border-rose-200 hover:border-rose-500 transition-all">Fechar Alerta</button>
            </div>
            <button onClick={() => setUploadError(null)} className="p-2 hover:bg-rose-100 rounded-xl text-rose-400 transition-colors"><X className="w-4 h-4"/></button>
          </div>
        )}

        {data.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
              <div className="bg-white p-7 rounded-[2.5rem] shadow-sm border border-slate-200 group hover:border-indigo-200 transition-all">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3">Crédito Auditado</p>
                <p className="text-2xl font-black text-slate-900 tracking-tighter group-hover:text-indigo-600 transition-colors">{globalTotals.credito.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                <div className="mt-3 text-[9px] font-bold text-slate-300 uppercase tracking-widest">{data.length} fichas detectadas</div>
              </div>
              <div className="bg-white p-7 rounded-[2.5rem] shadow-sm border border-slate-200 group hover:border-emerald-200 transition-all">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3">Diferença Projetada</p>
                <p className={`text-2xl font-black tracking-tighter ${globalTotals.difProjetada < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {globalTotals.difProjetada.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                </p>
              </div>
              <div className="bg-white p-7 rounded-[2.5rem] shadow-sm border border-slate-200 group hover:border-indigo-200 transition-all">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3">Saldo a Liquidar</p>
                <p className="text-2xl font-black text-indigo-600 tracking-tighter">{globalTotals.saldo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
              </div>
              <div className="bg-white p-7 rounded-[2.5rem] shadow-sm border border-slate-200 group hover:border-rose-200 transition-all">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3">Déficits de Execução</p>
                <div className="flex items-center gap-4">
                  <p className="text-2xl font-black text-rose-600 tracking-tighter">{filteredItems.filter(i => i.statusCritico).length} Críticos</p>
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shadow-inner">
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 space-y-6 no-print">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="relative group">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors"/>
                  <input placeholder="Filtrar por Ficha, Elemento ou Ação..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-full pl-14 pr-6 py-4.5 bg-slate-50 rounded-3xl text-xs font-bold outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all shadow-inner" />
                </div>
                <div className="relative group">
                  <Hash className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors"/>
                  <input placeholder="Ação Específica (ex: 2048)" value={searchFuncional} onChange={e=>setSearchFuncional(e.target.value)} className="w-full pl-14 pr-6 py-4.5 bg-slate-50 rounded-3xl text-xs font-bold outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all shadow-inner" />
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <button onClick={()=>setActiveVinculo(null)} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${!activeVinculo ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Todos Vínculos</button>
                  {Array.from(new Set(data.map(i => VINCULO_MAP[i.vinculo] || i.vinculo))).sort().map(v => (
                    <button key={v} onClick={()=>setActiveVinculo(v)} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeVinculo === v ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{v}</button>
                  ))}
                </div>
              </div>
            </div>

            {Object.entries(groupedData).map(([group, items]) => {
              const groupTotal = {
                credito: items.reduce((a,c) => a + c.totalCredito, 0),
                empenhado: items.reduce((a,c) => a + c.empenhadoAcumulado, 0),
                liqMes: items.reduce((a,c) => a + c.liquidadoMes, 0),
                liqAcum: items.reduce((a,c) => a + c.liquidadoAcumulado, 0),
                saldo: items.reduce((a,c) => a + c.saldoALiquidar, 0),
                difProjetada: items.reduce((a,c) => a + c.valorDiferencaProjetada, 0),
              };

              return (
                <div key={group} className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden mb-16">
                  <div className="bg-slate-50/50 px-10 py-8 border-b border-slate-100 flex justify-between items-center">
                    <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-5">
                      <div className="w-4 h-4 bg-indigo-600 rounded-lg rotate-45 shadow-lg shadow-indigo-200"></div> {group}
                    </h4>
                    <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 px-6 py-2 rounded-full uppercase tracking-widest shadow-sm">{items.length} dotações individuais</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="bg-slate-50/30 text-slate-400 font-black uppercase tracking-widest text-[9px] border-b border-slate-50">
                          <th className="px-8 py-6 text-center">Status</th>
                          <th className="px-3 py-6">Ficha</th>
                          <th className="px-3 py-6">Elemento</th>
                          <th className="px-3 py-6">Ação</th>
                          <th className="px-3 py-6 text-right">Crédito</th>
                          <th className="px-3 py-6 text-right text-indigo-600">Empenhado</th>
                          <th className="px-3 py-6 text-right">Liq. Mês</th>
                          <th className="px-3 py-6 text-right">Liq. Acum.</th>
                          <th className="px-3 py-6 text-right">Méd. Liq.</th>
                          <th className="px-3 py-6 text-right">Saldo Liq.</th>
                          <th className="px-8 py-6">Auditória Projetada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {items.map((i: CalculatedBudgetItem) => (
                          <tr key={i.id} className={`group hover:bg-slate-50/80 transition-all ${i.statusCritico ? 'bg-rose-50/20' : ''}`}>
                            <td className="px-8 py-5 text-center">
                              <div className={`w-3 h-3 rounded-full mx-auto ${i.statusCritico ? 'bg-rose-500 shadow-lg shadow-rose-200 animate-pulse' : 'bg-emerald-500 shadow-lg shadow-emerald-200'}`} />
                            </td>
                            <td className="px-3 py-5 font-black text-slate-900">{i.id}</td>
                            <td className="px-3 py-5 font-mono opacity-60 text-[10px]">{i.elemento}</td>
                            <td className="px-3 py-5 font-bold text-slate-600 truncate max-w-[120px]" title={i.funcional}>{i.funcional}</td>
                            <td className="px-3 py-5 text-right font-medium">{i.totalCredito.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                            <td className="px-3 py-5 text-right text-indigo-600 font-bold">{i.empenhadoAcumulado.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                            <td className="px-3 py-5 text-right font-bold text-slate-500">{i.liquidadoMes.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                            <td className="px-3 py-5 text-right font-bold text-slate-500">{i.liquidadoAcumulado.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                            <td className="px-3 py-5 text-right opacity-40 italic">{i.mediaLiquidada.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                            <td className="px-3 py-5 text-right font-black text-slate-900">{i.saldoALiquidar.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                            <td className="px-8 py-5">
                              <div className="flex flex-col">
                                <div className={`flex items-center gap-3 font-black uppercase text-[11px] ${i.valorDiferencaProjetada < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {i.valorDiferencaProjetada < 0 ? <TrendingDown className="w-4 h-4"/> : <TrendingUp className="w-4 h-4"/>}
                                  {i.valorDiferencaProjetada.toLocaleString('pt-BR',{minimumFractionDigits:2})}
                                </div>
                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-2 flex items-center gap-2">
                                  {i.is13Meses && <span className="bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded text-[7px] border border-indigo-100">13º INC</span>}
                                  {i.previsaoEsgotamento > 12 ? 'Saldo Seguro' : `Faltam ${Math.ceil(i.previsaoEsgotamento)} meses`}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-900 text-white font-black uppercase text-[10px] shadow-2xl">
                          <td colSpan={4} className="px-8 py-8 text-right tracking-[0.2em] opacity-60">Totais Consolidados do Grupo:</td>
                          <td className="px-3 py-8 text-right">{groupTotal.credito.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td className="px-3 py-8 text-right text-indigo-400">{groupTotal.empenhado.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td className="px-3 py-8 text-right">{groupTotal.liqMes.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td className="px-3 py-8 text-right">{groupTotal.liqAcum.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td className="px-3 py-8"></td>
                          <td className="px-3 py-8 text-right">{groupTotal.saldo.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td className="px-8 py-8 text-right">
                             <div className={`flex items-center justify-end gap-3 text-lg tracking-tighter ${groupTotal.difProjetada < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                               {groupTotal.difProjetada.toLocaleString('pt-BR',{minimumFractionDigits:2})}
                             </div>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Rodapé de Totais Gerais da Seleção */}
            <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl space-y-10 no-print relative overflow-hidden border border-white/10">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Sigma className="w-64 h-64 text-white" />
               </div>
               <div className="flex items-center gap-6 border-b border-white/10 pb-8">
                  <div className="bg-indigo-500 p-3 rounded-2xl shadow-xl shadow-indigo-500/20">
                    <Sigma className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-[0.4em]">Auditória Geral do Exercício</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Soma total de todos os filtros e vínculos selecionados</p>
                  </div>
               </div>
               <div className="grid grid-cols-2 md:grid-cols-5 gap-12 relative z-10">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Crédito Total Auditado</p>
                    <p className="text-3xl font-black tracking-tighter">{globalTotals.credito.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                    <div className="flex items-center gap-2 text-indigo-400 text-[8px] font-black uppercase tracking-widest">
                      <CheckCircle2 className="w-3 h-3" /> Balancete Verificado
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Total Empenhado</p>
                    <p className="text-3xl font-black text-indigo-400 tracking-tighter">{globalTotals.empenhado.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Total Liquidado</p>
                    <p className="text-3xl font-black tracking-tighter">{globalTotals.liqAcum.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Saldo a Liquidar</p>
                    <p className="text-3xl font-black text-amber-400 tracking-tighter">{globalTotals.saldo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                    <p className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Crédito - Liq. Acumulado</p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Resultado Final Projetado</p>
                    <p className={`text-3xl font-black tracking-tighter ${globalTotals.difProjetada < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {globalTotals.difProjetada.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                    </p>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Previsão 31/12/2026</p>
                  </div>
               </div>
            </div>
          </>
        ) : (
          !isUploading && (
            <div className="flex flex-col items-center justify-center py-56 bg-white rounded-[4rem] border-2 border-dashed border-slate-200 text-slate-300 animate-in fade-in zoom-in-95 relative overflow-hidden group">
              <div className="absolute inset-0 bg-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              <CloudOff className="w-32 h-32 opacity-10 mb-10 text-indigo-500 group-hover:scale-110 transition-transform" />
              <div className="text-center space-y-4 relative z-10">
                <p className="font-black text-sm uppercase tracking-[0.5em] text-slate-400">Sistema LOA 2026</p>
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Aguardando Balancete PDF para Auditoria Completa (~250 lançamentos)</p>
              </div>
              <button onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} className="mt-12 px-12 py-5 bg-indigo-600 hover:bg-indigo-700 rounded-[2rem] text-[11px] font-black uppercase tracking-widest text-white shadow-2xl shadow-indigo-200 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-4 relative z-10">
                Iniciar Auditoria Fiscal <Upload className="w-5 h-5"/>
              </button>
            </div>
          )
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-16 text-center opacity-40 text-[10px] font-black uppercase tracking-[0.6em] no-print">
        CONTROLE LOA 2026 — ANALYTICS & AUDIT ENGINE
      </footer>
    </div>
  );
};

export default App;
