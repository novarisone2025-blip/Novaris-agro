import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeDollarSign, BarChart3, Beef, Bell,
  Bot, CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, CloudSun,
  CircleDollarSign, Download, FileBarChart, HeartPulse, Home, Leaf, LogOut,
  Layers3, MapPin, Menu, Package, Pill, Plus, Scale, Search, Settings, ShieldCheck, Sparkles, Sprout,
  Stethoscope, Syringe, TrendingDown, TrendingUp, UserCog, Users, Wallet,
  Weight, X, Trophy, Dna, Boxes, Handshake, Calculator, Gauge, FolderArchive,
  Landmark, MessageCircle, QrCode, Printer, Camera, Upload, Wind, Droplets,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { api, authenticatedBlob, downloadReport } from "./api";

const today = new Date().toISOString().slice(0, 10);
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
const dateBr = (value) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "—";
const weatherLabels = { 0: "Céu limpo", 1: "Predominantemente limpo", 2: "Parcialmente nublado", 3: "Nublado", 45: "Neblina", 51: "Garoa leve", 61: "Chuva leve", 63: "Chuva", 65: "Chuva intensa", 80: "Pancadas de chuva", 95: "Trovoadas" };

async function fetchLiveWeather(fallback) {
  try {
    const place = new URLSearchParams({ name: fallback.city, count: "1", language: "pt", format: "json" });
    const locationResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${place}`);
    const location = (await locationResponse.json()).results?.[0];
    if (!location) return fallback;
    const query = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code", daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max", forecast_days: "5", timezone: "America/Sao_Paulo" });
    const forecastResponse = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
    const payload = await forecastResponse.json();
    const current = payload.current;
    const forecast = (payload.daily?.time || []).map((day, index) => ({ date: day, max: Math.round(payload.daily.temperature_2m_max[index]), min: Math.round(payload.daily.temperature_2m_min[index]), rain: payload.daily.precipitation_probability_max[index], condition: weatherLabels[payload.daily.weather_code[index]] || "Variável" }));
    return { ...fallback, available: true, temperature: Math.round(current.temperature_2m), humidity: current.relative_humidity_2m, wind: current.wind_speed_10m, condition: weatherLabels[current.weather_code] || "Condição variável", updated_at: current.time, forecast };
  } catch {
    return fallback;
  }
}

const menuItems = [
  { id: "dashboard", label: "Visão geral", icon: Home, permission: "dashboard" },
  { id: "animals", label: "Rebanho", icon: Beef, permission: "rebanho" },
  { id: "lots", label: "Lotes", icon: Layers3, permission: "rebanho" },
  { id: "calendar", label: "Calendário rural", icon: CalendarRange, permission: "dashboard" },
  { id: "weighings", label: "Pesagens", icon: Scale, permission: "pesagens" },
  { id: "health", label: "Sanidade", icon: Syringe, permission: "sanidade" },
  { id: "reproduction", label: "Reprodução", icon: HeartPulse, permission: "reproducao" },
  { id: "pastures", label: "Pastagens", icon: Leaf, permission: "pastagens" },
  { id: "finance", label: "Financeiro", icon: CircleDollarSign, permission: "financeiro" },
  { id: "arroba", label: "Arroba & venda", icon: BadgeDollarSign, permission: "financeiro" },
  { id: "rankings", label: "Rankings", icon: Trophy, permission: "rebanho" },
  { id: "genetics", label: "Genética", icon: Dna, permission: "rebanho" },
  { id: "inventory", label: "Estoque veterinário", icon: Boxes, permission: "sanidade" },
  { id: "commercial", label: "Compra & venda", icon: Handshake, permission: "financeiro" },
  { id: "simulator", label: "Simulador de lucro", icon: Calculator, permission: "financeiro" },
  { id: "benchmark", label: "Metas da fazenda", icon: Gauge, permission: "dashboard" },
  { id: "profit", label: "Central de lucro", icon: Landmark, permission: "financeiro" },
  { id: "documents", label: "Documentos", icon: FolderArchive, permission: "dashboard" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, permission: "dashboard" },
  { id: "reports", label: "Relatórios", icon: FileBarChart, permission: "relatorios" },
  { id: "ai", label: "IA Agro", icon: Bot, permission: "ia", highlight: true },
  { id: "users", label: "Equipe", icon: UserCog, adminOnly: true },
];

const emptyData = {
  dashboard: {
    total_animals: 0, active_animals: 0, average_weight: 0, expired_vaccines: 0,
    upcoming_vaccines_count: 0, pregnant_animals: 0, sale_ready_animals: 0,
    monthly_revenue: 0, monthly_expenses: 0, monthly_profit: 0, weight_evolution: [],
    herd_evolution: [], financial_evolution: [], vaccines_by_month: [], recent_weighings: [],
  },
  animals: [], weighings: [], health: [], healthCalendar: [], reproduction: [], reproductionIndicators: {}, paddocks: [],
  lots: { items: [], best_performance: null, most_profitable: null, lowest_performance: null }, ruralCalendar: [],
  finance: { entries: [], revenue: 0, expenses: 0, profit: 0, cost_per_animal: 0, profit_per_animal: 0, lots: [] },
  arroba: { arroba_price: 340, carcass_yield_percent: 50, total_live_weight: 0, total_arrobas: 0, estimated_total_value: 0, animals: [] },
  weather: { available: false, temperature: null, condition: "Clima indisponível", city: "", state: "" },
  alerts: [], users: [], permissions: { permissions: ["*"] },
  rankings: { heaviest: [], best_gmd: [], highest_value: [], overall: [] },
  genetics: { animals_with_genealogy: 0, lineages: {}, family_ranking: [] },
  inventory: [], trades: [], benchmark: [], profitCenter: { lots: [], monthly: [] },
  documents: [], whatsapp: { recipients: [], messages: [] },
};

function Logo() {
  return <div className="logo"><span className="logo-mark"><Leaf size={21} /></span><span>novaris<strong>agro</strong></span></div>;
}

function Login({ onLogin }) {
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "demo@novarisagro.com.br", password: "123456", farmName: "", city: "", state: "MG", area: "" });
  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = registering
        ? { name: form.name, email: form.email, password: form.password, farm: { name: form.farmName, city: form.city, state: form.state, area_hectares: Number(form.area) || null } }
        : { email: form.email, password: form.password };
      onLogin(await api(registering ? "/auth/register" : "/auth/login", { method: "POST", body: JSON.stringify(payload) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="story-content">
          <span className="eyebrow light"><Sparkles size={14} /> Inteligência para o campo</span>
          <h1>Gestão pecuária.<br />Mais simples.<br /><em>Mais rentável.</em></h1>
          <p>Controle o rebanho, a sanidade e os resultados da fazenda em uma única plataforma profissional.</p>
          <div className="story-metrics"><div><strong>360°</strong><span>visão da fazenda</span></div><div><strong>24h</strong><span>dados disponíveis</span></div></div>
        </div>
        <p className="story-footer">Novaris Agro. Decisões melhores todos os dias.</p>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="mobile-auth-logo"><Logo /></div>
          <span className="eyebrow">NOVARIS AGRO</span>
          <h2>{registering ? "Crie sua operação" : "Bem-vindo de volta"}</h2>
          <p>{registering ? "Comece a gerir sua fazenda com inteligência." : "Acesse o painel da sua fazenda."}</p>
          {registering && <>
            <label>Seu nome<input required value={form.name} onChange={change("name")} /></label>
            <div className="form-row"><label>Fazenda<input required value={form.farmName} onChange={change("farmName")} /></label><label>Área (ha)<input type="number" value={form.area} onChange={change("area")} /></label></div>
            <div className="form-row location-row"><label>Cidade<input required value={form.city} onChange={change("city")} /></label><label>UF<input required maxLength="2" value={form.state} onChange={change("state")} /></label></div>
          </>}
          <label>E-mail<input type="email" required value={form.email} onChange={change("email")} /></label>
          <label>Senha<input type="password" required minLength="6" value={form.password} onChange={change("password")} /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button wide" disabled={loading}>{loading ? "Aguarde..." : registering ? "Criar conta" : "Entrar no Novaris"}</button>
          <button type="button" className="text-button" onClick={() => setRegistering(!registering)}>{registering ? "Já possui conta? Entrar" : "Criar uma nova conta"}</button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({ page, setPage, user, permissions, mobile, close, logout }) {
  const allowed = (item) => item.adminOnly ? user.role === "Administrador" : permissions.includes("*") || permissions.includes(item.permission);
  return <>
    {mobile && <button className="sidebar-backdrop" onClick={close} />}
    <aside className={`sidebar ${mobile ? "open" : ""}`}>
      <div className="sidebar-head"><Logo /><button className="icon-button mobile-only" onClick={close}><X size={19} /></button></div>
      <div className="farm-switcher"><span className="farm-avatar">{user.farm.name.slice(0, 2).toUpperCase()}</span><div><small>FAZENDA ATUAL</small><strong>{user.farm.name}</strong></div><ChevronDown size={15} /></div>
      <nav><span className="nav-title">GESTÃO PECUÁRIA</span>
        {menuItems.filter(allowed).map(({ id, label, icon: Icon, highlight }) => <button key={id} className={`${page === id ? "active" : ""} ${highlight ? "ai-menu" : ""}`} onClick={() => { setPage(id); close(); }}><Icon size={19} /><span>{label}</span>{highlight && <Sparkles size={12} />}</button>)}
      </nav>
      <div className="sidebar-bottom"><button><Settings size={19} /> Configurações</button><div className="user-card"><span className="user-avatar">{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role}</small></div><button onClick={logout}><LogOut size={17} /></button></div></div>
    </aside>
  </>;
}

function Header({ user, title, alerts, openAlerts, onMenu }) {
  return <header className="topbar">
    <button className="icon-button mobile-only" onClick={onMenu}><Menu size={21} /></button>
    <div><small>FAZENDA {user.farm.name.toUpperCase()}</small><h1>{title}</h1></div>
    <div className="topbar-actions"><button className="icon-button notification" onClick={openAlerts}><Bell size={19} />{alerts.length > 0 && <b>{Math.min(alerts.length, 9)}</b>}</button><span className="header-avatar">{user.name.slice(0, 2).toUpperCase()}</span></div>
  </header>;
}

function Metric({ icon: Icon, label, value, detail, tone = "green", trend }) {
  return <article className="stat-card pro-stat"><div className={`stat-icon ${tone}`}><Icon size={20} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>{trend !== undefined && <span className={`trend ${trend >= 0 ? "up" : "down"}`}>{trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(trend)}%</span>}</article>;
}

function MiniChart({ data, valueKey, secondKey, color = "#397055", secondColor = "#d78752", suffix = "" }) {
  const values = data.length ? data.map((item) => Number(item[valueKey] || 0)) : [0, 0, 0, 0, 0, 0];
  const secondary = secondKey ? data.map((item) => Number(item[secondKey] || 0)) : [];
  const all = [...values, ...secondary, 1];
  const max = Math.max(...all);
  const line = (series) => series.map((value, index) => `${10 + index * (280 / Math.max(series.length - 1, 1))},${112 - (value / max) * 85}`).join(" ");
  return <div className="pro-chart">
    <svg viewBox="0 0 300 125" preserveAspectRatio="none">
      {[28, 70, 112].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} className="grid-line" />)}
      <polyline points={line(values)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {secondKey && <polyline points={line(secondary)} fill="none" stroke={secondColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
    <div className="chart-labels">{data.map((item, index) => <span key={index}>{item.month?.slice(5) || index + 1}</span>)}</div>
    {suffix && <small className="chart-unit">{suffix}</small>}
  </div>;
}

function ChartPanel({ title, subtitle, children, legend }) {
  return <article className="panel chart-panel"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div>{legend && <div className="chart-legend">{legend.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>}</div>{children}</article>;
}

const chartTooltip = { border: "1px solid #dfe7e1", borderRadius: 10, boxShadow: "0 12px 30px rgba(20,55,39,.12)", fontSize: 11 };
const monthTick = (value) => value?.slice(5) || value;

function PremiumChart({ data, type = "line", series, moneyAxis = false }) {
  const common = <>
    <CartesianGrid stroke="#edf1ed" strokeDasharray="4 5" vertical={false} />
    <XAxis dataKey="month" tickFormatter={monthTick} axisLine={false} tickLine={false} tick={{ fill: "#89958e", fontSize: 9 }} />
    <YAxis width={42} tickFormatter={(value) => moneyAxis ? `${Math.round(value / 1000)}k` : value} axisLine={false} tickLine={false} tick={{ fill: "#89958e", fontSize: 9 }} />
    <Tooltip contentStyle={chartTooltip} labelFormatter={(value) => `Período ${value}`} formatter={(value, name) => [moneyAxis ? money(value) : value, name]} />
    {series.length > 1 && <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 9 }} />}
  </>;
  if (type === "bar") return <ResponsiveContainer width="100%" height="100%"><BarChart data={data}>{common}{series.map((item) => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[5, 5, 0, 0]} animationDuration={900} />)}</BarChart></ResponsiveContainer>;
  if (type === "area") return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>{common}{series.map((item) => <Area key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} fill={item.fill || item.color} fillOpacity={.12} strokeWidth={2.5} animationDuration={1000} />)}</AreaChart></ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}>{common}{series.map((item) => <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2.6} dot={{ r: 3, fill: item.color, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} animationDuration={1000} />)}</LineChart></ResponsiveContainer>;
}

function DashboardTable({ title, subtitle, headers, rows, empty }) {
  return <article className="panel smart-table"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div></div>{rows.length ? <div className="smart-table-body"><div className="smart-table-row smart-table-head">{headers.map((header) => <span key={header}>{header}</span>)}</div>{rows.map((row, index) => <div className="smart-table-row" key={row.key || index}>{row.cells.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>)}</div> : <Empty icon={Check} title={empty} text="Os registros aparecerão automaticamente aqui." />}</article>;
}

function Dashboard({ data, openModal, farm, userName, weather, animals, weighings, reproduction, paddocks, healthCalendar }) {
  const performance = useMemo(() => animals.map((animal) => {
    const history = weighings.filter((item) => item.animal_id === animal.id).sort((a, b) => b.weighed_at.localeCompare(a.weighed_at));
    if (history.length < 2) return { ...animal, daily: null };
    const days = Math.max((new Date(history[0].weighed_at) - new Date(history[1].weighed_at)) / 86400000, 1);
    return { ...animal, daily: (history[0].weight - history[1].weight) / days };
  }), [animals, weighings]);
  const lowGain = performance.filter((item) => item.daily !== null).sort((a, b) => a.daily - b.daily).slice(0, 5);
  const births = reproduction.filter((item) => item.expected_calving_at && daysUntil(item.expected_calving_at) <= 45).sort((a, b) => a.expected_calving_at.localeCompare(b.expected_calving_at)).slice(0, 5);
  const vaccines = healthCalendar.filter((item) => item.record_type === "Vacina").slice(0, 5);
  const occupied = paddocks.filter((item) => item.current_animals > 0 || item.status === "Em uso");
  const gmdEvolution = useMemo(() => {
    const grouped = {};
    animals.forEach((animal) => {
      const history = weighings.filter((item) => item.animal_id === animal.id).sort((a, b) => a.weighed_at.localeCompare(b.weighed_at));
      history.slice(1).forEach((entry, index) => {
        const previous = history[index];
        const days = Math.max((new Date(entry.weighed_at) - new Date(previous.weighed_at)) / 86400000, 1);
        const month = entry.weighed_at.slice(0, 7);
        (grouped[month] ||= []).push((entry.weight - previous.weight) / days);
      });
    });
    return Object.entries(grouped).sort().slice(-12).map(([month, values]) => ({ month, gmd: Number(avg(values).toFixed(3)) }));
  }, [animals, weighings]);
  const financialAnnual = data.financial_evolution.map((item) => ({ ...item, profit: item.revenue - item.expenses }));
  const trends = data.trends || {};
  return <>
    <section className="farm-hero">
      <div className="hero-copy"><span className="hero-welcome">Bem-vindo ao Novaris Agro, {userName.split(" ")[0]}</span><h2>{farm.name}</h2><p><MapPin size={13} /> {farm.city} - {farm.state}</p><div className="hero-quick">
        <span><Beef size={18} /><strong>{data.total_animals}</strong><small>animais</small></span>
        <span><Syringe size={18} /><strong>{data.upcoming_vaccines_count}</strong><small>vacinas pendentes</small></span>
        <span><HeartPulse size={18} /><strong>{data.pregnant_animals}</strong><small>prenhezes</small></span>
        <span><Sprout size={18} /><strong>{occupied.length}</strong><small>piquetes ocupados</small></span>
      </div></div>
      <div className="hero-context"><span><CloudSun size={25} /><b>{weather.temperature !== null ? `${weather.temperature}°C` : "—"}</b><small>{weather.condition}</small></span><span><CalendarDays size={22} /><b>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date())}</b><small>{new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date())}</small></span></div>
    </section>
    {weather.available && <section className="weather-strip"><span><Droplets size={17} /><strong>{weather.humidity}%</strong><small>Umidade</small></span><span><Wind size={17} /><strong>{weather.wind} km/h</strong><small>Vento</small></span>{weather.forecast?.slice(1, 5).map((day) => <span key={day.date}><CloudSun size={17} /><strong>{day.max}° / {day.min}°</strong><small>{dateBr(day.date)} • {day.rain}% chuva</small></span>)}</section>}
    <PageHeading eyebrow="PAINEL EXECUTIVO" title="Indicadores da operação" text="Produção, sanidade e resultado financeiro em uma visão única." button="Novo animal" onButton={() => openModal("animal")} />
    <section className="stats-grid pro-grid">
      <Metric icon={Beef} label="Total de animais" value={data.total_animals} detail={`${data.active_animals} ativos`} trend={trends.total_animals || 0} />
      <Metric icon={Weight} label="Peso médio" value={`${data.average_weight} kg`} detail="Média do rebanho" tone="orange" trend={trends.average_weight || 0} />
      <Metric icon={AlertTriangle} label="Vacinas vencidas" value={data.expired_vaccines} detail="Requer atenção" tone="red" trend={0} />
      <Metric icon={ShieldCheck} label="Próximas vacinas" value={data.upcoming_vaccines_count} detail="Próximos 30 dias" tone="yellow" trend={0} />
      <Metric icon={HeartPulse} label="Taxa de prenhez" value={`${data.pregnancy_rate}%`} detail={`${data.pregnant_animals} em acompanhamento`} tone="purple" trend={0} />
      <Metric icon={TrendingUp} label="Ganho médio diário" value={`${Number(data.average_daily_gain || 0).toFixed(3)} kg`} detail="Média das pesagens" tone="blue" trend={0} />
      <Metric icon={Wallet} label="Receita mensal" value={money(data.monthly_revenue)} detail="Entradas no mês" tone="green" trend={trends.monthly_revenue || 0} />
      <Metric icon={CircleDollarSign} label="Lucro mensal" value={money(data.monthly_profit)} detail={`${money(data.monthly_expenses)} em despesas`} tone={data.monthly_profit >= 0 ? "green" : "red"} trend={trends.monthly_profit || 0} />
      <Metric icon={Sprout} label="Taxa de lotação" value={`${data.stocking_rate} cab/ha`} detail="Área total da fazenda" tone="yellow" trend={0} />
      <Metric icon={Activity} label="Mortalidade" value={`${data.mortality_rate}%`} detail="Rebanho cadastrado" tone="purple" trend={0} />
      <Metric icon={BadgeDollarSign} label="Custo por cabeça" value={money(data.monthly_cost_per_head)} detail="Custo mensal estimado" tone="blue" trend={trends.monthly_expenses || 0} />
      <Metric icon={TrendingUp} label="Prontos para venda" value={data.sale_ready_animals} detail="Por peso ou marcação" tone="green" trend={0} />
    </section>
    <section className="premium-charts">
      <ChartPanel title="Evolução do rebanho" subtitle="Animais cadastrados por período"><div className="rechart-wrap"><PremiumChart data={data.herd_evolution} series={[{ key: "total", label: "Animais", color: "#24724d" }]} /></div></ChartPanel>
      <ChartPanel title="Evolução de peso" subtitle="Peso médio mensal"><div className="rechart-wrap"><PremiumChart data={data.weight_evolution} series={[{ key: "weight", label: "Peso médio", color: "#e07835" }]} /></div></ChartPanel>
      <ChartPanel title="Receita x despesas" subtitle="Fluxo financeiro mensal"><div className="rechart-wrap"><PremiumChart data={data.financial_evolution} moneyAxis series={[{ key: "revenue", label: "Receitas", color: "#24724d" }, { key: "expenses", label: "Despesas", color: "#e07835" }]} /></div></ChartPanel>
      <ChartPanel title="Vacinas aplicadas" subtitle="Registros sanitários por mês"><div className="rechart-wrap"><PremiumChart type="bar" data={data.vaccines_by_month} series={[{ key: "count", label: "Aplicações", color: "#2e8058" }]} /></div></ChartPanel>
      <ChartPanel title="Ganho médio diário" subtitle="Evolução do GMD por pesagem"><div className="rechart-wrap"><PremiumChart type="area" data={gmdEvolution} series={[{ key: "gmd", label: "kg/dia", color: "#437ca0", fill: "#77a8c4" }]} /></div></ChartPanel>
      <ChartPanel title="Evolução financeira anual" subtitle="Resultado acumulado em até 12 meses"><div className="rechart-wrap"><PremiumChart type="area" data={financialAnnual} moneyAxis series={[{ key: "profit", label: "Lucro líquido", color: "#24724d", fill: "#70aa87" }]} /></div></ChartPanel>
    </section>
    <section className="smart-tables-grid">
      <DashboardTable title="Animais com menor ganho" subtitle="Desempenho entre as duas últimas pesagens" headers={["Animal", "Peso", "GMD", "Situação"]} empty="Sem histórico suficiente" rows={lowGain.map((item) => ({ key: item.id, cells: [<b>#{item.tag_number}</b>, `${item.current_weight} kg`, `${item.daily.toFixed(3)} kg`, <em className={`table-status ${item.daily < .2 ? "danger" : "warning"}`}>{item.daily < .2 ? "Atenção" : "Regular"}</em>] }))} />
      <DashboardTable title="Próximos partos" subtitle="Previsões para os próximos 45 dias" headers={["Animal", "Data prevista", "Dias"]} empty="Sem partos previstos" rows={births.map((item) => ({ key: item.id, cells: [<b>#{item.animal_tag}</b>, dateBr(item.expected_calving_at), <em className="days-pill">{daysUntil(item.expected_calving_at)} dias</em>] }))} />
      <DashboardTable title="Próximas vacinas" subtitle="Calendário sanitário prioritário" headers={["Animal", "Vacina", "Data"]} empty="Vacinação em dia" rows={vaccines.map((item) => ({ key: item.id, cells: [<b>#{item.animal_tag}</b>, item.product_name, <em className={item.days_until < 0 ? "date-danger" : ""}>{dateBr(item.next_application_at)}</em>] }))} />
      <DashboardTable title="Piquetes em uso" subtitle="Ocupação atual das áreas" headers={["Piquete", "Ocupação", "Animais"]} empty="Nenhum piquete ocupado" rows={occupied.slice(0, 5).map((item) => ({ key: item.id, cells: [<b>{item.name}</b>, <span className="table-progress"><i style={{ width: `${Math.min(item.occupancy_rate, 100)}%` }} />{item.occupancy_rate}%</span>, item.current_animals] }))} />
    </section>
    <section className="quick-section"><div className="section-title"><h3>Ações rápidas</h3><p>Registre as rotinas mais frequentes.</p></div><div className="quick-grid pro-actions">{[["animal", Beef, "Novo animal", "Adicionar ao rebanho", "green"], ["weighing", Scale, "Nova pesagem", "Atualizar desempenho", "orange"], ["health", Syringe, "Aplicação sanitária", "Vacina ou medicamento", "blue"], ["finance", Wallet, "Lançamento", "Receita ou despesa", "green"]].map(([type, Icon, label, note, color]) => <button key={type} className="quick-card" onClick={() => openModal(type)}><span className={`quick-icon ${color}`}><Icon size={20} /></span><span><strong>{label}</strong><small>{note}</small></span><Plus size={17} /></button>)}</div></section>
  </>;
}

function BarMiniChart({ data }) {
  const max = Math.max(...data.map((item) => item.count), 1);
  return <div className="bar-chart">{(data.length ? data : [{ month: "—", count: 0 }]).map((item) => <div key={item.month}><span style={{ height: `${Math.max((item.count / max) * 100, 4)}%` }}><b>{item.count}</b></span><small>{item.month.slice(5)}</small></div>)}</div>;
}

function PageHeading({ eyebrow, title, text, button, onButton, secondary, onSecondary }) {
  return <section className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div><div className="heading-actions">{secondary && <button className="secondary-button" onClick={onSecondary}>{secondary}</button>}{button && <button className="primary-button" onClick={onButton}><Plus size={17} />{button}</button>}</div></section>;
}

function Empty({ icon: Icon, title, text }) {
  return <div className="empty-state"><span><Icon size={24} /></span><h4>{title}</h4><p>{text}</p></div>;
}

function Pagination({ page, total, size, setPage }) {
  const pages = Math.max(Math.ceil(total / size), 1);
  return <div className="pagination"><span>{total} registros</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button><b>{page} de {pages}</b><button disabled={page === pages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button></div></div>;
}

function Animals({ animals, openModal, openProfile, scanQr }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const size = 7;
  const filtered = animals.filter((a) => (!status || a.status === status) && `${a.tag_number} ${a.name || ""} ${a.breed} ${a.lot}`.toLowerCase().includes(search.toLowerCase()));
  const shown = filtered.slice((page - 1) * size, page * size);
  return <>
    <PageHeading eyebrow="REBANHO" title="Gestão do rebanho" text="Ficha individual, histórico e situação de cada animal." button="Cadastrar animal" onButton={() => openModal("animal")} secondary="Ler QR" onSecondary={scanQr} />
    <div className="toolbar pro-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar brinco, nome, raça ou lote..." /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option><option>Ativo</option><option>Prenhe</option><option>Vendido</option><option>Morto</option><option>Descartado</option></select></div>
    <div className="table-card">{shown.length ? <div className="data-table animal-table"><div className="table-row table-header"><span>Animal</span><span>Raça / idade</span><span>Localização</span><span>Peso</span><span>Status</span></div>{shown.map((animal) => <button className="table-row clickable-row" key={animal.id} onClick={() => openProfile(animal.id)}><span className="animal-cell">{animal.photo_url ? <img src={animal.photo_url} /> : <i><Beef size={18} /></i>}<span><strong>{animal.name || `Brinco ${animal.tag_number}`}</strong><small>#{animal.tag_number}</small></span></span><span><strong>{animal.breed}</strong><small>{ageLabel(animal.birth_date)} • {animal.sex}</small></span><span><strong>{animal.lot}</strong><small>{animal.paddock}</small></span><span><strong>{animal.current_weight} kg</strong><small>{animal.sale_ready || animal.current_weight > 450 ? "Pronto para venda" : "Em produção"}</small></span><span><b className={`status ${statusClass(animal.status)}`}>{animal.status}</b></span></button>)}</div> : <Empty icon={Beef} title="Nenhum animal encontrado" text="Ajuste os filtros ou cadastre um novo animal." />}</div>
    <Pagination page={page} total={filtered.length} size={size} setPage={setPage} />
  </>;
}

function QRScannerModal({ animals, close, openProfile }) {
  const [message, setMessage] = useState("Aponte a câmera para o QR do animal.");
  useEffect(() => {
    let stream;
    let timer;
    const video = document.querySelector("#novaris-qr-video");
    async function start() {
      if (!("BarcodeDetector" in window)) { setMessage("Este navegador não oferece leitura nativa. Use a busca pelo código Novaris."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const detect = async () => {
          const codes = await detector.detect(video).catch(() => []);
          if (codes[0]?.rawValue) {
            const code = new URL(codes[0].rawValue).searchParams.get("animalCode");
            const animal = animals.find((item) => item.unique_code === code);
            if (animal) { close(); openProfile(animal.id); return; }
            setMessage("QR reconhecido, mas o animal não pertence a esta fazenda.");
          }
          timer = requestAnimationFrame(detect);
        };
        video.onloadeddata = detect;
      } catch { setMessage("Não foi possível acessar a câmera. Autorize o uso da câmera no navegador."); }
    }
    start();
    return () => { cancelAnimationFrame(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, []);
  return <div className="modal-backdrop"><div className="modal qr-scanner"><div className="modal-head"><div><span className="eyebrow">LEITOR DE CAMPO</span><h3>Ler QR do animal</h3></div><button className="icon-button" onClick={close}><X size={19} /></button></div><video id="novaris-qr-video" autoPlay playsInline /><p>{message}</p></div></div>;
}

function LotsPage({ data, openLot }) {
  return <>
    <PageHeading eyebrow="GESTÃO POR LOTE" title="Desempenho e rentabilidade dos lotes" text="Compare peso, ganho diário, valor comercial e resultado financeiro." />
    <section className="summary-grid">
      <Metric icon={TrendingUp} label="Melhor desempenho" value={data.best_performance?.lot || "—"} detail={data.best_performance ? `${data.best_performance.average_daily_gain} kg/dia` : "Sem pesagens suficientes"} />
      <Metric icon={BadgeDollarSign} label="Lote mais lucrativo" value={data.most_profitable?.lot || "—"} detail={data.most_profitable ? money(data.most_profitable.estimated_profit) : "Sem dados"} tone="blue" />
      <Metric icon={TrendingDown} label="Menor desempenho" value={data.lowest_performance?.lot || "—"} detail={data.lowest_performance ? `${data.lowest_performance.average_daily_gain} kg/dia` : "Sem pesagens suficientes"} tone="red" />
    </section>
    <div className="lot-analytics-grid">{data.items.map((lot, index) => <button className="lot-analytics-card" key={lot.lot} onClick={() => openLot(lot)}><div className="lot-rank"><span>#{index + 1}</span><div><h3>{lot.lot}</h3><p>{lot.animal_count} animais ativos • clique para visualizar</p></div><b className={lot.average_daily_gain !== null && lot.average_daily_gain < .2 ? "low" : ""}>{lot.average_daily_gain !== null ? `${lot.average_daily_gain} kg/dia` : "GMD indisponível"}</b></div><div className="lot-metrics"><span><small>Peso médio</small><strong>{lot.average_weight} kg</strong></span><span><small>Valor estimado</small><strong>{money(lot.estimated_value)}</strong></span><span><small>Receita</small><strong>{money(lot.revenue)}</strong></span><span><small>Custos</small><strong>{money(lot.expenses)}</strong></span></div><div className="lot-result"><span>Lucro estimado</span><strong className={lot.estimated_profit >= 0 ? "positive" : "negative"}>{money(lot.estimated_profit)}</strong><ChevronRight size={17} /></div></button>)}</div>
  </>;
}

function LotDrawer({ lot, animals, close, openProfile, updateWeight }) {
  const lotAnimals = animals.filter((animal) => animal.lot === lot.lot);
  return <><button className="drawer-backdrop" onClick={close} /><aside className="lot-drawer"><div className="drawer-head"><div><span className="eyebrow">ANIMAIS DO LOTE</span><h2>{lot.lot}</h2><p>{lotAnimals.length} animais cadastrados • peso médio {lot.average_weight} kg</p></div><button className="icon-button" onClick={close}><X size={19} /></button></div><div className="lot-drawer-summary"><span><small>GMD médio</small><strong>{lot.average_daily_gain !== null ? `${lot.average_daily_gain} kg/dia` : "—"}</strong></span><span><small>Valor estimado</small><strong>{money(lot.estimated_value)}</strong></span></div><div className="lot-animal-list">{lotAnimals.length ? lotAnimals.map((animal) => <article key={animal.id}><button className="lot-animal-main" onClick={() => openProfile(animal.id)}>{animal.photo_url ? <img src={animal.photo_url} /> : <span><Beef size={20} /></span>}<div><strong>{animal.name || `Brinco ${animal.tag_number}`}</strong><small>#{animal.tag_number} • {animal.breed} • {animal.sex}</small><p>{animal.paddock} • {ageLabel(animal.birth_date)}</p></div><b className={`status ${statusClass(animal.status)}`}>{animal.status}</b></button><div className="lot-animal-weight"><span><small>Peso atual</small><strong>{animal.current_weight} kg</strong></span><button onClick={() => updateWeight(animal)}><Scale size={15} /> Atualizar peso</button></div></article>) : <Empty icon={Beef} title="Lote sem animais" text="Nenhum animal está vinculado a este lote." />}</div></aside></>;
}

function WeightUpdateModal({ animal, close, saved }) {
  const [weight, setWeight] = useState(animal.current_weight);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/weighings", { method: "POST", body: JSON.stringify({ animal_id: animal.id, weight: Number(weight), weighed_at: date, notes: notes || null }) });
      saved(`Peso do brinco ${animal.tag_number} atualizado`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><form className="modal weight-update-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">NOVA PESAGEM</span><h3>Atualizar peso</h3><p>Brinco {animal.tag_number} • {animal.name || animal.breed} • peso atual {animal.current_weight} kg</p></div><button type="button" className="icon-button" onClick={close}><X size={19} /></button></div><label>Novo peso (kg)<input autoFocus required type="number" min="1" step=".1" value={weight} onChange={(event) => setWeight(event.target.value)} /></label><label>Data da pesagem<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Observações<textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: pesagem de rotina, mudança de dieta..." /></label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancelar</button><button className="primary-button" disabled={loading}><Check size={17} />{loading ? "Atualizando..." : "Salvar novo peso"}</button></div></form></div>;
}

function RuralCalendar({ events, openModal }) {
  const [filter, setFilter] = useState("");
  const filtered = events.filter((item) => !filter || item.event_type === filter || item.source === filter);
  const types = [...new Set(events.map((item) => item.event_type))];
  const grouped = filtered.reduce((result, item) => {
    const month = item.event_date.slice(0, 7);
    (result[month] ||= []).push(item);
    return result;
  }, {});
  return <>
    <PageHeading eyebrow="PLANEJAMENTO RURAL" title="Calendário inteligente" text="Sanidade, pesagens, reprodução e vendas programadas em uma agenda única." button="Criar evento" onButton={() => openModal("ruralEvent")} />
    <div className="calendar-toolbar"><button className={!filter ? "active" : ""} onClick={() => setFilter("")}>Todos</button>{types.map((type) => <button className={filter === type ? "active" : ""} onClick={() => setFilter(type)} key={type}>{type}</button>)}</div>
    <div className="rural-calendar">{Object.entries(grouped).map(([month, items]) => <section key={month}><div className="calendar-month"><strong>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</strong><span>{items.length} eventos</span></div><div className="calendar-events">{items.map((item) => <article className={`calendar-event ${item.source}`} key={`${item.source}-${item.id}`}><time><strong>{item.event_date.slice(8)}</strong><small>{monthName(item.event_date)}</small></time><i /><div><small>{item.event_type}</small><h3>{item.title}</h3><p>{item.animal_tag ? `Brinco ${item.animal_tag}` : "Evento da fazenda"} {item.notes ? `• ${item.notes}` : ""}</p></div><b>{item.status}</b></article>)}</div></section>)}</div>
  </>;
}

function Weighings({ records, animals, openModal }) {
  const analytics = animals.map((animal) => {
    const history = records.filter((item) => item.animal_id === animal.id).sort((a, b) => b.weighed_at.localeCompare(a.weighed_at));
    const current = history[0]?.weight ?? animal.current_weight;
    const previous = history[1]?.weight ?? current;
    const days = history[1] ? Math.max((new Date(history[0].weighed_at) - new Date(history[1].weighed_at)) / 86400000, 1) : 1;
    const oldest = history.at(-1)?.weight ?? current;
    return { ...animal, current, previous, accumulated: current - oldest, daily: (current - previous) / days, monthly: ((current - previous) / days) * 30 };
  });
  const ranked = [...analytics].sort((a, b) => b.daily - a.daily);
  return <>
    <PageHeading eyebrow="DESEMPENHO" title="Pesagens e ganho de peso" text="Identifique rapidamente os melhores resultados e animais que exigem atenção." button="Nova pesagem" onButton={() => openModal("weighing")} secondary="Pesagem em lote" onSecondary={() => openModal("weighingBatch")} />
    <section className="summary-grid"><Metric icon={Weight} label="Peso médio" value={`${avg(analytics.map((a) => a.current)).toFixed(1)} kg`} detail="Rebanho monitorado" /><Metric icon={TrendingUp} label="Melhor desempenho" value={ranked[0] ? `${ranked[0].daily.toFixed(2)} kg/dia` : "—"} detail={ranked[0] ? `Brinco ${ranked[0].tag_number}` : "Sem dados"} tone="blue" /><Metric icon={TrendingDown} label="Baixo desempenho" value={ranked.at(-1) ? `${ranked.at(-1).daily.toFixed(2)} kg/dia` : "—"} detail={ranked.at(-1) ? `Brinco ${ranked.at(-1).tag_number}` : "Sem dados"} tone="red" /></section>
    <div className="performance-grid">{analytics.map((item) => <article className={`performance-card ${item.daily < .2 ? "low" : item.daily > .7 ? "high" : ""}`} key={item.id}><div><span className="animal-avatar"><Beef size={18} /></span><div><strong>Brinco {item.tag_number}</strong><small>{item.name || item.breed}</small></div><b>{item.daily < .2 ? "Atenção" : item.daily > .7 ? "Destaque" : "Regular"}</b></div><div className="performance-values five"><span><small>Atual</small><strong>{item.current} kg</strong></span><span><small>Anterior</small><strong>{item.previous} kg</strong></span><span><small>Ganho diário</small><strong>{item.daily.toFixed(2)} kg</strong></span><span><small>Projeção mensal</small><strong>{item.monthly.toFixed(1)} kg</strong></span><span><small>Ganho acumulado</small><strong>{item.accumulated.toFixed(1)} kg</strong></span></div><MiniChart data={records.filter((r) => r.animal_id === item.id).reverse().map((r) => ({ month: r.weighed_at.slice(5), weight: r.weight }))} valueKey="weight" color={item.daily < .2 ? "#bd5448" : "#397055"} /></article>)}</div>
  </>;
}

function Health({ records, calendar, openModal }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [batch, setBatch] = useState("");
  const filtered = records.filter((item) => (!type || item.record_type === type) && item.animal_tag.includes(search) && (!batch || (item.batch || "").toLowerCase().includes(batch.toLowerCase())));
  return <>
    <PageHeading eyebrow="SANIDADE" title="Central sanitária" text="Vacinas, vermífugos, medicamentos e alertas automáticos." button="Nova aplicação" onButton={() => openModal("health")} />
    <div className="toolbar health-filters"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Número do brinco..." /></div><select value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos os tipos</option><option>Vacina</option><option>Vermífugo</option><option>Medicamento</option></select><input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Filtrar lote..." /></div>
    <div className="health-board">{filtered.map((item) => <article className={`health-card ${item.situation}`} key={item.id}><div className="health-card-top"><span className="record-type"><Stethoscope size={15} />{item.record_type}</span><b className={`due-badge ${item.situation}`}>{item.situation === "expired" ? "Vencida" : item.situation === "upcoming" ? "Próxima" : "Em dia"}</b></div><h3>{item.product_name}</h3><p>Brinco <strong>{item.animal_tag}</strong> • {item.animal_lot}</p><div className="health-details"><span><small>Aplicação</small><b>{dateBr(item.applied_at)}</b></span><span><small>Próxima</small><b>{dateBr(item.next_application_at)}</b></span><span><small>Lote</small><b>{item.batch || "—"}</b></span></div></article>)}</div>
    {!filtered.length && <div className="panel"><Empty icon={ShieldCheck} title="Nenhum registro sanitário" text="Cadastre vacinas, vermífugos e medicamentos." /></div>}
    <article className="panel health-calendar"><div className="panel-head"><div><h3>Calendário sanitário</h3><p>Aplicações vencidas e previstas para os próximos 90 dias</p></div><CalendarDays size={19} /></div><div className="calendar-list">{calendar.length ? calendar.map((item) => <div key={item.id}><span className={`calendar-day ${item.situation}`}><strong>{item.next_application_at.slice(8)}</strong><small>{monthName(item.next_application_at)}</small></span><div><strong>{item.product_name} • Brinco {item.animal_tag}</strong><small>{item.record_type} • {item.animal_lot}</small></div><b>{item.days_until < 0 ? `${Math.abs(item.days_until)} dias vencida` : `em ${item.days_until} dias`}</b></div>) : <Empty icon={Check} title="Calendário em dia" text="Nenhuma aplicação prevista no período." />}</div></article>
  </>;
}

function Reproduction({ events, indicators, openModal }) {
  const upcoming = events.filter((item) => item.expected_calving_at).sort((a, b) => a.expected_calving_at.localeCompare(b.expected_calving_at));
  return <>
    <PageHeading eyebrow="REPRODUÇÃO" title="Manejo reprodutivo" text="Cio, inseminação, cobertura, diagnóstico e partos em um calendário único." button="Registrar evento" onButton={() => openModal("reproduction")} />
    <section className="summary-grid reproduction-summary"><Metric icon={HeartPulse} label="Taxa de prenhez" value={`${indicators.pregnancy_rate || 0}%`} detail={`${indicators.eligible_females || 0} fêmeas elegíveis`} tone="purple" /><Metric icon={Activity} label="Taxa de natalidade" value={`${indicators.birth_rate || 0}%`} detail={`${indicators.births || 0} partos registrados`} tone="green" /><Metric icon={TrendingUp} label="Taxa de desmame" value={`${indicators.weaning_rate || 0}%`} detail={`${indicators.calves || 0} bezerros cadastrados`} tone="blue" /></section>
    <section className="dashboard-grid reproduction-layout"><article className="panel"><div className="panel-head"><div><h3>Calendário reprodutivo</h3><p>Próximos partos e acompanhamentos</p></div><CalendarDays size={19} /></div><div className="calendar-list">{upcoming.length ? upcoming.map((item) => <div key={item.id}><span className="calendar-day"><strong>{item.expected_calving_at.slice(8)}</strong><small>{monthName(item.expected_calving_at)}</small></span><div><strong>Parto previsto • Brinco {item.animal_tag}</strong><small>{item.animal_name || "Matriz"} • {item.bull_or_semen || "Reprodutor não informado"}</small></div><b>{daysUntil(item.expected_calving_at)} dias</b></div>) : <Empty icon={CalendarDays} title="Sem partos previstos" text="Registre diagnósticos positivos para gerar previsões." />}</div></article><article className="panel"><div className="panel-head"><div><h3>Resumo do ciclo</h3><p>Eventos registrados</p></div></div><div className="cycle-stats">{["Cio", "Inseminação artificial", "Cobertura natural", "Diagnóstico de prenhez", "Parto"].map((type) => <div key={type}><span>{type}</span><strong>{events.filter((e) => e.event_type === type).length}</strong></div>)}</div></article></section>
    <div className="timeline">{events.map((event) => <article key={event.id}><span className="timeline-dot" /><div><small>{dateBr(event.event_date)}</small><h3>{event.event_type}</h3><p>Brinco {event.animal_tag} {event.animal_name ? `• ${event.animal_name}` : ""}</p></div><b>{event.result || event.bull_or_semen || "Registrado"}</b></article>)}</div>
  </>;
}

function Pastures({ paddocks, openModal }) {
  return <>
    <PageHeading eyebrow="PASTAGENS" title="Gestão de piquetes" text="Capacidade, ocupação e descanso das áreas de pastejo." button="Novo piquete" onButton={() => openModal("paddock")} secondary="Movimentar animal" onSecondary={() => openModal("movement")} />
    <div className="pasture-map"><div className="map-legend"><span><i className="normal" />Normal</span><span><i className="attention" />Atenção</span><span><i className="overloaded" />Superlotado</span></div><div className="paddock-grid">{paddocks.map((item) => { const rate = item.occupancy_rate; const severity = rate > 100 ? "overloaded" : rate >= 80 ? "attention" : "normal"; return <article className={`paddock-card ${severity}`} key={item.id}><div className="paddock-head"><span><Sprout size={20} /></span><div><h3>{item.name}</h3><p>{item.area_hectares} hectares</p></div><b className={item.status === "Descanso" ? "resting" : ""}>{item.status}</b></div><div className="occupancy-ring" style={{ "--rate": `${Math.min(rate, 100)}%` }}><div><strong>{rate}%</strong><small>ocupação</small></div></div><div className="paddock-info"><span><small>Animais</small><strong>{item.current_animals}/{item.capacity}</strong></span><span><small>Descanso</small><strong>{item.rest_days} dias</strong></span></div><div className="progress"><i style={{ width: `${Math.min(rate, 100)}%` }} /></div>{rate >= 80 && <p className="capacity-alert"><AlertTriangle size={13} /> {rate > 100 ? "Capacidade excedida" : "Capacidade próxima do limite"}</p>}</article>; })}</div></div>
  </>;
}

function Finance({ data, openModal }) {
  return <>
    <PageHeading eyebrow="FINANCEIRO" title="Resultados da operação" text="Fluxo de caixa, custos e rentabilidade por lote." button="Novo lançamento" onButton={() => openModal("finance")} />
    <section className="summary-grid finance-summary"><Metric icon={ArrowUpRight} label="Receitas" value={money(data.revenue)} detail="Total acumulado" /><Metric icon={ArrowDownRight} label="Despesas" value={money(data.expenses)} detail="Custos operacionais" tone="red" /><Metric icon={Wallet} label="Lucro líquido" value={money(data.profit)} detail="Resultado da operação" tone="blue" /><Metric icon={Beef} label="Custo por animal" value={money(data.cost_per_animal)} detail="Animais ativos" tone="orange" /><Metric icon={BadgeDollarSign} label="Lucro por animal" value={money(data.profit_per_animal)} detail="Resultado por cabeça" tone={data.profit_per_animal >= 0 ? "green" : "red"} /></section>
    <section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><h3>Fluxo de caixa</h3><p>Últimos lançamentos</p></div></div><div className="finance-list">{data.entries.map((item) => <div key={item.id}><span className={`finance-icon ${item.entry_type === "Receita" ? "income" : "expense"}`}>{item.entry_type === "Receita" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</span><div><strong>{item.description}</strong><small>{item.category} • {dateBr(item.occurred_at)}</small></div><b className={item.entry_type === "Receita" ? "positive" : "negative"}>{item.entry_type === "Receita" ? "+" : "-"} {money(item.amount)}</b></div>)}</div></article><article className="panel"><div className="panel-head"><div><h3>Rentabilidade por lote</h3><p>Receitas, custos e lucro</p></div></div><div className="lot-profit">{data.lots.map((item) => <div key={item.lot}><div><strong>{item.lot}</strong><small>{money(item.revenue)} receita</small></div><span><small>Custos</small><b>{money(item.expenses)}</b></span><span><small>Lucro</small><b className={item.profit >= 0 ? "positive" : "negative"}>{money(item.profit)}</b></span></div>)}</div></article></section>
  </>;
}

function ArrobaPage({ data, saved }) {
  const [price, setPrice] = useState(data.arroba_price);
  const [yieldPercent, setYieldPercent] = useState(data.carcass_yield_percent);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setPrice(data.arroba_price); setYieldPercent(data.carcass_yield_percent); }, [data]);
  async function update(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await api("/arroba/settings", { method: "PUT", body: JSON.stringify({ arroba_price: Number(price), carcass_yield_percent: Number(yieldPercent) }) });
      await saved("Parâmetros comerciais atualizados");
    } finally { setLoading(false); }
  }
  return <>
    <PageHeading eyebrow="COMERCIALIZAÇÃO" title="Arroba e valor do rebanho" text="Projeção comercial baseada no peso vivo e no rendimento de carcaça configurado." />
    <section className="summary-grid arroba-summary"><Metric icon={Scale} label="Peso vivo total" value={`${data.total_live_weight} kg`} detail={`${data.animals.length} animais avaliados`} /><Metric icon={BadgeDollarSign} label="Arrobas estimadas" value={`${data.total_arrobas} @`} detail={`${yieldPercent}% de rendimento`} tone="orange" /><Metric icon={Wallet} label="Valor do rebanho" value={money(data.estimated_total_value)} detail={`${money(price)} por arroba`} tone="blue" /><Metric icon={TrendingUp} label="Prontos para venda" value={data.sale_ready_count || 0} detail={`${data.near_target_count || 0} próximos da meta`} tone="green" /></section>
    <section className="arroba-layout">
      <form className="panel arroba-settings" onSubmit={update}><div className="panel-head"><div><h3>Parâmetros da estimativa</h3><p>Ajuste conforme a cotação e o padrão do lote</p></div></div><label>Preço da arroba (R$)<input type="number" min="1" step=".01" value={price} onChange={(e) => setPrice(e.target.value)} /></label><label>Rendimento de carcaça (%)<input type="number" min="35" max="65" step=".1" value={yieldPercent} onChange={(e) => setYieldPercent(e.target.value)} /></label><button className="primary-button" disabled={loading}>{loading ? "Atualizando..." : "Atualizar cálculo"}</button><p className="method-note">{data.methodology}</p></form>
      <div className="table-card arroba-table"><div className="data-table"><div className="table-row table-header"><span>Ranking / animal</span><span>Peso vivo</span><span>Carcaça est.</span><span>Arrobas</span><span>Valor estimado</span></div>{data.animals.map((animal, index) => <div className="table-row" key={animal.animal_id}><span><strong>#{index + 1} • Brinco {animal.tag_number}</strong><small>{animal.lot} • última pesagem {dateBr(animal.last_weighing_at)}</small></span><span><strong>{animal.live_weight} kg</strong><small>{animal.sale_ready ? "Pronto para venda" : animal.near_target ? `${animal.kilograms_to_target} kg para meta` : "Em evolução"}</small></span><span><strong>{animal.carcass_weight} kg</strong><small>{data.carcass_yield_percent}% rendimento</small></span><span><strong>{animal.estimated_arrobas} @</strong></span><span><strong>{money(animal.estimated_value)}</strong></span></div>)}</div></div>
    </section>
  </>;
}

function RankingsPage({ data, openProfile }) {
  const boards = [["Ranking geral", data.overall, "score"], ["Mais pesados", data.heaviest, "weight"], ["Melhor GMD", data.best_gmd, "gmd"], ["Maior valor", data.highest_value, "estimated_value"]];
  const value = (row, key) => key === "weight" ? `${row[key]} kg` : key === "gmd" ? `${row[key]} kg/dia` : key === "estimated_value" ? money(row[key]) : `${row[key]} pts`;
  return <><PageHeading eyebrow="DESEMPENHO ANIMAL" title="Rankings do rebanho" text="Compare desempenho, peso, valor estimado e índice geral dos animais." /><div className="ranking-board">{boards.map(([title, rows, key]) => <article className="panel" key={title}><div className="panel-head"><div><h3>{title}</h3><p>Atualizado com os dados cadastrados</p></div><Trophy size={19} /></div><div className="ranking-list">{rows.slice(0, 6).map((row, index) => <button key={row.id} onClick={() => openProfile(row.id)}><b className={`rank-medal rank-${index + 1}`}>{index + 1}</b><span><strong>{row.name || `Brinco ${row.tag_number}`}</strong><small>{row.breed} • #{row.tag_number}</small></span><em>{value(row, key)}</em></button>)}</div></article>)}</div></>;
}

function GeneticsPage({ data }) {
  return <><PageHeading eyebrow="GENÉTICA E LINHAGENS" title="Inteligência genética" text="Acompanhe parentesco e desempenho médio dos descendentes." /><section className="summary-grid"><Metric icon={Dna} label="Animais com genealogia" value={data.animals_with_genealogy} detail="Pai ou mãe identificados" /><Metric icon={Layers3} label="Linhagens" value={Object.keys(data.lineages || {}).length} detail="Grupos genéticos cadastrados" tone="purple" /></section><div className="panel"><div className="panel-head"><div><h3>Ranking de matrizes e reprodutores</h3><p>Resultado dos descendentes cadastrados</p></div></div><div className="data-table"><div className="table-row table-header"><span>Ascendente</span><span>Descendentes</span><span>Peso médio</span><span>GMD médio</span><span>Animais</span></div>{data.family_ranking.map((item) => <div className="table-row" key={item.parent_tag}><span><strong>#{item.parent_tag}</strong></span><span>{item.offspring_count}</span><span>{item.average_offspring_weight} kg</span><span>{item.average_offspring_gmd ?? "—"} kg/dia</span><span><small>{item.offspring.map((child) => child.tag_number).join(", ")}</small></span></div>)}</div></div></>;
}

function InventoryPage({ items, openModal }) {
  const low = items.filter((item) => item.low_stock).length;
  const expiring = items.filter((item) => item.expiry_status !== "ok").length;
  return <><PageHeading eyebrow="ESTOQUE VETERINÁRIO" title="Medicamentos e insumos" text="Controle quantidade, lotes, validade e estoque mínimo." button="Cadastrar item" onButton={() => openModal("inventory")} /><section className="summary-grid"><Metric icon={Boxes} label="Itens cadastrados" value={items.length} detail="Produtos monitorados" /><Metric icon={AlertTriangle} label="Estoque baixo" value={low} detail="Abaixo do mínimo" tone="red" /><Metric icon={CalendarDays} label="Validade crítica" value={expiring} detail="Vencidos ou em 30 dias" tone="orange" /></section><div className="table-card"><div className="data-table"><div className="table-row table-header"><span>Produto</span><span>Tipo / lote</span><span>Quantidade</span><span>Validade</span><span>Situação</span></div>{items.map((item) => <div className="table-row" key={item.id}><span><strong>{item.name}</strong><small>{item.supplier || "Fornecedor não informado"}</small></span><span><strong>{item.item_type}</strong><small>{item.batch || "Sem lote"}</small></span><span><strong>{item.quantity} {item.unit}</strong><small>Mínimo {item.minimum_quantity}</small></span><span>{dateBr(item.expires_at)}</span><span><b className={`status ${item.expiry_status === "expired" || item.low_stock ? "danger" : item.expiry_status === "soon" ? "warning" : "active"}`}>{item.low_stock ? "Estoque baixo" : item.expiry_status === "expired" ? "Vencido" : item.expiry_status === "soon" ? "Próximo" : "Regular"}</b></span></div>)}</div></div></>;
}

function CommercialPage({ trades, openModal }) {
  return <><PageHeading eyebrow="GESTÃO COMERCIAL" title="Compra e venda de animais" text="Histórico com comprador, fornecedor, GTA, nota fiscal e transporte." button="Nova operação" onButton={() => openModal("trade")} /><div className="table-card"><div className="data-table"><div className="table-row table-header"><span>Operação</span><span>Parte relacionada</span><span>Animal / lote</span><span>Documentos</span><span>Valor / data</span></div>{trades.map((item) => <div className="table-row" key={item.id}><span><b className={`status ${item.trade_type === "Venda" ? "active" : "warning"}`}>{item.trade_type}</b></span><span><strong>{item.counterparty_name}</strong><small>{item.carrier || "Sem transportadora"}</small></span><span><strong>{item.animal_tag ? `#${item.animal_tag}` : item.lot || "Operação geral"}</strong></span><span><strong>GTA {item.gta || "—"}</strong><small>NF {item.invoice_number || "—"}</small></span><span><strong>{money(item.amount)}</strong><small>{dateBr(item.occurred_at)}</small></span></div>)}</div></div></>;
}

function ProfitSimulator() {
  const [form, setForm] = useState({ weight: 400, average_daily_gain: .75, purchase_value: 3500, daily_cost: 7 });
  const [result, setResult] = useState(null);
  async function simulate(event) { event.preventDefault(); setResult(await api("/profit-simulator", { method: "POST", body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)]))) })); }
  return <><PageHeading eyebrow="PLANEJAMENTO DE VENDA" title="Simulador de lucro" text="Projete peso, arrobas, valor e margem para 30, 60 e 90 dias." /><section className="simulator-layout"><form className="panel simulator-form" onSubmit={simulate}><label>Peso atual (kg)<input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></label><label>Ganho médio diário<input type="number" step=".01" value={form.average_daily_gain} onChange={(e) => setForm({ ...form, average_daily_gain: e.target.value })} /></label><label>Valor de compra<input type="number" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} /></label><label>Custo diário<input type="number" step=".01" value={form.daily_cost} onChange={(e) => setForm({ ...form, daily_cost: e.target.value })} /></label><button className="primary-button"><Calculator size={17} /> Calcular cenários</button></form><article className="panel"><div className="panel-head"><div><h3>Projeção comercial</h3><p>Estimativa baseada na arroba configurada</p></div></div>{result ? <><ResponsiveContainer width="100%" height={250}><AreaChart data={result.scenarios}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="days" unit="d" /><YAxis /><Tooltip formatter={(value) => money(value)} /><Area dataKey="estimated_profit" name="Lucro estimado" stroke="#267454" fill="#cde7d9" /></AreaChart></ResponsiveContainer><div className="scenario-grid">{result.scenarios.map((item) => <span key={item.days}><small>{item.days === 0 ? "Hoje" : `${item.days} dias`}</small><strong>{item.projected_weight} kg</strong><b>{money(item.estimated_profit)}</b></span>)}</div></> : <Empty icon={Calculator} title="Informe os dados" text="O sistema calculará quatro cenários de venda." />}</article></section></>;
}

