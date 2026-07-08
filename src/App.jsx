import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  clearAuthSession,
  getStoredAuthUser,
  hasStoredAuthSession,
  loadAuthenticatedUser,
  loginUser,
  logoutUser
} from "./lib/authService";
import { AUTO_REFRESH_MS, loadDashboardData, refreshDashboardData } from "./lib/dataService";
import { chartData, countBy, currency, percent, short } from "./lib/formatters";

const TABS = [
  { id: "executivo", label: "Executivo" },
  { id: "criticas", label: "Obras críticas" },
  { id: "fisicoFinanceiro", label: "Físico x financeiro" },
  { id: "farol", label: "Farol de risco" },
  { id: "gargalos", label: "Gargalos" },
  { id: "custoKm", label: "Custo/km" },
  { id: "mapaCalor", label: "Mapa RD" },
  { id: "reabilita", label: "Reabilita" },
  { id: "qualidade", label: "Qualidade" },
  { id: "historicoNota", label: "Notas" },
  { id: "execucao", label: "Obras em execução" },
  { id: "licitacoes", label: "Licitações" },
  { id: "mapa", label: "Mapa" },
  { id: "nota", label: "Nota técnica" }
];

const STATUS_COLORS = {
  "01 - OBRAS CONCLUÍDAS": "#34d399",
  FINALIZADA: "#34d399",
  INAUGURADA: "#34d399",
  "02 - OBRAS EM EXECUÇÃO": "#60a5fa",
  "03 - OBRAS COM LICITAÇÃO CONCLUÍDA": "#a5b4fc",
  "04 - OBRAS EM LICITAÇÃO": "#fbbf24",
  "05 - OBRA A LICITAR": "#fb923c",
  "06 - PROJETOS EM LICITAÇÃO": "#38bdf8",
  "07 - PROJETOS EM DESENVOLVIMENTO": "#94a3b8",
  PARALISADO: "#fb7185"
};

function normalize(value) {
  return (value || "").toString().trim().toUpperCase();
}

function statusColor(value) {
  const key = normalize(value);
  return STATUS_COLORS[key] || Object.entries(STATUS_COLORS).find(([status]) => key.includes(status))?.[1] || "#56ccf2";
}

function km(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
}

function number(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value || 0);
}

function firstDateFromNotes(value) {
  const match = (value || "").match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  return match?.[1] || "-";
}

function latestNote(value) {
  return (value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean)[0] || "-";
}

