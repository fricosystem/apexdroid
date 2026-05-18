// Gerador de XML BKY 100% compativel com Kodular/App Inventor
// Etapa 3: Estrutura correta com is_generic="false" e IDs únicos

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let id = ''
  for (let i = 0; i < 20; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export function convertFlowToBky(nodes: any[], edges: any[]): string {
  let xml = '<xml xmlns="http://www.w3.org/1999/xhtml">\n'
  
  // Encontrar nós de topo: evento, lógica raíz, ou sem arestas de entrada
  const topNodes = nodes.filter(n => {
    const hasIncoming = edges.some(e => e.target === n.id)
    const isEvent = (n.metadata?.functions || []).some((f: any) => f.type === 'event') ||
                    n.label.startsWith('Quando') ||
                    n.type === 'event'
    const isLogicTop = n.type === 'logic' && !hasIncoming
    return isEvent || isLogicTop
  })
  
  topNodes.forEach(node => {
    const functions = node.metadata?.functions || []
    const events = functions.filter((f: any) => f.type === 'event')
    
    // Bloco de procedimento
    if (node.type === 'logic' && node.label.startsWith('Procedimento')) {
      const procName = node.label.split(': ')[1] || 'procedimento'
      xml += `  <block type="procedures_defnoreturn" id="${generateId()}" x="${Math.round(node.x)}" y="${Math.round(node.y)}">\n`
      xml += `    <field name="NAME">${procName}</field>\n`
      const nextEdge = edges.find(e => e.source === node.id)
      if (nextEdge) {
        xml += '    <statement name="STACK">\n'
        xml += processNodeToBky(nextEdge.target, nodes, edges, 6)
        xml += '    </statement>\n'
      }
      xml += '  </block>\n'
      return
    }
    
    // Bloco de variável global
    if (node.type === 'logic' && node.label.startsWith('Variável Global')) {
      const varName = node.label.split(': ')[1] || 'var'
      xml += `  <block type="global_declaration" id="${generateId()}" x="${Math.round(node.x)}" y="${Math.round(node.y)}">\n`
      xml += `    <field name="NAME">${varName}</field>\n`
      xml += `    <value name="VALUE"><block type="math_number"><field name="NUM">0</field></block></value>\n`
      xml += '  </block>\n'
      return
    }

    // Inferir evento do label se nao houver funcoes explicitas
    if (events.length === 0 && (node.label.startsWith('Quando') || node.type === 'event')) {
      const raw = node.label.replace('Quando ', '')
      const parts = raw.split('.')
      const compName = node.metadata?.componentName || parts[0] || 'Screen1'
      const eventName = parts[1] || node.metadata?.eventName || 'Click'
      const compType = node.metadata?.componentType || 'Form'
      events.push({ name: eventName, componentName: compName, componentType: compType })
    }

    events.forEach((event: any) => {
      const compName = node.metadata?.componentName || event.componentName || 'Screen1'
      const eventName = event.name || 'Click'
      const compType = event.componentType || node.metadata?.componentType || 'Form'

      xml += `  <block type="component_event" id="${generateId()}" x="${Math.round(node.x)}" y="${Math.round(node.y)}">\n`
      xml += `    <mutation component_type="${compType}" is_generic="false" instance_name="${compName}" event_name="${eventName}"></mutation>\n`
      xml += `    <field name="COMPONENT_SELECTOR">${compName}</field>\n`
      
      const nextEdge = edges.find(e => e.source === node.id)
      if (nextEdge) {
        xml += '    <statement name="DO">\n'
        xml += processNodeToBky(nextEdge.target, nodes, edges, 6)
        xml += '    </statement>\n'
      }
      xml += '  </block>\n'
    })
  })
  
  xml += '</xml>'
  return xml
}

function indent(level: number): string {
  return ' '.repeat(level)
}

function processNodeToBky(nodeId: string, nodes: any[], edges: any[], depth = 4): string {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return ''
  
  const pad = indent(depth)
  const pad2 = indent(depth + 2)
  let blockXml = ''
  const functions = node.metadata?.functions || []
  
  // Prioridade 1: Tipo de bloco explícito (bkyType) vindo do Sidebar
  if (node.metadata?.bkyType) {
    blockXml += `${pad}<block type="${node.metadata.bkyType}" id="${generateId()}">\n`
    
    // Se for abrir outra tela, precisamos do input SCREEN
    if (node.metadata.bkyType === 'controls_openAnotherScreen' || node.metadata.bkyType === 'kodular_open_screen') {
      const screenName = node.metadata?.targetScreen || 'Screen1'
      blockXml += `${pad2}<value name="SCREEN"><block type="text" id="${generateId()}"><field name="TEXT">${screenName}</field></block></value>\n`
    }

    // Se for uma variável, precisamos do campo VAR
    if (node.metadata.bkyType === 'lexical_variable_set' || node.metadata.bkyType === 'lexical_variable_get') {
      const varName = node.label.replace('Definir ', '').replace('Obter ', '') || 'item'
      blockXml += `${pad2}<field name="VAR">global ${varName}</field>\n`
    }
    // Se for um bloco de texto literal
    if (node.metadata.bkyType === 'text') {
      blockXml += `${pad2}<field name="TEXT"></field>\n`
    }
    // Se for um número
    if (node.metadata.bkyType === 'math_number') {
      blockXml += `${pad2}<field name="NUM">0</field>\n`
    }
    
    blockXml += processNextNode(node, edges, nodes, depth)
    blockXml += `${pad}</block>\n`
    return blockXml
  }
  
  // Nó de navegação — usa controls_openAnotherScreen
  if (node.label.startsWith('Abrir Tela')) {
    const screenName = node.metadata?.targetScreen || node.label.split(': ')[1] || 'Screen1'
    blockXml += `${pad}<block type="controls_openAnotherScreen" id="${generateId()}">\n`
    blockXml += `${pad2}<value name="SCREEN"><block type="text" id="${generateId()}"><field name="TEXT">${screenName}</field></block></value>\n`
    blockXml += processNextNode(node, edges, nodes, depth)
    blockXml += `${pad}</block>\n`
    return blockXml
  }
  
  // Nó de decisão (If/Else)
  if (node.type === 'decision') {
    const trueEdge = edges.find(e => e.source === nodeId && (e.label === 'Sim' || e.label === 'Verdadeiro' || !e.label))
    const falseEdge = edges.find(e => e.source === nodeId && (e.label === 'Não' || e.label === 'Falso'))

    if (falseEdge) {
      blockXml += `${pad}<block type="controls_if" id="${generateId()}">\n`
      blockXml += `${pad2}<mutation else="1"></mutation>\n`
    } else {
      blockXml += `${pad}<block type="controls_if" id="${generateId()}">\n`
    }
    blockXml += `${pad2}<value name="IF0"><block type="logic_boolean" id="${generateId()}"><field name="BOOL">TRUE</field></block></value>\n`
    if (trueEdge) {
      blockXml += `${pad2}<statement name="DO0">\n`
      blockXml += processNodeToBky(trueEdge.target, nodes, edges, depth + 4)
      blockXml += `${pad2}</statement>\n`
    }
    if (falseEdge) {
      blockXml += `${pad2}<statement name="ELSE">\n`
      blockXml += processNodeToBky(falseEdge.target, nodes, edges, depth + 4)
      blockXml += `${pad2}</statement>\n`
    }
    blockXml += processNextNode(node, edges, nodes, depth)
    blockXml += `${pad}</block>\n`
    return blockXml
  }
  
  // Nó de definir variavel
  if (node.type === 'logic' && node.label.startsWith('Definir')) {
    const varName = node.label.split(' ')[1] || 'var'
    blockXml += `${pad}<block type="lexical_variable_set" id="${generateId()}">\n`
    blockXml += `${pad2}<field name="VAR">global ${varName}</field>\n`
    blockXml += `${pad2}<value name="VALUE"><block type="math_number" id="${generateId()}"><field name="NUM">0</field></block></value>\n`
    blockXml += processNextNode(node, edges, nodes, depth)
    blockXml += `${pad}</block>\n`
    return blockXml
  }
  
  // Nó com funções configuradas (método, set, get)
  if (functions.length > 0) {
    return generateFunctionChain(functions, node, edges, nodes, depth)
  }
  
  // Fallback legado: label "Componente.Metodo"
  if (node.label.includes('.')) {
    const compName = node.metadata?.componentName || node.label.split('.')[0]
    const methodName = node.label.split('.')[1]
    const compType = node.metadata?.componentType || 'Form'
    if (methodName && methodName !== 'undefined') {
      blockXml += `${pad}<block type="component_method" id="${generateId()}">\n`
      blockXml += `${pad2}<mutation component_type="${compType}" method_name="${methodName}" is_generic="false" instance_name="${compName}"></mutation>\n`
      blockXml += `${pad2}<field name="COMPONENT_SELECTOR">${compName}</field>\n`
      blockXml += processNextNode(node, edges, nodes, depth)
      blockXml += `${pad}</block>\n`
      return blockXml
    }
  }
  
  // Bloco genérico de texto
  blockXml += `${pad}<block type="text_print" id="${generateId()}">\n`
  blockXml += `${pad2}<value name="TEXT"><block type="text" id="${generateId()}"><field name="TEXT">${node.label}</field></block></value>\n`
  blockXml += processNextNode(node, edges, nodes, depth)
  blockXml += `${pad}</block>\n`
  return blockXml
}

function processNextNode(node: any, edges: any[], nodes: any[], depth: number): string {
  const nextEdge = edges.find(e => e.source === node.id && !e.label)
  if (nextEdge) {
    const pad = indent(depth + 2)
    let xml = `${pad}<next>\n`
    xml += processNodeToBky(nextEdge.target, nodes, edges, depth + 2)
    xml += `${pad}</next>\n`
    return xml
  }
  return ''
}

function generateFunctionChain(functions: any[], node: any, edges: any[], nodes: any[], depth: number): string {
  const compName = node.metadata?.componentName || 'Screen1'
  const compType = node.metadata?.componentType || 'Form'
  const pad = indent(depth)
  const pad2 = indent(depth + 2)

  // Construir blocos encadeados com <next>
  let result = ''
  
  for (let i = 0; i < functions.length; i++) {
    const func = functions[i]
    if (!func.name || func.name === 'undefined') continue
    
    if (func.type === 'method') {
      result += `${pad}<block type="component_method" id="${generateId()}">\n`
      result += `${pad2}<mutation component_type="${compType}" method_name="${func.name}" is_generic="false" instance_name="${compName}"></mutation>\n`
      result += `${pad2}<field name="COMPONENT_SELECTOR">${compName}</field>\n`
      
      // Argumentos do método
      if (func.value && typeof func.value === 'string' && func.value.trim()) {
        const params = func.value.split(',').map((s: string) => s.trim())
        params.forEach((param: string, pIdx: number) => {
          result += `${pad2}<value name="ARG${pIdx}">\n`
          result += indent(depth + 4) + getValueBlockFromString(param) + '\n'
          result += `${pad2}</value>\n`
        })
      }
      
      // Encadear próximo
      if (i < functions.length - 1) {
        result += `${pad2}<next>\n`
        result += generateFunctionChain(functions.slice(i + 1), node, edges, nodes, depth + 2)
        result += `${pad2}</next>\n`
      } else {
        result += processNextNode(node, edges, nodes, depth)
      }
      result += `${pad}</block>\n`
      break // O encadeamento é recursivo
      
    } else if (func.type === 'property_set') {
      result += `${pad}<block type="component_set" id="${generateId()}">\n`
      result += `${pad2}<mutation component_type="${compType}" set_or_get="set" property_name="${func.name}" is_generic="false" instance_name="${compName}"></mutation>\n`
      result += `${pad2}<field name="COMPONENT_SELECTOR">${compName}</field>\n`
      result += `${pad2}<value name="VALUE">\n`
      result += indent(depth + 4) + getValueBlock(func.value, func.inputType) + '\n'
      result += `${pad2}</value>\n`
      
      if (i < functions.length - 1) {
        result += `${pad2}<next>\n`
        result += generateFunctionChain(functions.slice(i + 1), node, edges, nodes, depth + 2)
        result += `${pad2}</next>\n`
      } else {
        result += processNextNode(node, edges, nodes, depth)
      }
      result += `${pad}</block>\n`
      break
    }
  }
  
  return result
}

function getValueBlock(value: any, inputType?: string): string {
  const id = generateId()
  if (inputType === 'number') {
    return `<block type="math_number" id="${id}"><field name="NUM">${value || 0}</field></block>`
  } else if (inputType === 'boolean') {
    return `<block type="logic_boolean" id="${id}"><field name="BOOL">${String(!!value).toUpperCase()}</field></block>`
  } else if (inputType === 'color') {
    return `<block type="color_picker" id="${id}"><field name="COLOR">${value || '#ffffff'}</field></block>`
  } else {
    return `<block type="text" id="${id}"><field name="TEXT">${value || ''}</field></block>`
  }
}

function getValueBlockFromString(param: string): string {
  const id = generateId()
  if (param === 'true' || param === 'false') {
    return `<block type="logic_boolean" id="${id}"><field name="BOOL">${param.toUpperCase()}</field></block>`
  }
  if (!isNaN(Number(param)) && param.trim() !== '') {
    return `<block type="math_number" id="${id}"><field name="NUM">${param}</field></block>`
  }
  const strVal = param.replace(/^["']|["']$/g, '')
  return `<block type="text" id="${id}"><field name="TEXT">${strVal}</field></block>`
}
