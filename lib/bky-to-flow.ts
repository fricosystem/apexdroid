/**
 * Converte XML de blocos (Blockly) em estrutura de fluxograma (nós e arestas)
 * Suporta metadados complexos, funções reais do Kodular e blocos de lógica.
 */
export function convertBkyToFlow(xmlText: string): { nodes: any[], edges: any[] } {
  const nodes: any[] = []
  const edges: any[] = []
  
  if (!xmlText || !xmlText.trim().startsWith('<xml')) {
    return { nodes, edges }
  }

  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")
    
    // Mapeamento de nomes internos para nomes amigáveis
    const friendlyNames: Record<string, string> = {
      'procedures_defnoreturn': 'Procedimento',
      'procedures_defreturn': 'Função',
      'global_declaration': 'Variável Global',
      'lexical_variable_set': 'Definir Variável',
      'Se ': 'Se (If)',
      'Se': 'Se (If)',
      'controls_if': 'Se (If)',
      'component_set_get': 'Lógica de Atribuição'
    }

    // Buscar blocos de topo (eventos e definições)
    const allBlocks = Array.from(xmlDoc.getElementsByTagName('block'))
    const topBlocks = allBlocks.filter(b => b.parentElement?.tagName.toLowerCase() === 'xml')
    
    topBlocks.forEach((block, index) => {
      const blockId = block.getAttribute('id') || `block-${index}`
      const type = block.getAttribute('type')
      
      let label = friendlyNames[type || ''] || type || "Bloco"
      let metadata: any = { type: "event", functions: [] }
      
      const mutation = block.getElementsByTagName('mutation')[0]
      const fields = Array.from(block.getElementsByTagName('field'))

      if (type === "component_event" || type === "kodular_event") {
        const componentType = mutation?.getAttribute('component_type') || "Componente"
        let componentName = mutation?.getAttribute('instance_name') || 
                             fields.find(f => f.getAttribute('name') === 'COMPONENT_SELECTOR')?.textContent || "Componente"
        
        const eventName = mutation?.getAttribute('event_name') || 
                         fields.find(f => f.getAttribute('name') === 'EVENT')?.textContent || "Evento"
        
        // Limpar nomes conhecidos de lógica que foram salvos como componentes
        const displayCompName = friendlyNames[componentName] || componentName
        
        label = eventName !== "Evento" ? `Quando ${displayCompName}.${eventName}` : displayCompName
        metadata.componentName = componentName
        metadata.componentType = componentType
        metadata.functions.push({
          id: `f-${blockId}`,
          type: "event",
          name: eventName,
          label: `Quando ${eventName}`
        })
      } else if (type === "procedures_defnoreturn" || type === "procedures_defreturn") {
        const name = fields.find(f => f.getAttribute('name') === 'NAME')?.textContent || "procedimento"
        label = `${type === "procedures_defreturn" ? 'Função' : 'Procedimento'}: ${name}`
        metadata.type = "logic"
        metadata.functions.push({
          id: `f-${blockId}`,
          type: "method",
          name: name,
          label: "Executar"
        })
      } else if (type === "global_declaration") {
        const name = fields.find(f => f.getAttribute('name') === 'NAME')?.textContent || "var"
        label = `Variável Global: ${name}`
        metadata.type = "logic"
      } else if (type === "component_method" || type === "kodular_method") {
        const componentType = mutation?.getAttribute('component_type') || "Componente"
        const componentName = mutation?.getAttribute('instance_name') || 
                             fields.find(f => f.getAttribute('name') === 'COMPONENT_SELECTOR')?.textContent || "Componente"
        const methodName = mutation?.getAttribute('method_name') || 
                          fields.find(f => f.getAttribute('name') === 'METHOD')?.textContent || "Ação"
        
        label = methodName !== "Ação" ? `${componentName}.${methodName}` : componentName
        metadata.componentName = componentName
        metadata.componentType = componentType
        metadata.functions.push({
          id: `f-${blockId}`,
          type: "method",
          name: methodName,
          label: methodName
        })
      }

      // Usar coordenadas reais do arquivo BKY se disponíveis
      const rawX = parseFloat(block.getAttribute('x') || '0')
      const rawY = parseFloat(block.getAttribute('y') || '0')
      const nodeX = isNaN(rawX) || rawX === 0 ? (index * 420 + 80) : rawX
      const nodeY = isNaN(rawY) || rawY === 0 ? 80 : rawY
      
      let nodeType = 'process'
      if (type === 'component_event' || type === 'kodular_event') nodeType = 'event'
      else if (type?.includes('if') || type === 'decision') nodeType = 'decision'
      else if (type?.includes('procedures') || type === 'global_declaration') nodeType = 'logic'
      
      const eventNode = {
        id: blockId,
        type: nodeType,
        label: label,
        x: nodeX,
        y: nodeY,
        width: 220,
        height: 80,
        metadata
      }
      
      nodes.push(eventNode)
      
      // Processar blocos internos (statements)
      const statements = Array.from(block.children).filter(c => ['statement', 'stack', 'do'].includes(c.tagName.toLowerCase()))
      statements.forEach(stmt => {
        const firstBlock = Array.from(stmt.children).find(c => c.tagName.toLowerCase() === 'block')
        if (firstBlock) {
          processStatement(firstBlock, blockId, nodeX, nodeY + 150, nodes, edges, friendlyNames)
        }
      })
    })
  } catch (e) {
    console.error("Erro ao converter BKY para Flow:", e)
  }

  return { nodes, edges }
}