function chartPayload(entry) {
  return entry?.payload || entry || {};
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await loginUser(username, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || "Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <img src="/assets/media/governo-pe-brasao-transparent.png" alt="Governo de Pernambuco" />
          <div className="auth-kicker">SEPLAG | DER-PE</div>
          <h1>Monitoramento de Estradas</h1>
          <p>Acompanhamento executivo das obras rodoviárias de Pernambuco.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Usuário</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            <span>Senha</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}

function Kpi({ label, value, detail, tone = "primary" }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function StatusPill({ value }) {
  const color = statusColor(value);
  return (
    <span className="status-pill" style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}>
      {value || "Não informado"}
    </span>
  );
}

function buildOverview(obras, licitacoes, reabilita) {
  const totalInvestimento = obras.reduce((sum, item) => sum + (item.investimentoTotal || 0), 0);
  const totalMedido = obras.reduce((sum, item) => sum + (item.valorMedido || 0), 0);
  const kmTotal = obras.reduce((sum, item) => sum + (item.extensaoKm || 0), 0);
  const kmRecuperado = obras.reduce((sum, item) => sum + (item.kmRecuperados || 0), 0);
  const emExecucao = obras.filter((item) => normalize(item.status).includes("EXECU")).length;
  const concluida = obras.filter((item) => normalize(item.status).includes("CONCLU") || normalize(item.statusInauguracao).includes("INAUG")).length;
  const licitacaoInvest = licitacoes.reduce((sum, item) => sum + (item.valorReferencia || 0), 0);
  const reabilitaKm = reabilita.reduce((sum, item) => sum + (item.extensaoKm || 0), 0);

  return {
    totalInvestimento,
    totalMedido,
    saldo: Math.max(totalInvestimento - totalMedido, 0),
    kmTotal,
    kmRecuperado,
    emExecucao,
    concluida,
    licitacoes: licitacoes.length,
    licitacaoInvest,
    reabilitaKm,
    reabilitaLotes: new Set(reabilita.map((item) => item.lote).filter(Boolean)).size
  };
}

function regionSummary(obras) {
  const groups = new Map();
  obras.forEach((item) => {
    const region = item.regiaoDesenvolvimento || "Não informado";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(item);
  });

  return [...groups.entries()].map(([name, rows]) => ({
    name,
    obras: rows.length,
    investimento: rows.reduce((sum, item) => sum + (item.investimentoTotal || 0), 0),
    medido: rows.reduce((sum, item) => sum + (item.valorMedido || 0), 0),
    km: rows.reduce((sum, item) => sum + (item.extensaoKm || 0), 0),
    recuperado: rows.reduce((sum, item) => sum + (item.kmRecuperados || 0), 0)
  })).sort((a, b) => b.investimento - a.investimento);
}

function progressRows(obras) {
  return [...obras]
    .filter((item) => normalize(item.status).includes("EXECU"))
    .sort((a, b) => (b.avancoFisico || 0) - (a.avancoFisico || 0))
    .slice(0, 12);
}

function riskRows(obras, licitacoes) {
  const slowWorks = obras
    .filter((item) => normalize(item.status).includes("EXECU") && (item.avancoFisico || 0) < 20)
    .map((item) => ({ tipo: "Execução", nome: item.rodovia, status: item.status, detalhe: `${percent(item.avancoFisico)} físico`, observacao: item.observacao || item.finalizacao || "" }));
  const blockedBids = licitacoes
    .filter((item) => ["sim", "SIM"].includes((item.pendenteDdo || "").trim()) || normalize(item.status).includes("A LICITAR"))
    .map((item) => ({ tipo: "Licitação", nome: item.rodovia, status: item.status, detalhe: item.etapaObra || item.etapaProjeto || "-", observacao: item.consideracoes || "" }));
  return [...slowWorks, ...blockedBids].slice(0, 14);
}

function financialPercent(row) {
  return row.investimentoTotal ? (row.valorMedido || 0) / row.investimentoTotal * 100 : 0;
}

function isRunningWork(row) {
  return normalize(row.status).includes("EXECU");
}

function hasRiskTerm(value) {
  const textValue = normalize(value);
  return ["AGUARD", "PENDENTE", "PGE", "LICEN", "AUTORIZ", "EMPENHO", "CHUVA", "INTERFER", "PARALIS", "LENTO", "DDO"].some((term) => textValue.includes(term));
}

function criticalityScore(row) {
  let score = 0;
  const physical = Number(row.avancoFisico) || 0;
  const financial = financialPercent(row);
  const investment = Number(row.investimentoTotal) || 0;

  if (isRunningWork(row)) score += 12;
  if (physical < 10) score += 28;
  else if (physical < 25) score += 18;
  else if (physical < 50) score += 8;
  if (investment >= 100000000) score += 22;
  else if (investment >= 50000000) score += 15;
  else if (investment >= 20000000) score += 8;
  if (financial - physical >= 25) score += 24;
  else if (financial - physical >= 15) score += 14;
  if (!row.contratada && isRunningWork(row)) score += 10;
  if (!(row.valorMedido || 0) && isRunningWork(row)) score += 8;
  if (hasRiskTerm(`${row.observacao || ""} ${row.finalizacao || ""}`)) score += 14;

  return Math.min(score, 100);
}

function criticalityLabel(score) {
  if (score >= 70) return "Crítico";
  if (score >= 45) return "Atenção";
  if (score >= 20) return "Monitorar";
  return "Regular";
}

function criticalWorks(rows) {
  return rows
    .filter(isRunningWork)
    .map((row) => ({
      ...row,
      financeiroCalculado: financialPercent(row),
      diferencaFinanceiroFisico: financialPercent(row) - (Number(row.avancoFisico) || 0),
      criticidade: criticalityScore(row)
    }))
    .sort((a, b) => b.criticidade - a.criticidade || (b.investimentoTotal || 0) - (a.investimentoTotal || 0));
}

function physicalFinancialAnalysis(rows) {
  return rows
    .filter((row) => isRunningWork(row) && (row.investimentoTotal || 0) > 0)
    .map((row) => ({
      ...row,
      financeiroCalculado: financialPercent(row),
      diferencaFinanceiroFisico: financialPercent(row) - (Number(row.avancoFisico) || 0),
      criticidade: criticalityScore(row)
    }))
    .sort((a, b) => Math.abs(b.diferencaFinanceiroFisico) - Math.abs(a.diferencaFinanceiroFisico));
}

function bottleneckRows(licitacoes) {
  return licitacoes
    .map((row) => {
      const textValue = `${row.status || ""} ${row.etapaObra || ""} ${row.etapaProjeto || ""} ${row.consideracoes || ""}`;
      let tipoGargalo = "Acompanhar";
      if (normalize(textValue).includes("PGE")) tipoGargalo = "PGE";
      else if (normalize(textValue).includes("DDO") || normalize(textValue).includes("EMPENHO")) tipoGargalo = "DDO / empenho";
      else if (normalize(textValue).includes("AUTORIZ")) tipoGargalo = "Autorização";
      else if (normalize(textValue).includes("LICEN")) tipoGargalo = "Licença";
      else if (normalize(row.status).includes("A LICITAR")) tipoGargalo = "A licitar";
      else if (normalize(row.status).includes("LICITA")) tipoGargalo = "Em licitação";
      return { ...row, tipoGargalo, textoGargalo: textValue };
    })
    .filter((row) => row.tipoGargalo !== "Acompanhar" || hasRiskTerm(row.textoGargalo))
    .sort((a, b) => (b.valorReferencia || 0) - (a.valorReferencia || 0));
}

function costPerKmRows(rows) {
  return rows
    .filter((row) => (row.extensaoKm || 0) > 0 && (row.investimentoTotal || 0) > 0)
    .map((row) => ({
      ...row,
      custoKm: row.investimentoTotal / row.extensaoKm,
      obraEspecial: (row.extensaoKm || 0) < 1 || normalize(row.rodovia).includes("TUNEL") || normalize(row.rodovia).includes("VIADUTO") || normalize(row.rodovia).includes("PASSARELA")
    }))
    .sort((a, b) => b.custoKm - a.custoKm);
}

function regionalHeat(rows) {
  return regionSummary(rows).map((row) => ({
    ...row,
    criticas: criticalWorks(rows.filter((item) => item.regiaoDesenvolvimento === row.name)).filter((item) => item.criticidade >= 45).length,
    financeiro: row.investimento ? row.medido / row.investimento * 100 : 0,
    recuperadoPct: row.km ? row.recuperado / row.km * 100 : 0
  }));
}

function qualityChecks(rows, licitacoes, reabilita) {
  const duplicates = rows.filter((row, _index, list) => row.id && list.filter((item) => item.id === row.id).length > 1);
  return [
    { label: "Obras sem empresa", rows: rows.filter((row) => isRunningWork(row) && !row.contratada), columns: obraColumns() },
    { label: "Obras sem contrato", rows: rows.filter((row) => isRunningWork(row) && !row.contrato && !row.numeroContrato), columns: obraColumns() },
    { label: "Obras sem RD", rows: rows.filter((row) => !row.regiaoDesenvolvimento), columns: obraColumns() },
    { label: "Extensão zerada", rows: rows.filter((row) => !(row.extensaoKm || 0)), columns: obraColumns() },
    { label: "Investimento zerado", rows: rows.filter((row) => !(row.investimentoTotal || 0)), columns: obraColumns() },
    { label: "Avanço fora da faixa", rows: rows.filter((row) => (row.avancoFisico || 0) < 0 || (row.avancoFisico || 0) > 100), columns: obraColumns() },
    { label: "Medido acima do investimento", rows: rows.filter((row) => (row.investimentoTotal || 0) > 0 && (row.valorMedido || 0) > (row.investimentoTotal || 0)), columns: obraColumns() },
    { label: "IDs duplicados", rows: duplicates, columns: obraColumns() },
    { label: "Licitações sem valor", rows: licitacoes.filter((row) => !(row.valorReferencia || 0) && !(row.valorLicitado || 0)), columns: licitacaoColumns() },
    { label: "Reabilita sem lote", rows: reabilita.filter((row) => !row.lote || row.lote === "Sem lote"), columns: reabilitaColumns() }
  ];
}

function noteRows(obras, licitacoes) {
  return [...obras, ...licitacoes]
    .filter((row) => row.observacao || row.consideracoes || row.finalizacao)
    .map((row) => ({
      ...row,
      ultimaObservacao: latestNote(row.observacao || row.consideracoes || row.finalizacao),
      dataObservacao: firstDateFromNotes(row.observacao || row.consideracoes || row.finalizacao),
      criticidade: criticalityScore(row)
    }))
    .sort((a, b) => b.criticidade - a.criticidade);
}

function ObrasCriticasTab({ rows, onDrillDown }) {
  const critical = criticalWorks(rows);
  const top = critical.slice(0, 15);
  const buckets = ["Crítico", "Atenção", "Monitorar", "Regular"].map((label) => ({
    name: label,
    value: critical.filter((row) => criticalityLabel(row.criticidade) === label).length
  }));

  return (
    <div className="slide">
      <div className="kpi-grid">
        <Kpi label="Críticas" value={buckets.find((item) => item.name === "Crítico")?.value || 0} detail="Score acima de 70" tone="danger" />
        <Kpi label="Em atenção" value={buckets.find((item) => item.name === "Atenção")?.value || 0} detail="Score entre 45 e 69" tone="warning" />
        <Kpi label="Maior risco" value={top[0]?.rodovia || "-"} detail={top[0] ? `${top[0].criticidade} pontos` : ""} />
        <Kpi label="Investimento crítico" value={currency(critical.filter((row) => row.criticidade >= 45).reduce((sum, row) => sum + (row.investimentoTotal || 0), 0))} />
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="slide-head">
            <h2>Distribuição do risco</h2>
            <p>Classificação automática considerando avanço, investimento, medição, contrato e observações.</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="value"
                radius={[8, 8, 0, 0]}
                onClick={(entry) => {
                  const payload = chartPayload(entry);
                  onDrillDown({
                    title: `Obras | ${payload.name}`,
                    rows: critical.filter((row) => criticalityLabel(row.criticidade) === payload.name),
                    columns: criticalColumns()
                  });
                }}
                className="chart-clickable"
              >
                {buckets.map((entry) => <Cell key={entry.name} fill={entry.name === "Crítico" ? "#fb7185" : entry.name === "Atenção" ? "#fbbf24" : entry.name === "Monitorar" ? "#60a5fa" : "#34d399"} />)}
                <LabelList dataKey="value" position="top" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="panel">
          <div className="slide-head">
            <h2>Top 15 críticas</h2>
            <p>Ranking das obras em execução com maior score de criticidade.</p>
          </div>
          <DataTable rows={top} columns={criticalColumns()} />
        </section>
      </div>
    </div>
  );
}

function FisicoFinanceiroTab({ rows, onDrillDown }) {
  const analysis = physicalFinancialAnalysis(rows);
  const mismatch = analysis.filter((row) => Math.abs(row.diferencaFinanceiroFisico) >= 15);
  const highFinancialLowPhysical = analysis.filter((row) => row.financeiroCalculado >= 30 && (row.avancoFisico || 0) <= 25);
  const scatterRows = analysis.map((row) => ({
    ...row,
    x: Number(row.avancoFisico) || 0,
    y: row.financeiroCalculado,
    z: Math.max((row.investimentoTotal || 0) / 1000000, 4)
  }));

  return (
    <div className="slide">
      <div className="kpi-grid">
        <Kpi label="Descasamentos" value={mismatch.length} detail="Diferença maior que 15 p.p." />
        <Kpi label="Financeiro alto / físico baixo" value={highFinancialLowPhysical.length} detail="Financeiro >= 30% e físico <= 25%" tone="danger" />
        <Kpi label="Maior diferença" value={analysis[0] ? percent(Math.abs(analysis[0].diferencaFinanceiroFisico)) : "0%"} detail={analysis[0]?.rodovia || "-"} />
        <Kpi label="Base analisada" value={analysis.length} detail="Obras em execução com investimento" />
      </div>
      <section className="panel">
        <div className="slide-head">
          <h2>Dispersão físico x financeiro</h2>
          <p>Cada ponto é uma obra. Acima da diagonal indica financeiro maior que físico.</p>
        </div>
        <ResponsiveContainer width="100%" height={420}>
          <ScatterChart margin={{ top: 20, right: 24, bottom: 20, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" name="Físico" unit="%" domain={[0, 100]} />
            <YAxis type="number" dataKey="y" name="Financeiro" unit="%" domain={[0, 100]} />
            <Tooltip formatter={(value) => percent(value)} cursor={{ strokeDasharray: "3 3" }} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#94a3b8" strokeDasharray="4 4" />
            <Scatter
              data={scatterRows}
              fill="#60a5fa"
              onClick={(entry) => onDrillDown({ title: `Físico x financeiro | ${entry.rodovia}`, rows: [entry], columns: financialColumns() })}
              className="chart-clickable"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </section>
      <section className="panel">
        <div className="slide-head">
          <h2>Maiores diferenças</h2>
          <p>Obras ordenadas pelo maior afastamento entre avanço físico e financeiro calculado.</p>
        </div>
        <DataTable rows={analysis.slice(0, 20)} columns={financialColumns()} />
      </section>
    </div>
  );
}

function FarolRiscoTab({ rows, onDrillDown }) {
  const critical = criticalWorks(rows);
  const groups = ["Crítico", "Atenção", "Monitorar", "Regular"].map((label) => {
    const scoped = critical.filter((row) => criticalityLabel(row.criticidade) === label);
    return {
      name: label,
      obras: scoped.length,
      investimento: scoped.reduce((sum, row) => sum + (row.investimentoTotal || 0), 0),
      rows: scoped
    };
  });

  return (
    <div className="slide">
      <section className="panel">
        <div className="slide-head">
          <h2>Farol de risco</h2>
          <p>Semáforo executivo para priorização semanal das obras em execução.</p>
        </div>
        <div className="risk-lanes">
          {groups.map((group) => (
            <button
              className={`risk-lane risk-${group.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
              key={group.name}
              type="button"
              onClick={() => onDrillDown({ title: `Farol | ${group.name}`, rows: group.rows, columns: criticalColumns() })}
            >
              <span>{group.name}</span>
              <strong>{group.obras}</strong>
              <em>{currency(group.investimento)}</em>
            </button>
          ))}
        </div>
        <div className="risk-methodology">
          <div>
            <p className="eyebrow">Metodologia</p>
            <h3>Como calculamos a criticidade</h3>
            <p>
              A nota vai de 0 a 100 pontos e soma sinais de risco operacional, financeiro e cadastral.
              Quanto maior a nota, maior a prioridade de acompanhamento na reunião.
            </p>
          </div>
          <div className="risk-method-grid">
            <div className="risk-method-card">
              <span>Baixo avanço físico</span>
              <strong>até 28 pts</strong>
              <p>Menos de 10% físico soma 28 pts; entre 10% e 25% soma 18 pts; entre 25% e 50% soma 8 pts.</p>
            </div>
            <div className="risk-method-card">
              <span>Alto investimento</span>
              <strong>até 22 pts</strong>
              <p>Obras acima de R$ 100 mi somam 22 pts; acima de R$ 50 mi somam 15 pts; acima de R$ 20 mi somam 8 pts.</p>
            </div>
            <div className="risk-method-card">
              <span>Financeiro acima do físico</span>
              <strong>até 24 pts</strong>
              <p>Quando o financeiro calculado supera o físico em 25 p.p. ou mais soma 24 pts; acima de 15 p.p. soma 14 pts.</p>
            </div>
            <div className="risk-method-card">
              <span>Dados contratuais e medição</span>
              <strong>até 18 pts</strong>
              <p>Obra em execução sem empresa soma 10 pts. Obra em execução sem valor medido soma 8 pts.</p>
            </div>
            <div className="risk-method-card">
              <span>Entraves em observações</span>
              <strong>14 pts</strong>
              <p>Termos como aguardando, pendente, PGE, licença, autorização, empenho, chuva, interferência, paralisado, lento ou DDO somam risco.</p>
            </div>
            <div className="risk-method-card">
              <span>Obra em execução</span>
              <strong>12 pts</strong>
              <p>A tela prioriza obras em execução. Esse status soma uma base de 12 pontos antes dos demais fatores.</p>
            </div>
          </div>
          <div className="risk-scale">
            <span><i className="scale-critical" /> Crítico: 70 a 100 pts</span>
            <span><i className="scale-warning" /> Atenção: 45 a 69 pts</span>
            <span><i className="scale-watch" /> Monitorar: 20 a 44 pts</span>
            <span><i className="scale-regular" /> Regular: abaixo de 20 pts</span>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="slide-head">
          <h2>Fila de decisão</h2>
          <p>Lista priorizada para reunião de monitoramento.</p>
        </div>
        <DataTable rows={critical.slice(0, 25)} columns={criticalColumns()} />
      </section>
    </div>
  );
}

function GargalosTab({ rows, onDrillDown }) {
  const bottlenecks = bottleneckRows(rows);
  const byType = chartData(countBy(bottlenecks, "tipoGargalo"));

  return (
    <div className="slide">
      <div className="two-col">
        <section className="panel">
          <div className="slide-head">
            <h2>Gargalos de licitação</h2>
            <p>Classificação automática por termos de etapa e observações.</p>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={byType} layout="vertical" margin={{ left: 24, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip />
              <Bar
                dataKey="value"
                fill="#fbbf24"
                radius={[0, 8, 8, 0]}
                onClick={(entry) => {
                  const payload = chartPayload(entry);
                  onDrillDown({ title: `Gargalo | ${payload.name}`, rows: bottlenecks.filter((row) => row.tipoGargalo === payload.name), columns: bottleneckColumns() });
                }}
                className="chart-clickable"
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="panel">
          <div className="slide-head">
            <h2>Indicadores</h2>
            <p>Itens com risco operacional no bloco a executar.</p>
          </div>
          <div className="kpi-grid kpi-grid-compact">
            <Kpi label="Gargalos" value={bottlenecks.length} />
            <Kpi label="PGE" value={bottlenecks.filter((row) => row.tipoGargalo === "PGE").length} />
            <Kpi label="DDO / empenho" value={bottlenecks.filter((row) => row.tipoGargalo === "DDO / empenho").length} />
            <Kpi label="A licitar" value={bottlenecks.filter((row) => row.tipoGargalo === "A licitar").length} />
          </div>
        </section>
      </div>
      <section className="panel">
        <DataTable rows={bottlenecks.slice(0, 40)} columns={bottleneckColumns()} />
      </section>
    </div>
  );
}

function CustoKmTab({ rows, onDrillDown }) {
  const values = costPerKmRows(rows);
  const common = values.filter((row) => !row.obraEspecial).slice(0, 12);
  const special = values.filter((row) => row.obraEspecial).slice(0, 12);

  return (
    <div className="slide">
      <div className="two-col">
        <section className="panel">
          <div className="slide-head">
            <h2>Obras comuns</h2>
            <p>Ranking de custo por km sem trechos especiais muito curtos.</p>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={common} layout="vertical" margin={{ left: 22, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => `${Math.round(value / 1000000)} mi/km`} />
              <YAxis dataKey="rodovia" type="category" width={120} />
              <Tooltip formatter={(value) => currency(value)} />
              <Bar dataKey="custoKm" fill="#60a5fa" radius={[0, 8, 8, 0]} onClick={(entry) => onDrillDown({ title: `Custo/km | ${chartPayload(entry).rodovia}`, rows: [chartPayload(entry)], columns: costColumns() })} className="chart-clickable" />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="panel">
          <div className="slide-head">
            <h2>Obras especiais</h2>
            <p>Túneis, viadutos, passarelas ou trechos curtos tratados separadamente.</p>
          </div>
          <DataTable rows={special} columns={costColumns()} />
        </section>
      </div>
      <section className="panel">
        <DataTable rows={values.slice(0, 30)} columns={costColumns()} />
      </section>
    </div>
  );
}

function MapaCalorRdTab({ rows, onDrillDown }) {
  const heat = regionalHeat(rows);
  const maxCritical = Math.max(...heat.map((row) => row.criticas), 1);

  return (
    <div className="slide">
      <section className="panel">
        <div className="slide-head">
          <h2>Mapa de calor por RD</h2>
          <p>Concentração territorial de investimento, km e obras críticas.</p>
        </div>
        <div className="rd-heat-grid">
          {heat.map((row) => (
            <button
              type="button"
              className="rd-heat-card"
              key={row.name}
              style={{ borderColor: `rgba(251, 113, 133, ${0.18 + row.criticas / maxCritical * 0.55})` }}
              onClick={() => onDrillDown({ title: `RD | ${row.name}`, rows: rows.filter((item) => item.regiaoDesenvolvimento === row.name), columns: obraColumns() })}
            >
              <span>{row.name}</span>
              <strong>{row.criticas} críticas</strong>
              <em>{currency(row.investimento)}</em>
              <small>{km(row.km)} km | {percent(row.financeiro)} financeiro</small>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <DataTable rows={heat} columns={[
          ["name", "RD", (row) => <strong>{row.name}</strong>],
          ["obras", "Obras"],
          ["criticas", "Críticas"],
          ["investimento", "Investimento", (row) => currency(row.investimento)],
          ["medido", "Medido", (row) => currency(row.medido)],
          ["financeiro", "% financeiro", (row) => percent(row.financeiro)],
          ["km", "Km", (row) => km(row.km)],
          ["recuperado", "Km recuperados", (row) => km(row.recuperado)]
        ]} />
      </section>
    </div>
  );
}

function QualidadeBaseTab({ data, onDrillDown }) {
  const checks = qualityChecks(data.obras, data.licitacoes, data.reabilita);

  return (
    <div className="slide">
      <section className="panel">
        <div className="slide-head">
          <h2>Qualidade da base</h2>
          <p>Inconsistências e lacunas que merecem conferência na origem.</p>
        </div>
        <div className="quality-list">
          {checks.map((check) => (
            <button
              className={`quality-item ${check.rows.length ? "is-warning" : ""}`}
              key={check.label}
              type="button"
              disabled={!check.rows.length}
              onClick={() => onDrillDown({ title: `Qualidade | ${check.label}`, rows: check.rows, columns: check.columns })}
            >
              <span>{check.label}</span>
              <strong>{check.rows.length}</strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function HistoricoNotasTab({ data, onDrillDown }) {
  const rows = noteRows(data.obras, data.licitacoes);

  return (
    <div className="slide">
      <section className="panel">
        <div className="slide-head">
          <h2>Notas e observações</h2>
          <p>Histórico priorizado pelas observações mais críticas e recentes identificáveis.</p>
        </div>
        <DataTable rows={rows.slice(0, 60)} columns={[
          ["dataObservacao", "Data"],
          ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
          ["status", "Status", (row) => <StatusPill value={row.status} />],
          ["criticidade", "Risco", (row) => `${row.criticidade} | ${criticalityLabel(row.criticidade)}`],
          ["ultimaObservacao", "Última observação", (row) => short(row.ultimaObservacao, 160)]
        ]} onRowClick={(row) => onDrillDown({ title: `Observações | ${row.rodovia}`, rows: [row], columns: [
          ["rodovia", "Rodovia"],
          ["status", "Status", (item) => <StatusPill value={item.status} />],
          ["dataObservacao", "Data"],
          ["ultimaObservacao", "Última observação"],
          ["observacao", "Observação completa", (item) => item.observacao || item.consideracoes || item.finalizacao || "-"]
        ] })} />
      </section>
    </div>
  );
}

function ExecutiveTab({ data, overview, selectedRegion, onDrillDown }) {
  const obras = data.obras.filter((item) => selectedRegion === "TODAS" || item.regiaoDesenvolvimento === selectedRegion);
  const licitacoes = data.licitacoes.filter((item) => selectedRegion === "TODAS" || item.regiaoDesenvolvimento === selectedRegion);
  const byRegion = regionSummary(obras).slice(0, 8);
  const statusData = chartData(countBy(obras, "status")).slice(0, 8);

  return (
    <div className="slide">
      <div className="kpi-grid">
        <Kpi label="Investimento monitorado" value={currency(overview.totalInvestimento)} detail={`${currency(overview.totalMedido)} medidos`} />
        <Kpi label="Rodovias monitoradas" value={number(obras.length)} detail={`${overview.emExecucao} em execução | ${overview.concluida} concluídas`} />
        <Kpi label="Extensão total" value={`${km(overview.kmTotal)} km`} detail={`${km(overview.kmRecuperado)} km recuperados`} />
        <Kpi label="Bloco a executar" value={number(licitacoes.length)} detail={`${currency(overview.licitacaoInvest)} em referência`} />
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="slide-head">
            <h2>Investimento por RD</h2>
            <p>Comparação entre investimento total e valores medidos nas obras do monitoramento GOV.</p>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={byRegion} layout="vertical" margin={{ left: 22, right: 22 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => `${value / 1000000} mi`} />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip formatter={(value) => currency(value)} />
              <Bar
                dataKey="investimento"
                fill="#60a5fa"
                name="Investimento"
                radius={[0, 8, 8, 0]}
                onClick={(entry) => {
                  const payload = chartPayload(entry);
                  onDrillDown({
                    title: `Investimento | ${payload.name}`,
                    rows: obras.filter((row) => row.regiaoDesenvolvimento === payload.name),
                    columns: obraColumns()
                  });
                }}
                className="chart-clickable"
              />
              <Bar
                dataKey="medido"
                fill="#34d399"
                name="Medido"
                radius={[0, 8, 8, 0]}
                onClick={(entry) => {
                  const payload = chartPayload(entry);
                  onDrillDown({
                    title: `Valores medidos | ${payload.name}`,
                    rows: obras.filter((row) => row.regiaoDesenvolvimento === payload.name),
                    columns: obraColumns()
                  });
                }}
                className="chart-clickable"
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="panel">
          <div className="slide-head">
            <h2>Status das obras</h2>
            <p>Distribuição dos empreendimentos por estágio informado.</p>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" height={88} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="value"
                radius={[8, 8, 0, 0]}
                onClick={(entry) => {
                  const payload = chartPayload(entry);
                  onDrillDown({
                    title: `Status | ${payload.name}`,
                    rows: obras.filter((row) => row.status === payload.name),
                    columns: obraColumns()
                  });
                }}
                className="chart-clickable"
              >
                {statusData.map((entry) => <Cell key={entry.name} fill={statusColor(entry.name)} />)}
                <LabelList dataKey="value" position="top" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      <section className="panel">
        <div className="slide-head">
          <h2>Alertas para gestão</h2>
          <p>Itens com baixo avanço físico ou licitação em etapa sensível.</p>
        </div>
        <DataTable
          rows={riskRows(obras, licitacoes)}
          columns={[
            ["tipo", "Tipo"],
            ["nome", "Rodovia"],
            ["status", "Status", (row) => <StatusPill value={row.status} />],
            ["detalhe", "Detalhe"],
            ["observacao", "Última observação", (row) => short(latestNote(row.observacao), 120)]
          ]}
        />
      </section>
    </div>
  );
}

function ExecutionTab({ rows, onSelect, onDrillDown }) {
  const [query, setQuery] = useState("");
  const filtered = rows
    .filter((row) => `${row.rodovia} ${row.inicio} ${row.fim} ${row.contratada} ${row.regiaoDesenvolvimento}`.toUpperCase().includes(query.toUpperCase()))
    .sort((a, b) => (b.investimentoTotal || 0) - (a.investimentoTotal || 0));
  const topProgress = progressRows(filtered);

  return (
    <div className="slide">
      <section className="panel">
        <div className="slide-head">
          <h2>Obras em execução</h2>
          <p>Carteira do Monitoramento GOV com avanço físico, financeiro, contrato e extensão.</p>
        </div>
        <div className="table-actions">
          <div className="filter-field">
            <span>Buscar</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rodovia, trecho, empresa ou RD" />
          </div>
        </div>
        <DataTable
          rows={filtered}
          onRowClick={onSelect}
          columns={[
            ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
            ["trecho", "Trecho", (row) => short(`${row.inicio || ""} - ${row.fim || ""}`, 72)],
            ["regiaoDesenvolvimento", "RD"],
            ["contratada", "Empresa", (row) => short(row.contratada, 44)],
            ["extensaoKm", "Km", (row) => km(row.extensaoKm)],
            ["avancoFisico", "% físico", (row) => <strong>{percent(row.avancoFisico)}</strong>],
            ["investimentoTotal", "Investimento", (row) => currency(row.investimentoTotal)],
            ["valorMedido", "Medido", (row) => currency(row.valorMedido)],
            ["status", "Status", (row) => <StatusPill value={row.status} />]
          ]}
        />
      </section>
      <section className="panel">
        <div className="slide-head">
          <h2>Ranking de avanço</h2>
          <p>Obras em execução com maior percentual físico informado.</p>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={topProgress} margin={{ left: 12, right: 12, bottom: 44 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="rodovia" interval={0} angle={-18} textAnchor="end" height={92} />
            <YAxis tickFormatter={(value) => `${value}%`} />
            <Tooltip formatter={(value) => percent(value)} />
            <Bar
              dataKey="avancoFisico"
              fill="#60a5fa"
              radius={[8, 8, 0, 0]}
              onClick={(entry) => {
                const payload = chartPayload(entry);
                onDrillDown({
                  title: `Ranking de avanço | ${payload.rodovia}`,
                  rows: filtered.filter((row) => row.id === payload.id),
                  columns: obraColumns()
                });
              }}
              className="chart-clickable"
            />
            <Line type="monotone" dataKey="avancoFinanceiro" stroke="#34d399" strokeWidth={3} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function LicitacoesTab({ rows, onDrillDown }) {
  const [status, setStatus] = useState("TODOS");
  const statuses = ["TODOS", ...new Set(rows.map((item) => item.status).filter(Boolean))].sort();
  const filtered = rows.filter((row) => status === "TODOS" || row.status === status);
  const byStage = chartData(countBy(filtered, "status")).slice(0, 10);
  const byType = chartData(countBy(filtered, "tipo"));

  return (
    <div className="slide">
      <div className="two-col">
        <section className="panel">
          <div className="slide-head">
            <h2>Pipeline por etapa</h2>
            <p>Bloco a executar vindo do Controle de Licitações.</p>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={byStage} layout="vertical" margin={{ left: 28, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={170} />
              <Tooltip />
              <Bar
                dataKey="value"
                radius={[0, 8, 8, 0]}
                onClick={(entry) => {
                  const payload = chartPayload(entry);
                  onDrillDown({
                    title: `Licitações | ${payload.name}`,
                    rows: filtered.filter((row) => row.status === payload.name),
                    columns: licitacaoColumns()
                  });
                }}
                className="chart-clickable"
              >
                {byStage.map((entry) => <Cell key={entry.name} fill={statusColor(entry.name)} />)}
                <LabelList dataKey="value" position="right" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="panel">
          <div className="slide-head">
            <h2>Tipo de contratação</h2>
            <p>Separação entre obra, projeto, supervisão e itens diversos.</p>
          </div>
          <div className="mini-bars">
            {byType.map((item) => (
              <button
                className="mini-bar mini-bar-button"
                key={item.name}
                type="button"
                onClick={() => onDrillDown({
                  title: `Tipo de contratação | ${item.name}`,
                  rows: filtered.filter((row) => row.tipo === item.name),
                  columns: licitacaoColumns()
                })}
              >
                <div><strong>{item.name}</strong><span>{item.value}</span></div>
                <em><i style={{ width: `${Math.min((item.value / Math.max(...byType.map((x) => x.value))) * 100, 100)}%` }} /></em>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="slide-head">
          <h2>Lista de licitações</h2>
          <p>Use a etapa para priorizar análises de prazo, PGE, DDO, autorização e ordem de serviço.</p>
        </div>
        <div className="table-actions table-actions-right">
          <div className="filter-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <DataTable
          rows={filtered}
          columns={[
            ["id", "ID"],
            ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
            ["tipo", "Tipo"],
            ["regiaoDesenvolvimento", "RD"],
            ["extensaoKm", "Km", (row) => km(row.extensaoKm)],
            ["valorReferencia", "Valor ref.", (row) => currency(row.valorReferencia)],
            ["etapaObra", "Etapa obra", (row) => short(row.etapaObra || row.etapaProjeto, 58)],
            ["prazoEtapa", "Prazo"],
            ["status", "Status", (row) => <StatusPill value={row.status} />]
          ]}
        />
      </section>
    </div>
  );
}

function ReabilitaTab({ rows, onDrillDown }) {
  const lots = [...new Set(rows.map((item) => item.lote).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const summary = lots.map((lote) => {
    const lotRows = rows.filter((item) => item.lote === lote);
    return {
      lote,
      estradas: lotRows.length,
      km: lotRows.reduce((sum, item) => sum + (item.extensaoKm || 0), 0),
      investimento: lotRows.reduce((sum, item) => sum + (item.investimentoEstimado || 0), 0)
    };
  });

  return (
    <div className="slide">
      <div className="kpi-grid">
        <Kpi label="Lotes" value={lots.length} detail="Blocos do Reabilita" />
        <Kpi label="Estradas" value={rows.length} detail="Trechos cadastrados" />
        <Kpi label="Extensão" value={`${km(rows.reduce((sum, item) => sum + (item.extensaoKm || 0), 0))} km`} />
        <Kpi label="Investimento estimado" value={currency(rows.reduce((sum, item) => sum + (item.investimentoEstimado || 0), 0))} />
      </div>
      <section className="panel">
        <div className="slide-head">
          <h2>Estradas por lote</h2>
          <p>Programa de pequenas intervenções organizado por lote.</p>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={summary}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="lote" interval={0} angle={-12} textAnchor="end" height={70} />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip formatter={(value, name) => name === "investimento" ? currency(value) : value} />
            <Bar
              yAxisId="left"
              dataKey="estradas"
              fill="#60a5fa"
              name="Estradas"
              radius={[8, 8, 0, 0]}
              onClick={(entry) => {
                const payload = chartPayload(entry);
                onDrillDown({
                  title: `Reabilita | ${payload.lote}`,
                  rows: rows.filter((row) => row.lote === payload.lote),
                  columns: reabilitaColumns()
                });
              }}
              className="chart-clickable"
            />
            <Line yAxisId="right" dataKey="km" stroke="#34d399" strokeWidth={3} name="Km" />
          </BarChart>
        </ResponsiveContainer>
      </section>
      <section className="panel">
        <div className="slide-head">
          <h2>Detalhamento Reabilita</h2>
          <p>Lista de trechos pronta para receber status por lote quando a base atualizada chegar.</p>
        </div>
        <DataTable
          rows={rows}
          columns={[
            ["lote", "Lote"],
            ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
            ["trecho", "Trecho", (row) => short(`${row.inicio || ""} - ${row.fim || ""}`, 76)],
            ["extensaoKm", "Km", (row) => km(row.extensaoKm)],
            ["investimentoEstimado", "Investimento", (row) => currency(row.investimentoEstimado)],
            ["custoKm", "R$/km", (row) => currency(row.custoKm)]
          ]}
        />
      </section>
    </div>
  );
}

function MapTab({ data }) {
  const [roads, setRoads] = useState([]);
  const [stateShape, setStateShape] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("TODOS");
  const [selectedDro, setSelectedDro] = useState("TODOS");
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [roadPopup, setRoadPopup] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/pernambuco.geojson", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/data/pernambuco-municipios.geojson", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/data/roads.geojson", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
    ])
      .then(([statePayload, municipalityPayload, roadsPayload]) => {
        setStateShape(statePayload?.features || []);
        setMunicipalities(municipalityPayload?.features || []);
        setRoads(roadsPayload?.features || []);
      })
      .catch(() => {
        setStateShape([]);
        setMunicipalities([]);
        setRoads([]);
      });
  }, []);

  const statusOptions = useMemo(() => ["TODOS", ...new Set(roads.map((feature) => feature.properties?.STATUS).filter(Boolean))].sort(), [roads]);
  const droOptions = useMemo(() => ["TODOS", ...new Set(roads.map((feature) => feature.properties?.DRO).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })), [roads]);
  const filteredRoads = roads.filter((feature) => (
    (selectedStatus === "TODOS" || feature.properties?.STATUS === selectedStatus) &&
    (selectedDro === "TODOS" || String(feature.properties?.DRO) === selectedDro)
  ));
  const width = 980;
  const height = 560;
  const bounds = useMemo(() => boundsFromFeatures([...stateShape, ...roads]), [stateShape, roads]);
  const project = useMemo(() => createProjector(bounds, width, height), [bounds]);
  const selectedProperties = selectedRoad?.properties || filteredRoads[0]?.properties || {};
  const totalKm = filteredRoads.reduce((sum, feature) => sum + (Number(feature.properties?.EXTENSAO_1 || feature.properties?.EXTENSAO) || 0), 0);
  const totalCost = filteredRoads.reduce((sum, feature) => sum + (Number(String(feature.properties?.["CUSTO OBRA"] || 0).replace(",", ".")) || 0), 0);

  return (
    <div className="slide">
      <section className="panel">
        <div className="slide-head">
          <h2>Mapa de Pernambuco</h2>
          <p>Shapefile DER convertido para GeoJSON com trechos, extensão, status, DRO e custos.</p>
        </div>
        <div className="map-layout roads-map-layout">
          <div className="map-canvas roads-map-canvas">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mapa de obras rodoviárias do DER em Pernambuco">
              {stateShape.map((feature, index) => (
                <path key={`state-${index}`} className="map-shape" d={geometryPath(feature.geometry, project)} />
              ))}
              {municipalities.map((feature, index) => (
                <path key={`municipality-${index}`} className="map-municipal-boundaries" d={geometryPath(feature.geometry, project)} />
              ))}
              {filteredRoads.map((feature, index) => {
                const status = feature.properties?.STATUS || "";
                const color = statusColor(status);
                const isSelected = selectedRoad === feature;
                return (
                  <path
                    key={`${feature.properties?.fid || index}-${feature.properties?.CODIGO_SRE}`}
                    className="road-line"
                    d={geometryPath(feature.geometry, project)}
                    stroke={color}
                    strokeWidth={isSelected ? 4.2 : 2.4}
                    onClick={() => {
                      setSelectedRoad(feature);
                      setRoadPopup(feature);
                    }}
                  >
                    <title>{roadLabel(feature.properties)}</title>
                  </path>
                );
              })}
            </svg>
            <div className="map-legend">
              <span><i style={{ background: statusColor("EM ANDAMENTO") }} /> Em andamento</span>
              <span><i style={{ background: statusColor("01 - OBRAS CONCLUÍDAS") }} /> Concluída</span>
              <span><i style={{ background: "#94a3b8" }} /> Outros status</span>
            </div>
          </div>
          <aside className="map-detail">
            <div>
              <p className="eyebrow">Camada DER</p>
              <h3>{filteredRoads.length} trechos</h3>
            </div>
            <div className="map-filters">
              <label>
                <span>Status</span>
                <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                  {statusOptions.map((option) => <option key={option} value={option}>{option === "TODOS" ? "Todos" : option}</option>)}
                </select>
              </label>
              <label>
                <span>DRO</span>
                <select value={selectedDro} onChange={(event) => setSelectedDro(event.target.value)}>
                  {droOptions.map((option) => <option key={option} value={option}>{option === "TODOS" ? "Todos" : `DRO ${option}`}</option>)}
                </select>
              </label>
            </div>
            <dl>
              <dt>Extensão filtrada</dt>
              <dd>{km(totalKm)} km</dd>
              <dt>Custo obra</dt>
              <dd>{currency(totalCost)}</dd>
              <dt>Rodovia selecionada</dt>
              <dd>{selectedProperties.CONCT_ROD || selectedProperties["ROD."] || "-"}</dd>
              <dt>Trecho</dt>
              <dd>{short(`${selectedProperties.LOCAL_INIC || ""} - ${selectedProperties.LOCAL_FIM || ""}`, 120)}</dd>
              <dt>Situação</dt>
              <dd>{selectedProperties.DESC_SITUA || selectedProperties.STATUS || "-"}</dd>
            </dl>
            <p className="map-note">
              {data.obras.length} obras do Monitoramento GOV e {data.reabilita.length} trechos Reabilita podem ser vinculados a esta camada por código/rodovia.
            </p>
          </aside>
        </div>
      </section>
      <RoadFeatureModal feature={roadPopup} onClose={() => setRoadPopup(null)} />
    </div>
  );
}

function TechnicalNoteTab({ obras, licitacoes }) {
  const candidates = [...obras, ...licitacoes]
    .filter((item) => item.observacao || item.consideracoes)
    .slice(0, 25);
  const [selectedId, setSelectedId] = useState(candidates[0]?.id || "");
  const selected = candidates.find((item) => String(item.id) === String(selectedId)) || candidates[0];
  const text = selected ? generateTechnicalNote(selected) : "";

  return (
    <div className="slide">
      <section className="panel">
        <div className="slide-head">
          <h2>Última observação automática</h2>
          <p>Modelo inicial de nota técnica montada a partir dos campos de status, contrato, avanço, interferências e observações.</p>
        </div>
        <div className="table-actions">
          <div className="filter-field">
            <span>Rodovia</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {candidates.map((item) => <option key={`${item.id}-${item.rodovia}`} value={item.id}>{item.rodovia}</option>)}
            </select>
          </div>
        </div>
        <article className="note-box">
          <pre>{text}</pre>
        </article>
      </section>
    </div>
  );
}

function generateTechnicalNote(item) {
  const note = item.observacao || item.consideracoes || "";
  const status = item.status || "Sem status informado";
  const date = firstDateFromNotes(note);
  const company = item.contratada || item.empresa || "-";
  const physical = item.avancoFisico !== undefined ? percent(item.avancoFisico) : "-";
  const financial = item.avancoFinanceiro !== undefined ? percent(item.avancoFinanceiro) : "-";

  return [
    `${item.rodovia || "Rodovia sem identificação"}`,
    "",
    `Obra em ${status.replace(/^\d+\s*-\s*/, "").toUpperCase()}`,
    "",
    "1. STATUS GERAL",
    `${date} - ${latestNote(note)}`,
    "",
    "2. INTERFERÊNCIAS MEIO AMBIENTE",
    "Sem registro estruturado na base atual.",
    "",
    "3. INTERFERÊNCIAS DESAPROPRIAÇÃO",
    "Sem registro estruturado na base atual.",
    "",
    "4. INTERFERÊNCIAS NEOENERGIA",
    "Sem registro estruturado na base atual.",
    "",
    "5. INTERFERÊNCIAS COMPESA",
    "Sem registro estruturado na base atual.",
    "",
    "PONTOS RELEVANTES:",
    short(note.replace(/\n/g, " "), 420),
    "",
    "INFORMAÇÕES CONTRATUAIS",
    `Contratada atual: ${company}`,
    `Contrato: ${item.contrato || item.numeroContrato || "-"}`,
    `Extensão: ${km(item.extensaoKm)} km`,
    `Avanço físico: ${physical}`,
    `Avanço financeiro: ${financial}`,
    `Investimento total: ${currency(item.investimentoTotal || item.valorReferencia || 0)}`,
    `Valor medido/licitação: ${currency(item.valorMedido || item.valorLicitado || 0)}`
  ].join("\n");
}

function coordinatesFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates;
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

function boundsFromFeatures(features) {
  const coords = features.flatMap((feature) => coordinatesFromGeometry(feature.geometry));
  const valid = coords.filter((coord) => Number.isFinite(coord?.[0]) && Number.isFinite(coord?.[1]));
  if (!valid.length) return { minX: -41.5, minY: -9.7, maxX: -34.7, maxY: -7.2 };
  return valid.reduce((acc, [x, y]) => ({
    minX: Math.min(acc.minX, x),
    minY: Math.min(acc.minY, y),
    maxX: Math.max(acc.maxX, x),
    maxY: Math.max(acc.maxY, y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function createProjector(bounds, width, height, padding = 24) {
  const spanX = Math.max(bounds.maxX - bounds.minX, 0.01);
  const spanY = Math.max(bounds.maxY - bounds.minY, 0.01);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return ([x, y]) => [
    offsetX + (x - bounds.minX) * scale,
    height - (offsetY + (y - bounds.minY) * scale)
  ];
}

function ringPath(ring, project) {
  return ring.map((coord, index) => {
    const [x, y] = project(coord);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function geometryPath(geometry, project) {
  if (!geometry) return "";
  if (geometry.type === "LineString") return ringPath(geometry.coordinates, project);
  if (geometry.type === "MultiLineString") return geometry.coordinates.map((line) => ringPath(line, project)).join(" ");
  if (geometry.type === "Polygon") return geometry.coordinates.map((ring) => `${ringPath(ring, project)} Z`).join(" ");
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => `${ringPath(ring, project)} Z`)).join(" ");
  return "";
}

function roadLabel(properties = {}) {
  const road = properties.CONCT_ROD || properties["ROD."] || `${properties.UF || ""}${properties.RODOVIA || ""}`;
  const start = properties.LOCAL_INIC || "";
  const end = properties.LOCAL_FIM || "";
  return `${road}${start || end ? ` | ${start} - ${end}` : ""}`;
}

function DataTable({ rows, columns, onRowClick }) {
  return (
    <div className="table-wrap contractor-table">
      <table>
        <thead>
          <tr>
            {columns.map(([, label]) => <th key={label}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.id || row.rodovia || row.nome}-${index}`}
              className={onRowClick ? "clickable-row" : ""}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map(([field, label, render]) => <td key={`${label}-${field}`}>{render ? render(row) : (row[field] || "-")}</td>)}
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={columns.length}>Nenhum registro encontrado.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function obraColumns() {
  return [
    ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
    ["trecho", "Trecho", (row) => short(`${row.inicio || ""} - ${row.fim || ""}`, 72)],
    ["regiaoDesenvolvimento", "RD"],
    ["contratada", "Empresa", (row) => short(row.contratada, 44)],
    ["extensaoKm", "Km", (row) => km(row.extensaoKm)],
    ["avancoFisico", "% físico", (row) => <strong>{percent(row.avancoFisico)}</strong>],
    ["investimentoTotal", "Investimento", (row) => currency(row.investimentoTotal)],
    ["valorMedido", "Medido", (row) => currency(row.valorMedido)],
    ["status", "Status", (row) => <StatusPill value={row.status} />]
  ];
}

function licitacaoColumns() {
  return [
    ["id", "ID"],
    ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
    ["tipo", "Tipo"],
    ["regiaoDesenvolvimento", "RD"],
    ["extensaoKm", "Km", (row) => km(row.extensaoKm)],
    ["valorReferencia", "Valor ref.", (row) => currency(row.valorReferencia)],
    ["etapaObra", "Etapa", (row) => short(row.etapaObra || row.etapaProjeto, 68)],
    ["prazoEtapa", "Prazo"],
    ["status", "Status", (row) => <StatusPill value={row.status} />]
  ];
}

function reabilitaColumns() {
  return [
    ["lote", "Lote"],
    ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
    ["trecho", "Trecho", (row) => short(`${row.inicio || ""} - ${row.fim || ""}`, 86)],
    ["extensaoKm", "Km", (row) => km(row.extensaoKm)],
    ["investimentoEstimado", "Investimento", (row) => currency(row.investimentoEstimado)],
    ["custoKm", "R$/km", (row) => currency(row.custoKm)]
  ];
}

function criticalColumns() {
  return [
    ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
    ["criticidade", "Risco", (row) => `${row.criticidade} | ${criticalityLabel(row.criticidade)}`],
    ["regiaoDesenvolvimento", "RD"],
    ["avancoFisico", "% físico", (row) => percent(row.avancoFisico)],
    ["financeiroCalculado", "% financeiro", (row) => percent(row.financeiroCalculado)],
    ["diferencaFinanceiroFisico", "Diferença", (row) => percent(row.diferencaFinanceiroFisico)],
    ["investimentoTotal", "Investimento", (row) => currency(row.investimentoTotal)],
    ["valorMedido", "Medido", (row) => currency(row.valorMedido)],
    ["status", "Status", (row) => <StatusPill value={row.status} />]
  ];
}

function financialColumns() {
  return [
    ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
    ["regiaoDesenvolvimento", "RD"],
    ["avancoFisico", "% físico", (row) => percent(row.avancoFisico)],
    ["financeiroCalculado", "% financeiro", (row) => percent(row.financeiroCalculado)],
    ["diferencaFinanceiroFisico", "Financeiro - físico", (row) => percent(row.diferencaFinanceiroFisico)],
    ["investimentoTotal", "Investimento", (row) => currency(row.investimentoTotal)],
    ["valorMedido", "Medido", (row) => currency(row.valorMedido)],
    ["contratada", "Empresa", (row) => short(row.contratada, 44)]
  ];
}

function bottleneckColumns() {
  return [
    ["id", "ID"],
    ["tipoGargalo", "Gargalo", (row) => <strong>{row.tipoGargalo}</strong>],
    ["rodovia", "Rodovia"],
    ["tipo", "Tipo"],
    ["status", "Status", (row) => <StatusPill value={row.status} />],
    ["etapaObra", "Etapa", (row) => short(row.etapaObra || row.etapaProjeto, 72)],
    ["valorReferencia", "Valor ref.", (row) => currency(row.valorReferencia)],
    ["consideracoes", "Observação", (row) => short(row.consideracoes, 120)]
  ];
}

function costColumns() {
  return [
    ["rodovia", "Rodovia", (row) => <strong>{row.rodovia}</strong>],
    ["regiaoDesenvolvimento", "RD"],
    ["extensaoKm", "Km", (row) => km(row.extensaoKm)],
    ["investimentoTotal", "Investimento", (row) => currency(row.investimentoTotal)],
    ["custoKm", "Custo/km", (row) => currency(row.custoKm)],
    ["obraEspecial", "Tipo", (row) => row.obraEspecial ? "Especial" : "Comum"],
    ["status", "Status", (row) => <StatusPill value={row.status} />]
  ];
}

function DrilldownModal({ drilldown, onClose }) {
  if (!drilldown) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="panel detail-modal drilldown-modal" onClick={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div>
            <p className="eyebrow">Detalhamento do gráfico</p>
            <h2>{drilldown.title}</h2>
            <p>{drilldown.rows.length} registros encontrados.</p>
          </div>
          <button className="logout-button" type="button" onClick={onClose}>Fechar</button>
        </div>
        <DataTable rows={drilldown.rows} columns={drilldown.columns} />
      </section>
    </div>
  );
}

function RoadFeatureModal({ feature, onClose }) {
  if (!feature) return null;
  const props = feature.properties || {};
  const attrs = [
    ["Rodovia", props.CONCT_ROD || props["ROD."] || `${props.UF || ""}${props.RODOVIA || ""}`],
    ["Código SRE", props.CODIGO_SRE],
    ["Status", props.STATUS],
    ["Situação", props.DESC_SITUA],
    ["Revestimento", props.DESC_REVES],
    ["DRO", props.DRO],
    ["Início", props.LOCAL_INIC],
    ["Fim", props.LOCAL_FIM],
    ["Km inicial", props.KM_INICIAL],
    ["Km final", props.KM_FINAL],
    ["Extensão", props.EXTENSAO_1 || props.EXTENSAO ? `${km(Number(props.EXTENSAO_1 || props.EXTENSAO))} km` : "-"],
    ["Custo obra", currency(Number(String(props["CUSTO OBRA"] || 0).replace(",", ".")) || 0)],
    ["Custo total", props["CUSTO TOTA"] || "-"],
    ["Observação", props.OBSERVACAO]
  ];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="panel detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div>
            <p className="eyebrow">Trecho no mapa</p>
            <h2>{attrs[0][1] || "Rodovia"}</h2>
          </div>
          <button className="logout-button" type="button" onClick={onClose}>Fechar</button>
        </div>
        <div className="detail-grid">
          {attrs.slice(0, 12).map(([label, value]) => <Detail key={label} label={label} value={value} />)}
        </div>
        <div className="detail-notes">
          <span>Observação</span>
          <p>{props.OBSERVACAO || "-"}</p>
        </div>
      </section>
    </div>
  );
}

function DetailModal({ row, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="panel detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div>
            <p className="eyebrow">Detalhe da obra</p>
            <h2>{row.rodovia}</h2>
          </div>
          <button className="logout-button" type="button" onClick={onClose}>Fechar</button>
        </div>
        <div className="detail-grid">
          <Detail label="Status" value={row.status} />
          <Detail label="RD" value={row.regiaoDesenvolvimento} />
          <Detail label="Trecho" value={`${row.inicio || "-"} - ${row.fim || "-"}`} />
          <Detail label="Contrato" value={row.contrato || row.numeroContrato} />
          <Detail label="Contratada" value={row.contratada} />
          <Detail label="Extensão" value={`${km(row.extensaoKm)} km`} />
          <Detail label="Avanço físico" value={percent(row.avancoFisico)} />
          <Detail label="Investimento" value={currency(row.investimentoTotal)} />
          <Detail label="Valor medido" value={currency(row.valorMedido)} />
        </div>
        <div className="detail-notes">
          <span>Observação</span>
          <p>{row.observacao || row.finalizacao || "-"}</p>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState(() => getStoredAuthUser());
  const [authChecked, setAuthChecked] = useState(!hasStoredAuthSession());
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("executivo");
  const [selectedRegion, setSelectedRegion] = useState("TODAS");
  const [selectedRow, setSelectedRow] = useState(null);
  const [drilldown, setDrilldown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!hasStoredAuthSession()) return;
    loadAuthenticatedUser().then((user) => setAuthUser(user)).finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!authChecked || !authUser) return;
    let active = true;
    async function load() {
      try {
        const payload = await loadDashboardData();
        if (active) setData(payload);
      } catch (err) {
        if (active) setError(err.message || "Falha ao carregar dados.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const timer = window.setInterval(load, AUTO_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authChecked, authUser]);

  async function handleLogout() {
    await logoutUser();
    clearAuthSession();
    setAuthUser(null);
    setData(null);
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError("");
    try {
      await refreshDashboardData();
      setData(await loadDashboardData());
    } catch (err) {
      setError(err.message || "Falha ao atualizar bases.");
    } finally {
      setRefreshing(false);
    }
  }

  const scopedData = useMemo(() => {
    if (!data) return null;
    const byRegion = (row) => selectedRegion === "TODAS" || row.regiaoDesenvolvimento === selectedRegion;
    return {
      ...data,
      obras: data.obras.filter(byRegion),
      licitacoes: data.licitacoes.filter(byRegion),
      reabilita: data.reabilita
    };
  }, [data, selectedRegion]);

  const overview = useMemo(() => scopedData ? buildOverview(scopedData.obras, scopedData.licitacoes, scopedData.reabilita) : null, [scopedData]);
  const regions = useMemo(() => {
    if (!data) return ["TODAS"];
    return ["TODAS", ...new Set([...data.obras, ...data.licitacoes].map((item) => item.regiaoDesenvolvimento).filter(Boolean))].sort();
  }, [data]);

  if (!authChecked) return <main className="app"><p>Validando sessão...</p></main>;
  if (!authUser) return <LoginScreen onLogin={setAuthUser} />;
  if (loading) return <main className="app"><p>Carregando painel...</p></main>;
  if (!scopedData || !overview) return <main className="app"><p className="alert">{error || "Base indisponível."}</p></main>;

  return (
    <main className="app">
      <header className="hero">
        <img className="hero-mark" src="/assets/media/governo-pe-brasao-transparent.png" alt="Governo de Pernambuco" />
        <div className="hero-main">
          <div>
            <p className="eyebrow">Painel de Monitoramento | 2026</p>
            <h1>Obras de Estradas de Pernambuco</h1>
            <p>Execução, licitações, Reabilita, alertas de gestão e nota técnica automática.</p>
          </div>
        </div>
        <div className="hero-side">
          <div className="partner-logos">
            <img className="partner-logo" src="/assets/media/seges-seplag-pe-transparent.png" alt="SEPLAG PE" />
            <img className="partner-logo" src="/assets/media/igpe.png" alt="Instituto de Gestão Pública de Pernambuco" />
          </div>
          <span className="auth-user-label">{authUser.fullName || authUser.username}</span>
          <button className="logout-button" type="button" onClick={handleLogout}>Sair</button>
        </div>
      </header>

      <nav className="toolbar">
        <div className="segmented">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <select value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)}>
            {regions.map((region) => <option key={region} value={region}>{region === "TODAS" ? "Todas as RDs" : region}</option>)}
          </select>
          <button className="export-button" type="button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Atualizando..." : "Atualizar bases"}
          </button>
        </div>
      </nav>

      {error ? <p className="refresh-message alert">{error}</p> : null}

      {activeTab === "executivo" ? <ExecutiveTab data={scopedData} overview={overview} selectedRegion={selectedRegion} onDrillDown={setDrilldown} /> : null}
      {activeTab === "criticas" ? <ObrasCriticasTab rows={scopedData.obras} onDrillDown={setDrilldown} /> : null}
      {activeTab === "fisicoFinanceiro" ? <FisicoFinanceiroTab rows={scopedData.obras} onDrillDown={setDrilldown} /> : null}
      {activeTab === "farol" ? <FarolRiscoTab rows={scopedData.obras} onDrillDown={setDrilldown} /> : null}
      {activeTab === "gargalos" ? <GargalosTab rows={scopedData.licitacoes} onDrillDown={setDrilldown} /> : null}
      {activeTab === "custoKm" ? <CustoKmTab rows={scopedData.obras} onDrillDown={setDrilldown} /> : null}
      {activeTab === "mapaCalor" ? <MapaCalorRdTab rows={scopedData.obras} onDrillDown={setDrilldown} /> : null}
      {activeTab === "execucao" ? <ExecutionTab rows={scopedData.obras} onSelect={setSelectedRow} onDrillDown={setDrilldown} /> : null}
      {activeTab === "licitacoes" ? <LicitacoesTab rows={scopedData.licitacoes} onDrillDown={setDrilldown} /> : null}
      {activeTab === "reabilita" ? <ReabilitaTab rows={scopedData.reabilita} onDrillDown={setDrilldown} /> : null}
      {activeTab === "qualidade" ? <QualidadeBaseTab data={scopedData} onDrillDown={setDrilldown} /> : null}
      {activeTab === "historicoNota" ? <HistoricoNotasTab data={scopedData} onDrillDown={setDrilldown} /> : null}
      {activeTab === "mapa" ? <MapTab data={scopedData} /> : null}
      {activeTab === "nota" ? <TechnicalNoteTab obras={scopedData.obras} licitacoes={scopedData.licitacoes} /> : null}

      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
      {drilldown ? <DrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} /> : null}
    </main>
  );
}
