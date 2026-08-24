import type { CellValue as ExcelCellValue, Workbook as ExcelWorkbook } from 'exceljs'
import type { Ocorrencia } from './types'
import { parseDateLocal } from './utils'

export interface ChecklistExportData {
  id: number
  data_checklist: string
  km: string | null
  placa: string | null
  motorista: string | null
  fotos_avarias: string[]
  foto_frontal: string | null
  foto_traseira: string | null
  foto_direita: string | null
  foto_esquerda: string | null
  itens: Record<string, string> | null
  observacoes: string | null
  assinatura_data: string | null
  created_at: string
}

const AZUL = '1a4b8c'
const LARANJA = 'E05F00'
const CINZA_CLARO = 'f3f4f6'
const BRANCO = 'FFFFFF'

const FOTO_W = 120  // largura da miniatura em pixels
const FOTO_H = 90   // altura da miniatura em pixels
const FOTO_COL_W = 17  // largura da coluna em caracteres (≈ 120px)
const ROW_H_PX_TO_PT = 0.75  // 1pt ≈ 1.33px

// Converte uma URL de imagem (ex: Supabase Storage) em data URL base64
// URLs do Supabase são buscadas via proxy do servidor para evitar CORS
async function urlParaBase64(url: string): Promise<string | null> {
  try {
    // Roteia URLs do Supabase Storage pelo proxy Express (evita bloqueio CORS)
    const fetchUrl = url.includes('supabase.co/storage')
      ? `/api/proxy-imagem?url=${encodeURIComponent(url)}`
      : url
    const res = await fetch(fetchUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Normaliza uma foto (base64 ou URL) para { base64, ext } pronto para o ExcelJS
async function normalizarFoto(foto: string): Promise<{ base64: string; ext: 'jpeg' | 'png' } | null> {
  if (!foto) return null
  let dataUrl = foto
  if (foto.startsWith('http://') || foto.startsWith('https://')) {
    const fetched = await urlParaBase64(foto)
    if (!fetched) return null
    dataUrl = fetched
  }
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  const ext: 'png' | 'jpeg' = dataUrl.startsWith('data:image/png') ? 'png' : 'jpeg'
  return { base64, ext }
}

function nivelLabel(n: string) {
  return n === 'alto' ? 'Alto 🔴' : n === 'medio' ? 'Médio 🟡' : 'Baixo 🟢'
}
function statusLabel(s: string) {
  return s === 'ativo' ? 'Ativo' : 'Resolvido'
}

function calcularAreaM2(pontos: { lat: number; lng: number }[]): number {
  if (pontos.length < 3) return 0
  const toRad = (d: number) => d * Math.PI / 180
  const R = 6371000
  const lat0 = pontos[0].lat
  const lng0 = pontos[0].lng
  const pts = pontos.map(p => ({
    x: (p.lng - lng0) * Math.cos(toRad(lat0)) * R * toRad(1),
    y: (p.lat - lat0) * R * toRad(1),
  }))
  let area = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(area) / 2
}

function formatarAreaExcel(m2: number): string {
  if (m2 < 1) return '< 1 m²'
  if (m2 < 10000) return `${Math.round(m2).toLocaleString('pt-BR')} m²`
  const ha = m2 / 10000
  return `${ha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`
}

function extrairBairroExcel(endereco: string | null): string {
  if (!endereco) return 'Não informado'
  let s = endereco.trim()
  s = s.replace(/,?\s*Ouro Branco.*$/i, '')
  s = s.replace(/\s*-\s*MG.*$/i, '')
  s = s.replace(/\s*\d{5}-?\d{3}.*$/, '')
  if (s.includes(' - ')) {
    const partes = s.split(' - ').map(p => p.trim()).filter(Boolean)
    if (partes.length >= 2) return partes[partes.length - 1]
  }
  if (s.includes(',')) {
    const partes = s.split(',').map(p => p.trim()).filter(Boolean)
    if (partes.length >= 2) {
      const ultimo = partes[partes.length - 1]
      if (!/^\d+$/.test(ultimo)) return ultimo
      if (partes.length >= 3) return partes[partes.length - 2]
    }
  }
  return s || 'Não informado'
}

// ── Export single occurrence with photos ──────────────────────────────────────
export async function exportarOcorrenciaExcel(o: Ocorrencia): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()

  const ws = wb.addWorksheet('Ocorrência', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  })

  ws.columns = [
    { width: 28 },
    { width: 38 },
    { width: 4 },
    { width: 32 },
    { width: 32 },
  ]

  ws.mergeCells('A1:E1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'DEFESA CIVIL OURO BRANCO — RELATÓRIO DE OCORRÊNCIA'
  titleCell.font = { bold: true, size: 14, color: { argb: BRANCO } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 32

  ws.mergeCells('A2:E2')
  const subCell = ws.getCell('A2')
  subCell.value = `Ocorrência #${o.id} — Gerado em ${new Date().toLocaleString('pt-BR')}`
  subCell.font = { italic: true, size: 10, color: { argb: '6b7280' } }
  subCell.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  let row = 4

  function secao(titulo: string) {
    ws.mergeCells(`A${row}:B${row}`)
    const c = ws.getCell(`A${row}`)
    c.value = titulo
    c.font = { bold: true, size: 10, color: { argb: BRANCO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } }
    c.alignment = { horizontal: 'left', indent: 1 }
    ws.getRow(row).height = 20
    row++
  }

  function linha(label: string, valor: string | null | undefined) {
    const lCell = ws.getCell(`A${row}`)
    const vCell = ws.getCell(`B${row}`)
    lCell.value = label
    lCell.font = { bold: true, size: 10 }
    lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO.replace('#', '') } }
    lCell.alignment = { vertical: 'top', indent: 1 }
    vCell.value = valor || '—'
    vCell.font = { size: 10 }
    vCell.alignment = { vertical: 'top', wrapText: true }
    vCell.border = { bottom: { style: 'thin', color: { argb: 'e5e7eb' } } }
    lCell.border = { bottom: { style: 'thin', color: { argb: 'e5e7eb' } } }
    ws.getRow(row).height = 18
    row++
  }

  secao('IDENTIFICAÇÃO')
  linha('ID', String(o.id))
  linha('Data da Ocorrência', parseDateLocal(o.data_ocorrencia)?.toLocaleDateString('pt-BR') ?? '—')
  linha('Registrado em', o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—')
  linha('Tipo', o.tipo)
  linha('Natureza', o.natureza)
  if (o.subnatureza) linha('Detalhe', o.subnatureza)
  linha('Nível de Risco', nivelLabel(o.nivel_risco))
  linha('Status', statusLabel(o.status_oc))

  row++
  secao('LOCALIZAÇÃO')
  linha('Endereço', o.endereco)
  linha('Latitude', o.lat != null ? String(o.lat) : null)
  linha('Longitude', o.lng != null ? String(o.lng) : null)

  row++
  secao('RESPONSÁVEL')
  linha('Proprietário / Morador', o.proprietario)

  row++
  secao('SITUAÇÃO')
  const obsCell = ws.getCell(`A${row}`)
  ws.mergeCells(`A${row}:B${row + 3}`)
  obsCell.value = o.situacao || '—'
  obsCell.font = { size: 10 }
  obsCell.alignment = { vertical: 'top', wrapText: true, indent: 1 }
  ws.getRow(row).height = 18
  row += 4

  if (o.recomendacao) {
    row++
    secao('RECOMENDAÇÃO')
    const recCell = ws.getCell(`A${row}`)
    ws.mergeCells(`A${row}:B${row + 3}`)
    recCell.value = o.recomendacao
    recCell.font = { size: 10 }
    recCell.alignment = { vertical: 'top', wrapText: true, indent: 1 }
    ws.getRow(row).height = 18
    row += 4
  }

  if (o.conclusao) {
    row++
    secao('CONCLUSÃO')
    const conCell = ws.getCell(`A${row}`)
    ws.mergeCells(`A${row}:B${row + 3}`)
    conCell.value = o.conclusao
    conCell.font = { size: 10 }
    conCell.alignment = { vertical: 'top', wrapText: true, indent: 1 }
    ws.getRow(row).height = 18
    row += 4
  }

  // ── Vistorias adicionais (Interdição de Imóvel) ──
  const vistoriasAdic = Array.isArray(o.vistorias) ? o.vistorias : []
  if (vistoriasAdic.length > 0) {
    row++
    ws.mergeCells(`A${row}:E${row}`)
    const vistoriasHeader = ws.getCell(`A${row}`)
    vistoriasHeader.value = `VISTORIAS ADICIONAIS (${vistoriasAdic.length})`
    vistoriasHeader.font = { bold: true, size: 10, color: { argb: BRANCO } }
    vistoriasHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } }
    vistoriasHeader.alignment = { horizontal: 'left', indent: 1 }
    ws.getRow(row).height = 20
    row++

    vistoriasAdic.forEach((v, vIdx) => {
      const dataFmt = v.data ? new Date(v.data).toLocaleString('pt-BR') : '—'
      linha(`Vistoria #${vIdx + 1} — Data`, dataFmt)
      if (v.agente) linha(`Vistoria #${vIdx + 1} — Agente`, v.agente)
      const obsCellV = ws.getCell(`A${row}`)
      ws.mergeCells(`A${row}:B${row + 2}`)
      obsCellV.value = v.observacao || '—'
      obsCellV.font = { size: 10 }
      obsCellV.alignment = { vertical: 'top', wrapText: true, indent: 1 }
      ws.getRow(row).height = 18
      row += 3

      if (Array.isArray(v.fotos) && v.fotos.length > 0) {
        const ROW_H_PT_V = Math.round(FOTO_H / ROW_H_PX_TO_PT)
        let fRow = row
        let col = 3
        for (let i = 0; i < v.fotos.length; i++) {
          const fb = v.fotos[i]
          const data = fb.includes(',') ? fb.split(',')[1] : fb
          const ext = fb.startsWith('data:image/png') ? 'png' : 'jpeg'
          try {
            const imageId = wb.addImage({ base64: data, extension: ext })
            ws.addImage(imageId, {
              tl: { col, row: fRow - 1 },
              ext: { width: FOTO_W, height: FOTO_H },
            })
            ws.getRow(fRow).height = ROW_H_PT_V
          } catch { /* ignora */ }
          col++
          if (col > 4) { col = 3; fRow++; ws.getRow(fRow).height = ROW_H_PT_V }
        }
        row = fRow + 1
      }
      row++
    })
  }

  if (o.fotos && o.fotos.length > 0) {
    row++
    ws.mergeCells(`A${row}:E${row}`)
    const fotosHeader = ws.getCell(`A${row}`)
    fotosHeader.value = `FOTOS DO REGISTRO (${o.fotos.length})`
    fotosHeader.font = { bold: true, size: 10, color: { argb: BRANCO } }
    fotosHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    fotosHeader.alignment = { horizontal: 'left', indent: 1 }
    ws.getRow(row).height = 20
    row++

    const ROW_H_PT = Math.round(FOTO_H / ROW_H_PX_TO_PT)
    let fotoRow = row
    let col = 3

    for (let i = 0; i < o.fotos.length; i++) {
      const fotoBase64 = o.fotos[i]
      const base64Data = fotoBase64.includes(',') ? fotoBase64.split(',')[1] : fotoBase64
      const ext = fotoBase64.startsWith('data:image/png') ? 'png' : 'jpeg'

      try {
        const imageId = wb.addImage({ base64: base64Data, extension: ext })
        ws.addImage(imageId, {
          tl: { col: col, row: fotoRow - 1 },
          ext: { width: FOTO_W, height: FOTO_H },
        })
        ws.getRow(fotoRow).height = ROW_H_PT
      } catch {
        // ignora imagem inválida
      }

      col++
      if (col > 4) {
        col = 3
        fotoRow++
        ws.getRow(fotoRow).height = ROW_H_PT
      }
    }
  }

  ws.getCell('A1').border = {
    top: { style: 'medium', color: { argb: AZUL } },
    left: { style: 'medium', color: { argb: AZUL } },
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ocorrencia_${o.id}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}


// ── Dashboard Analytics Sheet (100% editável e orientado por fórmulas) ────────
async function adicionarAbaDashboard(wb: ExcelWorkbook, ocorrencias: Ocorrencia[]): Promise<void> {
  const ws = wb.addWorksheet('📊 Dashboard', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  const dataSheet = "'Ocorrências'"
  const ultimaLinha = Math.max(3, ocorrencias.length + 2)
  const tipos = [...new Set(ocorrencias.map(o => o.tipo || 'Não informado'))].sort()
  const bairros = [...new Set(ocorrencias.map(o => extrairBairroExcel(o.endereco)))].sort()

  ws.columns = [
    { width: 30 }, { width: 16 }, { width: 16 }, { width: 18 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ]
  ws.mergeCells('A1:H1')
  ws.getCell('A1').value = '📊 DASHBOARD DE OCORRÊNCIAS — PAINEL EDITÁVEL'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BRANCO } }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 30

  ws.mergeCells('A2:H2')
  ws.getCell('A2').value = 'Altere as células amarelas para filtrar por atividade ou bairro. As fórmulas recalculam ao abrir o arquivo.'
  ws.getCell('A2').font = { italic: true, size: 10, color: { argb: '475569' } }
  ws.getCell('A2').alignment = { horizontal: 'center' }

  ws.getCell('A4').value = 'Atividade / tipo'
  ws.getCell('A5').value = 'Bairro'
  ;['A4', 'A5'].forEach(ref => {
    ws.getCell(ref).font = { bold: true, color: { argb: AZUL } }
  })
  ws.getCell('B4').value = 'Todos'
  ws.getCell('B5').value = 'Todos'
  ;['B4', 'B5'].forEach(ref => {
    ws.getCell(ref).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } }
    ws.getCell(ref).font = { bold: true, color: { argb: '7c4a03' } }
    ws.getCell(ref).alignment = { horizontal: 'center' }
  })
  ws.getCell('D4').value = 'Opções de atividade: Todos ou um tipo existente na aba Ocorrências'
  ws.getCell('D5').value = 'Opções de bairro: Todos ou edite a coluna Bairro na aba Ocorrências'
  ;['D4', 'D5'].forEach(ref => {
    ws.getCell(ref).font = { italic: true, size: 9, color: { argb: '64748b' } }
  })

  const totalFormula = `IF(AND($B$4="Todos",$B$5="Todos"),COUNTA(${dataSheet}!$A$3:$A$${ultimaLinha}),IF($B$4="Todos",COUNTIF(${dataSheet}!$T$3:$T$${ultimaLinha},$B$5),IF($B$5="Todos",COUNTIF(${dataSheet}!$D$3:$D$${ultimaLinha},$B$4),COUNTIFS(${dataSheet}!$D$3:$D$${ultimaLinha},$B$4,${dataSheet}!$T$3:$T$${ultimaLinha},$B$5))))`
  const countFor = (column: string, value: string, extraFilter = true) => {
    const matching = ocorrencias.filter(o => {
      const bairro = extrairBairroExcel(o.endereco)
      const columnValue = column === 'D' ? (o.tipo || 'Não informado') : column === 'E' ? (o.natureza || 'Não informado') : column === 'H' ? statusLabel(o.status_oc) : bairro
      return columnValue === value &&
        (!extraFilter || (ws.getCell('B4').value === 'Todos' || o.tipo === ws.getCell('B4').value) &&
          (ws.getCell('B5').value === 'Todos' || bairro === ws.getCell('B5').value))
    }).length
    return matching
  }
  const formulaCell = (ref: string, formula: string, result: number) => {
    ws.getCell(ref).value = { formula, result } as any
    ws.getCell(ref).numFmt = '0'
    ws.getCell(ref).font = { bold: true, size: 18, color: { argb: AZUL } }
    ws.getCell(ref).alignment = { horizontal: 'center', vertical: 'middle' }
  }
  const baseTotal = ocorrencias.length
  const resolvidos = ocorrencias.filter(o => o.status_oc === 'resolvido').length
  const ativos = baseTotal - resolvidos
  const altos = ocorrencias.filter(o => o.nivel_risco === 'alto').length
  const formulaComFiltros = (column: string, value: string) =>
    `IF(AND($B$4="Todos",$B$5="Todos"),COUNTIF(${dataSheet}!$${column}$3:$${column}$${ultimaLinha},"${value}"),IF($B$4="Todos",COUNTIFS(${dataSheet}!$${column}$3:$${column}$${ultimaLinha},"${value}",${dataSheet}!$T$3:$T$${ultimaLinha},$B$5),IF($B$5="Todos",COUNTIFS(${dataSheet}!$${column}$3:$${column}$${ultimaLinha},"${value}",${dataSheet}!$D$3:$D$${ultimaLinha},$B$4),COUNTIFS(${dataSheet}!$${column}$3:$${column}$${ultimaLinha},"${value}",${dataSheet}!$D$3:$D$${ultimaLinha},$B$4,${dataSheet}!$T$3:$T$${ultimaLinha},$B$5))))`
  const kpis: [string, string, string, number][] = [
    ['D7', 'Total', totalFormula, baseTotal],
    ['E7', 'Ativas', formulaComFiltros('H', 'Ativo'), ativos],
    ['F7', 'Resolvidas', formulaComFiltros('H', 'Resolvido'), resolvidos],
    ['G7', 'Risco alto', formulaComFiltros('G', 'Alto 🔴'), altos],
  ]
  kpis.forEach(([ref, label, formula, result]) => {
    const labelCell = ws.getCell(ref.replace('7', '6'))
    labelCell.value = label
    labelCell.font = { bold: true, color: { argb: '64748b' } }
    labelCell.alignment = { horizontal: 'center' }
    formulaCell(ref, formula, result)
    ws.getCell(ref).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } }
  })
  ws.getRow(6).height = 20
  ws.getRow(7).height = 32

  const secao = (row: number, title: string, color = AZUL) => {
    ws.mergeCells(`A${row}:C${row}`)
    ws.getCell(`A${row}`).value = title
    ws.getCell(`A${row}`).font = { bold: true, color: { argb: BRANCO } }
    ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
  }
  const cabecalho = (row: number, labels: string[]) => labels.forEach((label, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = label
    cell.font = { bold: true, color: { argb: '475569' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO } }
  })
  const linha = (row: number, label: string, formula: string, result: number, columns = ['A', 'B', 'C'], totalRef = '$D$7') => {
    const [labelCol, countCol, pctCol] = columns
    ws.getCell(`${labelCol}${row}`).value = label
    ws.getCell(`${countCol}${row}`).value = { formula, result } as any
    ws.getCell(`${pctCol}${row}`).value = { formula: `IFERROR(${countCol}${row}/${totalRef},0)`, result: result / Math.max(baseTotal, 1) } as any
    ws.getCell(`${pctCol}${row}`).numFmt = '0.0%'
    columns.forEach(col => {
      ws.getCell(`${col}${row}`).border = { bottom: { style: 'hair', color: { argb: 'dbeafe' } } }
      if (col !== labelCol) ws.getCell(`${col}${row}`).alignment = { horizontal: 'center' }
    })
  }

  secao(10, '🏷️ Por atividade / tipo')
  cabecalho(11, ['Atividade', 'Quantidade', '% do filtro'])
  tipos.forEach((tipo, i) => linha(12 + i, tipo,
    `IF($B$5="Todos",COUNTIF(${dataSheet}!$D$3:$D$${ultimaLinha},A${12 + i}),COUNTIFS(${dataSheet}!$D$3:$D$${ultimaLinha},A${12 + i},${dataSheet}!$T$3:$T$${ultimaLinha},$B$5))`,
    countFor('D', tipo)))

  const bairroInicio = 10
  // A tabela de bairros ocupa E:G, para ficar lado a lado com atividades.
  ws.mergeCells(`E${bairroInicio}:G${bairroInicio}`)
  ws.getCell(`E${bairroInicio}`).value = '🏘️ Por bairro'
  ws.getCell(`E${bairroInicio}`).font = { bold: true, color: { argb: BRANCO } }
  ws.getCell(`E${bairroInicio}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f766e' } }
  ;['E', 'F', 'G'].forEach((col, i) => {
    ws.getCell(`${col}11`).value = ['Bairro', 'Quantidade', '% do filtro'][i]
    ws.getCell(`${col}11`).font = { bold: true, color: { argb: '475569' } }
    ws.getCell(`${col}11`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO } }
  })
  bairros.forEach((bairro, i) => {
    const row = 12 + i
    linha(row, bairro, `IF($B$4="Todos",COUNTIF(${dataSheet}!$T$3:$T$${ultimaLinha},E${row}),COUNTIFS(${dataSheet}!$T$3:$T$${ultimaLinha},E${row},${dataSheet}!$D$3:$D$${ultimaLinha},$B$4))`, countFor('T', bairro), ['E', 'F', 'G'])
  })

  const statusRow = Math.max(12 + tipos.length, 12 + bairros.length) + 2
  secao(statusRow, '📌 Status no filtro')
  cabecalho(statusRow + 1, ['Status', 'Quantidade', '% do filtro'])
  ;['Ativo', 'Resolvido'].forEach((status, i) => {
    const row = statusRow + 2 + i
    linha(row, status, `IF(AND($B$4="Todos",$B$5="Todos"),COUNTIF(${dataSheet}!$H$3:$H$${ultimaLinha},A${row}),IF($B$4="Todos",COUNTIFS(${dataSheet}!$H$3:$H$${ultimaLinha},A${row},${dataSheet}!$T$3:$T$${ultimaLinha},$B$5),IF($B$5="Todos",COUNTIFS(${dataSheet}!$H$3:$H$${ultimaLinha},A${row},${dataSheet}!$D$3:$D$${ultimaLinha},$B$4),COUNTIFS(${dataSheet}!$H$3:$H$${ultimaLinha},A${row},${dataSheet}!$D$3:$D$${ultimaLinha},$B$4,${dataSheet}!$T$3:$T$${ultimaLinha},$B$5))))`,
      status === 'Resolvido' ? resolvidos : ativos)
  })

  ws.mergeCells(`A${statusRow + 5}:H${statusRow + 5}`)
  ws.getCell(`A${statusRow + 5}`).value = 'As fórmulas usam a aba Ocorrências como fonte. Edite Tipo, Endereço/Bairro ou os filtros amarelos e pressione F9 para recalcular.'
  ws.getCell(`A${statusRow + 5}`).font = { italic: true, size: 9, color: { argb: '64748b' } }
  ws.getCell(`A${statusRow + 5}`).alignment = { wrapText: true }
  ws.views = [{ state: 'frozen', ySplit: 5 }]
  ws.autoFilter = { from: { row: 11, column: 1 }, to: { row: 11, column: 7 } }
}

// ── Export all occurrences (tabular) with embedded photo thumbnails ───────────
export async function exportarTodasExcel(
  ocorrencias: Ocorrencia[],
  onProgresso?: (atual: number, total: number) => void,
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()
  wb.calcProperties = { calcMode: 'auto', fullCalcOnLoad: true, forceFullCalc: true }

  const ws = wb.addWorksheet('Ocorrências')

  const maxFotos = ocorrencias.reduce((max, o) => Math.max(max, o.fotos?.length ?? 0), 0)
   // Colunas extras: 15 base + bairro editável + 3 vistorias + 1 área queimada
   const COLS_BASE = 15 + 1 + 3 + 1
  const totalCols = COLS_BASE + maxFotos

  // ── Linha 1: título ───────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, totalCols)
  const titulo = ws.getCell('A1')
  titulo.value = `DEFESA CIVIL OURO BRANCO — TODAS AS OCORRÊNCIAS — Gerado em ${new Date().toLocaleString('pt-BR')}`
  titulo.font = { bold: true, size: 12, color: { argb: BRANCO } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } }
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 26

  // ── Linha 2: cabeçalhos das colunas ──────────────────────────────────────
  const cabecalhos = [
    'ID', 'Data Ocorrência', 'Registrado em', 'Tipo', 'Natureza', 'Detalhe',
     'Nível de Risco', 'Status', 'Endereço', 'Latitude', 'Longitude',
    'Proprietário', 'Situação', 'Recomendação', 'Conclusão',
    'Vistorias Adicionais (qtd)', 'Última Vistoria', 'Observações das Vistorias',
     'Área Queimada', 'Bairro (editável)',
    ...Array.from({ length: maxFotos }, (_, i) => `Foto ${i + 1}`),
  ]

  const larguras = [6, 16, 20, 14, 26, 20, 14, 12, 32, 12, 12, 26, 40, 40, 40,
     14, 18, 50, 20, 24,
    ...Array(maxFotos).fill(FOTO_COL_W)]

  ws.columns = larguras.map((w) => ({ width: w }))

  const headerRow = ws.getRow(2)
  cabecalhos.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 10, color: { argb: BRANCO } }
     // Cols 16-18 = Vistorias (vermelho); 19 = Área Queimada; 20 = Bairro; >= 21 = Fotos
    let bg = AZUL
    if (i >= 15 && i < 18) bg = 'B91C1C'
    else if (i === 18) bg = 'D97706'
     else if (i === 19) bg = '0f766e'
     else if (i >= 20) bg = LARANJA
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: BRANCO } } }
  })
  headerRow.height = 22

  // ── Filtro e freeze ───────────────────────────────────────────────────────
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: totalCols } }
  ws.views = [{ state: 'frozen', ySplit: 2 }]

  // ── Linhas de dados (começam na linha 3) ─────────────────────────────────
  const ROW_H_PT = Math.round(FOTO_H / ROW_H_PX_TO_PT)
  const LINHA_INICIO = 3  // primeira linha de dados (1-indexed)

  for (let idx = 0; idx < ocorrencias.length; idx++) {
    const o = ocorrencias[idx]
    onProgresso?.(idx + 1, ocorrencias.length)
    const temFotos = o.fotos && o.fotos.length > 0
    const linhaNum = LINHA_INICIO + idx
    const r = ws.getRow(linhaNum)

    const vAdic = Array.isArray(o.vistorias) ? o.vistorias : []
    const ultimaV = vAdic.length > 0 ? vAdic[vAdic.length - 1] : null
    const ultimaVistoriaTxt = ultimaV
      ? new Date(ultimaV.data).toLocaleDateString('pt-BR')
      : '—'
    const obsVistoriasTxt = vAdic.length > 0
      ? vAdic.map((v, i) => {
          const d = new Date(v.data).toLocaleDateString('pt-BR')
          const ag = v.agente ? ` [${v.agente}]` : ''
          const fc = Array.isArray(v.fotos) && v.fotos.length > 0 ? ` (📷 ${v.fotos.length})` : ''
          return `#${i + 1} ${d}${ag}${fc}: ${v.observacao || '—'}`
        }).join('\n')
      : '—'

    const polPontos = Array.isArray((o as any).poligono_area_queimada) && (o as any).poligono_area_queimada.length >= 3
      ? (o as any).poligono_area_queimada as { lat: number; lng: number }[]
      : null
    const areaQueimadaTxt = polPontos ? formatarAreaExcel(calcularAreaM2(polPontos)) : '—'

    const valores = [
      o.id,
      parseDateLocal(o.data_ocorrencia)?.toLocaleDateString('pt-BR') ?? '—',
      o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—',
      o.tipo,
      o.natureza,
      o.subnatureza || '—',
      nivelLabel(o.nivel_risco),
      statusLabel(o.status_oc),
      o.endereco || '—',
      o.lat ?? '—',
      o.lng ?? '—',
      o.proprietario || '—',
      o.situacao || '—',
      o.recomendacao || '—',
      o.conclusao || '—',
      vAdic.length,
      ultimaVistoriaTxt,
      obsVistoriasTxt,
      areaQueimadaTxt,
      extrairBairroExcel(o.endereco),
    ]

    valores.forEach((v, i) => { r.getCell(i + 1).value = v as ExcelCellValue })

    r.height = temFotos ? ROW_H_PT : 18

    const isEven = idx % 2 === 1
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 10 }
      cell.alignment = { vertical: 'middle', wrapText: false }
      if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f0f4ff' } }
    })

    // Wrap text na coluna de observações das vistorias (col 18)
    r.getCell(18).alignment = { vertical: 'top', wrapText: true }

    // Destaque para qtd de vistorias se houver
    if (vAdic.length > 0) {
      r.getCell(16).font = { bold: true, size: 10, color: { argb: 'B91C1C' } }
      r.getCell(16).alignment = { horizontal: 'center', vertical: 'middle' }
    }

    // Cor do nível de risco (coluna 7)
    const nivelCell = r.getCell(7)
    if (o.nivel_risco === 'alto') nivelCell.font = { bold: true, size: 10, color: { argb: 'dc2626' } }
    else if (o.nivel_risco === 'medio') nivelCell.font = { bold: true, size: 10, color: { argb: 'd97706' } }
    else nivelCell.font = { bold: true, size: 10, color: { argb: '059669' } }

    // Incorpora fotos — linha 0-indexed = linhaNum - 1
    if (temFotos) {
      for (let fotoIdx = 0; fotoIdx < o.fotos!.length; fotoIdx++) {
        const foto = o.fotos![fotoIdx]
        const normalizada = await normalizarFoto(foto)
        if (!normalizada) continue
       const colIdx = 20 + fotoIdx  // 0-indexed: coluna 21 em diante (após Bairro)
        try {
          const imageId = wb.addImage({ base64: normalizada.base64, extension: normalizada.ext })
          ws.addImage(imageId, {
            tl: { col: colIdx, row: linhaNum - 1 },
            ext: { width: FOTO_W, height: FOTO_H },
          })
        } catch {
          // ignora imagem inválida
        }
      }
    }
  }

  // ── Aba de Dashboard Analítico ────────────────────────────────────
  await adicionarAbaDashboard(wb, ocorrencias)

  // Ativa a aba de dados como padrão ao abrir
  ws.state = 'visible'

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `defesacivil_ourobranco_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Export checklists da viatura ──────────────────────────────────────────────
export async function exportarChecklistExcel(checklists: ChecklistExportData[], nomeArquivo?: string): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()

  const ws = wb.addWorksheet('Checklists', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  })

  const LABELS_BMR: Record<string, string> = { bom: 'Bom', medio: 'Médio', ruim: 'Ruim' }
  const LABELS_SN: Record<string, string> = { sim: 'Sim', nao: 'Não', na: 'N/A' }

  const ITENS_LABELS: [string, string, 'bmr' | 'sn'][] = [
    ['limpezaExterna', 'Limpeza Externa', 'bmr'],
    ['limpezaInterna', 'Limpeza Interna', 'bmr'],
    ['pneus', 'Pneus', 'bmr'],
    ['estepe', 'Estepe', 'bmr'],
    ['ltzPlaca', 'Luz Placa (Tras.)', 'sn'],
    ['ltzDirLuz', 'Luz Tras. Dir.', 'sn'],
    ['ltzDirLuzRe', 'Luz Ré Dir.', 'sn'],
    ['ltzDirFreio', 'Freio Dir.', 'sn'],
    ['ltzDirSeta', 'Seta Tras. Dir.', 'sn'],
    ['ltzEsqLuz', 'Luz Tras. Esq.', 'sn'],
    ['ltzEsqLuzRe', 'Luz Ré Esq.', 'sn'],
    ['ltzEsqFreio', 'Freio Esq.', 'sn'],
    ['ltzEsqSeta', 'Seta Tras. Esq.', 'sn'],
    ['ldzPlaca', 'Luz Placa (Diant.)', 'sn'],
    ['ldzDirFarolAlto', 'Farol Alto Dir.', 'sn'],
    ['ldzDirFarolBaixo', 'Farol Baixo Dir.', 'sn'],
    ['ldzDirNeblina', 'Neblina Dir.', 'sn'],
    ['ldzEsqFarolAlto', 'Farol Alto Esq.', 'sn'],
    ['ldzEsqFarolBaixo', 'Farol Baixo Esq.', 'sn'],
    ['ldzEsqSeta', 'Seta Diant. Esq.', 'sn'],
    ['ldzEsqNeblina', 'Neblina Esq.', 'sn'],
    ['segAlarme', 'Alarme', 'sn'],
    ['segBuzina', 'Buzina', 'sn'],
    ['segChaveRoda', 'Chave de Roda', 'sn'],
    ['segCintos', 'Cintos', 'sn'],
    ['segDocumentos', 'Documentos', 'sn'],
    ['segExtintor', 'Extintor', 'sn'],
    ['segLimpadores', 'Limpadores', 'sn'],
    ['segMacaco', 'Macaco', 'sn'],
    ['segPainel', 'Painel', 'sn'],
    ['segRetrovisorInterno', 'Retrovisor Int.', 'sn'],
    ['segRetrovisorDireito', 'Retrovisor Dir.', 'sn'],
    ['segRetrovisorEsquerdo', 'Retrovisor Esq.', 'sn'],
    ['segTravas', 'Travas', 'sn'],
    ['segTriangulo', 'Triângulo', 'sn'],
    ['motAcelerador', 'Acelerador', 'sn'],
    ['motAguaLimpador', 'Água Limpador', 'sn'],
    ['motAguaRadiador', 'Água Radiador', 'sn'],
    ['motEmbreagem', 'Embreagem', 'sn'],
    ['motFreio', 'Freio', 'sn'],
    ['motFreioMao', 'Freio de Mão', 'sn'],
    ['motOleoFreio', 'Óleo Freio', 'sn'],
    ['motOleoMoto', 'Óleo Motor', 'sn'],
    ['motTanquePartida', 'Tanque/Partida', 'sn'],
  ]

  const fotosFixas = ['Foto Esquerda', 'Foto Frontal', 'Foto Traseira', 'Foto Direita']
  const maxAvarias = checklists.reduce((max, c) => Math.max(max, c.fotos_avarias?.length ?? 0), 0)
  const fotosAvariasHeaders = Array.from({ length: maxAvarias }, (_, i) => `Foto Avaria ${i + 1}`)
  const fotoHeaders = [...fotosFixas, ...fotosAvariasHeaders]
  const totalCols = 9 + ITENS_LABELS.length + fotoHeaders.length
  const FOTO_CHECKLIST_SIZE = 110
  const FOTO_CHECKLIST_COL_W = 16
  const FOTO_CHECKLIST_ROW_H = Math.round(FOTO_CHECKLIST_SIZE / ROW_H_PX_TO_PT)

  ws.mergeCells(1, 1, 1, totalCols)
  const titulo = ws.getCell('A1')
  titulo.value = `DEFESA CIVIL OURO BRANCO — CHECKLISTS DA VIATURA — Gerado em ${new Date().toLocaleString('pt-BR')}`
  titulo.font = { bold: true, size: 12, color: { argb: BRANCO } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 26

  const cabecalhos = [
    'ID', 'Data', 'Motorista', 'Placa', 'KM', 'Combustível', 'Avarias', 'Assinado', 'Observações',
    ...ITENS_LABELS.map(([, label]) => label),
    ...fotoHeaders,
  ]
  const larguras = [
    5, 12, 14, 10, 10, 11, 8, 10, 28,
    ...Array(ITENS_LABELS.length).fill(14),
    ...Array(fotoHeaders.length).fill(FOTO_CHECKLIST_COL_W),
  ]
  ws.columns = larguras.map(w => ({ width: w }))

  const headerRow = ws.getRow(2)
  cabecalhos.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 9, color: { argb: BRANCO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i < 9 ? AZUL : i < 9 + ITENS_LABELS.length ? LARANJA : '166534' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: BRANCO } } }
  })
  headerRow.height = 36

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: totalCols } }
  ws.views = [{ state: 'frozen', ySplit: 2 }]

  for (let idx = 0; idx < checklists.length; idx++) {
    const c = checklists[idx]
    const linhaNum = 3 + idx
    const r = ws.getRow(linhaNum)
    const it = c.itens || {}
    const [y,m,d] = String(c.data_checklist || '').split('T')[0].split('-')
    const fotosLinha = [
      c.foto_esquerda,
      c.foto_frontal,
      c.foto_traseira,
      c.foto_direita,
      ...(c.fotos_avarias || []),
    ]

    const valores = [
      c.id,
      `${d}/${m}/${y}`,
      c.motorista || '—',
      c.placa || '—',
      c.km || '—',
      it.nivelCombustivel || '—',
      c.fotos_avarias?.length ?? 0,
      c.assinatura_data ? 'Sim' : 'Não',
      c.observacoes || '—',
      ...ITENS_LABELS.map(([campo, , tipo]) => {
        const v = it[campo] || ''
        return tipo === 'bmr' ? (LABELS_BMR[v] || '—') : (LABELS_SN[v] || '—')
      }),
      ...fotoHeaders.map((_, fotoIdx) => fotosLinha[fotoIdx] ? 'Foto' : '—'),
    ]

    valores.forEach((v, i) => { r.getCell(i + 1).value = v as ExcelCellValue })

    r.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 9 }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      if (colNum <= 2) cell.alignment = { ...cell.alignment, horizontal: 'left' }
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f0f4ff' } }

      if (colNum > 9 && colNum <= 9 + ITENS_LABELS.length) {
        const itenIdx = colNum - 10
        const [campo, , tipo] = ITENS_LABELS[itenIdx]
        const raw = it[campo] || ''
        if (tipo === 'bmr') {
          if (raw === 'bom') cell.font = { size: 9, bold: true, color: { argb: '15803d' } }
          else if (raw === 'medio') cell.font = { size: 9, bold: true, color: { argb: 'd97706' } }
          else if (raw === 'ruim') cell.font = { size: 9, bold: true, color: { argb: 'dc2626' } }
        } else {
          if (raw === 'sim') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'd1fae5' } }
          else if (raw === 'nao') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fee2e2' } }
          else if (raw === 'na') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f3f4f6' } }
        }
      }

      if (colNum > 9 + ITENS_LABELS.length) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.border = {
          top: { style: 'thin', color: { argb: 'd1d5db' } },
          left: { style: 'thin', color: { argb: 'd1d5db' } },
          bottom: { style: 'thin', color: { argb: 'd1d5db' } },
          right: { style: 'thin', color: { argb: 'd1d5db' } },
        }
      }
    })

    const temFoto = fotosLinha.some(Boolean)
    r.height = temFoto ? FOTO_CHECKLIST_ROW_H : 16

    for (let fotoIdx = 0; fotoIdx < fotosLinha.length; fotoIdx++) {
      const foto = fotosLinha[fotoIdx]
      if (!foto) continue
      const normalizada = await normalizarFoto(foto)
      if (!normalizada) continue
      const colIdx = 9 + ITENS_LABELS.length + fotoIdx
      try {
        const imageId = wb.addImage({ base64: normalizada.base64, extension: normalizada.ext })
        ws.addImage(imageId, {
          tl: { col: colIdx, row: linhaNum - 1 },
          ext: { width: FOTO_CHECKLIST_SIZE, height: FOTO_CHECKLIST_SIZE },
        })
      } catch {
        // ignora imagem inválida
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomeArquivo ?? `checklists_viatura_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}`}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