function processStatement(block: Element, parentId: string, x: number, y: number, nodes: any[], edges: any[], friendlyNames: Record<string, string>) {
  const blockId = block.getAttribute('id') || `sub-${Date.now()}-${Math.random()}`
  const type = block.getAttribute('type')
  
  let label = friendlyNames[type || ''] || type || "Ação"
  let metadata: any = { type: "action", functions: [] }
  
  const mutation = block.getElementsByTagName('mutation')[0]
  const fields = Array.from(block.getElementsByTagName('field'))
  
  if (type === "component_method" || type === "kodular_call_method") {
    const componentType = mutation?.getAttribute('component_type') || "default"
    const componentName = mutation?.getAttribute('instance_name') || 
                         fields.find(f => f.getAttribute('name') === 'COMPONENT_SELECTOR')?.textContent
    
    const methodName = mutation?.getAttribute('method_name') || 
                      fields.find(f => f.getAttribute('name') === 'METHOD')?.textContent
    
    const displayCompName = friendlyNames[componentName || ''] || componentName
    const displayMethodName = methodName === 'undefined' ? 'Executar' : (friendlyNames[methodName || ''] || methodName)
    
    label = methodName === 'undefined' ? `${displayCompName}` : `${displayCompName}.${displayMethodName}`
    
    metadata.componentName = componentName
    metadata.componentType = componentType
    metadata.functions.push({
      id: `f-${blockId}`,
      type: "method",
      name: methodName,
      label: displayMethodName
    })
  } else if (type === "component_set" || type === "component_get") {
    const componentType = mutation?.getAttribute('component_type') || "default"
    const componentName = mutation?.getAttribute('instance_name') || 
                         fields.find(f => f.getAttribute('name') === 'COMPONENT_SELECTOR')?.textContent
    
    const propertyName = mutation?.getAttribute('property_name') || 
                        fields.find(f => f.getAttribute('name') === 'PROP')?.textContent
    
    const isSet = type === "component_set"
    label = `${isSet ? 'Definir' : 'Obter'} ${componentName}.${propertyName}`
    metadata.componentName = componentName
    metadata.componentType = componentType
    metadata.functions.push({
      id: `f-${blockId}`,
      type: isSet ? "property_set" : "property_get",
      name: propertyName,
      label: propertyName
    })
  } else if (type === "controls_openAnotherScreen" || type === "kodular_open_screen") {
    const values = Array.from(block.getElementsByTagName('value'))
    const screenValue = values.find(v => v.getAttribute('name') === 'SCREEN' || v.getAttribute('name') === 'SCREEN_NAME')
    const screenName = screenValue?.getElementsByTagName('field')[0]?.textContent || 
                       fields.find(f => f.getAttribute('name') === 'SCREEN')?.textContent || "Tela"
    
    label = `Abrir Tela: ${screenName}`
    metadata.targetScreen = screenName
  } else if (type === "lexical_variable_set") {
    const varName = fields.find(f => f.getAttribute('name') === 'VAR')?.textContent || "variavel"
    label = `Definir ${varName}`
    metadata.type = "logic"
  } else if (type?.includes('if')) {
    label = "Se ... Então"
    metadata.type = "logic"
  }

  const newNode = {
    id: blockId,
    type: (type?.includes('if') || type === "controls_if" ? "decision" : (type?.includes('procedures') || metadata.type === "logic" ? "logic" : "action")) as any,
    label: label,
    x: x,
    y: y,
    width: 200,
    height: 80,
    metadata
  }
  
  nodes.push(newNode)
  edges.push({
    id: `e-${parentId}-${blockId}`,
    source: parentId,
    target: blockId
  })
  
  // Próximo bloco na sequência (next)
  const nexts = Array.from(block.children).filter(c => c.tagName.toLowerCase() === 'next')
  nexts.forEach(next => {
    const nextBlock = Array.from(next.children).find(c => c.tagName.toLowerCase() === 'block')
    if (nextBlock) {
      processStatement(nextBlock, blockId, x, y + 150, nodes, edges, friendlyNames)
    }
  })
}

