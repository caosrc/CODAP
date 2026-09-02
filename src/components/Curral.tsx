import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react'
import './Curral.css'

export type CurralStatus = 'encontrado' | 'a_caminho' | 'no_curral' | 'encerrado'

export interface CurralDados {
  especie: string
  porte: string
  sexo: string
  identificacao: string
  localDescricao: string
  observacoes: string
  latitude: number | null
  longitude: number | null
  precisaoGps: number | null
  capturadoEm: string
  fotos: string[]
  status: CurralStatus
}

export interface CurralRegistro extends CurralDados {
  id: string | number
}

export interface CurralProps {
  registros?: CurralRegistro[]
  carregandoLista?: boolean
  erroLista?: string | null
  onSalvar: (dados: CurralDados) => void | Promise<void>
  onAtualizarLista: () => void | Promise<void>
  onVoltar: () => void
}

type GpsStatus = 'inativo' | 'aguardando' | 'ativo' | 'indisponivel' | 'negado' | 'erro'

const novoRegistro = (): CurralDados => ({
  especie: '',
  porte: '',
  sexo: '',
  identificacao: '',
  localDescricao: '',
  observacoes: '',
  latitude: null,
  longitude: null,
  precisaoGps: null,
  capturadoEm: new Date().toISOString().slice(0, 16),
  fotos: [],
  status: 'encontrado',
})

