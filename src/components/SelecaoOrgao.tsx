import type { Orgao } from './Login'
import { selecionarOrgao } from './Login'

interface Props {
  onSelecionar: (orgao: Orgao) => void
}

const opcoes: Array<{
  id: Orgao
  icone: string
  nome: string
  descricao: string
  destaque: string
}> = [
  {
    id: 'defesa-civil',
    icone: '🛡️',
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
        <div className="login-logo-wrap" aria-label="CODAP">CODAP</div>
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
              <span className="selecao-orgao-icone" aria-hidden="true">{opcao.icone}</span>
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