function BenchmarkPage({ data }) {
  return <><PageHeading eyebrow="BENCHMARK PECUÁRIO" title="Metas da fazenda" text="Compare os indicadores atuais com metas técnicas editáveis em uma próxima etapa." /><div className="benchmark-grid">{data.map((item) => { const progress = item.lower_is_better ? Math.min(item.target / Math.max(item.current, .01) * 100, 100) : Math.min(item.achievement, 100); return <article className="panel" key={item.name}><div className="benchmark-title"><span><Gauge size={19} /></span><div><h3>{item.name}</h3><p>Meta: {item.target} {item.unit}</p></div><strong>{item.current} {item.unit}</strong></div><div className="occupancy-bar"><i style={{ width: `${progress}%` }} /></div><small>{progress.toFixed(0)}% da meta técnica</small></article>; })}</div></>;
}

function ProfitCenterPage({ data }) {
  return <><PageHeading eyebrow="RESULTADO DA OPERAÇÃO" title="Central de lucro" text="Visão consolidada do patrimônio pecuário, receitas, custos e resultado por lote." /><section className="summary-grid"><Metric icon={Beef} label="Valor do rebanho" value={money(data.herd_value)} detail="Estimativa comercial" /><Metric icon={ArrowUpRight} label="Receita acumulada" value={money(data.accumulated_revenue)} detail="Todos os lançamentos" tone="green" /><Metric icon={ArrowDownRight} label="Custo total" value={money(data.total_cost)} detail="Despesas registradas" tone="red" /><Metric icon={Landmark} label="Lucro líquido" value={money(data.net_profit)} detail={`${money(data.profit_per_head)} por cabeça`} tone="blue" /></section><article className="panel"><ResponsiveContainer width="100%" height={280}><BarChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(value) => money(value)} /><Legend /><Bar dataKey="revenue" name="Receita" fill="#267454" /><Bar dataKey="expenses" name="Despesas" fill="#dc7a32" /></BarChart></ResponsiveContainer></article></>;
}

