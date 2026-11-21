import { useEffect, useState } from 'react'
import { wsOn } from '../../wsClient'
import type { PaeStatus } from '../../paeTypes'
import './pae.css'

interface Props {
  agente: string
}

interface AlertaPae {
  id: string
  titulo: string
  mensagem: string
  chamadoId: string
  tipoRisco: string
  endereco: string
  status: PaeStatus
}

function abrirPae() {
  try {
    localStorage.setItem('defesacivil-pae-abrir', '1')
  } catch {
    // O evento de navegação ainda permite abrir o Radar nesta sessão.
  }
  window.dispatchEvent(new CustomEvent('dc:abrir-pae'))
  window.dispatchEvent(new CustomEvent('dc:abrir-radar'))
}

export default function PAEAlertOverlay({ agente: agenteAtual }: Props) {
  const [alerta, setAlerta] = useState<AlertaPae | null>(null)

  useEffect(() => {
    const receberNovoChamado = (mensagem: Record<string, unknown>) => {
      const destinatarios = Array.isArray(mensagem.agentesEnvolvidos)
        ? mensagem.agentesEnvolvidos.map(String)
        : []
      if (!agenteAtual || !destinatarios.includes(agenteAtual)) return
      const tipoRisco = String(mensagem.tipoRisco || 'Risco registrado')
      const endereco = String(mensagem.endereco || 'Localização registrada')
      setAlerta({
        id: String(mensagem.id || mensagem.chamadoId || Date.now()),
        titulo: 'Novo chamado PAE',
        mensagem: `${tipoRisco} · ${endereco}`,
        chamadoId: String(mensagem.chamadoId || ''),
        tipoRisco,
        endereco,
        status: 'novo',
      })
    }
    const receberConclusao = (mensagem: Record<string, unknown>) => {
      const destinatarios = Array.isArray(mensagem.agentesEnvolvidos)
        ? mensagem.agentesEnvolvidos.map(String)
        : []
      if (!agenteAtual || !destinatarios.includes(agenteAtual)) return
      const tipoRisco = String(mensagem.tipoRisco || 'Chamado PAE')
      const endereco = String(mensagem.endereco || '')
      const responsavel = String(mensagem.agente || 'Equipe')
      setAlerta({
        id: String(mensagem.id || mensagem.chamadoId || Date.now()),
        titulo: 'Atendimento PAE concluído',
        mensagem: `${tipoRisco} atendido por ${responsavel}${endereco ? ` · ${endereco}` : ''}`,
        chamadoId: String(mensagem.chamadoId || ''),
        tipoRisco,
        endereco,
        status: 'concluido',
      })
    }
    const receberDesignacao = (mensagem: Record<string, unknown>) => {
      const destinatarios = Array.isArray(mensagem.agentesEnvolvidos)
        ? mensagem.agentesEnvolvidos.map(String)
        : []
      if (!agenteAtual || !destinatarios.includes(agenteAtual)) return
      const tipoRisco = String(mensagem.tipoRisco || 'Nova missão')
      const endereco = String(mensagem.endereco || '')
      setAlerta({
        id: String(mensagem.id || mensagem.chamadoId || Date.now()),
        titulo: 'Nova missão PAE',
        mensagem: endereco ? `${tipoRisco} · ${endereco}` : tipoRisco,
        chamadoId: String(mensagem.chamadoId || ''),
        tipoRisco,
        endereco,
        status: 'triado',
      })
    }
    const receberRespostaDesignacao = (mensagem: Record<string, unknown>) => {
      const destinatarios = Array.isArray(mensagem.agentesEnvolvidos)
        ? mensagem.agentesEnvolvidos.map(String)
        : []
      if (!agenteAtual || !destinatarios.includes(agenteAtual)) return
      const aceito = mensagem.aceito === true
      const responsavel = String(mensagem.agente || 'Equipe')
      setAlerta({
        id: String(mensagem.id || mensagem.chamadoId || Date.now()),
        titulo: aceito ? 'Missão PAE aceita' : 'Missão PAE recusada',
        mensagem: `${String(mensagem.tipoRisco || 'Chamado')} · ${responsavel}${mensagem.motivo ? ` · ${String(mensagem.motivo)}` : ''}`,
        chamadoId: String(mensagem.chamadoId || ''),
        tipoRisco: String(mensagem.tipoRisco || 'Chamado'),
        endereco: String(mensagem.endereco || ''),
        status: 'triado',
      })
    }
    const receberPedidoReforco = (mensagem: Record<string, unknown>) => {
      const destinatarios = Array.isArray(mensagem.agentesEnvolvidos)
        ? mensagem.agentesEnvolvidos.map(String)
        : []
      if (!agenteAtual || !destinatarios.includes(agenteAtual)) return
      setAlerta({
        id: String(mensagem.id || mensagem.chamadoId || Date.now()),
        titulo: 'Pedido de reforço PAE',
        mensagem: `${String(mensagem.tipoRisco || 'Chamado')} · ${String(mensagem.motivo || 'Verifique a solicitação da equipe.')}`,
        chamadoId: String(mensagem.chamadoId || ''),
        tipoRisco: String(mensagem.tipoRisco || 'Chamado'),
        endereco: String(mensagem.endereco || ''),
        status: 'triado',
      })
    }
    const receberReforcoAtendido = (mensagem: Record<string, unknown>) => {
      const destinatarios = Array.isArray(mensagem.agentesEnvolvidos)
        ? mensagem.agentesEnvolvidos.map(String)
        : []
      if (!agenteAtual || !destinatarios.includes(agenteAtual)) return
      const novosAgentes = Array.isArray(mensagem.agentesAdicionados)
        ? mensagem.agentesAdicionados.map(String).join(', ')
        : ''
      setAlerta({
        id: String(mensagem.id || mensagem.chamadoId || Date.now()),
        titulo: 'Reforço PAE designado',
        mensagem: novosAgentes || String(mensagem.tipoRisco || 'Equipe atualizada'),
        chamadoId: String(mensagem.chamadoId || ''),
        tipoRisco: String(mensagem.tipoRisco || 'Chamado'),
        endereco: String(mensagem.endereco || ''),
        status: 'triado',
      })
    }

    const removeNovo = wsOn('pae_novo_chamado', receberNovoChamado)
    const removeConclusao = wsOn('pae_chamado_concluido', receberConclusao)
    const removeDesignacao = wsOn('pae_nova_designacao', receberDesignacao)
    const removeResposta = wsOn('pae_designacao_respondida', receberRespostaDesignacao)
    const removeReforco = wsOn('pae_reforco_solicitado', receberPedidoReforco)
    const removeReforcoAtendido = wsOn('pae_reforco_atendido', receberReforcoAtendido)
    return () => {
      removeNovo()
      removeConclusao()
      removeDesignacao()
      removeResposta()
      removeReforco()
      removeReforcoAtendido()
    }
  }, [agenteAtual])

  useEffect(() => {
    if (!alerta) return
    const timer = window.setTimeout(() => setAlerta(null), 15000)
    return () => window.clearTimeout(timer)
  }, [alerta])

  if (!alerta) return null

  return (
    <aside
      className={`pae-alert-toast ${alerta.status === 'concluido' ? 'is-complete' : ''}`}
      role="status"
      aria-live="assertive"
      data-testid="alert-pae"
    >
      <div className="pae-alert-indicator" aria-hidden="true" />
      <div className="pae-alert-copy">
        <strong>{alerta.titulo}</strong>
        <span>{alerta.mensagem}</span>
        {alerta.chamadoId && <small>Chamado {alerta.chamadoId.slice(0, 8).toUpperCase()}</small>}
      </div>
      <div className="pae-alert-actions">
        <button type="button" onClick={abrirPae} data-testid="button-open-pae-alert">Abrir PAE</button>
        <button type="button" aria-label="Dispensar alerta PAE" onClick={() => setAlerta(null)} data-testid="button-dismiss-pae-alert">Fechar</button>
      </div>
    </aside>
  )
}