function formatarData(data: string) {
  if (!data) return 'Data não informada'
  const valor = new Date(data)
  if (Number.isNaN(valor.getTime())) return data
  return valor.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatarCoordenada(valor: number | null) {
  return typeof valor === 'number' ? valor.toFixed(6) : 'não capturada'
}

function rotuloStatus(status: CurralStatus) {
  const labels: Record<CurralStatus, string> = {
    encontrado: 'Encontrado',
    a_caminho: 'A caminho',
    no_curral: 'No curral',
    encerrado: 'Encerrado',
  }
  return labels[status]
}

export default function Curral({
  registros = [],
  carregandoLista = false,
  erroLista = null,
  onSalvar,
  onAtualizarLista,
  onVoltar,
}: CurralProps) {
  const [dados, setDados] = useState<CurralDados>(novoRegistro)
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('inativo')
  const [gpsMensagem, setGpsMensagem] = useState('')
  const [etapa, setEtapa] = useState<'formulario' | 'revisao' | 'sucesso'>('formulario')
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')
  const [fotoEmFoco, setFotoEmFoco] = useState<string | null>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)

  const formularioValido = Boolean(dados.especie && dados.porte && dados.localDescricao && dados.latitude !== null)
  const gpsCapturado = dados.latitude !== null && dados.longitude !== null
  const textoGps = useMemo(() => {
    if (gpsStatus === 'aguardando') return 'Buscando posição do aparelho...'
    if (gpsStatus === 'ativo' && dados.precisaoGps) return `Posição registrada com precisão de ${Math.round(dados.precisaoGps)} m`
    if (gpsStatus === 'negado') return 'Permissão de localização negada'
    if (gpsStatus === 'indisponivel') return 'GPS indisponível neste dispositivo'
    if (gpsStatus === 'erro') return gpsMensagem || 'Não foi possível capturar o GPS'
    return gpsCapturado ? 'Local georreferenciado neste registro' : 'Local ainda não georreferenciado'
  }, [dados.precisaoGps, gpsCapturado, gpsMensagem, gpsStatus])

  function atualizarCampo(campo: keyof CurralDados, valor: string) {
    setDados((anterior) => ({ ...anterior, [campo]: valor }))
    setErroSalvar('')
  }

  function capturarGps() {
    if (!navigator.geolocation) {
      setGpsStatus('indisponivel')
      setGpsMensagem('Este aparelho não oferece localização pelo navegador.')
      return
    }

    setGpsStatus('aguardando')
    setGpsMensagem('')
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setDados((anterior) => ({
          ...anterior,
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
          precisaoGps: posicao.coords.accuracy,
        }))
        setGpsStatus('ativo')
      },
      (erro) => {
        if (erro.code === erro.PERMISSION_DENIED) {
          setGpsStatus('negado')
          setGpsMensagem('Permita a localização nas configurações do navegador e tente novamente.')
        } else {
          setGpsStatus('erro')
          setGpsMensagem('Não foi possível obter uma posição. Tente em uma área aberta.')
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  function abrirCamera() {
    fotoInputRef.current?.click()
  }

  function adicionarFotos(evento: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? []).slice(0, 6 - dados.fotos.length)
    if (!arquivos.length) return
    Promise.all(
      arquivos.map((arquivo) => new Promise<string>((resolve, reject) => {
        const leitor = new FileReader()
        leitor.onload = () => resolve(String(leitor.result))
        leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
        leitor.readAsDataURL(arquivo)
      })),
    ).then((novasFotos) => {
      setDados((anterior) => ({ ...anterior, fotos: [...anterior.fotos, ...novasFotos] }))
    }).catch(() => setErroSalvar('Uma das fotos não pôde ser adicionada. Tente novamente.'))
    evento.target.value = ''
  }

  function removerFoto(indice: number) {
    setDados((anterior) => ({ ...anterior, fotos: anterior.fotos.filter((_, posicao) => posicao !== indice) }))
  }

  function revisar(evento: FormEvent) {
    evento.preventDefault()
    if (!formularioValido) {
      setErroSalvar('Preencha espécie, porte, local e capture o GPS antes de revisar.')
      return
    }
    setErroSalvar('')
    setEtapa('revisao')
  }

  async function salvar() {
    setSalvando(true)
    setErroSalvar('')
    try {
      await onSalvar(dados)
      setEtapa('sucesso')
    } catch {
      setErroSalvar('Não foi possível enviar o registro. Confira a conexão e tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  function iniciarOutro() {
    setDados(novoRegistro())
    setGpsStatus('inativo')
    setGpsMensagem('')
    setErroSalvar('')
    setEtapa('formulario')
  }

  return (
    <main className="curral-shell" data-testid="page-curral">
      <header className="curral-header">
        <button className="curral-back" type="button" onClick={onVoltar} data-testid="button-curral-voltar" aria-label="Voltar">
          ←
        </button>
        <div className="curral-header-copy">
          <span className="curral-kicker">Defesa Civil · Campo</span>
          <h1>Curral</h1>
          <p>Registro de animal encontrado</p>
        </div>
        <span className="curral-mark" aria-hidden="true">C</span>
      </header>

      <div className="curral-content">
        {etapa === 'sucesso' ? (
          <section className="curral-success" data-testid="status-curral-sucesso">
            <div className="curral-success-mark" aria-hidden="true">✓</div>
            <span className="curral-kicker">Registro enviado</span>
            <h2>Atendimento salvo no curral</h2>
            <p>Os dados e as fotos foram entregues para a fila de acompanhamento. A coordenada ficou vinculada a este registro.</p>
            <div className="curral-success-meta">
              <span>{dados.especie || 'Animal'}</span>
              <strong>{dados.fotos.length} {dados.fotos.length === 1 ? 'foto' : 'fotos'}</strong>
            </div>
            <div className="curral-success-actions">
              <button className="curral-button curral-button-primary" type="button" onClick={iniciarOutro} data-testid="button-curral-novo">
                Novo registro
              </button>
              <button className="curral-button curral-button-quiet" type="button" onClick={onAtualizarLista} data-testid="button-curral-atualizar-sucesso">
                Atualizar registros
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="curral-intro">
              <div>
                <span className="curral-kicker">Atendimento rápido</span>
                <h2>Primeiro, cuide do registro.</h2>
                <p>Identifique o animal, marque o ponto da captura e envie para a equipe.</p>
              </div>
              <div className="curral-progress" aria-label={`Etapa ${etapa === 'formulario' ? '1' : '2'} de 2`}>
                <span className={etapa === 'formulario' ? 'active' : 'done'}>01</span>
                <i />
                <span className={etapa === 'revisao' ? 'active' : ''}>02</span>
              </div>
            </section>

            {etapa === 'formulario' ? (
              <form className="curral-form" onSubmit={revisar} data-testid="form-curral">
                <section className="curral-card curral-card-identidade">
                  <div className="curral-section-heading">
                    <span className="curral-section-number">01</span>
                    <div>
                      <h3>Identificação</h3>
                      <p>O que foi encontrado?</p>
                    </div>
                  </div>
                  <div className="curral-field-grid">
                    <label className="curral-field curral-field-wide">
                      <span>Espécie <b>*</b></span>
                      <input value={dados.especie} onChange={(e) => atualizarCampo('especie', e.target.value)} placeholder="Ex.: bovino, equino, cão" data-testid="input-curral-especie" />
                    </label>
                    <label className="curral-field">
                      <span>Porte <b>*</b></span>
                      <select value={dados.porte} onChange={(e) => atualizarCampo('porte', e.target.value)} data-testid="select-curral-porte">
                        <option value="">Selecionar</option>
                        <option value="pequeno">Pequeno</option>
                        <option value="medio">Médio</option>
                        <option value="grande">Grande</option>
                      </select>
                    </label>
                    <label className="curral-field">
                      <span>Sexo</span>
                      <select value={dados.sexo} onChange={(e) => atualizarCampo('sexo', e.target.value)} data-testid="select-curral-sexo">
                        <option value="">Não informado</option>
                        <option value="femea">Fêmea</option>
                        <option value="macho">Macho</option>
                      </select>
                    </label>
                    <label className="curral-field curral-field-wide">
                      <span>Identificação visível</span>
                      <input value={dados.identificacao} onChange={(e) => atualizarCampo('identificacao', e.target.value)} placeholder="Brinco, marca, cor ou característica" data-testid="input-curral-identificacao" />
                    </label>
                  </div>
                </section>

                <section className="curral-card curral-card-location">
                  <div className="curral-section-heading">
                    <span className="curral-section-number">02</span>
                    <div>
                      <h3>Local da captura</h3>
                      <p>Georreferencie a ocorrência</p>
                    </div>
                    <span className="curral-location-pin" aria-hidden="true">⌖</span>
                  </div>
                  <label className="curral-field">
                    <span>Descrição do local <b>*</b></span>
                    <input value={dados.localDescricao} onChange={(e) => atualizarCampo('localDescricao', e.target.value)} placeholder="Rua, ponto de referência ou propriedade" data-testid="input-curral-local" />
                  </label>
                  <div className={`curral-gps-box ${gpsCapturado ? 'captured' : ''} ${gpsStatus === 'negado' || gpsStatus === 'erro' || gpsStatus === 'indisponivel' ? 'warning' : ''}`} data-testid="status-curral-gps">
                    <div className="curral-gps-symbol" aria-hidden="true">+</div>
                    <div className="curral-gps-copy">
                      <strong>{gpsCapturado ? 'Local marcado no mapa' : 'Marque o ponto exato'}</strong>
                      <span>{textoGps}</span>
                      {gpsCapturado && <small>{formatarCoordenada(dados.latitude)} · {formatarCoordenada(dados.longitude)}</small>}
                    </div>
                    <button className="curral-gps-button" type="button" onClick={capturarGps} disabled={gpsStatus === 'aguardando'} data-testid="button-curral-gps">
                      {gpsStatus === 'aguardando' ? 'Buscando' : gpsCapturado ? 'Atualizar' : 'Capturar GPS'}
                    </button>
                  </div>
                  <p className="curral-gps-note">A coordenada será registrada junto deste atendimento. O navegador não insere GPS dentro da foto.</p>
                </section>

                <section className="curral-card curral-card-evidence">
                  <div className="curral-section-heading">
                    <span className="curral-section-number">03</span>
                    <div>
                      <h3>Registro visual</h3>
                      <p>Fotografe o animal e seus sinais</p>
                    </div>
                  </div>
                  <input ref={fotoInputRef} className="curral-file-input" type="file" accept="image/*" capture="environment" multiple onChange={adicionarFotos} data-testid="input-curral-fotos" />
                  <button className="curral-camera-button" type="button" onClick={abrirCamera} disabled={dados.fotos.length >= 6} data-testid="button-curral-camera">
                    <span className="curral-camera-icon" aria-hidden="true">□</span>
                    <span>
                      <strong>{dados.fotos.length ? 'Adicionar outra foto' : 'Abrir câmera'}</strong>
                      <small>{dados.fotos.length}/6 fotos · imagens ficam neste registro</small>
                    </span>
                    <b aria-hidden="true">+</b>
                  </button>
                  {dados.fotos.length > 0 && (
                    <div className="curral-photo-grid" data-testid="list-curral-fotos">
                      {dados.fotos.map((foto, indice) => (
                        <div className="curral-photo" key={`${foto.slice(-16)}-${indice}`}>
                          <button type="button" onClick={() => setFotoEmFoco(foto)} data-testid={`button-curral-foto-${indice}`} aria-label={`Ampliar foto ${indice + 1}`}>
                            <img src={foto} alt={`Registro visual ${indice + 1}`} />
                          </button>
                          <button className="curral-photo-remove" type="button" onClick={() => removerFoto(indice)} data-testid={`button-curral-remover-foto-${indice}`} aria-label={`Remover foto ${indice + 1}`}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="curral-card curral-card-notes">
                  <div className="curral-section-heading">
                    <span className="curral-section-number">04</span>
                    <div>
                      <h3>Observações</h3>
                      <p>Deixe o contexto para a próxima equipe</p>
                    </div>
                  </div>
                  <div className="curral-field">
                    <textarea value={dados.observacoes} onChange={(e) => atualizarCampo('observacoes', e.target.value)} placeholder="Condição do animal, risco no local ou orientação dada..." rows={4} data-testid="textarea-curral-observacoes" />
                  </div>
                  <label className="curral-field curral-field-time">
                    <span>Capturado em</span>
                    <input type="datetime-local" value={dados.capturadoEm} onChange={(e) => atualizarCampo('capturadoEm', e.target.value)} data-testid="input-curral-capturado-em" />
                  </label>
                </section>

                {erroSalvar && <div className="curral-error" role="alert" data-testid="status-curral-erro">{erroSalvar}</div>}
                <button className="curral-submit" type="submit" data-testid="button-curral-revisar">
                  <span>Revisar e enviar</span>
                  <b aria-hidden="true">→</b>
                </button>
              </form>
            ) : (
              <section className="curral-review" data-testid="section-curral-revisao">
                <div className="curral-review-banner">
                  <span className="curral-review-icon" aria-hidden="true">✓</span>
                  <div>
                    <strong>Confira antes de enviar</strong>
                    <p>O registro será encaminhado com os dados abaixo.</p>
                  </div>
                </div>
                <div className="curral-review-card">
                  <div className="curral-review-title"><span>Animal</span><button type="button" onClick={() => setEtapa('formulario')} data-testid="button-curral-editar">Editar</button></div>
                  <h2>{dados.especie}</h2>
                  <div className="curral-review-chips">
                    <span>{dados.porte}</span>
                    {dados.sexo && <span>{dados.sexo}</span>}
                    {dados.identificacao && <span>{dados.identificacao}</span>}
                  </div>
                  <dl className="curral-review-details">
                    <div><dt>Local</dt><dd>{dados.localDescricao}</dd></div>
                    <div><dt>GPS</dt><dd>{formatarCoordenada(dados.latitude)}, {formatarCoordenada(dados.longitude)}{dados.precisaoGps ? ` · ±${Math.round(dados.precisaoGps)} m` : ''}</dd></div>
                    <div><dt>Capturado em</dt><dd>{formatarData(dados.capturadoEm)}</dd></div>
                    {dados.observacoes && <div><dt>Observações</dt><dd>{dados.observacoes}</dd></div>}
                  </dl>
                  <div className="curral-review-photos">
                    <span>Fotos anexadas</span><strong>{dados.fotos.length}/6</strong>
                  </div>
                  {dados.fotos.length > 0 && <div className="curral-review-photo-strip">{dados.fotos.map((foto, indice) => <img key={`${foto.slice(-14)}-${indice}`} src={foto} alt={`Foto anexada ${indice + 1}`} />)}</div>}
                </div>
                {erroSalvar && <div className="curral-error" role="alert" data-testid="status-curral-erro-revisao">{erroSalvar}</div>}
                <div className="curral-review-actions">
                  <button className="curral-button curral-button-quiet" type="button" onClick={() => setEtapa('formulario')} data-testid="button-curral-voltar-edicao">Voltar e editar</button>
                  <button className="curral-submit" type="button" onClick={salvar} disabled={salvando} data-testid="button-curral-enviar">
                    {salvando ? 'Enviando registro...' : 'Enviar registro'} {!salvando && <b aria-hidden="true">→</b>}
                  </button>
                </div>
              </section>
            )}

            <section className="curral-recentes" data-testid="section-curral-recentes">
              <div className="curral-recentes-heading">
                <div>
                  <span className="curral-kicker">Acompanhamento</span>
                  <h2>Registros recentes</h2>
                </div>
                <button className="curral-refresh" type="button" onClick={onAtualizarLista} disabled={carregandoLista} data-testid="button-curral-atualizar">
                  <span aria-hidden="true">↻</span> {carregandoLista ? 'Atualizando' : 'Atualizar'}
                </button>
              </div>
              {erroLista ? (
                <div className="curral-list-state curral-list-error" role="alert" data-testid="status-curral-erro-lista">
                  <strong>Não foi possível carregar os registros.</strong>
                  <button type="button" onClick={onAtualizarLista} data-testid="button-curral-tentar-lista">Tentar novamente</button>
                </div>
              ) : carregandoLista ? (
                <div className="curral-skeleton-list" data-testid="status-curral-carregando">
                  <span /><span /><span />
                </div>
              ) : registros.length === 0 ? (
                <div className="curral-list-state" data-testid="status-curral-vazio">
                  <span className="curral-empty-mark" aria-hidden="true">—</span>
                  <strong>Nenhum registro por aqui</strong>
                  <p>Os próximos animais encontrados aparecerão nesta lista.</p>
                </div>
              ) : (
                <div className="curral-record-list" data-testid="list-curral-registros">
                  {registros.slice(0, 8).map((registro) => (
                    <article className="curral-record" key={registro.id} data-testid={`card-curral-registro-${registro.id}`}>
                      <div className="curral-record-stamp" aria-hidden="true">C</div>
                      <div className="curral-record-main">
                        <div className="curral-record-top">
                          <strong>{registro.especie || 'Espécie não informada'}</strong>
                          <span className={`curral-status status-${registro.status}`}>{rotuloStatus(registro.status)}</span>
                        </div>
                        <span className="curral-record-place">{registro.localDescricao || 'Local não informado'}</span>
                        <span className="curral-record-meta">{formatarData(registro.capturadoEm)} · {registro.fotos.length} {registro.fotos.length === 1 ? 'foto' : 'fotos'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {fotoEmFoco && (
        <div className="curral-photo-lightbox" role="dialog" aria-modal="true" data-testid="dialog-curral-foto">
          <button type="button" onClick={() => setFotoEmFoco(null)} data-testid="button-curral-fechar-foto" aria-label="Fechar foto">×</button>
          <img src={fotoEmFoco} alt="Foto ampliada do registro" />
        </div>
      )}
    </main>
  )
}