function DocumentsPage({ documents, animals, saved }) {
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  async function upload(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => { await api("/documents", { method: "POST", body: JSON.stringify({ document_type: "Documento", title: file.name.replace(/\.[^.]+$/, ""), file_name: file.name, data_url: reader.result, document_date: today }) }); setUploading(false); saved("Documento arquivado"); };
    reader.readAsDataURL(file);
  }
  const filtered = documents.filter((item) => `${item.title} ${item.file_name} ${item.document_type}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeading eyebrow="ARQUIVO DIGITAL" title="Central de documentos" text="GTA, notas fiscais, exames, receitas e contratos organizados na nuvem." /><div className="toolbar pro-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar documentos..." /></div><label className="primary-button file-button"><Upload size={17} />{uploading ? "Enviando..." : "Enviar arquivo"}<input type="file" hidden onChange={upload} /></label></div><div className="documents-grid">{filtered.map((item) => <a className="document-card" href={item.data_url} download={item.file_name} key={item.id}><span><FolderArchive size={22} /></span><div><h3>{item.title}</h3><p>{item.document_type} • {dateBr(item.document_date)}</p><small>{item.file_name}</small></div><Download size={17} /></a>)}</div>{!filtered.length && <div className="panel"><Empty icon={FolderArchive} title="Nenhum documento" text="Envie o primeiro arquivo da fazenda." /></div>}</>;
}

function WhatsAppPage({ data, openModal }) {
  return <><PageHeading eyebrow="COMUNICAÇÃO" title="Alertas por WhatsApp" text="Cadastre destinatários e compartilhe relatórios e alertas prontos." button="Novo destinatário" onButton={() => openModal("whatsapp")} /><div className="whatsapp-grid"><article className="panel"><div className="panel-head"><div><h3>Destinatários</h3><p>Equipe autorizada a receber informações</p></div></div>{data.recipients.map((item) => <div className="recipient-row" key={item.id}><span><MessageCircle size={18} /></span><div><strong>{item.name}</strong><small>{item.phone} • {item.alert_types}</small></div><b>{item.active ? "Ativo" : "Pausado"}</b></div>)}</article><article className="panel"><div className="panel-head"><div><h3>Caixa de saída</h3><p>{data.notice}</p></div></div>{data.messages.map((item) => <a className="whatsapp-message" href={item.share_url} target="_blank" rel="noreferrer" key={item.phone}><MessageCircle size={19} /><span><strong>Enviar para {item.recipient}</strong><small>Mensagem gerada com os alertas atuais</small></span><ChevronRight size={17} /></a>)}</article></div></>;
}

function Reports() {
  const reports = [["rebanho", Beef, "Relatório do rebanho", "Cadastro, localização, peso e situação"], ["sanitario", ShieldCheck, "Relatório sanitário", "Vacinas, medicamentos e aplicações"], ["financeiro", Wallet, "Relatório financeiro", "Receitas, despesas e fluxo de caixa"], ["reprodutivo", HeartPulse, "Relatório reprodutivo", "Eventos, diagnósticos e partos"], ["pesagens", Scale, "Relatório de pesagens", "Histórico de peso e desempenho"], ["arrobas", BadgeDollarSign, "Relatório de arrobas", "Carcaça, arrobas e valor comercial"], ["lotes", Layers3, "Relatório de lotes", "Desempenho e rentabilidade por lote"], ["pastagens", Sprout, "Relatório de pastagens", "Capacidade e ocupação dos piquetes"]];
  return <><PageHeading eyebrow="RELATÓRIOS" title="Central de relatórios" text="Documentos profissionais prontos para análise e compartilhamento." /><div className="reports-grid">{reports.map(([kind, Icon, title, text]) => <article className="report-card" key={kind}><span><Icon size={22} /></span><div><h3>{title}</h3><p>{text}</p></div><div><button onClick={() => downloadReport(kind, "pdf")}><Download size={15} /> PDF</button><button onClick={() => downloadReport(kind, "xlsx")}><Download size={15} /> Excel</button></div></article>)}</div></>;
}

function UsersPage({ users, openModal }) {
  return <><PageHeading eyebrow="MULTIUSUÁRIOS" title="Equipe e permissões" text="Defina o acesso de cada profissional da fazenda." button="Adicionar usuário" onButton={() => openModal("user")} /><div className="team-grid">{users.map((item) => <article className="team-card" key={item.id}><span className="team-avatar">{item.name.slice(0, 2).toUpperCase()}</span><div><h3>{item.name}</h3><p>{item.email}</p><b>{item.role}</b></div><div className="permission-tags">{(item.permissions.includes("*") ? ["Acesso total"] : item.permissions.slice(0, 4)).map((permission) => <span key={permission}>{permission}</span>)}</div></article>)}</div></>;
}

function AIAgro() {
  const [insights, setInsights] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([{ role: "ai", result: {
    title: "Assistente analítico da fazenda",
    answer: "Analiso os dados reais cadastrados e mostro cálculos, evidências, premissas e nível de confiança. Escolha uma análise ou faça uma pergunta.",
    sections: [], metrics: [], evidence: [], assumptions: [], suggestions: [],
    confidence: { label: "alta", score: 1 },
  } }]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    api("/ai/insights").then(setInsights).catch(() => setInsights(null));
  }, []);
  async function ask(text = question) {
    if (!text.trim() || loading) return;
    setMessages((current) => [...current, { role: "user", text }]);
    setQuestion("");
    setLoading(true);
    try {
      const result = await api("/ai/query", { method: "POST", body: JSON.stringify({ question: text }) });
      setMessages((current) => [...current, { role: "ai", result }]);
    } catch (err) {
      setMessages((current) => [...current, { role: "ai", result: { title: "Não foi possível analisar", answer: err.message, sections: [], metrics: [], evidence: [], assumptions: [], confidence: { label: "baixa", score: 0 } } }]);
    } finally {
      setLoading(false);
    }
  }
  const suggestions = insights?.suggestions || ["Faça um diagnóstico geral da fazenda.", "Quais animais estão ganhando menos peso?", "Analise os custos deste mês."];
  return <section className="ai-page">
    <div className="ai-hero"><span><Bot size={28} /></span><div><span className="eyebrow light">INTELIGÊNCIA PECUÁRIA EXPLICÁVEL</span><h2>IA Agro</h2><p>Análises zootécnicas, sanitárias, reprodutivas, financeiras e de pastagem calculadas sobre os dados reais da fazenda.</p></div><b className="ai-live"><i /> Dados da fazenda</b></div>
    {insights && <div className="ai-indicators">{insights.indicators.map((item) => <article key={item.label}><small>{item.label}</small><strong>{item.value ?? "—"} <em>{item.value !== null ? item.unit : ""}</em></strong></article>)}</div>}
    {insights && <div className="ai-alert-strip"><span><AlertTriangle size={16} /></span><p><strong>Leitura rápida:</strong> {insights.alerts.expired_health} sanitário(s) vencido(s), {insights.alerts.stale_weighings} pesagem(ns) desatualizada(s) e {insights.alerts.overloaded_paddocks} piquete(s) acima de 90%.</p><b>Dados {insights.data_quality}% completos</b></div>}
    <div className="suggestion-list">{suggestions.map((item) => <button key={item} onClick={() => ask(item)}><Sparkles size={14} />{item}</button>)}</div>
    <div className="chat-panel ai-chat-pro"><div className="chat-messages">{messages.map((item, index) => item.role === "user"
      ? <div className="chat-message user" key={index}><p>{item.text}</p></div>
      : <AIResponse result={item.result} ask={ask} key={index} />
    )}{loading && <div className="chat-message ai"><span><Bot size={17} /></span><p className="typing">Consultando registros e calculando indicadores...</p></div>}</div><form onSubmit={(e) => { e.preventDefault(); ask(); }}><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex.: quando o BR-1042 atingirá 450 kg?" /><button className="primary-button">Analisar</button></form></div>
    {insights && <details className="ai-methodology"><summary>Como a IA Agro calcula</summary>{insights.methodology.map((item) => <p key={item}><Check size={13} />{item}</p>)}</details>}
  </section>;
}

function AIResponse({ result, ask }) {
  return <div className="chat-message ai ai-result"><span><Bot size={17} /></span><div className="ai-answer-card">
    <div className="ai-answer-head"><div><small>ANÁLISE DA IA AGRO</small><h3>{result.title}</h3></div>{result.confidence && <b className={`confidence ${result.confidence.label}`}>Confiança {result.confidence.label}</b>}</div>
    <p className="ai-summary">{result.answer}</p>
    {result.metrics?.length > 0 && <div className="ai-answer-metrics">{result.metrics.map((metric) => <span key={metric.label}><small>{metric.label}</small><strong>{metric.value ?? "—"} <em>{metric.value !== null ? metric.unit : ""}</em></strong></span>)}</div>}
    {result.sections?.map((section) => <div className="ai-section" key={section.title}><h4>{section.title}</h4><ul>{section.items.map((entry, index) => <li key={index}>{entry}</li>)}</ul></div>)}
    {result.evidence?.length > 0 && <details className="ai-details"><summary>Evidências usadas</summary>{result.evidence.map((entry) => <p key={entry}>{entry}</p>)}</details>}
    {result.assumptions?.length > 0 && <details className="ai-details assumptions"><summary>Premissas do cálculo</summary>{result.assumptions.map((entry) => <p key={entry}>{entry}</p>)}</details>}
    {result.disclaimer && <div className="ai-disclaimer"><ShieldCheck size={15} /><p>{result.disclaimer}</p></div>}
    {result.suggestions?.length > 0 && <div className="ai-followups">{result.suggestions.map((entry) => <button key={entry} onClick={() => ask(entry)}>{entry}</button>)}</div>}
  </div></div>;
}

function AlertsDrawer({ alerts, close }) {
  const icon = (item) => item.type === "danger" ? <AlertTriangle size={18} /> : item.type === "reproduction" ? <HeartPulse size={18} /> : item.type === "stock" ? <Pill size={18} /> : item.type === "warning" ? <Bell size={18} /> : <CalendarDays size={18} />;
  return <><button className="drawer-backdrop" onClick={close} /><aside className="alerts-drawer"><div className="drawer-head"><div><span className="eyebrow">CENTRAL DE ALERTAS</span><h2>Notificações</h2><p>{alerts.length} ocorrência(s) que merecem acompanhamento</p></div><button className="icon-button" onClick={close}><X size={19} /></button></div><div className="alerts-list">{alerts.length ? alerts.map((item, index) => <article className={item.type} key={index}><span>{icon(item)}</span><div><small>{item.category}</small><strong>{item.title}</strong><p>{item.detail}</p><time>{dateBr(item.date)}</time></div></article>) : <Empty icon={Check} title="Tudo em dia" text="Nenhum alerta pendente." />}</div></aside></>;
}

function AnimalProfile({ profile, close, updateWeight }) {
  const tabs = [["Timeline", profile.timeline || []], ["Pesagens", profile.weighings], ["Sanidade", [...profile.vaccinations, ...profile.health_records]], ["Reprodução", profile.reproduction], ["Financeiro", profile.financial_entries || []], ["Movimentações", profile.movements]];
  const [tab, setTab] = useState("Timeline");
  const [qrUrl, setQrUrl] = useState("");
  const [photos, setPhotos] = useState([]);
  useEffect(() => {
    authenticatedBlob(`/animals/${profile.id}/qr.svg`).then(setQrUrl);
    api(`/animals/${profile.id}/photos`).then(setPhotos);
    return () => { if (qrUrl) URL.revokeObjectURL(qrUrl); };
  }, [profile.id]);
  async function printProfile() { const url = await authenticatedBlob(`/animals/${profile.id}/print.pdf`); window.open(url, "_blank"); }
  function addPhoto(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => { const photo = await api(`/animals/${profile.id}/photos`, { method: "POST", body: JSON.stringify({ image_data: reader.result, captured_at: today }) }); setPhotos((current) => [photo, ...current]); };
    reader.readAsDataURL(file);
  }
  const records = tabs.find(([name]) => name === tab)?.[1] || [];
  return <><button className="drawer-backdrop" onClick={close} /><aside className="profile-drawer"><div className="drawer-head"><span className="eyebrow">FICHA DO ANIMAL</span><button className="icon-button" onClick={close}><X size={19} /></button></div><div className="profile-hero">{profile.photo_url ? <img src={profile.photo_url} /> : <span><Beef size={32} /></span>}<div><h2>{profile.name || `Brinco ${profile.tag_number}`}</h2><p>#{profile.tag_number} • {profile.breed} • {profile.sex}</p><b className={`status ${statusClass(profile.status)}`}>{profile.status}</b></div>{qrUrl && <img className="animal-qr" src={qrUrl} />}</div><div className="profile-actions"><button onClick={() => updateWeight(profile)}><Scale size={16} /> Atualizar peso</button><button onClick={printProfile}><Printer size={16} /> Imprimir ficha</button><label><Camera size={16} /> Adicionar foto<input hidden type="file" accept="image/*" onChange={addPhoto} /></label></div><div className="profile-metrics"><span><small>Código Novaris</small><strong>{profile.unique_code || "—"}</strong></span><span><small>Peso atual</small><strong>{profile.current_weight} kg</strong></span><span><small>Pai / mãe</small><strong>{profile.father_tag || "—"} / {profile.mother_tag || "—"}</strong></span><span><small>Linhagem</small><strong>{profile.lineage || "Não informada"}</strong></span><span><small>Idade</small><strong>{profile.age_label}</strong></span><span><small>Lote / piquete</small><strong>{profile.lot} • {profile.paddock}</strong></span></div>{photos.length > 0 && <div className="animal-gallery">{photos.map((photo) => <figure key={photo.id}><img src={photo.image_data} /><figcaption>{dateBr(photo.captured_at)}</figcaption></figure>)}</div>}<div className="profile-tabs">{tabs.map(([name, values]) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}<b>{values.length}</b></button>)}</div><div className="profile-history">{records.length ? records.map((item, index) => <article key={item.id || index}><span className="history-dot" /><div><strong>{item.title || item.product_name || item.vaccine_name || item.event_type || item.movement_type || `${item.weight} kg`}</strong><small>{item.kind ? `${item.kind} • ` : ""}{dateBr(item.date || item.applied_at || item.weighed_at || item.event_date || item.moved_at)}</small><p>{item.detail || item.notes || item.result || item.to_location || "Registro concluído"}</p></div></article>) : <Empty icon={Package} title="Sem registros" text="O histórico deste módulo aparecerá aqui." />}</div></aside></>;
}

const modalDefinitions = {
  animal: { title: "Cadastrar animal", endpoint: "/animals", fields: [["tag_number", "Número do brinco"], ["name", "Nome (opcional)"], ["photo_url", "URL da foto"], ["breed", "Raça", "select", ["Nelore", "Angus", "Senepol", "Guzerá", "Girolando", "Mestiço"]], ["sex", "Sexo", "select", ["Fêmea", "Macho"]], ["birth_date", "Nascimento", "date"], ["current_weight", "Peso atual (kg)", "number"], ["category", "Categoria", "select", ["Bezerro", "Bezerra", "Novilho", "Novilha", "Vaca", "Touro", "Adulto"]], ["lot", "Lote"], ["paddock", "Piquete"], ["status", "Status", "select", ["Ativo", "Vendido", "Morto", "Descartado"]], ["father_tag", "Brinco do pai"], ["mother_tag", "Brinco da mãe"], ["lineage", "Linhagem"], ["blood_degree", "Grau de sangue"], ["rfid_code", "Código RFID (opcional)"], ["sale_ready", "Pronto para venda", "checkbox"], ["purchase_value", "Valor de compra", "number"]] },
  weighing: { title: "Registrar pesagem", endpoint: "/weighings", fields: [["animal_id", "Animal", "animal"], ["weight", "Peso (kg)", "number"], ["weighed_at", "Data", "date"], ["notes", "Observações", "textarea"]] },
  health: { title: "Registrar aplicação sanitária", endpoint: "/health-records", fields: [["animal_id", "Animal", "animal"], ["record_type", "Tipo", "select", ["Vacina", "Vermífugo", "Medicamento"]], ["product_name", "Produto"], ["applied_at", "Data da aplicação", "date"], ["next_application_at", "Próxima aplicação", "date"], ["expires_at", "Validade do produto", "date"], ["batch", "Lote"], ["dosage", "Dosagem"], ["responsible", "Responsável"], ["notes", "Observações", "textarea"]] },
  reproduction: { title: "Registrar evento reprodutivo", endpoint: "/reproduction", fields: [["animal_id", "Matriz", "female"], ["event_type", "Evento", "select", ["Cio", "Inseminação artificial", "Cobertura natural", "Diagnóstico de prenhez", "Previsão de parto", "Parto"]], ["event_date", "Data", "date"], ["bull_or_semen", "Touro ou sêmen"], ["result", "Resultado"], ["expected_calving_at", "Previsão de parto", "date"], ["calf_tag", "Brinco do bezerro"], ["notes", "Observações", "textarea"]] },
  paddock: { title: "Cadastrar piquete", endpoint: "/paddocks", fields: [["name", "Nome"], ["area_hectares", "Área (ha)", "number"], ["capacity", "Capacidade"], ["current_animals", "Animais atuais", "number"], ["status", "Status", "select", ["Em uso", "Descanso", "Manutenção"]], ["rest_started_at", "Início do descanso", "date"]] },
  movement: { title: "Movimentar animal", endpoint: "/movements", fields: [["animal_id", "Animal", "animal"], ["movement_type", "Tipo", "select", ["Entrada", "Saída", "Transferência"]], ["from_location", "Origem"], ["to_location", "Destino"], ["moved_at", "Data", "date"], ["notes", "Observações", "textarea"]] },
  finance: { title: "Novo lançamento financeiro", endpoint: "/finance", fields: [["entry_type", "Tipo", "select", ["Receita", "Despesa"]], ["category", "Categoria", "select", ["Compra de animais", "Venda de animais", "Ração", "Sal mineral", "Medicamentos", "Funcionários", "Combustível", "Manutenção"]], ["description", "Descrição"], ["amount", "Valor", "number"], ["occurred_at", "Data", "date"], ["lot", "Lote"], ["animal_id", "Animal (opcional)", "animalOptional"], ["notes", "Observações", "textarea"]] },
  user: { title: "Adicionar usuário", endpoint: "/users", fields: [["name", "Nome"], ["email", "E-mail", "email"], ["password", "Senha", "password"], ["role", "Perfil", "select", ["Administrador", "Gerente", "Veterinário", "Funcionário"]]] },
  ruralEvent: { title: "Criar evento rural", endpoint: "/rural-calendar", fields: [["event_type", "Tipo", "select", ["Vacinação", "Vermifugação", "Pesagem", "Parto", "Diagnóstico de prenhez", "Inseminação", "Venda programada", "Outro"]], ["title", "Título"], ["event_date", "Data", "date"], ["animal_id", "Animal (opcional)", "animalOptional"], ["status", "Status", "select", ["Programado", "Confirmado", "Concluído"]], ["notes", "Observações", "textarea"]] },
  inventory: { title: "Cadastrar item no estoque", endpoint: "/inventory", fields: [["item_type", "Tipo", "select", ["Vacina", "Vermífugo", "Medicamento", "Material veterinário"]], ["name", "Produto"], ["quantity", "Quantidade", "number"], ["unit", "Unidade", "select", ["un", "frascos", "doses", "ml", "kg"]], ["minimum_quantity", "Estoque mínimo", "number"], ["expires_at", "Validade", "date"], ["batch", "Lote"], ["supplier", "Fornecedor"], ["notes", "Observações", "textarea"]] },
  trade: { title: "Registrar compra ou venda", endpoint: "/trades", fields: [["trade_type", "Operação", "select", ["Compra", "Venda"]], ["animal_id", "Animal (opcional)", "animalOptional"], ["counterparty_name", "Comprador ou fornecedor"], ["counterparty_document", "CPF/CNPJ"], ["carrier", "Transportadora"], ["gta", "Número da GTA"], ["invoice_number", "Nota fiscal"], ["amount", "Valor", "number"], ["occurred_at", "Data", "date"], ["lot", "Lote"], ["notes", "Observações", "textarea"]] },
  whatsapp: { title: "Cadastrar destinatário", endpoint: "/whatsapp/recipients", fields: [["name", "Nome"], ["phone", "WhatsApp com DDD"], ["alert_types", "Alertas", "select", ["todos", "sanidade", "reprodução", "pesagens", "financeiro"]], ["active", "Ativo", "checkbox"]] },
};

function BatchWeighingModal({ animals, close, saved }) {
  const [date, setDate] = useState(today);
  const [weights, setWeights] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const items = Object.entries(weights).filter(([, value]) => Number(value) > 0).map(([animalId, weight]) => ({ animal_id: Number(animalId), weight: Number(weight), weighed_at: date }));
    if (!items.length) { setError("Informe o peso de pelo menos um animal."); return; }
    setLoading(true);
    try {
      await api("/weighings/batch", { method: "POST", body: JSON.stringify({ items }) });
      saved(`${items.length} pesagem(ns) registrada(s)`);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><form className="modal professional-modal batch-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">MANEJO COLETIVO</span><h3>Pesagem em lote</h3><p>Preencha somente os animais pesados nesta operação.</p></div><button type="button" className="icon-button" onClick={close}><X size={19} /></button></div><label>Data da pesagem<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><div className="batch-list">{animals.filter((a) => ["Ativo", "Prenhe"].includes(a.status)).map((animal) => <label key={animal.id}><span><strong>#{animal.tag_number} {animal.name || ""}</strong><small>{animal.lot} • atual {animal.current_weight} kg</small></span><input type="number" min="1" step=".1" placeholder="Novo peso" value={weights[animal.id] || ""} onChange={(e) => setWeights({ ...weights, [animal.id]: e.target.value })} /></label>)}</div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancelar</button><button className="primary-button" disabled={loading}><Check size={17} />{loading ? "Salvando..." : "Registrar pesagens"}</button></div></form></div>;
}

function DataModal({ type, animals, close, saved }) {
  const definition = modalDefinitions[type];
  const initial = {};
  definition.fields.forEach(([key, , kind, options]) => {
    if (kind === "date") initial[key] = today;
    else if (kind === "checkbox") initial[key] = false;
    else if (kind === "select") initial[key] = options[0];
    else if (kind === "animal" || kind === "female") initial[key] = (kind === "female" ? animals.find((a) => a.sex === "Fêmea") : animals[0])?.id || "";
    else initial[key] = "";
  });
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const payload = { ...form };
    definition.fields.forEach(([key, , kind]) => {
      if ((kind === "number" || kind === "animal" || kind === "female" || kind === "animalOptional") && payload[key] !== "") payload[key] = Number(payload[key]);
      if (kind === "date" && !payload[key]) payload[key] = null;
      if (kind === "animalOptional" && payload[key] === "") payload[key] = null;
    });
    try {
      await api(definition.endpoint, { method: "POST", body: JSON.stringify(payload) });
      saved();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><form className="modal professional-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">NOVO REGISTRO</span><h3>{definition.title}</h3></div><button type="button" className="icon-button" onClick={close}><X size={19} /></button></div><div className="modal-fields form-grid">{definition.fields.map(([key, label, kind = "text", options]) => {
    const animalsList = kind === "female" ? animals.filter((a) => a.sex === "Fêmea") : animals;
    if (kind === "checkbox") return <label className="checkbox-field" key={key}><input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} /><span>{label}</span></label>;
    if (kind === "textarea") return <label className="full-field" key={key}>{label}<textarea rows="3" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>;
    if (kind === "select") return <label key={key}>{label}<select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
    if (["animal", "female", "animalOptional"].includes(kind)) return <label key={key}>{label}<select required={kind !== "animalOptional"} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>{kind === "animalOptional" && <option value="">Nenhum</option>}{animalsList.map((animal) => <option key={animal.id} value={animal.id}>#{animal.tag_number} {animal.name ? `• ${animal.name}` : ""}</option>)}</select></label>;
    return <label key={key}>{label}<input required={!["name", "photo_url", "purchase_value", "lot", "bull_or_semen", "result", "calf_tag", "responsible", "batch", "dosage"].includes(key)} type={kind} step={kind === "number" ? ".01" : undefined} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>;
  })}</div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancelar</button><button className="primary-button" disabled={loading}><Check size={17} />{loading ? "Salvando..." : "Salvar registro"}</button></div></form></div>;
}

function ageLabel(birth) {
  const months = Math.max(0, (new Date().getFullYear() - Number(birth.slice(0, 4))) * 12 + new Date().getMonth() + 1 - Number(birth.slice(5, 7)));
  return `${Math.floor(months / 12)}a ${months % 12}m`;
}
function statusClass(status) { return status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function avg(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function monthName(value) { return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function daysUntil(value) { return Math.max(Math.ceil((new Date(`${value}T00:00:00`) - new Date()) / 86400000), 0); }

function BottomNav({ page, setPage, openModal }) {
  return <nav className="bottom-nav field-nav"><button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}><Home size={19} /><span>Início</span></button><button onClick={() => openModal("weighing")}><Scale size={19} /><span>Pesar</span></button><button className="bottom-add" onClick={() => setPage("animals")}><Search size={20} /><span>Animal</span></button><button onClick={() => openModal("health")}><Syringe size={19} /><span>Vacina</span></button><button onClick={() => openModal("reproduction")}><HeartPulse size={19} /><span>Parto</span></button></nav>;
}

function AppSkeleton() {
  return <div className="skeleton-shell"><aside><div className="skeleton logo-line" />{Array.from({ length: 9 }).map((_, index) => <div className="skeleton nav-line" key={index} />)}</aside><main><div className="skeleton top-line" /><div className="skeleton hero-line" /><div className="skeleton-grid">{Array.from({ length: 12 }).map((_, index) => <div className="skeleton card-line" key={index} />)}</div></main></div>;
}

export function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(emptyData);
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(Boolean(localStorage.getItem("novaris_token")));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [selectedLotName, setSelectedLotName] = useState(null);
  const [weightAnimal, setWeightAnimal] = useState(null);
  const [qrScanner, setQrScanner] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const requests = ["/dashboard", "/animals", "/weighings", "/health-records", "/health-calendar", "/reproduction", "/paddocks", "/finance", "/arroba", "/alerts", "/permissions", "/weather", "/lots", "/rural-calendar", "/reproduction/indicators"];
    const results = await Promise.all(requests.map((path) => api(path)));
    let users = [];
    try { users = await api("/users"); } catch { users = []; }
    const optionalPaths = ["/rankings", "/genetics", "/inventory", "/trades", "/benchmark", "/profit-center", "/documents", "/whatsapp/recipients", "/whatsapp/outbox"];
    const optional = await Promise.all(optionalPaths.map((path) => api(path).catch(() => null)));
    const weather = await fetchLiveWeather(results[11]);
    setData({ dashboard: results[0], animals: results[1], weighings: results[2], health: results[3], healthCalendar: results[4], reproduction: results[5], paddocks: results[6], finance: results[7], arroba: results[8], alerts: results[9], permissions: results[10], weather, lots: results[12], ruralCalendar: results[13], reproductionIndicators: results[14], users, rankings: optional[0] || emptyData.rankings, genetics: optional[1] || emptyData.genetics, inventory: optional[2] || [], trades: optional[3] || [], benchmark: optional[4] || [], profitCenter: optional[5] || emptyData.profitCenter, documents: optional[6] || [], whatsapp: { recipients: optional[7] || [], ...(optional[8] || { messages: [] }) } });
  }, []);

  const logout = useCallback(() => { localStorage.removeItem("novaris_token"); setUser(null); setLoading(false); }, []);
  useEffect(() => {
    const token = localStorage.getItem("novaris_token");
    if (!token) return;
    api("/auth/me").then((me) => { setUser(me); return load(); }).catch(logout).finally(() => setLoading(false));
  }, [load, logout]);
  useEffect(() => { window.addEventListener("novaris:logout", logout); return () => window.removeEventListener("novaris:logout", logout); }, [logout]);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("animalCode");
    const animal = code && data.animals.find((item) => item.unique_code === code);
    if (user && animal) { openProfile(animal.id); window.history.replaceState({}, "", window.location.pathname); }
  }, [user, data.animals]);

  function login(result) { localStorage.setItem("novaris_token", result.access_token); setUser(result.user); setLoading(true); load().finally(() => setLoading(false)); }
  async function saved(message = "Registro salvo com sucesso") { setModal(null); setWeightAnimal(null); await load(); setToast(message); setTimeout(() => setToast(""), 2600); }
  async function openProfile(id) { setProfile(await api(`/animals/${id}/profile`)); }
  const title = menuItems.find((item) => item.id === page)?.label || "Novaris Agro";
  const selectedLot = data.lots.items.find((lot) => lot.lot === selectedLotName);

  if (loading) return <AppSkeleton />;
  if (!user) return <Login onLogin={login} />;

  const pages = {
    dashboard: <Dashboard data={data.dashboard} openModal={setModal} farm={user.farm} userName={user.name} weather={data.weather} animals={data.animals} weighings={data.weighings} reproduction={data.reproduction} paddocks={data.paddocks} healthCalendar={data.healthCalendar} />,
    animals: <Animals animals={data.animals} openModal={setModal} openProfile={openProfile} scanQr={() => setQrScanner(true)} />,
    lots: <LotsPage data={data.lots} openLot={(lot) => setSelectedLotName(lot.lot)} />,
    calendar: <RuralCalendar events={data.ruralCalendar} openModal={setModal} />,
    weighings: <Weighings records={data.weighings} animals={data.animals} openModal={setModal} />,
    health: <Health records={data.health} calendar={data.healthCalendar} openModal={setModal} />,
    reproduction: <Reproduction events={data.reproduction} indicators={data.reproductionIndicators} openModal={setModal} />,
    pastures: <Pastures paddocks={data.paddocks} openModal={setModal} />,
    finance: <Finance data={data.finance} openModal={setModal} />,
    arroba: <ArrobaPage data={data.arroba} saved={saved} />,
    rankings: <RankingsPage data={data.rankings} openProfile={openProfile} />,
    genetics: <GeneticsPage data={data.genetics} />,
    inventory: <InventoryPage items={data.inventory} openModal={setModal} />,
    commercial: <CommercialPage trades={data.trades} openModal={setModal} />,
    simulator: <ProfitSimulator />,
    benchmark: <BenchmarkPage data={data.benchmark} />,
    profit: <ProfitCenterPage data={data.profitCenter} />,
    documents: <DocumentsPage documents={data.documents} animals={data.animals} saved={saved} />,
    whatsapp: <WhatsAppPage data={data.whatsapp} openModal={setModal} />,
    reports: <Reports />,
    ai: <AIAgro />,
    users: <UsersPage users={data.users} openModal={setModal} />,
  };
  return <div className="app-shell">
    <Sidebar page={page} setPage={setPage} user={user} permissions={data.permissions.permissions || []} mobile={mobileMenu} close={() => setMobileMenu(false)} logout={logout} />
    <div className="main-shell"><Header user={user} title={title} alerts={data.alerts} openAlerts={() => setAlertsOpen(true)} onMenu={() => setMobileMenu(true)} /><main className="content">{pages[page]}</main></div>
    <BottomNav page={page} setPage={setPage} openModal={setModal} />
    {modal === "weighingBatch" && <BatchWeighingModal animals={data.animals} close={() => setModal(null)} saved={saved} />}
    {modal && modal !== "weighingBatch" && <DataModal type={modal} animals={data.animals} close={() => setModal(null)} saved={saved} />}
    {alertsOpen && <AlertsDrawer alerts={data.alerts} close={() => setAlertsOpen(false)} />}
    {selectedLot && <LotDrawer lot={selectedLot} animals={data.animals} close={() => setSelectedLotName(null)} openProfile={(id) => { setSelectedLotName(null); openProfile(id); }} updateWeight={setWeightAnimal} />}
    {weightAnimal && <WeightUpdateModal animal={weightAnimal} close={() => setWeightAnimal(null)} saved={saved} />}
    {qrScanner && <QRScannerModal animals={data.animals} close={() => setQrScanner(false)} openProfile={openProfile} />}
    {profile && <AnimalProfile profile={profile} close={() => setProfile(null)} updateWeight={(animal) => { setProfile(null); setWeightAnimal(animal); }} />}
    {toast && <div className="toast"><Check size={17} />{toast}</div>}
  </div>;
}
