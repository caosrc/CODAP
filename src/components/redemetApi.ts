import { useCallback, useEffect, useState } from 'react'

export type TipoRadarRedemet = 'maxcappi' | '10km' | '07km' | '05km' | '03km'
export type ProdutoRedemet = 'radar' | 'stsc' | 'satelite'

export interface ImagemRedemet {
  id: string
  nome: string
  localidade?: string
  bounds: [[number, number], [number, number]]
  url: string
  atualizadoEm: string | null
  raioKm?: number | null
}

export interface DadosRedemet {
  disponivel: boolean
  configurada?: boolean
  produto?: ProdutoRedemet
  tipo?: string
  fonte?: string
  imagens?: ImagemRedemet[]
  pontos?: Array<{ id: string; latitude: number; longitude: number }>
  horarioQuadro?: string | null
  consultadoEm?: string
  erro?: string
  cache?: boolean
}

interface EstadoProdutoRedemet {
  dados: DadosRedemet | null
  carregando: boolean
  erro: string
}

const INTERVALO_ATUALIZACAO_MS = 2 * 60 * 1000
const ESTADO_INICIAL: EstadoProdutoRedemet = { dados: null, carregando: false, erro: '' }

export function useProdutoRedemet(
  ativo: boolean,
  produto: ProdutoRedemet,
  tipo?: TipoRadarRedemet,
) {
  const [estado, setEstado] = useState<EstadoProdutoRedemet>(ESTADO_INICIAL)

  const carregar = useCallback(async () => {
    setEstado(anterior => ({ ...anterior, carregando: true, erro: '' }))
    try {
      const params = new URLSearchParams({ produto })
      if (produto === 'radar' && tipo) params.set('tipo', tipo)
      const response = await fetch(`/api/redemet?${params}`)
      const corpo = await response.json().catch(() => ({})) as DadosRedemet
      if (!response.ok || corpo?.disponivel !== true) {
        throw new Error(typeof corpo?.erro === 'string' ? corpo.erro : 'Produto REDEMET indisponível.')
      }
      setEstado({ dados: corpo, carregando: false, erro: '' })
    } catch (error) {
      setEstado(anterior => ({
        ...anterior,
        carregando: false,
        erro: error instanceof Error ? error.message : 'Produto REDEMET indisponível.',
      }))
    }
  }, [produto, tipo])

  useEffect(() => {
    if (!ativo) return
    const primeiraConsulta = window.setTimeout(() => { void carregar() }, 0)
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, INTERVALO_ATUALIZACAO_MS)
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void carregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.clearTimeout(primeiraConsulta)
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ativo, carregar])

  return { ...estado, atualizar: carregar }
}
