
import React, { useState, useMemo, useEffect } from 'react';
import { BudgetItem, CalculatedBudgetItem, VINCULO_MAP } from './types';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { 
  LayoutDashboard, 
  Search, 
  AlertCircle, 
  TrendingUp, 
  FileText, 
  Save, 
  Upload, 
  Loader2, 
  Trash2, 
  Filter, 
  X, 
  MessageSquare,
  FileSpreadsheet,
  FileType,
  Info,
  Hash,
  CheckCircle2,
  CloudOff,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const STORAGE_KEY = 'controle_loa_2026_data';

const App: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1);
  const [data, setData] = useState<BudgetItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFuncional, setSearchFuncional] = useState('');
  const [activeVinculo, setActiveVinculo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setData(JSON.parse(saved));
        setLastSaved(new Date());
      } catch (e) {
        console.error("Erro ao carregar dados", e);
      }
    }
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setLastSaved(new Date());
    }
  }, [data]);

  // Handle extraction with corrected Gemini SDK patterns
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const base64 = await fileToBase64(file);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Extraia dados da LOA deste PDF. Foque em: ID (Ref), Elemento (19 dig), Funcional (extrair 4 dig centrais de 0000.XXXX.0000), Vínculo (5 dig), Crédito Total, Empenhado, Liquidado e Saldo. Retorne JSON.`;
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: { 
          parts: [
            { text: prompt }, 
            { inlineData: { mimeType: file.type, data: base64 } }
          ] 
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                elemento: { type: Type.STRING },
                funcional: { type: Type.STRING },
                vinculo: { type: Type.STRING },
                totalCredito: { type: Type.NUMBER },
                empenhadoAcumulado: { type: Type.NUMBER },
                liquidadoAcumulado: { type: Type.NUMBER },
                saldoOrcamentario: { type: Type.NUMBER },
              },
              required: ["id", "elemento", "funcional", "vinculo", "totalCredito", "liquidadoAcumulado"],
            }
          }
        }
      });
      const text = response.text;
      const extractedData = JSON.parse(text || "[]") as BudgetItem[];
      if (extractedData.length > 0) setData(extractedData);
    } catch (error) {
      setUploadError("Falha ao processar PDF. Verifique se o arquivo é um relatório de despesa válido.");
    } finally {
      setIsUploading(false);
    }
  };

  const fileToBase64 = (f: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader(); r.readAsDataURL(f);
    r.onload = () => res((r.result as string).split(',')[1]);
    r.onerror = rej;
  });

  // Explicit type and complete property population for CalculatedBudgetItem
  const calculatedData = useMemo<CalculatedBudgetItem[]>(() => data.map(item => {
    const saldoALiquidar = item.totalCredito - item.liquidadoAcumulado;
    const media = item.liquidadoAcumulado / currentMonth;
    const is13 = item.elemento.startsWith('31') || item.elemento.startsWith('339008');
    const mesesCobertos = media > 0 ? (saldoALiquidar / media) : 99;
    return {
      ...item,
      saldoALiquidar,
      percentualExecucao: item.totalCredito > 0 ? (item.liquidadoAcumulado / item.totalCredito) * 100 : 0,
      statusCritico: mesesCobertos < (is13 ? (13 - currentMonth) : (12 - currentMonth)),
      previsaoEsgotamento: mesesCobertos,
      mediaEmpenhada: item.empenhadoAcumulado / currentMonth,
      mediaLiquidada: item.liquidadoAcumulado / currentMonth,
      is13Meses: is13
    };
  }), [data, currentMonth]);

  // Explicitly typed filteredItems to prevent 'unknown' property access errors
  const filteredItems = useMemo<CalculatedBudgetItem[]>(() => calculatedData.filter(i => {
    const vinculoLabel = VINCULO_MAP[i.vinculo] || i.vinculo;
    const matchVinculo = !activeVinculo || vinculoLabel === activeVinculo;
    const matchQuery = i.id.includes(searchQuery) || i.elemento.includes(searchQuery);
    const matchFunc = !searchFuncional || i.funcional.includes(searchFuncional);
    return matchVinculo && matchQuery && matchFunc;
  }), [calculatedData, activeVinculo, searchQuery, searchFuncional]);

  // Explicitly typed groupedData to ensure Object.entries inference works correctly
  const groupedData = useMemo<Record<string, CalculatedBudgetItem[]>>(() => {
    const g: Record<string, CalculatedBudgetItem[]> = {};
    filteredItems.forEach(i => {
      const v = VINCULO_MAP[i.vinculo] || `Vínculo ${i.vinculo}`;
      if (!g[v]) g[v] = []; 
      g[v].push(i);
    });
    return g;
  }, [filteredItems]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-indigo-900 text-white p-4 sticky top-0 z-50 shadow-xl no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-emerald-400" />
            <div>
              <h1 className="text-lg font-black tracking-tighter">CONTROLE LOA 2026</h1>
              <div className="flex items-center gap-2 opacity-70">
                <span className="text-[9px] font-bold uppercase tracking-widest">Inteligência Orçamentária</span>
                {lastSaved && <span className="text-[8px] bg-indigo-800 px-1.5 rounded flex items-center gap-1"><CheckCircle2 className="w-2 h-2" /> Salvo</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 cursor-pointer transition-all">
              <Upload className="w-4 h-4" /> {isUploading ? 'Processando...' : 'Carregar PDF'}
              <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
            </label>
            <select value={currentMonth} onChange={e => setCurrentMonth(Number(e.target.value))} className="bg-indigo-800 border-none rounded-lg text-xs font-bold p-2">
              {Array.from({length:12}, (_,i)=> <option key={i+1} value={i+1}>{new Intl.DateTimeFormat('pt-BR',{month:'long'}).format(new Date(0,i)).toUpperCase()}</option>)}
            </select>
            <button onClick={() => confirm('Limpar tudo?') && (setData([]), localStorage.clear())} className="p-2 bg-indigo-800 hover:bg-rose-600 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-indigo-500">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Crédito Filtrado</p>
            <p className="text-xl font-black">{filteredItems.reduce((a,c)=>a+c.totalCredito,0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-emerald-500">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Liquidado Filtrado</p>
            <p className="text-xl font-black">{filteredItems.reduce((a,c)=>a+c.liquidadoAcumulado,0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-rose-500">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Dotações Críticas</p>
            <p className="text-xl font-black text-rose-600">{filteredItems.filter(i => i.statusCritico).length}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 no-print">
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Filter className="w-3 h-3"/> Filtros de Navegação</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-300"/>
              <input placeholder="REF ou Elemento..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-xl text-sm focus:ring-2 ring-indigo-500/10 outline-none" />
            </div>
            <div className="relative">
              <Hash className="absolute left-3 top-3 w-4 h-4 text-slate-300"/>
              <input placeholder="Funcional (ex: 0366)" value={searchFuncional} onChange={e=>setSearchFuncional(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-xl text-sm focus:ring-2 ring-indigo-500/10 outline-none" />
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <button onClick={()=>setActiveVinculo(null)} className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${!activeVinculo ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-500'}`}>Todos</button>
              {[...new Set(data.map(i => VINCULO_MAP[i.vinculo] || i.vinculo))].map(v => (
                <button key={v} onClick={()=>setActiveVinculo(v)} className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeVinculo === v ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-500'}`}>{v}</button>
              ))}
            </div>
          </div>
        </div>

        {Object.entries(groupedData).map(([group, items]) => (
          <div key={group} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{group}</h4>
              <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-full border border-slate-200 text-indigo-600">{items.length} itens</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50/50 text-slate-400 font-bold uppercase">
                  <tr>
                    <th className="px-4 py-3 text-center w-10">ST</th>
                    <th className="px-2 py-3">REF</th>
                    <th className="px-2 py-3">Elemento</th>
                    <th className="px-2 py-3">Funcional</th>
                    <th className="px-2 py-3 text-right">Crédito</th>
                    <th className="px-2 py-3 text-right">Liquidado</th>
                    <th className="px-2 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3">Forecast</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((i: CalculatedBudgetItem) => (
                    <tr key={i.id} className={`hover:bg-slate-50 transition-colors ${i.statusCritico ? 'bg-rose-50/20' : ''}`}>
                      <td className="px-4 py-3"><div className={`w-2 h-2 rounded-full mx-auto ${i.statusCritico ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} /></td>
                      <td className="px-2 py-3 font-black">{i.id}</td>
                      <td className="px-2 py-3 font-mono text-slate-400 text-[9px]">{i.elemento}</td>
                      <td className="px-2 py-3"><span className="bg-slate-100 px-1.5 py-0.5 rounded font-black">{i.funcional}</span></td>
                      <td className="px-2 py-3 text-right font-bold">{i.totalCredito.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                      <td className="px-2 py-3 text-right">{i.liquidadoAcumulado.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                      <td className="px-2 py-3 text-right text-emerald-600 font-black">{i.saldoALiquidar.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className={`text-[9px] font-black uppercase ${i.statusCritico ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {i.previsaoEsgotamento > 12 ? 'SEGURO' : `DÉFICIT MÊS ${Math.ceil(i.previsaoEsgotamento)}`}
                          </span>
                          <span className="text-[8px] opacity-40 font-bold">{i.is13Meses ? 'CALC: 13M' : 'CALC: 12M'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {data.length === 0 && !isUploading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-300">
            <CloudOff className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-black text-xs uppercase tracking-widest">Nenhum dado salvo localmente</p>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center no-print">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center opacity-40">
          <p className="text-[9px] font-black uppercase tracking-[0.3em]">Controle LOA 2026 — Inteligência de Gestão</p>
          <div className="flex items-center gap-4 text-[8px] font-bold uppercase tracking-widest">
             <span className="flex items-center gap-1"><Save className="w-3 h-3 text-emerald-500"/> Salvamento em Tempo Real</span>
             <span className="flex items-center gap-1"><Info className="w-3 h-3 text-indigo-500"/> Banco de Dados Local (Browser)</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
