type NavigationPreviewProps = {
  mobile?: boolean
}

export function NavigationPreview({ mobile = false }: NavigationPreviewProps) {
  return (
    <main className={`preview-screen radar-page${mobile ? ' preview-screen-mobile' : ''}`}>
      <header className="preview-heading">Planejamento</header>

      <nav className="plan-subtabs" aria-label="Seções do planejamento">
        <button className="plan-subtab radar-subtab ativo" type="button" aria-current="page">
          <span className="radar-tab-mark" aria-hidden="true">DC</span>
          Radar DC
        </button>
        <button className="plan-subtab" type="button">
          <span className="st-emoji" aria-hidden="true">🌊</span>
          Monitoramento
        </button>
        <button className="plan-subtab" type="button">
          <span className="st-emoji" aria-hidden="true">🎪</span>
          Eventos
        </button>
        <button className="plan-subtab" type="button">
          <span className="st-emoji" aria-hidden="true">🚨</span>
          Operações
        </button>
        <button className="plan-subtab" type="button">
          <span className="st-emoji" aria-hidden="true">⛑️</span>
          Simulados
        </button>
        <button className="plan-subtab" type="button">
          <span className="st-emoji" aria-hidden="true">⚠️</span>
          Emergencial
        </button>
      </nav>

      <section className="preview-dashboard" aria-label="Cabeçalho do Radar DC">
        <div className="radar-tv-launcher">
          <div className="radar-tv-launcher-copy">
            <span className="radar-tv-launcher-label">RADAR DC</span>
            <span className="radar-tv-launcher-hint">Painel operacional</span>
          </div>
          <button className="radar-tv-launcher-btn" type="button">
            ⛶ Modo TV — Tela cheia
          </button>
        </div>
        <div className="preview-weather-card">
          <span>CLIMA</span>
          <h2>Conselheiro Lafaiete</h2>
          <p>Prévia do painel · conteúdo do Radar preservado</p>
        </div>
      </section>
    </main>
  )
}
