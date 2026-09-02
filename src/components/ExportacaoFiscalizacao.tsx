import { useState } from 'react'
import type { CurralRegistro } from './Curral'
import type { ProconRegistro } from './Procon'
import { exportarFiscalizacaoDocx, exportarFiscalizacaoExcel, exportarFiscalizacaoKmz } from '../exportarFiscalizacao'
import './ExportacaoFiscalizacao.css'

interface Props {
  registrosCurral: CurralRegistro[]
  relatoriosProcon: ProconRegistro[]
}

type Formato = 'excel' | 'docx' | 'kmz' | null

export default function ExportacaoFiscalizacao({ registrosCurral, relatoriosProcon }: Props) {
  const [exportando, setExportando] = useState<Formato>(null)
  const [mensagem, setMensagem] = useState('')
  const total = registrosCurral.length + relatoriosProcon.length

  async function gerar(formato: Exclude<Formato, null>) {
    if (!total) {
      setMensagem('Nenhum registro de Curral ou Procon carregado para exportar.')
      return
    }
    setExportando(formato)
    setMensagem('')
    try {
      if (formato === 'excel') {
        const resultado = await exportarFiscalizacaoExcel(registrosCurral, relatoriosProcon)
        setMensagem(`${resultado.total} ocorrência(s) exportada(s) em Excel.`)
      } else if (formato === 'docx') {
        const resultado = await exportarFiscalizacaoDocx(registrosCurral, relatoriosProcon)
        setMensagem(`${resultado.total} ocorrência(s) exportada(s) em documento editável.`)
      } else {
        const resultado = await exportarFiscalizacaoKmz(registrosCurral, relatoriosProcon)
        setMensagem(`${resultado.pontos} ponto(s) incluído(s) no KMZ${resultado.semGps ? ` · ${resultado.semGps} sem GPS não incluído(s)` : ''}.`)
      }
    } catch (erro) {
      console.error('Falha na exportação da fiscalização:', erro)
      setMensagem('Não foi possível gerar o arquivo. Tente novamente.')
    } finally {
      setExportando(null)
    }
  }

  return (
    <section className="exportacao-fiscalizacao" data-testid="section-exportacao-fiscalizacao">
      <div className="exportacao-fiscalizacao-copy">
        <span className="exportacao-fiscalizacao-kicker">Relatórios operacionais</span>
        <strong>Exportar Curral + Procon</strong>
        <span>{registrosCurral.length} Curral · {relatoriosProcon.length} Procon · {total} ocorrência(s)</span>
      </div>
      <div className="exportacao-fiscalizacao-actions">
        <button type="button" onClick={() => void gerar('excel')} disabled={exportando !== null} data-testid="button-exportar-fiscalizacao-excel"><b>▦</b> {exportando === 'excel' ? 'Gerando...' : 'Excel'}</button>
        <button type="button" onClick={() => void gerar('docx')} disabled={exportando !== null} data-testid="button-exportar-fiscalizacao-docx"><b>▤</b> {exportando === 'docx' ? 'Gerando...' : 'DOC editável'}</button>
        <button type="button" onClick={() => void gerar('kmz')} disabled={exportando !== null} data-testid="button-exportar-fiscalizacao-kmz"><b>⌖</b> {exportando === 'kmz' ? 'Gerando...' : 'KMZ / Earth'}</button>
      </div>
      {mensagem && <span className="exportacao-fiscalizacao-message" role="status">{mensagem}</span>}
    </section>
  )
}