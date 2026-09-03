import type { Orgao } from './Login'
import { selecionarOrgao } from './Login'
import codapBanner from '../../attached_assets/banner-codap-scaled_1788407707766.jpg'
import defesaCivilLogo from '../../attached_assets/bandeira-logo_1788407973835.jpg'
import proconLogo from '../../attached_assets/images_(18)_1788408031391.jpeg'

interface Props {
  onSelecionar: (orgao: Orgao) => void
}

const opcoes: Array<{
  id: Orgao
  icone: string
  logo?: string
  nome: string
  descricao: string
  destaque: string
}> = [
  {
    id: 'defesa-civil',
    icone: '🛡️',
    logo: defesaCivilLogo,
    nome: 'Defesa Civil',
    descricao: 'Ocorrências, monitoramento e operações de campo.',
    destaque: 'Operações gerais',
  },
  {
    id: 'curral',
    icone: '🐎',
    nome: 'Curral',
    descricao: 'Registro e acompanhamento de apreensão de animais.',
    destaque: 'Apreensão de animais',
  },
  {
    id: 'procon',
    icone: 'P',
    logo: proconLogo,
    nome: 'Procon',
    descricao: 'Fiscalização, autos e acompanhamento de processos.',
    destaque: 'Fiscalização',
  },
]

export default function SelecaoOrgao({ onSelecionar }: Props) {
  function escolher(orgao: Orgao) {
    selecionarOrgao(orgao)
    onSelecionar(orgao)
  }

  return (
    <main className="login-tela selecao-orgao-tela">
      <section className="login-box selecao-orgao-box">
        <div className="login-logo-wrap">
          <img className="login-logo" src={codapBanner} alt="CODAP — Consórcio Público" />
        </div>
        <div className="login-titulo">Escolha o órgão</div>
        <div className="login-subtitulo">Entre no ambiente de trabalho que deseja acessar</div>

        <div className="selecao-orgao-lista">
          {opcoes.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              className={`selecao-orgao-card selecao-orgao-card--${opcao.id}`}
              onClick={() => escolher(opcao.id)}
            >
              {opcao.logo ? (
                <img className="selecao-orgao-icone selecao-orgao-logo" src={opcao.logo} alt="" />
              ) : (
                <span className="selecao-orgao-icone" aria-hidden="true">{opcao.icone}</span>
              )}
              <span className="selecao-orgao-texto">
                <strong>{opcao.nome}</strong>
                <small>{opcao.descricao}</small>
                <em>{opcao.destaque}</em>
              </span>
              <span className="selecao-orgao-seta" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}