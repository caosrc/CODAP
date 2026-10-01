import { useEffect, useMemo, useState, type FormEvent } from "react";
import "./RadarTv.css";

type GlyphName =
  | "cloud-sun"
  | "droplet"
  | "wind"
  | "thermometer"
  | "clock"
  | "refresh"
  | "expand"
  | "bell"
  | "waves"
  | "pin"
  | "plus"
  | "minus"
  | "close"
  | "check"
  | "arrow";

function Glyph({ name, size = 16 }: { name: GlyphName; size?: number }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...common}
    >
      {name === "cloud-sun" && (
        <>
          <path d="M8 17.5h9.2a3.8 3.8 0 0 0 .3-7.6A5.6 5.6 0 0 0 7 8.8" />
          <path d="M7 5.2V3.5M3.5 7H2M5 5 3.8 3.8M3.5 10.5H2" />
          <path d="M5 13.7a3.4 3.4 0 0 1 6.1-2.1" />
        </>
      )}
      {name === "droplet" && <path d="M12 3.5s6.5 7.1 6.5 11.4a6.5 6.5 0 0 1-13 0C5.5 10.6 12 3.5 12 3.5Z" />}
      {name === "wind" && <><path d="M3 8h11a2.5 2.5 0 1 0-2.3-3.5" /><path d="M2 12h16a2.5 2.5 0 1 1-2.3 3.5" /><path d="M4 16h5" /></>}
      {name === "thermometer" && <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" /><path d="M12 10v7" /></>}
      {name === "clock" && <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 1.8" /></>}
      {name === "refresh" && <><path d="M20 7v5h-5" /><path d="M4.8 9A7.5 7.5 0 0 1 18 6.3L20 8M4 17v-5h5" /><path d="M19.2 15A7.5 7.5 0 0 1 6 17.7L4 16" /></>}
      {name === "expand" && <><path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4" /><path d="M4 4l6 6M20 4l-6 6M4 20l6-6M20 20l-6-6" /></>}
      {name === "bell" && <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>}
      {name === "waves" && <><path d="M3 7c2.2 0 2.2 2 4.5 2S9.8 7 12 7s2.3 2 4.5 2S18.8 7 21 7M3 12c2.2 0 2.2 2 4.5 2s2.3-2 4.5-2 2.3 2 4.5 2 2.3-2 4.5-2M3 17c2.2 0 2.2 2 4.5 2s2.3-2 4.5-2 2.3 2 4.5 2 2.3-2 4.5-2" /></>}
      {name === "pin" && <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></>}
      {name === "plus" && <><path d="M12 5v14M5 12h14" /></>}
      {name === "minus" && <path d="M5 12h14" />}
      {name === "close" && <><path d="m6 6 12 12M18 6 6 18" /></>}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
      {name === "arrow" && <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>}
    </svg>
  );
}

type MapLayer = "rain" | "temperature" | "lightning" | "clouds";

const hours = [
  { label: "Agora", value: "28°", symbol: "cloud" },
  { label: "15h", value: "29°", symbol: "sun" },
  { label: "16h", value: "31°", symbol: "sun" },
  { label: "17h", value: "32°", symbol: "sun" },
  { label: "18h", value: "32°", symbol: "cloud" },
  { label: "19h", value: "31°", symbol: "cloud" },
  { label: "20h", value: "29°", symbol: "cloud" },
];

const days = [
  { day: "HOJE", icon: "cloud", high: "32°", low: "19°", rain: "20%" },
  { day: "QUI", icon: "sun", high: "31°", low: "18°", rain: "10%" },
  { day: "SEX", icon: "cloud", high: "30°", low: "18°", rain: "25%" },
  { day: "SÁB", icon: "rain", high: "27°", low: "17°", rain: "60%" },
  { day: "DOM", icon: "rain", high: "25°", low: "16°", rain: "70%" },
];

const checklistEntries = [
  { name: "M. Ribeiro", time: "10:24", unit: "QVA-2B54", km: "42.180", fuel: "¾" },
  { name: "A. Souza", time: "09:40", unit: "RVK-3C71", km: "18.606", fuel: "½" },
];

const occurrences = [
  { name: "L. Andrade", time: "11:08", nature: "Alagamento em via", address: "Rua Santa Efigênia · Centro" },
  { name: "P. Nascimento", time: "08:52", nature: "Queda de galhos", address: "Av. Telésforo Cândido · São Sebastião" },
];

const notifications = [
  { year: 2026, month: 9, day: 8, time: "14:30", text: "Vistoria preventiva · Ponte do Bananeiras", level: "IMPORTANTE" },
  { year: 2026, month: 9, day: 14, time: "09:00", text: "Reunião do comitê de resposta", level: "NORMAL" },
  { year: 2026, month: 9, day: 22, time: "16:00", text: "Simulado de evacuação · São Dimas", level: "IMPORTANTE" },
];

function monthLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function calendarDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = first.getDay();
  const start = new Date(date.getFullYear(), date.getMonth(), 1 - offset);
  return Array.from({ length: 35 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function MapArtwork({
  layers,
  satellite,
  zoom,
}: {
  layers: Record<MapLayer, boolean>;
  satellite: boolean;
  zoom: number;
}) {
  return (
    <svg
      className={`rtv-map-art ${satellite ? "is-satellite" : ""}`}
      viewBox="0 0 1000 850"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Mapa operacional de Conselheiro Lafaiete com rota, estações de chuva e temperatura"
    >
      <g transform={`translate(500 425) scale(${zoom}) translate(-500 -425)`}>
        <rect width="1000" height="850" fill="var(--map-ground)" />

        <g className="rtv-map-green">
          <path d="M0 0h145l46 92-31 84-89 20L0 155z" />
          <path d="M758 0h242v144l-80 31-33-55-79 16-50-65z" />
          <path d="M0 473 102 444l58 62-21 121L0 670z" />
          <path d="m793 459 207-38v211l-134 44-61-75 30-71z" />
          <path d="m390 728 86-80 62 44-15 158H360z" />
          <path d="m168 255 77-49 55 22-21 49-89 21z" />
          <path d="m738 267 45-25 54 42-26 57-64-16z" />
          <path d="m576 85 45-24 46 28-7 41-69 5z" />
        </g>
        <g className="rtv-map-park-lines">
          <path d="M15 50c48 19 50 72 108 82M792 41c31 26 62 38 117 29M22 558c53-8 84 5 120 37M849 520c43 3 63 26 114 13M401 768c36-24 84-21 116 10" />
        </g>

        <path className="rtv-map-water" d="M-30 407c105-61 152 47 251 19 82-24 119-106 196-76 65 25 50 110 118 120 65 10 93-62 154-31 67 34 98 124 172 111 53-10 76-73 169-55" />

        <g className="rtv-map-road-minor">
          <path d="M-20 207 204 150l177 18 127-50 183 37 344-67" />
          <path d="M-20 248 187 202l180 30 166-73 169 36 318-42" />
          <path d="M-30 292 166 268l226 17 154-76 164 45 320-30" />
          <path d="M-10 332 169 309l216 42 166-69 182 56 285-36" />
          <path d="M-5 373 183 352l190 54 191-67 185 53 254-13" />
          <path d="M-10 459 164 432l202 52 174-54 192 50 282-18" />
          <path d="M-5 503 151 478l210 55 185-55 208 52 257-26" />
          <path d="M-12 548 134 530l226 54 182-52 208 58 266-29" />
          <path d="M-5 596 117 582l250 49 191-55 211 57 255-37" />
          <path d="M-20 644 112 630l261 49 188-41 218 64 260-42" />
          <path d="M77 0 107 175l-21 154 47 160-4 181 27 180" />
          <path d="M147-20 177 159l-7 162 42 158-11 195 28 198" />
          <path d="M224-12 248 153l-9 173 48 154-13 188 35 203" />
          <path d="M303-15 317 145l-7 180 51 156-13 182 24 204" />
          <path d="M395-20 397 134l-12 184 43 153-14 188 20 207" />
          <path d="M493-8 481 126l-4 192 46 150-11 191 24 206" />
          <path d="M588-16 566 130l-2 183 48 153-5 188 26 207" />
          <path d="M678-6 648 145l8 180 53 146-4 191 31 200" />
          <path d="M764-14 731 164l25 166 42 146-6 186 39 200" />
          <path d="M852-7 818 178l27 157 45 142-3 187 38 193" />
          <path d="M938-20 894 178l30 160 50 145" />
        </g>

        <g className="rtv-map-road-major">
          <path d="M-30 177c143 30 213 31 313 67s157 47 230 29c117-28 206-78 517-59" />
          <path d="M-20 687c162-41 268-54 391-81 107-24 177-38 293-92 103-48 198-70 368-76" />
          <path d="M180-20c31 130 49 223 57 315 12 137 39 222 100 302 72 95 130 170 152 277" />
          <path d="M846-20c-40 127-57 239-35 329 29 119 84 186 155 244 44 36 73 76 70 128" />
          <path d="M-20 390c125 22 232 55 351 68 112 12 218 10 322-12 143-31 229-4 367 61" />
        </g>

        <g className="rtv-map-highway">
          <path d="M930-30c-34 137-52 218-34 295 14 60 70 108 61 181-6 48-58 93-100 132-63 59-102 117-129 223" />
          <path d="M930-30c-34 137-52 218-34 295 14 60 70 108 61 181-6 48-58 93-100 132-63 59-102 117-129 223" />
        </g>

        <g className="rtv-map-street-labels">
          <text x="238" y="132" transform="rotate(5 238 132)">Rua Padre Lobo</text>
          <text x="602" y="178" transform="rotate(-5 602 178)">Av. Pref. Telésforo Cândido</text>
          <text x="684" y="379" transform="rotate(8 684 379)">Rua Santa Efigênia</text>
          <text x="310" y="531" transform="rotate(-7 310 531)">Av. Monsenhor Moreira</text>
          <text x="532" y="619" transform="rotate(6 532 619)">Rua Duque de Caxias</text>
          <text x="120" y="305" transform="rotate(-8 120 305)">BR-040</text>
          <text x="845" y="676" transform="rotate(-58 845 676)">MG-129</text>
          <text x="390" y="294">R. Tavares de Melo</text>
          <text x="548" y="457">R. Bias Fortes</text>
          <text x="178" y="614">R. Dr. Campolina</text>
          <text x="747" y="525">R. Melo Viana</text>
          <text x="402" y="728">R. Barão de Suassuí</text>
        </g>

        <g className="rtv-map-neighborhoods">
          <text x="76" y="105">Cidade Satélite</text>
          <text x="730" y="87">Jardim dos Inconfidentes</text>
          <text x="206" y="231">Santa Terezinha</text>
          <text x="510" y="210">São Sebastião</text>
          <text x="625" y="291">Sagrado Coração de Jesus</text>
          <text x="415" y="385" className="rtv-map-center-label">CENTRO</text>
          <text x="313" y="447">Angélica</text>
          <text x="674" y="489">Queluz</text>
          <text x="108" y="735">Paulo VI</text>
          <text x="557" y="754">Moinhos</text>
          <text x="818" y="331">Parque Montreal</text>
          <text x="71" y="495">Campo Alegre</text>
        </g>

        <g className="rtv-map-route">
          <path className="rtv-route-underlay" d="M843 55C826 125 828 177 858 224c30 47 55 88 27 128-31 43-112 45-174 39-66-7-119-13-171 3-70 21-114 53-177 60-75 9-151-6-214 13-64 19-79 74-53 124 30 59 89 89 121 137" />
          <path className="rtv-route-line" d="M843 55C826 125 828 177 858 224c30 47 55 88 27 128-31 43-112 45-174 39-66-7-119-13-171 3-70 21-114 53-177 60-75 9-151-6-214 13-64 19-79 74-53 124 30 59 89 89 121 137" />
          <circle cx="843" cy="55" r="7" />
          <circle cx="217" cy="728" r="7" />
        </g>

        {layers.rain && (
          <g className="rtv-map-rain-markers">
            <g transform="translate(733 262)"><circle r="16" /><text y="4">0,0</text></g>
            <g transform="translate(525 355)"><circle r="16" /><text y="4">0,2</text></g>
            <g transform="translate(447 435)"><circle r="16" /><text y="4">0,0</text></g>
            <g transform="translate(608 520)"><circle r="16" /><text y="4">0,4</text></g>
            <g transform="translate(336 588)"><circle r="16" /><text y="4">0,0</text></g>
          </g>
        )}
        {layers.temperature && (
          <g className="rtv-map-temperature-marker" transform="translate(455 404)">
            <circle r="23" />
            <text y="5">28°</text>
          </g>
        )}
        {layers.lightning && (
          <g className="rtv-map-lightning-markers">
            <path d="m709 178-9 17h9l-4 14 15-21h-9l5-10z" />
            <path d="m278 510-9 17h9l-4 14 15-21h-9l5-10z" />
          </g>
        )}
        {layers.clouds && <g className="rtv-map-cloud-layer"><ellipse cx="555" cy="254" rx="180" ry="94" /><ellipse cx="336" cy="521" rx="110" ry="70" /></g>}
      </g>
    </svg>
  );
}

export function RadarTv() {
  const [clock, setClock] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date(2026, 9, 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date(2026, 9, 8));
  const [doneReminder, setDoneReminder] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [reminders, setReminders] = useState([
    { id: 1, text: "Confirmar acesso à ponte do Rio Bananeiras após vistoria.", done: false },
  ]);
  const [monthNoticeOpen, setMonthNoticeOpen] = useState(false);
  const [monthNotices, setMonthNotices] = useState(notifications);
  const [noticeText, setNoticeText] = useState("");
  const [noticeTime, setNoticeTime] = useState("14:30");
  const [toast, setToast] = useState("");
  const [satellite, setSatellite] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [chartRange, setChartRange] = useState<"24 h" | "7 dias">("24 h");
  const [fullScreen, setFullScreen] = useState(false);
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>({
    rain: true,
    temperature: true,
    lightning: true,
    clouds: false,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const daysInMonth = useMemo(() => calendarDays(month), [month]);
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const selectedNotifications = monthNotices.filter(
    (notice) => notice.day === selectedDate.getDate() && notice.month === selectedDate.getMonth() && notice.year === selectedDate.getFullYear(),
  );

  function addReminder() {
    if (!noteText.trim()) return;
    setReminders((current) => [...current, { id: Date.now(), text: noteText.trim(), done: false }]);
    setNoteText("");
    setNoteOpen(false);
    setToast("Lembrete adicionado à prévia.");
  }

  function addNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!noticeText.trim()) return;
    setMonthNotices((current) => [
      ...current,
      { year: selectedDate.getFullYear(), month: selectedDate.getMonth(), day: selectedDate.getDate(), time: noticeTime, text: noticeText.trim(), level: "NORMAL" },
    ]);
    setNoticeText("");
    setMonthNoticeOpen(false);
    setToast("Notificação adicionada à prévia.");
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      setFullScreen(false);
      return;
    }
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
    }
    setFullScreen(Boolean(document.fullscreenElement));
    setToast(document.fullscreenElement ? "Modo tela cheia ativo." : "Tela cheia indisponível nesta prévia.");
  }

  function toggleLayer(layer: MapLayer) {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  return (
    <main className="rtv-screen">
      <header className="rtv-topbar">
        <div className="rtv-brand">
          <div className="rtv-brand-mark" aria-hidden="true"><span>R</span><i /></div>
          <div>
            <div className="rtv-brand-name">RADAR <b>DC</b></div>
            <div className="rtv-brand-subtitle">DEFESA CIVIL · CONSELHEIRO LAFAIETE</div>
          </div>
        </div>
        <div className="rtv-top-status"><span className="rtv-live-dot" /> OPERAÇÃO ATIVA <span className="rtv-status-divider" /> {clock.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
        <div className="rtv-top-actions">
          <div className="rtv-clock"><Glyph name="clock" size={14} /><span>{clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div>
          <button className="rtv-icon-button" type="button" title="Atualizar dados da prévia" aria-label="Atualizar dados da prévia" onClick={() => setToast("Painel atualizado · prévia estática")}>
            <Glyph name="refresh" size={15} />
          </button>
          <button className="rtv-tv-button" type="button" onClick={() => void toggleFullscreen()}>
            <Glyph name="expand" size={14} /> {fullScreen ? "Sair da tela cheia" : "Modo TV"}
          </button>
        </div>
      </header>

      <section className="rtv-weather" aria-label="Previsão do tempo">
        <div className="rtv-weather-current">
          <div className="rtv-weather-location">
            <span className="rtv-overline">CLIMA LOCAL</span>
            <strong>Conselheiro Lafaiete</strong>
            <small>Minas Gerais · atualização automática</small>
          </div>
          <div className="rtv-weather-now">
            <Glyph name="cloud-sun" size={33} />
            <strong>28°</strong>
            <span>Parcialmente nublado</span>
          </div>
          <div className="rtv-weather-metrics">
            <div><Glyph name="droplet" size={14} /><span>Chuva</span><b>0,0 mm</b></div>
            <div><Glyph name="wind" size={14} /><span>Vento</span><b>9 km/h</b></div>
            <div><Glyph name="thermometer" size={14} /><span>Umidade</span><b>64%</b></div>
          </div>
        </div>
        <div className="rtv-forecast-group rtv-hour-forecast">
          <div className="rtv-forecast-heading"><span>PREVISÃO POR HORA</span><small>Próximas horas</small></div>
          <div className="rtv-hour-items">
            {hours.map((hour, index) => (
              <div className={`rtv-hour ${index === 0 ? "is-now" : ""}`} key={hour.label}>
                <span>{hour.label}</span>
                <i className={`rtv-weather-symbol ${hour.symbol}`} aria-hidden="true" />
                <b>{hour.value}</b>
                <small>{index < 4 ? "10%" : "20%"}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="rtv-forecast-group rtv-day-forecast">
          <div className="rtv-forecast-heading"><span>PREVISÃO PARA OS PRÓXIMOS DIAS</span><small>Máx. / mín.</small></div>
          <div className="rtv-day-items">
            {days.map((day) => (
              <div className="rtv-day" key={day.day}>
                <span>{day.day}</span>
                <i className={`rtv-weather-symbol ${day.icon}`} aria-hidden="true" />
                <b>{day.high}<small>{day.low}</small></b>
                <em><Glyph name="droplet" size={10} /> {day.rain}</em>
              </div>
            ))}
          </div>
        </div>
        <div className="rtv-weather-refresh">ATUALIZADO<br /><b>14:20</b></div>
      </section>

      <div className="rtv-workspace">
        <section className="rtv-ops-grid" aria-label="Painel operacional">
          <section className="rtv-panel rtv-reminders">
            <div className="rtv-panel-heading">
              <div><span className="rtv-eyebrow"><span className="rtv-heading-mark cyan" /> LEMBRETES</span><h2>Lembretes da equipe</h2></div>
              <button className="rtv-quiet-button" type="button" onClick={() => setNoteOpen((open) => !open)}>
                {noteOpen ? <Glyph name="close" size={13} /> : <Glyph name="plus" size={13} />} {noteOpen ? "Fechar" : "Novo"}
              </button>
            </div>
            <div className="rtv-reminder-list">
              {reminders.map((reminder) => (
                <article className={`rtv-reminder ${reminder.done || doneReminder ? "is-done" : ""}`} key={reminder.id}>
                  <button className="rtv-check-button" type="button" aria-label="Marcar lembrete como ciente" onClick={() => {
                    if (reminder.id === 1) setDoneReminder((done) => !done);
                    else setReminders((items) => items.map((item) => item.id === reminder.id ? { ...item, done: !item.done } : item));
                  }}>
                    {(reminder.done || (reminder.id === 1 && doneReminder)) && <Glyph name="check" size={12} />}
                  </button>
                  <div><p>{reminder.text}</p><small>{reminder.id === 1 ? "AGENTE J · 13:48" : "ADICIONADO AGORA"}</small></div>
                </article>
              ))}
            </div>
            {noteOpen && (
              <div className="rtv-inline-form">
                <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Escreva um lembrete operacional..." aria-label="Novo lembrete" />
                <button type="button" onClick={addReminder} disabled={!noteText.trim()}>Salvar lembrete</button>
              </div>
            )}
            <div className="rtv-reminder-foot"><span className="rtv-status-dot" /> Equipe atualizada <b>há 2 min</b></div>
          </section>

          <section className="rtv-panel rtv-calendar">
            <div className="rtv-panel-heading">
              <div><span className="rtv-eyebrow"><span className="rtv-heading-mark amber" /> CALENDÁRIO DE NOTIFICAÇÕES</span><h2>{monthLabel(month)}</h2></div>
              <div className="rtv-month-actions">
                <button type="button" aria-label="Mês anterior" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button>
                <button type="button" aria-label="Próximo mês" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button>
              </div>
            </div>
            <div className="rtv-weekdays">{["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="rtv-calendar-days">
              {daysInMonth.map((date) => {
                const isCurrentMonth = date.getMonth() === month.getMonth();
                const hasNotification = monthNotices.some((notice) => notice.day === date.getDate() && notice.month === date.getMonth() && notice.year === date.getFullYear());
                return (
                  <button
                    className={`${isCurrentMonth ? "" : "is-outside"} ${dateKey(date) === dateKey(selectedDate) ? "is-selected" : ""}`}
                    type="button"
                    key={dateKey(date)}
                    aria-label={date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span>{date.getDate()}</span>{hasNotification && <i />}
                  </button>
                );
              })}
            </div>
            <div className="rtv-calendar-footer">
              <span><i /> NOTIFICAÇÃO</span>
              <button type="button" onClick={() => setMonthNoticeOpen((open) => !open)}><Glyph name="plus" size={12} /> Nova</button>
            </div>
            {selectedNotifications.length > 0 && (
              <div className="rtv-selected-notice">
                <b>{selectedNotifications[0].time} · {selectedNotifications[0].level}</b>
                <span>{selectedNotifications[0].text}</span>
              </div>
            )}
            {monthNoticeOpen && (
              <form className="rtv-notice-form" onSubmit={addNotification}>
                <div className="rtv-notice-form-top"><b>Notificar em {selectedDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</b><button type="button" aria-label="Fechar formulário" onClick={() => setMonthNoticeOpen(false)}><Glyph name="close" size={13} /></button></div>
                <input value={noticeText} onChange={(event) => setNoticeText(event.target.value)} placeholder="Escreva a notificação" aria-label="Texto da notificação" />
                <div className="rtv-notice-form-bottom"><input type="time" value={noticeTime} onChange={(event) => setNoticeTime(event.target.value)} aria-label="Hora da notificação" /><button type="submit" disabled={!noticeText.trim()}>Adicionar</button></div>
              </form>
            )}
          </section>

          <section className="rtv-panel rtv-hydro">
            <div className="rtv-panel-heading rtv-hydro-heading">
              <div><span className="rtv-eyebrow"><span className="rtv-heading-mark blue" /> MONITORAMENTO HIDROLÓGICO</span><h2>Nível do Rio Bananeiras</h2></div>
              <span className="rtv-live-tag"><i /> CEMADEN · AO VIVO</span>
            </div>
            <div className="rtv-river-summary">
              <div className="rtv-river-reading"><strong>1,42</strong><span>m</span><small>NÍVEL ATUAL</small></div>
              <div className="rtv-river-status"><b>NORMAL</b><span>Faixa de atenção · 2,10 m</span><small>Leitura às 14:15</small></div>
              <div className="rtv-river-scale"><i /><span>0 m</span><span>2,1 m</span><span>3,2 m</span></div>
            </div>
            <div className="rtv-chart-title"><b>Nível do rio</b><div className="rtv-segmented" role="group" aria-label="Período do gráfico">
              {(["24 h", "7 dias"] as const).map((range) => <button type="button" key={range} className={chartRange === range ? "is-active" : ""} onClick={() => setChartRange(range)}>{range}</button>)}
            </div></div>
            <div className="rtv-chart">
              <div className="rtv-chart-labels"><span>2,1 m</span><span>1,5 m</span><span>0,8 m</span></div>
              <svg viewBox="0 0 420 94" preserveAspectRatio="none" role="img" aria-label={`Série de nível do rio nas últimas ${chartRange}`}>
                <path className="rtv-chart-grid" d="M0 14H420M0 47H420M0 80H420" />
                <path className="rtv-chart-area" d={chartRange === "24 h" ? "M0 57 C28 56 34 53 58 55 S95 56 120 52 S160 56 185 53 S225 50 250 53 S289 48 313 51 S355 48 378 49 S400 47 420 48 V94H0Z" : "M0 64 C28 62 39 55 60 58 S97 53 120 55 S158 47 182 51 S220 45 245 49 S286 42 310 46 S354 40 378 42 S401 38 420 39 V94H0Z"} />
                <path className="rtv-chart-line" d={chartRange === "24 h" ? "M0 57 C28 56 34 53 58 55 S95 56 120 52 S160 56 185 53 S225 50 250 53 S289 48 313 51 S355 48 378 49 S400 47 420 48" : "M0 64 C28 62 39 55 60 58 S97 53 120 55 S158 47 182 51 S220 45 245 49 S286 42 310 46 S354 40 378 42 S401 38 420 39"} />
                <circle cx="420" cy={chartRange === "24 h" ? "48" : "39"} r="4" />
              </svg>
              <div className="rtv-chart-xlabels"><span>{chartRange === "24 h" ? "00h" : "02 OUT"}</span><span>{chartRange === "24 h" ? "06h" : "04 OUT"}</span><span>{chartRange === "24 h" ? "12h" : "06 OUT"}</span><span>AGORA</span></div>
            </div>
            <div className="rtv-rain-strip">
              <div><span className="rtv-eyebrow">CHUVA ACUMULADA · ÚLTIMAS 24 HORAS</span><b>0,4 <small>mm</small></b></div>
              <div className="rtv-rain-bars" aria-label="Chuva acumulada por hora">
                {[5, 7, 6, 4, 8, 5, 10, 8, 7, 12, 8, 5, 4, 7, 12, 17, 7, 5, 9, 6, 4, 8, 5, 11].map((height, index) => <i key={index} style={{ height: `${height}px` }} />)}
              </div>
              <small><span className="rtv-status-dot" /> Estação Centro · CEMADEN <b>ATUALIZADA 14:10</b></small>
            </div>
          </section>

          <section className="rtv-panel rtv-activities">
            <div className="rtv-panel-heading rtv-activity-heading">
              <div><span className="rtv-eyebrow"><span className="rtv-heading-mark amber" /> REGISTROS OPERACIONAIS</span><h2>Atividades de qui, 08 de out.</h2></div>
              <span className="rtv-record-count">04 REGISTROS</span>
            </div>
            <div className="rtv-activity-columns">
              <div className="rtv-activity-group">
                <h3>CHECKLISTS DO DIA <span>02</span></h3>
                {checklistEntries.map((entry) => (
                  <button className="rtv-activity-row" type="button" key={entry.unit} onClick={() => setToast(`Checklist de ${entry.name} · ${entry.unit}`)}>
                    <span className="rtv-activity-symbol vehicle" aria-hidden="true">V</span>
                    <span className="rtv-activity-copy"><b>{entry.name}<small>{entry.time}</small></b><span>{entry.unit} · KM {entry.km}</span></span>
                    <span className="rtv-activity-fuel">Comb. {entry.fuel}</span>
                  </button>
                ))}
                <h3 className="rtv-occurrence-title">OCORRÊNCIAS DO DIA <span>02</span></h3>
                {occurrences.map((entry) => (
                  <button className="rtv-activity-row rtv-occurrence-row" type="button" key={entry.time} onClick={() => setToast(`${entry.nature} · ${entry.address}`)}>
                    <span className="rtv-activity-symbol warning" aria-hidden="true">!</span>
                    <span className="rtv-activity-copy"><b>{entry.nature}<small>{entry.time} · {entry.name}</small></b><span>{entry.address}</span></span>
                    <Glyph name="arrow" size={13} />
                  </button>
                ))}
              </div>
              <div className="rtv-activity-side">
                <div className="rtv-mini-stat">
                  <span>VIATURAS EM CAMPO</span><b>02 <small>/ 04</small></b><i><em /></i>
                </div>
                <div className="rtv-team-card">
                  <span className="rtv-eyebrow">EQUIPE DE PLANTÃO</span>
                  <div><i>MR</i><i>AS</i><i>LA</i><b>+1</b></div>
                  <small>4 agentes · 2 equipes</small>
                </div>
                <div className="rtv-feed-status"><span className="rtv-status-dot" /> Último registro <b>há 12 min</b></div>
              </div>
            </div>
          </section>
        </section>

        <section className={`rtv-map-panel ${satellite ? "is-satellite" : ""}`} aria-label="Mapa meteorológico">
          <MapArtwork layers={layers} satellite={satellite} zoom={zoom} />
          <div className="rtv-map-topline">
            <div className="rtv-map-title">
              <span className="rtv-map-live"><i /> RADAR AO VIVO</span>
              <h2>Conselheiro Lafaiete <span>·</span> <small>tempo real</small></h2>
            </div>
            <div className="rtv-map-top-actions">
              <button type="button" title="Recentralizar mapa" onClick={() => { setZoom(1); setToast("Mapa centralizado em Conselheiro Lafaiete.") }}>⌖ <span>Centralizar</span></button>
              <button type="button" title="Atualização do radar" onClick={() => setToast("Radar atualizado · 14:20")}><Glyph name="refresh" size={13} /></button>
            </div>
          </div>
          <div className="rtv-map-toolbar">
            <div className="rtv-map-base">
              <button className={!satellite ? "is-active" : ""} type="button" onClick={() => setSatellite(false)}>Mapa</button>
              <button className={satellite ? "is-active" : ""} type="button" onClick={() => setSatellite(true)}>Satélite</button>
            </div>
            <button className={`rtv-layer-button rain ${layers.rain ? "is-active" : ""}`} type="button" aria-pressed={layers.rain} onClick={() => toggleLayer("rain")}><Glyph name="droplet" size={12} /> Chuva <i /></button>
            <button className={`rtv-layer-button temperature ${layers.temperature ? "is-active" : ""}`} type="button" aria-pressed={layers.temperature} onClick={() => toggleLayer("temperature")}><Glyph name="thermometer" size={12} /> Temperatura <i /></button>
            <button className={`rtv-layer-button lightning ${layers.lightning ? "is-active" : ""}`} type="button" aria-pressed={layers.lightning} onClick={() => toggleLayer("lightning")}><span aria-hidden="true">ϟ</span> Trovoadas <i /></button>
            <button className={`rtv-layer-button clouds ${layers.clouds ? "is-active" : ""}`} type="button" aria-pressed={layers.clouds} onClick={() => toggleLayer("clouds")}><Glyph name="cloud-sun" size={12} /> Nuvens <i /></button>
          </div>
          <div className="rtv-map-legend">
            <span><i className="rain-dot" /> Chuva observada</span><span><i className="station-dot" /> Estações CEMADEN</span><span><i className="temperature-dot" /> Temperatura atual</span><span><i className="route-dot" /> Rota de monitoramento</span>
          </div>
          <div className="rtv-map-zoom">
            <button type="button" title="Aumentar zoom" aria-label="Aumentar zoom" onClick={() => setZoom((current) => Math.min(1.35, current + 0.08))}><Glyph name="plus" size={17} /></button>
            <button type="button" title="Diminuir zoom" aria-label="Diminuir zoom" onClick={() => setZoom((current) => Math.max(0.78, current - 0.08))}><Glyph name="minus" size={17} /></button>
          </div>
          <div className="rtv-map-point-label"><i /><div><b>Centro</b><span>28° · 0,0 mm</span></div></div>
          <div className="rtv-map-attribution">© OpenStreetMap <span>·</span> Dados CEMADEN <span>·</span> prévia estática</div>
        </section>
      </div>

      <footer className="rtv-ticker">
        <div className="rtv-ticker-label"><Glyph name="bell" size={14} /> RADAR DC</div>
        <div className="rtv-ticker-message"><span className="rtv-ticker-pulse" /><b>AVISO OPERACIONAL</b><span>Vistoria preventiva programada para a Ponte do Rio Bananeiras · hoje às 14:30</span></div>
        <div className="rtv-ticker-meta">ATUALIZAÇÃO AUTOMÁTICA <i /> 5 MIN</div>
      </footer>
      {toast && <div className="rtv-toast" role="status">{toast}</div>}
    </main>
  );
}